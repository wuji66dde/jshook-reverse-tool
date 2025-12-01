/**
 * 控制台监控器 - 关键的动态逆向分析模块
 *
 * 核心功能:
 * 1. 实时控制台监控（log, warn, error, info, debug）
 * 2. 异常捕获和追踪（Runtime.exceptionThrown）
 * 3. 网络请求监控（Network域集成）
 * 4. 动态代码执行和注入
 * 5. 对象深度检查（Runtime.getProperties）
 * 6. 函数调用追踪（通过Proxy注入）
 *
 * 设计原则:
 * - 薄封装CDP Console/Runtime/Network域
 * - 动态、AI友好的逆向分析能力
 * - 完整的事件监听和状态追踪
 * - 依赖CodeCollector获取Page实例
 */

import type { CDPSession } from 'puppeteer';
import type { CodeCollector } from '../collector/CodeCollector.js';
import { logger } from '../../utils/logger.js';

/**
 * 控制台消息
 */
export interface ConsoleMessage {
  type: 'log' | 'warn' | 'error' | 'info' | 'debug' | 'trace' | 'dir' | 'table';
  text: string;
  args?: any[];
  timestamp: number;
  stackTrace?: StackFrame[];
  url?: string;
  lineNumber?: number;
  columnNumber?: number;
}

/**
 * 堆栈帧
 */
export interface StackFrame {
  functionName: string;
  url: string;
  lineNumber: number;
  columnNumber: number;
}

/**
 * 异常信息
 */
export interface ExceptionInfo {
  text: string;
  exceptionId: number;
  timestamp: number;
  stackTrace?: StackFrame[];
  url?: string;
  lineNumber?: number;
  columnNumber?: number;
  scriptId?: string;
}

/**
 * 网络请求信息
 */
export interface NetworkRequest {
  requestId: string;
  url: string;
  method: string;
  headers: Record<string, string>;
  postData?: string;
  timestamp: number;
  type?: string;
  initiator?: any;
}

/**
 * 网络响应信息
 */
export interface NetworkResponse {
  requestId: string;
  url: string;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  mimeType: string;
  timestamp: number;
  fromCache?: boolean;
  timing?: any;
}

/**
 * 控制台监控器 - 动态逆向分析核心
 */
export class ConsoleMonitor {
  private cdpSession: CDPSession | null = null;

  // 控制台消息
  private messages: ConsoleMessage[] = [];
  private readonly MAX_MESSAGES = 1000;

  // 异常追踪
  private exceptions: ExceptionInfo[] = [];
  private readonly MAX_EXCEPTIONS = 500;

  // 网络监控
  private networkEnabled = false;
  private requests: Map<string, NetworkRequest> = new Map();
  private responses: Map<string, NetworkResponse> = new Map();
  private readonly MAX_NETWORK_RECORDS = 500;

  // ✅ 网络事件监听器引用（用于正确清理）
  private networkListeners: {
    requestWillBeSent?: (params: any) => void;
    responseReceived?: (params: any) => void;
    loadingFinished?: (params: any) => void;
  } = {};

  // 对象缓存（用于深度检查）
  private objectCache: Map<string, any> = new Map();

  constructor(private collector: CodeCollector) {}

