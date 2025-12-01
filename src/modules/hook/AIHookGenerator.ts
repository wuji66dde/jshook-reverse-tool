/**
 * AI驱动的Hook生成器
 * 
 * 功能：
 * - AI客户端可以描述需要Hook的功能
 * - 自动生成对应的Hook代码
 * - 支持复杂的Hook逻辑（条件判断、数据提取、调用栈追踪等）
 * - 生成的代码可以直接注入到浏览器
 * 
 * 使用场景：
 * 1. AI分析目标网站后，发现需要Hook某个特定函数
 * 2. AI描述Hook需求（例如："Hook所有加密相关的函数调用"）
 * 3. 本模块生成对应的Hook代码
 * 4. 通过hook_inject工具注入到浏览器
 */

import { logger } from '../../utils/logger.js';

export interface AIHookRequest {
  // Hook描述（自然语言）
  description: string;
  
  // Hook目标
  target: {
    type: 'function' | 'object-method' | 'api' | 'property' | 'event' | 'custom';
    name?: string;           // 函数名或API名
    pattern?: string;        // 正则匹配模式
    object?: string;         // 对象名（如window.crypto）
    property?: string;       // 属性名
  };
  
  // Hook行为
  behavior: {
    captureArgs?: boolean;      // 是否捕获参数
    captureReturn?: boolean;    // 是否捕获返回值
    captureStack?: boolean;     // 是否捕获调用栈
    modifyArgs?: boolean;       // 是否修改参数
    modifyReturn?: boolean;     // 是否修改返回值
    blockExecution?: boolean;   // 是否阻止执行
    logToConsole?: boolean;     // 是否输出到控制台
  };
  
  // 条件过滤
  condition?: {
    argFilter?: string;         // 参数过滤条件（JS表达式）
    returnFilter?: string;      // 返回值过滤条件
    urlPattern?: string;        // URL匹配模式
    maxCalls?: number;          // 最大调用次数
  };
  
  // 自定义代码片段
  customCode?: {
    before?: string;            // 执行前的代码
    after?: string;             // 执行后的代码
    replace?: string;           // 完全替换原函数
  };
}

export interface AIHookResponse {
  success: boolean;
  hookId: string;
  generatedCode: string;
  explanation: string;
  injectionMethod: 'evaluateOnNewDocument' | 'evaluate' | 'addScriptTag';
  warnings?: string[];
}

export class AIHookGenerator {
  private hookCounter = 0;

  /**
   * 根据AI请求生成Hook代码
   */
  generateHook(request: AIHookRequest): AIHookResponse {
    logger.info(`🤖 AI Hook Generator: ${request.description}`);
    
    const hookId = `ai-hook-${++this.hookCounter}-${Date.now()}`;
    const warnings: string[] = [];
    
    try {
      let generatedCode = '';
      let explanation = '';
      let injectionMethod: AIHookResponse['injectionMethod'] = 'evaluateOnNewDocument';
      
      // 根据目标类型生成不同的Hook代码
      switch (request.target.type) {
        case 'function':
          ({ code: generatedCode, explanation } = this.generateFunctionHook(request, hookId));
          break;
          
        case 'object-method':
          ({ code: generatedCode, explanation } = this.generateObjectMethodHook(request, hookId));
          break;
          
        case 'api':
          ({ code: generatedCode, explanation } = this.generateAPIHook(request, hookId));
          injectionMethod = 'evaluateOnNewDocument'; // API Hook必须在页面加载前注入
          break;
          
        case 'property':
          ({ code: generatedCode, explanation } = this.generatePropertyHook(request, hookId));
          break;
          
        case 'event':
          ({ code: generatedCode, explanation } = this.generateEventHook(request, hookId));
          injectionMethod = 'evaluate'; // 事件Hook可以在页面加载后注入
          break;
          
        case 'custom':
          ({ code: generatedCode, explanation } = this.generateCustomHook(request, hookId));
          break;
          
        default:
          throw new Error(`Unsupported target type: ${request.target.type}`);
      }
      
      // 添加全局Hook存储
      generatedCode = this.wrapWithGlobalStorage(generatedCode, hookId);
      
      // 验证生成的代码
      this.validateGeneratedCode(generatedCode, warnings);
      
      logger.success(`✅ Hook generated: ${hookId}`);
      
      return {
        success: true,
        hookId,
        generatedCode,
        explanation,
        injectionMethod,
        warnings: warnings.length > 0 ? warnings : undefined,
      };
    } catch (error) {
      logger.error('Failed to generate hook', error);
      return {
        success: false,
        hookId,
        generatedCode: '',
        explanation: `Error: ${error instanceof Error ? error.message : String(error)}`,
        injectionMethod: 'evaluateOnNewDocument',
        warnings: ['Hook generation failed'],
      };
    }
  }