  /**
   * 启用控制台监控（完整版 - 包含异常和网络监控）
   */
  async enable(options?: {
    enableNetwork?: boolean;
    enableExceptions?: boolean;
  }): Promise<void> {
    if (this.cdpSession) {
      logger.warn('ConsoleMonitor already enabled');
      return;
    }

    const page = await this.collector.getActivePage();
    this.cdpSession = await page.createCDPSession();

    // 启用Runtime域（用于监听console API调用和异常）
    await this.cdpSession.send('Runtime.enable');
    await this.cdpSession.send('Console.enable');

    // ==================== 1. 监听控制台API调用 ====================
    this.cdpSession.on('Runtime.consoleAPICalled', (params: any) => {
      const stackTrace: StackFrame[] = params.stackTrace?.callFrames?.map((frame: any) => ({
        functionName: frame.functionName || '(anonymous)',
        url: frame.url,
        lineNumber: frame.lineNumber,
        columnNumber: frame.columnNumber,
      })) || [];

      const message: ConsoleMessage = {
        type: params.type,
        text: params.args.map((arg: any) => this.formatRemoteObject(arg)).join(' '),
        args: params.args.map((arg: any) => this.extractValue(arg)),
        timestamp: params.timestamp,
        stackTrace,
        url: stackTrace[0]?.url,
        lineNumber: stackTrace[0]?.lineNumber,
        columnNumber: stackTrace[0]?.columnNumber,
      };

      this.messages.push(message);

      // 防止内存泄漏
      if (this.messages.length > this.MAX_MESSAGES) {
        this.messages = this.messages.slice(-Math.floor(this.MAX_MESSAGES / 2));
      }

      logger.debug(`Console ${params.type}: ${message.text}`);
    });

    // ==================== 2. 监听Console.messageAdded ====================
    this.cdpSession.on('Console.messageAdded', (params: any) => {
      const msg = params.message;
      const message: ConsoleMessage = {
        type: msg.level as any,
        text: msg.text,
        timestamp: Date.now(),
        url: msg.url,
        lineNumber: msg.line,
        columnNumber: msg.column,
      };

      this.messages.push(message);

      if (this.messages.length > this.MAX_MESSAGES) {
        this.messages = this.messages.slice(-Math.floor(this.MAX_MESSAGES / 2));
      }
    });

    // ==================== 3. 监听异常（关键！）====================
    if (options?.enableExceptions !== false) {
      this.cdpSession.on('Runtime.exceptionThrown', (params: any) => {
        const exception = params.exceptionDetails;
        const stackTrace: StackFrame[] = exception.stackTrace?.callFrames?.map((frame: any) => ({
          functionName: frame.functionName || '(anonymous)',
          url: frame.url,
          lineNumber: frame.lineNumber,
          columnNumber: frame.columnNumber,
        })) || [];

        const exceptionInfo: ExceptionInfo = {
          text: exception.exception?.description || exception.text,
          exceptionId: exception.exceptionId,
          timestamp: Date.now(),
          stackTrace,
          url: exception.url,
          lineNumber: exception.lineNumber,
          columnNumber: exception.columnNumber,
          scriptId: exception.scriptId,
        };

        this.exceptions.push(exceptionInfo);

        // 防止内存泄漏
        if (this.exceptions.length > this.MAX_EXCEPTIONS) {
          this.exceptions = this.exceptions.slice(-Math.floor(this.MAX_EXCEPTIONS / 2));
        }

        logger.error(`Exception thrown: ${exceptionInfo.text}`, {
          url: exceptionInfo.url,
          line: exceptionInfo.lineNumber,
        });
      });
    }

    // ==================== 4. 启用网络监控（可选）====================
    if (options?.enableNetwork) {
      await this.enableNetworkMonitoring();
    }

    logger.info('ConsoleMonitor enabled', {
      network: options?.enableNetwork || false,
      exceptions: options?.enableExceptions !== false,
    });
  }

  /**
   * 禁用控制台监控（优化版 - 正确清理网络监听器）
   */
  async disable(): Promise<void> {
    if (this.cdpSession) {
      // ✅ 先移除网络事件监听器（防止内存泄漏）
      if (this.networkEnabled) {
        if (this.networkListeners.requestWillBeSent) {
          this.cdpSession.off('Network.requestWillBeSent', this.networkListeners.requestWillBeSent);
        }
        if (this.networkListeners.responseReceived) {
          this.cdpSession.off('Network.responseReceived', this.networkListeners.responseReceived);
        }
        if (this.networkListeners.loadingFinished) {
          this.cdpSession.off('Network.loadingFinished', this.networkListeners.loadingFinished);
        }

        // 禁用 Network 域
        try {
          await this.cdpSession.send('Network.disable');
        } catch (error) {
          logger.warn('Failed to disable Network domain:', error);
        }

        // 清空监听器引用
        this.networkListeners = {};
        this.networkEnabled = false;

        logger.info('Network monitoring disabled');
      }

      // 禁用 Console 和 Runtime 域
      await this.cdpSession.send('Console.disable');
      await this.cdpSession.send('Runtime.disable');
      await this.cdpSession.detach();
      this.cdpSession = null;
      logger.info('ConsoleMonitor disabled');
    }
  }