  /**
   * 生成函数Hook代码
   */
  private generateFunctionHook(request: AIHookRequest, hookId: string): { code: string; explanation: string } {
    const { target, behavior, condition, customCode } = request;
    const functionName = target.name || target.pattern || 'unknownFunction';
    
    let code = `
// AI Generated Hook: ${request.description}
// Hook ID: ${hookId}
(function() {
  const originalFunction = window.${functionName};
  
  if (typeof originalFunction !== 'function') {
    console.warn('[${hookId}] Function not found: ${functionName}');
    return;
  }
  
  let callCount = 0;
  const maxCalls = ${condition?.maxCalls || 'Infinity'};
  
  window.${functionName} = function(...args) {
    callCount++;
    
    // 检查调用次数限制
    if (callCount > maxCalls) {
      return originalFunction.apply(this, args);
    }
    
    const hookData = {
      hookId: '${hookId}',
      functionName: '${functionName}',
      callCount,
      timestamp: Date.now(),
      ${behavior.captureArgs ? 'args: args,' : ''}
      ${behavior.captureStack ? 'stack: new Error().stack,' : ''}
    };
    
    ${customCode?.before || ''}
    
    ${condition?.argFilter ? `
    // 参数过滤
    const argFilterPassed = (function() {
      try {
        return ${condition.argFilter};
      } catch (e) {
        console.error('[${hookId}] Arg filter error:', e);
        return true;
      }
    })();
    
    if (!argFilterPassed) {
      return originalFunction.apply(this, args);
    }
    ` : ''}
    
    ${behavior.logToConsole ? `
    console.log('[${hookId}] Function called:', hookData);
    ` : ''}
    
    ${behavior.blockExecution ? `
    console.warn('[${hookId}] Execution blocked');
    return undefined;
    ` : `
    // 执行原函数
    const startTime = performance.now();
    const result = originalFunction.apply(this, args);
    const executionTime = performance.now() - startTime;
    
    ${behavior.captureReturn ? `
    hookData.returnValue = result;
    hookData.executionTime = executionTime;
    ` : ''}
    
    ${customCode?.after || ''}
    
    // 存储Hook数据
    if (!window.__aiHooks) window.__aiHooks = {};
    if (!window.__aiHooks['${hookId}']) window.__aiHooks['${hookId}'] = [];
    window.__aiHooks['${hookId}'].push(hookData);
    
    return result;
    `}
  };
  
  console.log('[${hookId}] Hook installed for: ${functionName}');
})();
`;
    
    const explanation = `
Hook已生成用于函数: ${functionName}
- 捕获参数: ${behavior.captureArgs ? '是' : '否'}
- 捕获返回值: ${behavior.captureReturn ? '是' : '否'}
- 捕获调用栈: ${behavior.captureStack ? '是' : '否'}
- 阻止执行: ${behavior.blockExecution ? '是' : '否'}
${condition?.maxCalls ? `- 最大调用次数: ${condition.maxCalls}` : ''}
`;
    
    return { code, explanation };
  }

  /**
   * 生成对象方法Hook代码
   */
  private generateObjectMethodHook(request: AIHookRequest, hookId: string): { code: string; explanation: string } {
    const { target, behavior } = request;
    const objectPath = target.object || 'window';
    const methodName = target.property || target.name || 'unknownMethod';
    
    const code = `
// AI Generated Object Method Hook: ${request.description}
(function() {
  const targetObject = ${objectPath};
  const methodName = '${methodName}';
  
  if (!targetObject || typeof targetObject[methodName] !== 'function') {
    console.warn('[${hookId}] Method not found: ${objectPath}.${methodName}');
    return;
  }
  
  const originalMethod = targetObject[methodName];
  let callCount = 0;
  
  targetObject[methodName] = function(...args) {
    callCount++;
    
    const hookData = {
      hookId: '${hookId}',
      object: '${objectPath}',
      method: '${methodName}',
      callCount,
      timestamp: Date.now(),
      ${behavior.captureArgs ? 'args: args,' : ''}
      ${behavior.captureStack ? 'stack: new Error().stack,' : ''}
    };
    
    ${behavior.logToConsole ? `
    console.log('[${hookId}] Method called:', hookData);
    ` : ''}
    
    const result = originalMethod.apply(this, args);
    
    ${behavior.captureReturn ? `
    hookData.returnValue = result;
    ` : ''}
    
    if (!window.__aiHooks) window.__aiHooks = {};
    if (!window.__aiHooks['${hookId}']) window.__aiHooks['${hookId}'] = [];
    window.__aiHooks['${hookId}'].push(hookData);
    
    return result;
  };
  
  console.log('[${hookId}] Hook installed for: ${objectPath}.${methodName}');
})();
`;
    
    const explanation = `Hook已生成用于对象方法: ${objectPath}.${methodName}`;
    return { code, explanation };
  }