  /**
   * 获取控制台日志
   */
  getLogs(filter?: {
    type?: 'log' | 'warn' | 'error' | 'info' | 'debug';
    limit?: number;
    since?: number; // timestamp
  }): ConsoleMessage[] {
    let logs = this.messages;

    // 按类型过滤
    if (filter?.type) {
      logs = logs.filter(msg => msg.type === filter.type);
    }

    // 按时间过滤
    if (filter?.since !== undefined) {
      logs = logs.filter(msg => msg.timestamp >= filter.since!);
    }

    // 限制数量
    if (filter?.limit) {
      logs = logs.slice(-filter.limit);
    }

    logger.info(`getLogs: ${logs.length} messages`);
    return logs;
  }

  /**
   * 执行控制台命令（在页面上下文中执行JavaScript）
   */
  async execute(expression: string): Promise<any> {
    if (!this.cdpSession) {
      await this.enable();
    }

    try {
      const result = await this.cdpSession!.send('Runtime.evaluate', {
        expression,
        returnByValue: true,
      });

      if (result.exceptionDetails) {
        logger.error('Console execute error:', result.exceptionDetails);
        throw new Error(result.exceptionDetails.text);
      }

      logger.info(`Console executed: ${expression.substring(0, 50)}...`);
      return result.result.value;
    } catch (error) {
      logger.error('Console execute failed:', error);
      throw error;
    }
  }

  /**
   * 清除控制台日志
   */
  clearLogs(): void {
    this.messages = [];
    logger.info('Console logs cleared');
  }

  /**
   * 获取统计信息
   */
  getStats(): {
    totalMessages: number;
    byType: Record<string, number>;
  } {
    const byType: Record<string, number> = {};

    for (const msg of this.messages) {
      byType[msg.type] = (byType[msg.type] || 0) + 1;
    }

    return {
      totalMessages: this.messages.length,
      byType,
    };
  }

  /**
   * 关闭监控
   */
  async close(): Promise<void> {
    await this.disable();
  }

  // ==================== 🆕 网络监控功能 ====================

  /**
   * 启用网络监控（优化版 - 参考 DebuggerManager）
   */
  private async enableNetworkMonitoring(): Promise<void> {
    if (!this.cdpSession) {
      throw new Error('CDP session not initialized');
    }

    // ✅ 防止重复启用（参考 DebuggerManager.init()）
    if (this.networkEnabled) {
      logger.warn('Network monitoring already enabled');
      return;
    }

    try {
      // ✅ 先启用Network域，再注册监听器
      await this.cdpSession.send('Network.enable', {
        maxTotalBufferSize: 10000000,
        maxResourceBufferSize: 5000000,
        maxPostDataSize: 65536,
      });

      logger.info('Network domain enabled');

      // ✅ 创建命名函数并存储引用（便于后续移除）
      this.networkListeners.requestWillBeSent = (params: any) => {
        const request: NetworkRequest = {
          requestId: params.requestId,
          url: params.request.url,
          method: params.request.method,
          headers: params.request.headers,
          postData: params.request.postData,
          timestamp: params.timestamp,
          type: params.type,
          initiator: params.initiator,
        };

        this.requests.set(params.requestId, request);

        // 防止内存泄漏
        if (this.requests.size > this.MAX_NETWORK_RECORDS) {
          const firstKey = this.requests.keys().next().value;
          if (firstKey) {
            this.requests.delete(firstKey);
          }
        }

        logger.debug(`Network request captured: ${params.request.method} ${params.request.url}`);
      };

      this.networkListeners.responseReceived = (params: any) => {
        const response: NetworkResponse = {
          requestId: params.requestId,
          url: params.response.url,
          status: params.response.status,
          statusText: params.response.statusText,
          headers: params.response.headers,
          mimeType: params.response.mimeType,
          timestamp: params.timestamp,
          fromCache: params.response.fromDiskCache || params.response.fromServiceWorker,
          timing: params.response.timing,
        };

        this.responses.set(params.requestId, response);

        // 防止内存泄漏
        if (this.responses.size > this.MAX_NETWORK_RECORDS) {
          const firstKey = this.responses.keys().next().value;
          if (firstKey) {
            this.responses.delete(firstKey);
          }
        }

        logger.debug(`Network response captured: ${params.response.status} ${params.response.url}`);
      };

      // ✅ 添加 loadingFinished 事件（确保响应体完全加载）
      this.networkListeners.loadingFinished = (params: any) => {
        logger.debug(`Network loading finished: ${params.requestId}`);
        // 响应体现在可以安全获取
      };

      // ✅ 注册事件监听器
      this.cdpSession.on('Network.requestWillBeSent', this.networkListeners.requestWillBeSent);
      this.cdpSession.on('Network.responseReceived', this.networkListeners.responseReceived);
      this.cdpSession.on('Network.loadingFinished', this.networkListeners.loadingFinished);

      // ✅ 标记为已启用
      this.networkEnabled = true;

      logger.info('✅ Network monitoring enabled successfully', {
        requestListeners: !!this.networkListeners.requestWillBeSent,
        responseListeners: !!this.networkListeners.responseReceived,
        loadingListeners: !!this.networkListeners.loadingFinished,
      });
    } catch (error) {
      logger.error('❌ Failed to enable network monitoring:', error);
      this.networkEnabled = false;
      throw error;
    }
  }

  /**
   * 检查网络监控是否已启用
   */
  isNetworkEnabled(): boolean {
    return this.networkEnabled;
  }

  /**
   * ✅ 获取网络监控状态（用于调试和监控）
   */
  getNetworkStatus(): {
    enabled: boolean;
    requestCount: number;
    responseCount: number;
    listenerCount: number;
    cdpSessionActive: boolean;
  } {
    return {
      enabled: this.networkEnabled,
      requestCount: this.requests.size,
      responseCount: this.responses.size,
      listenerCount: Object.keys(this.networkListeners).filter(
        key => this.networkListeners[key as keyof typeof this.networkListeners] !== undefined
      ).length,
      cdpSessionActive: this.cdpSession !== null,
    };
  }

  /**
   * 获取网络请求
   */
  getNetworkRequests(filter?: {
    url?: string;
    method?: string;
    limit?: number;
  }): NetworkRequest[] {
    let requests = Array.from(this.requests.values());

    if (filter?.url) {
      requests = requests.filter(req => req.url.includes(filter.url!));
    }

    if (filter?.method) {
      requests = requests.filter(req => req.method === filter.method);
    }

    if (filter?.limit) {
      requests = requests.slice(-filter.limit);
    }

    return requests;
  }

  /**
   * 获取网络响应
   */
  getNetworkResponses(filter?: {
    url?: string;
    status?: number;
    limit?: number;
  }): NetworkResponse[] {
    let responses = Array.from(this.responses.values());

    if (filter?.url) {
      responses = responses.filter(res => res.url.includes(filter.url!));
    }

    if (filter?.status) {
      responses = responses.filter(res => res.status === filter.status);
    }

    if (filter?.limit) {
      responses = responses.slice(-filter.limit);
    }

    return responses;
  }

  /**
   * 获取请求和响应的完整信息
   */
  getNetworkActivity(requestId: string): {
    request?: NetworkRequest;
    response?: NetworkResponse;
  } {
    return {
      request: this.requests.get(requestId),
      response: this.responses.get(requestId),
    };
  }

  /**
   * 🆕 获取响应体内容（优化版 - 更详细的错误处理）
   */
  async getResponseBody(requestId: string): Promise<{
    body: string;
    base64Encoded: boolean;
  } | null> {
    if (!this.cdpSession) {
      throw new Error('CDP session not initialized');
    }

    // ✅ 检查网络监控是否启用
    if (!this.networkEnabled) {
      logger.error('Network monitoring is not enabled. Call enable() with enableNetwork: true first.');
      return null;
    }

    // ✅ 检查请求是否存在
    const request = this.requests.get(requestId);
    const response = this.responses.get(requestId);

    if (!request) {
      logger.error(`Request not found: ${requestId}. Make sure network monitoring was enabled before the request.`);
      return null;
    }

    if (!response) {
      logger.warn(`Response not yet received for request: ${requestId}. The request may still be pending.`);
      return null;
    }

    try {
      const result = await this.cdpSession.send('Network.getResponseBody', {
        requestId,
      });

      logger.info(`Response body retrieved for request: ${requestId}`, {
        url: response.url,
        status: response.status,
        size: result.body.length,
        base64: result.base64Encoded,
      });

      return {
        body: result.body,
        base64Encoded: result.base64Encoded,
      };
    } catch (error: any) {
      // ✅ 更详细的错误信息
      logger.error(`Failed to get response body for ${requestId}:`, {
        url: response.url,
        status: response.status,
        error: error.message,
        hint: 'The response body may not be available for this request type (e.g., cached, redirected, or failed requests)',
      });
      return null;
    }
  }