  /**
   * 生成API Hook代码（XHR、Fetch等）
   */
  private generateAPIHook(request: AIHookRequest, hookId: string): { code: string; explanation: string } {
    const apiName = request.target.name || 'fetch';
    
    let code = '';
    
    if (apiName === 'fetch') {
      code = this.generateFetchAPIHook(request, hookId);
    } else if (apiName === 'XMLHttpRequest') {
      code = this.generateXHRAPIHook(request, hookId);
    } else {
      code = `console.error('[${hookId}] Unsupported API: ${apiName}');`;
    }
    
    const explanation = `Hook已生成用于API: ${apiName}`;
    return { code, explanation };
  }

  /**
   * 生成Fetch API Hook
   */
  private generateFetchAPIHook(request: AIHookRequest, hookId: string): string {
    const { behavior, condition } = request;
    
    return `
// AI Generated Fetch Hook
(function() {
  const originalFetch = window.fetch;
  
  window.fetch = function(...args) {
    const [url, options] = args;
    
    ${condition?.urlPattern ? `
    const urlPattern = new RegExp('${condition.urlPattern}');
    if (!urlPattern.test(url)) {
      return originalFetch.apply(this, args);
    }
    ` : ''}
    
    const hookData = {
      hookId: '${hookId}',
      type: 'fetch',
      url: url,
      method: options?.method || 'GET',
      timestamp: Date.now(),
      ${behavior.captureArgs ? 'options: options,' : ''}
    };
    
    ${behavior.logToConsole ? `
    console.log('[${hookId}] Fetch request:', hookData);
    ` : ''}
    
    return originalFetch.apply(this, args).then(response => {
      ${behavior.captureReturn ? `
      hookData.status = response.status;
      hookData.statusText = response.statusText;
      ` : ''}
      
      if (!window.__aiHooks) window.__aiHooks = {};
      if (!window.__aiHooks['${hookId}']) window.__aiHooks['${hookId}'] = [];
      window.__aiHooks['${hookId}'].push(hookData);
      
      return response;
    });
  };
  
  console.log('[${hookId}] Fetch Hook installed');
})();
`;
  }

  /**
   * 生成XHR API Hook
   */
  private generateXHRAPIHook(_request: AIHookRequest, hookId: string): string {
    return `
// AI Generated XHR Hook
(function() {
  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;
  
  XMLHttpRequest.prototype.open = function(method, url, ...rest) {
    this.__hookData = {
      hookId: '${hookId}',
      type: 'xhr',
      method,
      url,
      timestamp: Date.now(),
    };
    return originalOpen.apply(this, [method, url, ...rest]);
  };
  
  XMLHttpRequest.prototype.send = function(...args) {
    const xhr = this;
    
    xhr.addEventListener('load', function() {
      if (xhr.__hookData) {
        xhr.__hookData.status = xhr.status;
        xhr.__hookData.response = xhr.responseText;
        
        if (!window.__aiHooks) window.__aiHooks = {};
        if (!window.__aiHooks['${hookId}']) window.__aiHooks['${hookId}'] = [];
        window.__aiHooks['${hookId}'].push(xhr.__hookData);
      }
    });
    
    return originalSend.apply(this, args);
  };
  
  console.log('[${hookId}] XHR Hook installed');
})();
`;
  }

  /**
   * 生成属性Hook代码
   */
  private generatePropertyHook(request: AIHookRequest, _hookId: string): { code: string; explanation: string } {
    const code = `// Property Hook not yet implemented for: ${request.description}`;
    const explanation = 'Property Hook generation is under development';
    return { code, explanation };
  }

  /**
   * 生成事件Hook代码
   */
  private generateEventHook(request: AIHookRequest, _hookId: string): { code: string; explanation: string } {
    const code = `// Event Hook not yet implemented for: ${request.description}`;
    const explanation = 'Event Hook generation is under development';
    return { code, explanation };
  }

  /**
   * 生成自定义Hook代码
   */
  private generateCustomHook(request: AIHookRequest, _hookId: string): { code: string; explanation: string } {
    const code = request.customCode?.replace || `// Custom Hook: ${request.description}`;
    const explanation = 'Custom Hook code provided by user';
    return { code, explanation };
  }

  /**
   * 包装Hook代码，添加全局存储
   */
  private wrapWithGlobalStorage(code: string, hookId: string): string {
    return `
// Initialize global hook storage
if (!window.__aiHooks) {
  window.__aiHooks = {};
  window.__aiHookMetadata = {};
}

window.__aiHookMetadata['${hookId}'] = {
  id: '${hookId}',
  createdAt: Date.now(),
  enabled: true,
};

${code}
`;
  }

  /**
   * 验证生成的代码
   */
  private validateGeneratedCode(code: string, warnings: string[]): void {
    // 检查是否包含危险操作
    if (code.includes('eval(') || code.includes('Function(')) {
      warnings.push('⚠️ Generated code contains eval() or Function(), which may be dangerous');
    }
    
    // 检查是否有语法错误（简单检查）
    const openBraces = (code.match(/{/g) || []).length;
    const closeBraces = (code.match(/}/g) || []).length;
    if (openBraces !== closeBraces) {
      warnings.push('⚠️ Possible syntax error: unmatched braces');
    }
  }
}