  /**
   * 🆕 获取所有JavaScript响应（动态脚本收集）
   */
  async getAllJavaScriptResponses(): Promise<Array<{
    url: string;
    content: string;
    size: number;
    requestId: string;
  }>> {
    const jsResponses: Array<{
      url: string;
      content: string;
      size: number;
      requestId: string;
    }> = [];

    for (const [requestId, response] of this.responses.entries()) {
      // 过滤JavaScript资源
      if (
        response.mimeType.includes('javascript') ||
        response.url.endsWith('.js') ||
        response.url.includes('.js?')
      ) {
        const bodyResult = await this.getResponseBody(requestId);

        if (bodyResult) {
          const content = bodyResult.base64Encoded
            ? Buffer.from(bodyResult.body, 'base64').toString('utf-8')
            : bodyResult.body;

          jsResponses.push({
            url: response.url,
            content,
            size: content.length,
            requestId,
          });
        }
      }
    }

    logger.info(`Collected ${jsResponses.length} JavaScript responses`);
    return jsResponses;
  }

  /**
   * 🆕 清除网络记录
   */
  clearNetworkRecords(): void {
    this.requests.clear();
    this.responses.clear();
    logger.info('Network records cleared');
  }

  /**
   * 🆕 获取网络统计信息
   */
  getNetworkStats(): {
    totalRequests: number;
    totalResponses: number;
    byMethod: Record<string, number>;
    byStatus: Record<number, number>;
    byType: Record<string, number>;
  } {
    const byMethod: Record<string, number> = {};
    const byStatus: Record<number, number> = {};
    const byType: Record<string, number> = {};

    for (const request of this.requests.values()) {
      byMethod[request.method] = (byMethod[request.method] || 0) + 1;
      if (request.type) {
        byType[request.type] = (byType[request.type] || 0) + 1;
      }
    }

    for (const response of this.responses.values()) {
      byStatus[response.status] = (byStatus[response.status] || 0) + 1;
    }

    return {
      totalRequests: this.requests.size,
      totalResponses: this.responses.size,
      byMethod,
      byStatus,
      byType,
    };
  }

  // ==================== 🆕 异常追踪功能 ====================

  /**
   * 获取异常列表
   */
  getExceptions(filter?: {
    url?: string;
    limit?: number;
    since?: number;
  }): ExceptionInfo[] {
    let exceptions = this.exceptions;

    if (filter?.url) {
      exceptions = exceptions.filter(ex => ex.url?.includes(filter.url!));
    }

    if (filter?.since !== undefined) {
      exceptions = exceptions.filter(ex => ex.timestamp >= filter.since!);
    }

    if (filter?.limit) {
      exceptions = exceptions.slice(-filter.limit);
    }

    return exceptions;
  }

  /**
   * 清除异常记录
   */
  clearExceptions(): void {
    this.exceptions = [];
    logger.info('Exceptions cleared');
  }

  // ==================== 🆕 对象深度检查功能 ====================

  /**
   * 获取对象的所有属性（深度检查）
   */
  async inspectObject(objectId: string): Promise<any> {
    if (!this.cdpSession) {
      throw new Error('CDP session not initialized');
    }

    // 检查缓存
    if (this.objectCache.has(objectId)) {
      return this.objectCache.get(objectId);
    }

    try {
      const result = await this.cdpSession.send('Runtime.getProperties', {
        objectId,
        ownProperties: true,
        accessorPropertiesOnly: false,
        generatePreview: true,
      });

      const properties: Record<string, any> = {};

      for (const prop of result.result) {
        if (!prop.value) continue;

        properties[prop.name] = {
          value: this.extractValue(prop.value),
          type: prop.value.type,
          objectId: prop.value.objectId,
          description: prop.value.description,
        };
      }

      // 缓存结果
      this.objectCache.set(objectId, properties);

      logger.info(`Object inspected: ${objectId}`, {
        propertyCount: Object.keys(properties).length,
      });

      return properties;
    } catch (error) {
      logger.error('Failed to inspect object:', error);
      throw error;
    }
  }

  /**
   * 清除对象缓存
   */
  clearObjectCache(): void {
    this.objectCache.clear();
    logger.info('Object cache cleared');
  }

  // ==================== 🆕 动态脚本监控功能 ====================

  /**
   * 启用动态脚本监控（MutationObserver）
   */
  async enableDynamicScriptMonitoring(): Promise<void> {
    if (!this.cdpSession) {
      throw new Error('CDP session not initialized');
    }

    const monitorCode = `
      (function() {
        // 防止重复注入
        if (window.__dynamicScriptMonitorInstalled) {
          console.log('[ScriptMonitor] Already installed');
          return;
        }
        window.__dynamicScriptMonitorInstalled = true;

        // 记录所有动态添加的脚本
        const dynamicScripts = [];

        // 1. 监听DOM变化（MutationObserver）
        const observer = new MutationObserver((mutations) => {
          mutations.forEach((mutation) => {
            mutation.addedNodes.forEach((node) => {
              if (node.nodeName === 'SCRIPT') {
                const script = node;
                const info = {
                  type: 'dynamic',
                  src: script.src || '(inline)',
                  content: script.src ? null : script.textContent,
                  timestamp: Date.now(),
                  async: script.async,
                  defer: script.defer,
                };

                dynamicScripts.push(info);
                console.log('[ScriptMonitor] Dynamic script added:', info);
              }
            });
          });
        });

        observer.observe(document.documentElement, {
          childList: true,
          subtree: true,
        });

        // 2. Hook document.createElement('script')
        const originalCreateElement = document.createElement;
        document.createElement = function(tagName) {
          const element = originalCreateElement.call(document, tagName);

          if (tagName.toLowerCase() === 'script') {
            console.log('[ScriptMonitor] Script element created via createElement');

            // 监听src属性变化
            const originalSetAttribute = element.setAttribute;
            element.setAttribute = function(name, value) {
              if (name === 'src') {
                console.log('[ScriptMonitor] Script src set to:', value);
              }
              return originalSetAttribute.call(element, name, value);
            };
          }

          return element;
        };

        // 3. Hook eval (危险但有用)
        const originalEval = window.eval;
        window.eval = function(code) {
          console.log('[ScriptMonitor] eval() called with code:',
            typeof code === 'string' ? code.substring(0, 100) + '...' : code);
          return originalEval.call(window, code);
        };

        // 4. Hook Function constructor
        const originalFunction = window.Function;
        window.Function = function(...args) {
          console.log('[ScriptMonitor] Function() constructor called with args:', args);
          return originalFunction.apply(this, args);
        };

        // 5. 暴露API供外部查询
        window.__getDynamicScripts = function() {
          return dynamicScripts;
        };

        console.log('[ScriptMonitor] Dynamic script monitoring enabled');
      })();
    `;

    await this.cdpSession.send('Runtime.evaluate', {
      expression: monitorCode,
    });

    logger.info('Dynamic script monitoring enabled');
  }

  /**
   * 获取动态加载的脚本列表
   */
  async getDynamicScripts(): Promise<any[]> {
    if (!this.cdpSession) {
      throw new Error('CDP session not initialized');
    }

    try {
      const result = await this.cdpSession.send('Runtime.evaluate', {
        expression: 'window.__getDynamicScripts ? window.__getDynamicScripts() : []',
        returnByValue: true,
      });

      return result.result.value || [];
    } catch (error) {
      logger.error('Failed to get dynamic scripts:', error);
      return [];
    }
  }

  // ==================== 🆕 动态代码注入功能 ====================

  /**
   * 注入函数追踪代码（Proxy模式）
   */
  async injectFunctionTracer(functionName: string): Promise<void> {
    if (!this.cdpSession) {
      throw new Error('CDP session not initialized');
    }

    const tracerCode = `
      (function() {
        const originalFunc = window.${functionName};
        if (typeof originalFunc !== 'function') {
          console.error('[Tracer] ${functionName} is not a function');
          return;
        }

        window.${functionName} = new Proxy(originalFunc, {
          apply: function(target, thisArg, args) {
            console.log('[Tracer] ${functionName} called with args:', args);
            const startTime = performance.now();

            try {
              const result = target.apply(thisArg, args);
              const endTime = performance.now();
              console.log('[Tracer] ${functionName} returned:', result, 'Time:', (endTime - startTime).toFixed(2), 'ms');
              return result;
            } catch (error) {
              console.error('[Tracer] ${functionName} threw error:', error);
              throw error;
            }
          }
        });

        console.log('[Tracer] ${functionName} is now being traced');
      })();
    `;

    await this.cdpSession.send('Runtime.evaluate', {
      expression: tracerCode,
    });

    logger.info(`Function tracer injected for: ${functionName}`);
  }

  /**
   * 🆕 注入XHR拦截器（监控AJAX请求）
   */
  async injectXHRInterceptor(): Promise<void> {
    if (!this.cdpSession) {
      throw new Error('CDP session not initialized');
    }

    const interceptorCode = `
      (function() {
        if (window.__xhrInterceptorInstalled) {
          console.log('[XHRInterceptor] Already installed');
          return;
        }
        window.__xhrInterceptorInstalled = true;

        const xhrRequests = [];
        const originalXHR = window.XMLHttpRequest;

        window.XMLHttpRequest = function() {
          const xhr = new originalXHR();
          const requestInfo = {
            method: '',
            url: '',
            requestHeaders: {},
            responseHeaders: {},
            status: 0,
            response: null,
            timestamp: Date.now(),
          };

          // Hook open
          const originalOpen = xhr.open;
          xhr.open = function(method, url, ...args) {
            requestInfo.method = method;
            requestInfo.url = url;
            console.log('[XHRInterceptor] XHR opened:', method, url);
            return originalOpen.call(xhr, method, url, ...args);
          };

          // Hook setRequestHeader
          const originalSetRequestHeader = xhr.setRequestHeader;
          xhr.setRequestHeader = function(header, value) {
            requestInfo.requestHeaders[header] = value;
            return originalSetRequestHeader.call(xhr, header, value);
          };

          // Hook send
          const originalSend = xhr.send;
          xhr.send = function(body) {
            console.log('[XHRInterceptor] XHR sent:', requestInfo.url, 'Body:', body);

            xhr.addEventListener('load', function() {
              requestInfo.status = xhr.status;
              requestInfo.response = xhr.response;
              requestInfo.responseHeaders = xhr.getAllResponseHeaders();

              xhrRequests.push(requestInfo);
              console.log('[XHRInterceptor] XHR completed:', requestInfo.url, 'Status:', xhr.status);
            });

            return originalSend.call(xhr, body);
          };

          return xhr;
        };

        window.__getXHRRequests = function() {
          return xhrRequests;
        };

        console.log('[XHRInterceptor] XHR interceptor installed');
      })();
    `;

    await this.cdpSession.send('Runtime.evaluate', {
      expression: interceptorCode,
    });

    logger.info('XHR interceptor injected');
  }

  /**
   * 🆕 注入Fetch拦截器（监控Fetch请求）
   */
  async injectFetchInterceptor(): Promise<void> {
    if (!this.cdpSession) {
      throw new Error('CDP session not initialized');
    }

    const interceptorCode = `
      (function() {
        if (window.__fetchInterceptorInstalled) {
          console.log('[FetchInterceptor] Already installed');
          return;
        }
        window.__fetchInterceptorInstalled = true;

        const fetchRequests = [];
        const originalFetch = window.fetch;

        window.fetch = function(url, options = {}) {
          const requestInfo = {
            url: typeof url === 'string' ? url : url.url,
            method: options.method || 'GET',
            headers: options.headers || {},
            body: options.body,
            timestamp: Date.now(),
            response: null,
            status: 0,
          };

          console.log('[FetchInterceptor] Fetch called:', requestInfo.method, requestInfo.url);

          return originalFetch.call(window, url, options).then(async (response) => {
            requestInfo.status = response.status;

            // Clone response to read body
            const clonedResponse = response.clone();
            try {
              requestInfo.response = await clonedResponse.text();
            } catch (e) {
              requestInfo.response = '[Unable to read response]';
            }

            fetchRequests.push(requestInfo);
            console.log('[FetchInterceptor] Fetch completed:', requestInfo.url, 'Status:', response.status);

            return response;
          }).catch((error) => {
            console.error('[FetchInterceptor] Fetch failed:', requestInfo.url, error);
            throw error;
          });
        };

        window.__getFetchRequests = function() {
          return fetchRequests;
        };

        console.log('[FetchInterceptor] Fetch interceptor installed');
      })();
    `;

    await this.cdpSession.send('Runtime.evaluate', {
      expression: interceptorCode,
    });

    logger.info('Fetch interceptor injected');
  }

  /**
   * 获取XHR请求列表
   */
  async getXHRRequests(): Promise<any[]> {
    if (!this.cdpSession) {
      throw new Error('CDP session not initialized');
    }

    try {
      const result = await this.cdpSession.send('Runtime.evaluate', {
        expression: 'window.__getXHRRequests ? window.__getXHRRequests() : []',
        returnByValue: true,
      });

      return result.result.value || [];
    } catch (error) {
      logger.error('Failed to get XHR requests:', error);
      return [];
    }
  }

  /**
   * 获取Fetch请求列表
   */
  async getFetchRequests(): Promise<any[]> {
    if (!this.cdpSession) {
      throw new Error('CDP session not initialized');
    }

    try {
      const result = await this.cdpSession.send('Runtime.evaluate', {
        expression: 'window.__getFetchRequests ? window.__getFetchRequests() : []',
        returnByValue: true,
      });

      return result.result.value || [];
    } catch (error) {
      logger.error('Failed to get Fetch requests:', error);
      return [];
    }
  }

  /**
   * 注入对象属性监听器（Object.defineProperty）
   */
  async injectPropertyWatcher(objectPath: string, propertyName: string): Promise<void> {
    if (!this.cdpSession) {
      throw new Error('CDP session not initialized');
    }

    const watcherCode = `
      (function() {
        const obj = ${objectPath};
        if (!obj) {
          console.error('[Watcher] Object not found: ${objectPath}');
          return;
        }

        let value = obj.${propertyName};

        Object.defineProperty(obj, '${propertyName}', {
          get: function() {
            console.log('[Watcher] ${objectPath}.${propertyName} accessed, value:', value);
            return value;
          },
          set: function(newValue) {
            console.log('[Watcher] ${objectPath}.${propertyName} changed from', value, 'to', newValue);
            value = newValue;
          },
          enumerable: true,
          configurable: true
        });

        console.log('[Watcher] Property watcher installed for ${objectPath}.${propertyName}');
      })();
    `;

    await this.cdpSession.send('Runtime.evaluate', {
      expression: watcherCode,
    });

    logger.info(`Property watcher injected for: ${objectPath}.${propertyName}`);
  }

  // ==================== 辅助方法 ====================

  /**
   * 格式化RemoteObject为字符串
   */
  private formatRemoteObject(obj: any): string {
    if (obj.value !== undefined) {
      return String(obj.value);
    }

    if (obj.description) {
      return obj.description;
    }

    if (obj.type === 'undefined') {
      return 'undefined';
    }

    if (obj.type === 'object' && obj.subtype === 'null') {
      return 'null';
    }

    return `[${obj.type}]`;
  }

  /**
   * 提取RemoteObject的值
   */
  private extractValue(obj: any): any {
    if (obj.value !== undefined) {
      return obj.value;
    }

    if (obj.type === 'undefined') {
      return undefined;
    }

    if (obj.type === 'object' && obj.subtype === 'null') {
      return null;
    }

    // 对于对象，返回objectId以便后续深度检查
    if (obj.objectId) {
      return {
        __objectId: obj.objectId,
        __type: obj.type,
        __description: obj.description,
      };
    }

    return obj.description || `[${obj.type}]`;
  }
}

