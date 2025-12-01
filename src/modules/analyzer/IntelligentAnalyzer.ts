/**
 * IntelligentAnalyzer - 智能数据分析和过滤
 * 
 * 核心功能：
 * 1. 智能过滤 - 过滤掉无关的网络请求和日志
 * 2. 数据聚合 - 将相似的请求/日志聚合在一起
 * 3. 优先级排序 - 根据重要性排序（加密算法、敏感API优先）
 * 4. 模式识别 - 识别常见的加密、签名、token生成模式
 * 5. 关键路径提取 - 提取关键的调用链路
 * 6. 数据摘要 - 生成简洁的摘要供AI分析
 * 
 * 解决问题：
 * - 网络请求太多（成百上千个）
 * - 控制台日志太多（框架日志、调试日志混杂）
 * - API调用太多（大量无关的第三方API）
 * - AI无法有效分析海量数据
 */

import type { NetworkRequest, NetworkResponse } from '../monitor/ConsoleMonitor.js';
import type { ConsoleMessage, ExceptionInfo } from '../monitor/ConsoleMonitor.js';
import { logger } from '../../utils/logger.js';
import type { LLMService } from '../../services/LLMService.js';

/**
 * 分析结果
 */
export interface AnalysisResult {
  // 关键网络请求（已过滤和排序）
  criticalRequests: NetworkRequest[];
  
  // 关键响应
  criticalResponses: NetworkResponse[];
  
  // 关键日志（已过滤框架日志）
  criticalLogs: ConsoleMessage[];
  
  // 异常信息
  exceptions: ExceptionInfo[];
  
  // 识别的模式
  patterns: {
    encryption?: EncryptionPattern[];
    signature?: SignaturePattern[];
    token?: TokenPattern[];
    antiDebug?: AntiDebugPattern[];
  };
  
  // 数据摘要
  summary: {
    totalRequests: number;
    filteredRequests: number;
    totalLogs: number;
    filteredLogs: number;
    suspiciousAPIs: string[];
    keyFunctions: string[];
  };
}

/**
 * 加密模式
 */
export interface EncryptionPattern {
  type: 'AES' | 'RSA' | 'MD5' | 'SHA' | 'Base64' | 'Custom';
  location: string; // URL或函数名
  confidence: number; // 0-1
  evidence: string[]; // 证据（关键字、特征）
}

/**
 * 签名模式
 */
export interface SignaturePattern {
  type: 'HMAC' | 'JWT' | 'Custom';
  location: string;
  parameters: string[]; // 参与签名的参数
  confidence: number;
}

/**
 * Token模式
 */
export interface TokenPattern {
  type: 'OAuth' | 'JWT' | 'Custom';
  location: string;
  format: string; // token格式
  confidence: number;
}

/**
 * 反调试模式
 */
export interface AntiDebugPattern {
  type: 'debugger' | 'console.log' | 'devtools-detect' | 'timing-check';
  location: string;
  code: string;
}

/**
 * 智能分析器
 */
export class IntelligentAnalyzer {
  private llmService?: LLMService;

  constructor(llmService?: LLMService) {
    this.llmService = llmService;
    if (llmService) {
      logger.info('IntelligentAnalyzer initialized with LLM support');
    } else {
      logger.warn('IntelligentAnalyzer initialized without LLM (using rule-based analysis only)');
    }
  }

  // 黑名单：常见的无关请求
  private static BLACKLIST_DOMAINS = [
    'google-analytics.com',
    'googletagmanager.com',
    'facebook.com/tr',
    'doubleclick.net',
    'googlesyndication.com',
    'clarity.ms',
    'hotjar.com',
    'segment.com',
    'mixpanel.com',
    'amplitude.com',
    'sentry.io',
    'bugsnag.com',
    'cdn.jsdelivr.net',
    'unpkg.com',
    'cdnjs.cloudflare.com',
  ];

  // 白名单：关键的API关键字
  private static WHITELIST_KEYWORDS = [
    'login',
    'auth',
    'token',
    'sign',
    'encrypt',
    'decrypt',
    'verify',
    'validate',
    'captcha',
    'api',
    'data',
    'user',
    'password',
    'secret',
    'key',
    'hash',
    'crypto',
  ];

  // 框架日志关键字（需要过滤）
  private static FRAMEWORK_LOG_KEYWORDS = [
    '[HMR]',
    '[WDS]',
    '[webpack]',
    'Download the React DevTools',
    'React DevTools',
    'Vue DevTools',
    'Angular DevTools',
    '%c',
    'color:',
    'font-size:',
  ];

  /**
   * 智能分析网络请求和日志
   */
  analyze(data: {
    requests: NetworkRequest[];
    responses: NetworkResponse[];
    logs: ConsoleMessage[];
    exceptions: ExceptionInfo[];
  }): AnalysisResult {
    logger.info('Starting intelligent analysis...', {
      requests: data.requests.length,
      responses: data.responses.length,
      logs: data.logs.length,
      exceptions: data.exceptions.length,
    });

    // 1. 过滤和排序网络请求
    const criticalRequests = this.filterCriticalRequests(data.requests);
    const criticalResponses = this.filterCriticalResponses(data.responses);

    // 2. 过滤和排序日志
    const criticalLogs = this.filterCriticalLogs(data.logs);

    // 3. 识别模式
    const patterns = {
      encryption: this.detectEncryptionPatterns(data.requests, data.logs),
      signature: this.detectSignaturePatterns(data.requests, data.logs),
      token: this.detectTokenPatterns(data.requests, data.logs),
      antiDebug: this.detectAntiDebugPatterns(data.logs),
    };

    // 4. 提取关键信息
    const suspiciousAPIs = this.extractSuspiciousAPIs(criticalRequests);
    const keyFunctions = this.extractKeyFunctions(criticalLogs);

    const result: AnalysisResult = {
      criticalRequests,
      criticalResponses,
      criticalLogs,
      exceptions: data.exceptions,
      patterns,
      summary: {
        totalRequests: data.requests.length,
        filteredRequests: criticalRequests.length,
        totalLogs: data.logs.length,
        filteredLogs: criticalLogs.length,
        suspiciousAPIs,
        keyFunctions,
      },
    };

    logger.success('Analysis completed', {
      criticalRequests: criticalRequests.length,
      criticalLogs: criticalLogs.length,
      patterns: Object.keys(patterns).length,
    });

    return result;
  }

  /**
   * 过滤关键网络请求
   */
  private filterCriticalRequests(requests: NetworkRequest[]): NetworkRequest[] {
    return requests
      .filter(req => {
        // 1. 过滤黑名单域名
        const isBlacklisted = IntelligentAnalyzer.BLACKLIST_DOMAINS.some(domain =>
          req.url.includes(domain)
        );
        if (isBlacklisted) return false;

        // 2. 过滤静态资源（图片、字体、CSS）
        const isStaticResource = /\.(png|jpg|jpeg|gif|svg|woff|woff2|ttf|css|ico)$/i.test(req.url);
        if (isStaticResource) return false;

        // 3. 保留包含关键字的请求
        const hasKeyword = IntelligentAnalyzer.WHITELIST_KEYWORDS.some(keyword =>
          req.url.toLowerCase().includes(keyword)
        );
        if (hasKeyword) return true;

        // 4. 保留POST请求（通常是API调用）
        if (req.method === 'POST' || req.method === 'PUT') return true;

        // 5. 保留包含查询参数的GET请求
        if (req.method === 'GET' && req.url.includes('?')) return true;

        return false;
      })
      .sort((a, b) => {
        // 优先级排序：POST > 包含关键字 > GET
        const scoreA = this.calculateRequestPriority(a);
        const scoreB = this.calculateRequestPriority(b);
        return scoreB - scoreA;
      });
  }

  /**
   * 计算请求优先级
   */
  private calculateRequestPriority(req: NetworkRequest): number {
    let score = 0;

    // POST/PUT请求 +10分
    if (req.method === 'POST' || req.method === 'PUT') score += 10;

    // 包含关键字 +5分/个
    const keywordCount = IntelligentAnalyzer.WHITELIST_KEYWORDS.filter(keyword =>
      req.url.toLowerCase().includes(keyword)
    ).length;
    score += keywordCount * 5;

    // 包含postData +5分
    if (req.postData) score += 5;

    // URL长度（可能包含加密参数） +1分/100字符
    score += Math.floor(req.url.length / 100);

    return score;
  }

  /**
   * 过滤关键响应
   */
  private filterCriticalResponses(responses: NetworkResponse[]): NetworkResponse[] {
    return responses
      .filter(res => {
        // 过滤黑名单域名
        const isBlacklisted = IntelligentAnalyzer.BLACKLIST_DOMAINS.some(domain =>
          res.url.includes(domain)
        );
        if (isBlacklisted) return false;

        // 保留JSON响应
        if (res.mimeType.includes('json')) return true;

        // 保留JavaScript响应
        if (res.mimeType.includes('javascript')) return true;

        // 保留包含关键字的响应
        const hasKeyword = IntelligentAnalyzer.WHITELIST_KEYWORDS.some(keyword =>
          res.url.toLowerCase().includes(keyword)
        );
        if (hasKeyword) return true;

        return false;
      })
      .sort((a, b) => b.timestamp - a.timestamp); // 按时间倒序
  }

  /**
   * 过滤关键日志
   */
  private filterCriticalLogs(logs: ConsoleMessage[]): ConsoleMessage[] {
    return logs
      .filter(log => {
        // 过滤框架日志
        const isFrameworkLog = IntelligentAnalyzer.FRAMEWORK_LOG_KEYWORDS.some(keyword =>
          log.text.includes(keyword)
        );
        if (isFrameworkLog) return false;

        // 过滤空日志
        if (!log.text || log.text.trim().length === 0) return false;

        // 保留error和warn
        if (log.type === 'error' || log.type === 'warn') return true;

        // 保留包含关键字的日志
        const hasKeyword = IntelligentAnalyzer.WHITELIST_KEYWORDS.some(keyword =>
          log.text.toLowerCase().includes(keyword)
        );
        if (hasKeyword) return true;

        return false;
      })
      .sort((a, b) => {
        // 优先级：error > warn > 包含关键字 > 其他
        const scoreA = this.calculateLogPriority(a);
        const scoreB = this.calculateLogPriority(b);
        return scoreB - scoreA;
      });
  }

  /**
   * 计算日志优先级
   */
  private calculateLogPriority(log: ConsoleMessage): number {
    let score = 0;

    if (log.type === 'error') score += 20;
    if (log.type === 'warn') score += 10;

    const keywordCount = IntelligentAnalyzer.WHITELIST_KEYWORDS.filter(keyword =>
      log.text.toLowerCase().includes(keyword)
    ).length;
    score += keywordCount * 5;

    return score;
  }

  // ==================== 模式识别功能 ====================

  /**
   * 检测加密模式
   */
  private detectEncryptionPatterns(
    requests: NetworkRequest[],
    logs: ConsoleMessage[]
  ): EncryptionPattern[] {
    const patterns: EncryptionPattern[] = [];

    // 加密算法关键字
    const cryptoKeywords = {
      AES: ['aes', 'cipher', 'encrypt', 'decrypt', 'CryptoJS.AES'],
      RSA: ['rsa', 'publickey', 'privatekey', 'RSA.encrypt'],
      MD5: ['md5', 'MD5', 'CryptoJS.MD5'],
      SHA: ['sha', 'sha1', 'sha256', 'sha512', 'CryptoJS.SHA'],
      Base64: ['base64', 'btoa', 'atob', 'Base64.encode'],
    };

    // 1. 从请求URL中检测
    for (const req of requests) {
      for (const [type, keywords] of Object.entries(cryptoKeywords)) {
        for (const keyword of keywords) {
          if (req.url.toLowerCase().includes(keyword.toLowerCase())) {
            patterns.push({
              type: type as any,
              location: req.url,
              confidence: 0.7,
              evidence: [keyword, 'Found in URL'],
            });
          }
        }
      }

      // 检测postData中的加密特征
      if (req.postData) {
        const postData = req.postData.toLowerCase();
        for (const [type, keywords] of Object.entries(cryptoKeywords)) {
          for (const keyword of keywords) {
            if (postData.includes(keyword.toLowerCase())) {
              patterns.push({
                type: type as any,
                location: req.url,
                confidence: 0.8,
                evidence: [keyword, 'Found in POST data'],
              });
            }
          }
        }
      }
    }

    // 2. 从日志中检测
    for (const log of logs) {
      const text = log.text.toLowerCase();
      for (const [type, keywords] of Object.entries(cryptoKeywords)) {
        for (const keyword of keywords) {
          if (text.includes(keyword.toLowerCase())) {
            patterns.push({
              type: type as any,
              location: log.url || 'console',
              confidence: 0.9,
              evidence: [keyword, 'Found in console log', log.text.substring(0, 100)],
            });
          }
        }
      }
    }

    // 去重
    return this.deduplicatePatterns(patterns);
  }

  /**
   * 检测签名模式（增强版 - 检测URL参数、headers、POST body）
   */
  private detectSignaturePatterns(
    requests: NetworkRequest[],
    _logs: ConsoleMessage[] // 前缀_表示未使用但保留接口一致性
  ): SignaturePattern[] {
    const patterns: SignaturePattern[] = [];

    // 签名相关关键字（更全面）
    const signatureKeywords = [
      'sign',
      'signature',
      'sig',
      'hmac',
      'hash',
      'digest',
      'checksum',
      'verify',
      'validation',
    ];

    for (const req of requests) {
      // 🆕 1. 检测URL参数中的签名
      if (req.url.includes('?')) {
        try {
          const url = new URL(req.url);
          const params = url.searchParams;
          const paramNames = Array.from(params.keys());

          for (const keyword of signatureKeywords) {
            const matchedParams = paramNames.filter(p => p.toLowerCase().includes(keyword));

            if (matchedParams.length > 0) {
              // 推断签名类型
              let signType: 'HMAC' | 'JWT' | 'Custom' = 'Custom';
              if (keyword.includes('hmac')) signType = 'HMAC';
              else if (keyword.includes('jwt')) signType = 'JWT';

              // 收集可能参与签名的参数（排除签名参数本身）
              const otherParams = paramNames.filter(p =>
                !matchedParams.includes(p) &&
                !p.toLowerCase().includes('callback') && // 排除JSONP callback
                !p.toLowerCase().includes('_') // 排除内部参数
              );

              patterns.push({
                type: signType,
                location: `${req.url} (URL params)`,
                parameters: otherParams,
                confidence: 0.82,
              });
            }
          }
        } catch (e) {
          // URL解析失败
        }
      }

      // 🆕 2. 检测headers中的签名
      if (req.headers) {
        for (const [headerName, headerValue] of Object.entries(req.headers)) {
          const headerNameLower = headerName.toLowerCase();

          // 检查header名称是否包含签名关键字
          const isSignatureHeader = signatureKeywords.some(keyword =>
            headerNameLower.includes(keyword)
          );

          if (isSignatureHeader && headerValue) {
            // 根据header值的特征推断签名类型
            let signType: 'HMAC' | 'JWT' | 'Custom' = 'Custom';
            let confidence = 0.75;

            // HMAC通常是64字符的hex字符串（SHA-256）或更长
            if (/^[a-f0-9]{64,}$/i.test(headerValue)) {
              signType = 'HMAC';
              confidence = 0.88;
            }
            // JWT格式
            else if (/^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+$/.test(headerValue)) {
              signType = 'JWT';
              confidence = 0.92;
            }

            // 收集可能参与签名的其他headers
            const otherHeaders = Object.keys(req.headers).filter(h =>
              h.toLowerCase() !== headerNameLower &&
              !h.toLowerCase().includes('content-type') &&
              !h.toLowerCase().includes('user-agent')
            );

            patterns.push({
              type: signType,
              location: `${req.url} (header: ${headerName})`,
              parameters: otherHeaders,
              confidence,
            });
          }
        }
      }

      // 🆕 3. 检测POST body中的签名
      if (req.postData && req.postData.length > 0) {
        try {
          // 尝试解析JSON
          const bodyData = JSON.parse(req.postData);

          for (const [key, value] of Object.entries(bodyData)) {
            const keyLower = key.toLowerCase();
            const isSignatureField = signatureKeywords.some(keyword => keyLower.includes(keyword));

            if (isSignatureField && typeof value === 'string') {
              // 推断签名类型
              let signType: 'HMAC' | 'JWT' | 'Custom' = 'Custom';
              let confidence = 0.7;

              if (/^[a-f0-9]{64,}$/i.test(value)) {
                signType = 'HMAC';
                confidence = 0.85;
              } else if (/^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+$/.test(value)) {
                signType = 'JWT';
                confidence = 0.9;
              }

              // 收集可能参与签名的其他字段
              const otherFields = Object.keys(bodyData).filter(k => k !== key);

              patterns.push({
                type: signType,
                location: `${req.url} (POST body: ${key})`,
                parameters: otherFields,
                confidence,
              });
            }
          }
        } catch (e) {
          // 不是JSON，尝试检测form-urlencoded
          for (const keyword of signatureKeywords) {
            if (req.postData.includes(`${keyword}=`)) {
              patterns.push({
                type: 'Custom',
                location: `${req.url} (POST body)`,
                parameters: ['form-urlencoded data'],
                confidence: 0.65,
              });
              break; // 只添加一次
            }
          }
        }
      }
    }

    return patterns;
  }

  /**
   * 检测Token模式（增强版 - 检测所有可能的header）
   */
  private detectTokenPatterns(
    requests: NetworkRequest[],
    _logs: ConsoleMessage[] // 前缀_表示未使用但保留接口一致性
  ): TokenPattern[] {
    const patterns: TokenPattern[] = [];

    // JWT格式检测（xxx.yyy.zzz）
    const jwtRegex = /[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+/g;

    // Token相关的header名称关键字（不区分大小写）
    const tokenHeaderKeywords = [
      'authorization',
      'token',
      'auth',
      'access',
      'bearer',
      'session',
      'credential',
      'api-key',
      'apikey',
      'x-token',
      'x-auth',
      'x-access',
      'x-api-key',
      'x-session',
    ];

    for (const req of requests) {
      // 🆕 检测所有headers中的token（不仅仅是Authorization）
      if (req.headers) {
        for (const [headerName, headerValue] of Object.entries(req.headers)) {
          const headerNameLower = headerName.toLowerCase();

          // 检查header名称是否包含token相关关键字
          const isTokenHeader = tokenHeaderKeywords.some(keyword =>
            headerNameLower.includes(keyword)
          );

          if (isTokenHeader && headerValue) {
            // 检测JWT格式
            const jwtMatch = headerValue.match(jwtRegex);
            if (jwtMatch) {
              patterns.push({
                type: 'JWT',
                location: `${req.url} (header: ${headerName})`,
                format: `JWT in ${headerName} header`,
                confidence: 0.95,
              });
            }
            // 检测Bearer token
            else if (headerValue.toLowerCase().startsWith('bearer ')) {
              patterns.push({
                type: 'Custom',
                location: `${req.url} (header: ${headerName})`,
                format: `Bearer token in ${headerName} header`,
                confidence: 0.9,
              });
            }
            // 检测其他格式的token（长度>20的字符串）
            else if (headerValue.length > 20 && /^[A-Za-z0-9_\-+=\/]+$/.test(headerValue)) {
              patterns.push({
                type: 'Custom',
                location: `${req.url} (header: ${headerName})`,
                format: `Custom token in ${headerName} header (length: ${headerValue.length})`,
                confidence: 0.75,
              });
            }
          }
        }
      }

      // 检测URL中的token参数（增强版）
      if (req.url.includes('?')) {
        try {
          const url = new URL(req.url);
          const params = url.searchParams;

          // Token相关的参数名关键字
          const tokenParamKeywords = [
            'token',
            'access_token',
            'accesstoken',
            'auth',
            'authorization',
            'session',
            'sessionid',
            'api_key',
            'apikey',
            'key',
            'credential',
          ];

          for (const [paramName, paramValue] of params.entries()) {
            const paramNameLower = paramName.toLowerCase();

            // 检查参数名是否包含token关键字
            const isTokenParam = tokenParamKeywords.some(keyword =>
              paramNameLower.includes(keyword)
            );

            if (isTokenParam && paramValue) {
              // 检测JWT格式
              const jwtMatch = paramValue.match(jwtRegex);
              if (jwtMatch) {
                patterns.push({
                  type: 'JWT',
                  location: `${req.url} (param: ${paramName})`,
                  format: `JWT in URL parameter '${paramName}'`,
                  confidence: 0.92,
                });
              }
              // 检测OAuth token
              else if (paramName.toLowerCase().includes('access_token')) {
                patterns.push({
                  type: 'OAuth',
                  location: `${req.url} (param: ${paramName})`,
                  format: `OAuth token in URL parameter '${paramName}'`,
                  confidence: 0.88,
                });
              }
              // 检测其他格式的token
              else if (paramValue.length > 20) {
                patterns.push({
                  type: 'Custom',
                  location: `${req.url} (param: ${paramName})`,
                  format: `Custom token in URL parameter '${paramName}' (length: ${paramValue.length})`,
                  confidence: 0.7,
                });
              }
            }
          }
        } catch (e) {
          // URL解析失败，忽略
        }
      }

      // 🆕 检测POST body中的token（如果有postData）
      if (req.postData && req.postData.length > 0) {
        try {
          // 尝试解析JSON
          const bodyData = JSON.parse(req.postData);

          const tokenParamKeywords = ['token', 'access_token', 'auth', 'authorization', 'session', 'api_key'];

          for (const [key, value] of Object.entries(bodyData)) {
            const keyLower = key.toLowerCase();
            const isTokenField = tokenParamKeywords.some(keyword => keyLower.includes(keyword));

            if (isTokenField && typeof value === 'string' && value.length > 20) {
              const jwtMatch = value.match(jwtRegex);
              if (jwtMatch) {
                patterns.push({
                  type: 'JWT',
                  location: `${req.url} (POST body: ${key})`,
                  format: `JWT in POST body field '${key}'`,
                  confidence: 0.93,
                });
              } else {
                patterns.push({
                  type: 'Custom',
                  location: `${req.url} (POST body: ${key})`,
                  format: `Custom token in POST body field '${key}' (length: ${value.length})`,
                  confidence: 0.72,
                });
              }
            }
          }
        } catch (e) {
          // 不是JSON或解析失败，尝试URL编码格式
          const tokenParamKeywords = ['token', 'access_token', 'auth', 'session', 'api_key'];
          for (const keyword of tokenParamKeywords) {
            if (req.postData.includes(`${keyword}=`)) {
              patterns.push({
                type: 'Custom',
                location: `${req.url} (POST body)`,
                format: `Token in POST body (form-urlencoded, field: ${keyword})`,
                confidence: 0.68,
              });
            }
          }
        }
      }
    }

    return patterns;
  }

  /**
   * 检测反调试模式
   */
  private detectAntiDebugPatterns(logs: ConsoleMessage[]): AntiDebugPattern[] {
    const patterns: AntiDebugPattern[] = [];

    for (const log of logs) {
      const text = log.text;

      // 检测debugger语句
      if (text.includes('debugger')) {
        patterns.push({
          type: 'debugger',
          location: log.url || 'unknown',
          code: text.substring(0, 200),
        });
      }

      // 检测console.log清除
      if (text.includes('console.log') && text.includes('=')) {
        patterns.push({
          type: 'console.log',
          location: log.url || 'unknown',
          code: text.substring(0, 200),
        });
      }

      // 检测DevTools检测
      if (text.includes('devtools') || text.includes('firebug')) {
        patterns.push({
          type: 'devtools-detect',
          location: log.url || 'unknown',
          code: text.substring(0, 200),
        });
      }

      // 检测时间检测（反调试）
      if (text.includes('performance.now') || text.includes('Date.now')) {
        patterns.push({
          type: 'timing-check',
          location: log.url || 'unknown',
          code: text.substring(0, 200),
        });
      }
    }

    return patterns;
  }

  /**
   * 提取可疑API
   */
  private extractSuspiciousAPIs(requests: NetworkRequest[]): string[] {
    const apis = new Set<string>();

    for (const req of requests) {
      try {
        const url = new URL(req.url);
        const path = url.pathname;

        // 提取API路径（去除参数）
        if (path.includes('/api/') || path.includes('/v1/') || path.includes('/v2/')) {
          apis.add(`${req.method} ${path}`);
        }
      } catch (e) {
        // 忽略无效URL
      }
    }

    return Array.from(apis).slice(0, 20); // 最多返回20个
  }

  /**
   * 提取关键函数
   */
  private extractKeyFunctions(logs: ConsoleMessage[]): string[] {
    const functions = new Set<string>();

    // 函数调用模式：functionName(
    const functionRegex = /([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/g;

    for (const log of logs) {
      const matches = log.text.matchAll(functionRegex);
      for (const match of matches) {
        const funcName = match[1];

        // 过滤常见的内置函数
        if (funcName && !['console', 'log', 'warn', 'error', 'info', 'debug'].includes(funcName)) {
          functions.add(funcName);
        }
      }
    }

    return Array.from(functions).slice(0, 30); // 最多返回30个
  }

  /**
   * 去重模式
   */
  private deduplicatePatterns<T extends { location: string; type: string }>(
    patterns: T[]
  ): T[] {
    const seen = new Set<string>();
    const result: T[] = [];

    for (const pattern of patterns) {
      const key = `${pattern.type}-${pattern.location}`;
      if (!seen.has(key)) {
        seen.add(key);
        result.push(pattern);
      }
    }

    return result;
  }

  // ==================== 数据聚合功能 ====================

  /**
   * 聚合相似的请求
   */
  aggregateSimilarRequests(requests: NetworkRequest[]): Map<string, NetworkRequest[]> {
    const groups = new Map<string, NetworkRequest[]>();

    for (const req of requests) {
      try {
        const url = new URL(req.url);
        const baseUrl = `${url.origin}${url.pathname}`; // 去除查询参数

        if (!groups.has(baseUrl)) {
          groups.set(baseUrl, []);
        }
        groups.get(baseUrl)!.push(req);
      } catch (e) {
        // 忽略无效URL
      }
    }

    return groups;
  }

  /**
   * 生成AI友好的摘要
   */
  generateAIFriendlySummary(result: AnalysisResult): string {
    const lines: string[] = [];

    lines.push('=== 智能分析摘要 ===\n');

    // 1. 总体统计
    lines.push(`📊 数据统计:`);
    lines.push(`  - 总请求数: ${result.summary.totalRequests} → 关键请求: ${result.summary.filteredRequests}`);
    lines.push(`  - 总日志数: ${result.summary.totalLogs} → 关键日志: ${result.summary.filteredLogs}`);
    lines.push(`  - 异常数: ${result.exceptions.length}\n`);

    // 2. 可疑API
    if (result.summary.suspiciousAPIs.length > 0) {
      lines.push(`🔍 可疑API (${result.summary.suspiciousAPIs.length}):`);
      result.summary.suspiciousAPIs.slice(0, 10).forEach(api => {
        lines.push(`  - ${api}`);
      });
      lines.push('');
    }

    // 3. 加密模式
    if (result.patterns.encryption && result.patterns.encryption.length > 0) {
      lines.push(`🔐 检测到加密算法 (${result.patterns.encryption.length}):`);
      result.patterns.encryption.slice(0, 5).forEach(pattern => {
        lines.push(`  - ${pattern.type} (置信度: ${(pattern.confidence * 100).toFixed(0)}%)`);
        lines.push(`    位置: ${pattern.location}`);
        lines.push(`    证据: ${pattern.evidence.join(', ')}`);
      });
      lines.push('');
    }

    // 4. 签名模式
    if (result.patterns.signature && result.patterns.signature.length > 0) {
      lines.push(`✍️ 检测到签名算法 (${result.patterns.signature.length}):`);
      result.patterns.signature.slice(0, 5).forEach(pattern => {
        lines.push(`  - ${pattern.type}`);
        lines.push(`    参数: ${pattern.parameters.join(', ')}`);
      });
      lines.push('');
    }

    // 5. 反调试
    if (result.patterns.antiDebug && result.patterns.antiDebug.length > 0) {
      lines.push(`⚠️ 检测到反调试技术 (${result.patterns.antiDebug.length}):`);
      result.patterns.antiDebug.slice(0, 3).forEach(pattern => {
        lines.push(`  - ${pattern.type}`);
      });
      lines.push('');
    }

    // 6. 关键函数
    if (result.summary.keyFunctions.length > 0) {
      lines.push(`🎯 关键函数 (${result.summary.keyFunctions.length}):`);
      lines.push(`  ${result.summary.keyFunctions.slice(0, 15).join(', ')}`);
      lines.push('');
    }

    lines.push('=== 分析完成 ===');

    return lines.join('\n');
  }

  // ==================== 🆕 LLM增强分析功能 ====================

  /**
   * 使用LLM动态分析网络请求（识别加密、签名、token等）
   *
   * 优化技术（参考LLMService最佳实践）：
   * 1. Role-based prompting - 明确专家角色
   * 2. Structured output - 严格JSON Schema
   * 3. Few-shot learning - 提供示例
   * 4. Chain-of-Thought - 引导分析步骤
   * 5. Confidence scoring - 不确定性量化
   */
  async analyzeCriticalRequestsWithLLM(requests: NetworkRequest[]): Promise<{
    encryption: EncryptionPattern[];
    signature: SignaturePattern[];
    token: TokenPattern[];
    customPatterns: Array<{
      type: string;
      description: string;
      location: string;
      confidence: number;
    }>;
  }> {
    if (!this.llmService) {
      logger.warn('LLM service not available, skipping LLM analysis');
      return { encryption: [], signature: [], token: [], customPatterns: [] };
    }

    logger.info('Starting LLM-enhanced request analysis...');

    // 构建分析提示词（限制数据量，提取关键信息）
    const requestSummary = requests.slice(0, 20).map(req => {
      // 提取URL参数
      const urlObj = new URL(req.url, 'http://dummy.com');
      const params = Object.fromEntries(urlObj.searchParams.entries());

      return {
        url: req.url,
        method: req.method,
        urlParams: params,
        headers: req.headers,
        postData: req.postData?.substring(0, 500),
      };
    });

    const systemPrompt = `# Role
You are a senior security researcher and reverse engineer specializing in:
- Web API security analysis and cryptographic pattern recognition
- Authentication and authorization mechanism identification (OAuth, JWT, SAML, custom tokens)
- Encryption algorithm detection (AES, RSA, DES, 3DES, ChaCha20, etc.)
- Signature scheme analysis (HMAC, RSA-PSS, ECDSA, custom signing)
- Parameter encoding and obfuscation techniques (Base64, Hex, URL encoding, custom encoding)

# Expertise Areas
- **Symmetric Encryption**: AES (CBC, GCM, CTR), DES, 3DES, Blowfish, ChaCha20
- **Asymmetric Encryption**: RSA (PKCS1, OAEP), ECC, ElGamal
- **Hash Functions**: MD5, SHA-1, SHA-256, SHA-512, BLAKE2, RIPEMD
- **MAC**: HMAC-SHA256, HMAC-SHA512, CMAC
- **Encoding**: Base64, Hex, URL encoding, custom Base variants
- **Token Formats**: JWT (HS256, RS256), OAuth 2.0, SAML, custom tokens

# Task
Analyze HTTP requests to identify cryptographic patterns, authentication mechanisms, and security-related parameters.

# Analysis Methodology
1. **URL Analysis**: Examine URL paths and query parameters for crypto-related keywords
2. **Header Analysis**: Check Authorization, X-Signature, X-Token headers
3. **Parameter Analysis**: Identify encrypted/encoded parameters by pattern (length, charset, format)
4. **Signature Detection**: Look for sign/signature/hmac parameters and their dependencies
5. **Token Detection**: Identify JWT (xxx.yyy.zzz), OAuth tokens, session tokens
6. **Custom Pattern Recognition**: Detect proprietary encryption/signing schemes

# Output Requirements
- Return ONLY valid JSON (no markdown, no explanations)
- Use confidence scores (0.0-1.0) for uncertain detections
- Provide specific evidence for each detection
- Be precise and avoid hallucination`;

    const userPrompt = `# Network Requests to Analyze
\`\`\`json
${JSON.stringify(requestSummary, null, 2)}
\`\`\`

# Required Output Schema
Return a JSON object with this EXACT structure (all fields required):

\`\`\`json
{
  "encryption": [
    {
      "type": "AES-256-CBC | RSA-2048 | MD5 | SHA-256 | Base64 | Custom",
      "location": "URL parameter name or header name",
      "confidence": 0.95,
      "evidence": [
        "Parameter 'data' has Base64-like pattern (length=344, charset=[A-Za-z0-9+/=])",
        "Parameter name contains 'encrypt' keyword"
      ],
      "parameters": {
        "parameterName": "data",
        "sampleValue": "first 50 chars of encrypted data...",
        "detectedPattern": "Base64 | Hex | Custom",
        "estimatedKeySize": "128 | 192 | 256 | null"
      }
    }
  ],
  "signature": [
    {
      "type": "HMAC-SHA256 | JWT-RS256 | Custom",
      "location": "URL or header",
      "parameters": ["timestamp", "nonce", "data"],
      "confidence": 0.88,
      "signatureParameter": "sign",
      "algorithm": "detected or inferred algorithm",
      "evidence": [
        "Found 'sign' parameter with 64-char hex string (SHA-256 output length)",
        "Request includes timestamp and nonce (common in HMAC)"
      ]
    }
  ],
  "token": [
    {
      "type": "JWT | OAuth2 | Custom",
      "location": "Authorization header | URL parameter",
      "format": "Bearer JWT | URL parameter 'access_token'",
      "confidence": 0.98,
      "tokenStructure": "xxx.yyy.zzz (JWT) | opaque string",
      "evidence": [
        "Authorization header contains 'Bearer' prefix",
        "Token matches JWT pattern (3 Base64 segments separated by dots)"
      ]
    }
  ],
  "customPatterns": [
    {
      "type": "Anti-replay | Rate limiting | Custom encryption | Other",
      "description": "Detailed description of the pattern",
      "location": "URL or header",
      "confidence": 0.75,
      "relatedParameters": ["param1", "param2"],
      "evidence": ["evidence 1", "evidence 2"]
    }
  ]
}
\`\`\`

# Example Output (for reference)
\`\`\`json
{
  "encryption": [
    {
      "type": "AES-256-CBC",
      "location": "POST data parameter 'encryptedData'",
      "confidence": 0.92,
      "evidence": [
        "Parameter value is Base64-encoded (length=344, divisible by 4)",
        "Decoded length suggests AES block cipher (multiple of 16 bytes)",
        "Parameter name explicitly mentions 'encrypted'"
      ],
      "parameters": {
        "parameterName": "encryptedData",
        "sampleValue": "U2FsdGVkX1+1234567890abcdefghijklmnopqrstuvwxyz...",
        "detectedPattern": "Base64",
        "estimatedKeySize": "256"
      }
    }
  ],
  "signature": [
    {
      "type": "HMAC-SHA256",
      "location": "URL parameter 'sign'",
      "parameters": ["timestamp", "nonce", "appId", "data"],
      "confidence": 0.95,
      "signatureParameter": "sign",
      "algorithm": "HMAC-SHA256",
      "evidence": [
        "Signature is 64-char hex string (SHA-256 output)",
        "Request includes timestamp, nonce (anti-replay)",
        "All parameters except 'sign' likely participate in signing"
      ]
    }
  ],
  "token": [
    {
      "type": "JWT",
      "location": "Authorization header",
      "format": "Bearer JWT (HS256)",
      "confidence": 0.99,
      "tokenStructure": "eyJhbGc.eyJzdWI.SflKxwRJ",
      "evidence": [
        "Perfect JWT format: header.payload.signature",
        "Header decodes to {\"alg\":\"HS256\",\"typ\":\"JWT\"}",
        "Payload contains standard claims (sub, exp, iat)"
      ]
    }
  ],
  "customPatterns": [
    {
      "type": "Anti-replay mechanism",
      "description": "Uses timestamp + nonce to prevent replay attacks",
      "location": "URL parameters",
      "confidence": 0.88,
      "relatedParameters": ["timestamp", "nonce"],
      "evidence": [
        "Timestamp parameter present in all requests",
        "Nonce appears to be random UUID",
        "Both parameters likely included in signature calculation"
      ]
    }
  ]
}
\`\`\`

Now analyze the provided requests and return ONLY the JSON output (no additional text).`;

    try {
      const response = await this.llmService.chat([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ], { temperature: 0.2, maxTokens: 3000 });

      const result = JSON.parse(response.content);

      logger.success('LLM request analysis completed', {
        encryption: result.encryption?.length || 0,
        signature: result.signature?.length || 0,
        token: result.token?.length || 0,
        custom: result.customPatterns?.length || 0,
      });

      return result;
    } catch (error) {
      logger.error('LLM request analysis failed:', error);
      return { encryption: [], signature: [], token: [], customPatterns: [] };
    }
  }

  /**
   * 使用LLM动态分析控制台日志（识别关键函数、数据流等）
   *
   * 优化技术：
   * 1. Domain expertise - JavaScript逆向工程专业知识
   * 2. Pattern recognition - 识别反调试、混淆、加密模式
   * 3. Semantic understanding - 理解代码真实意图
   * 4. Security assessment - 基于OWASP标准评估
   */
  async analyzeCriticalLogsWithLLM(logs: ConsoleMessage[]): Promise<{
    keyFunctions: Array<{
      name: string;
      purpose: string;
      confidence: number;
    }>;
    dataFlow: string;
    suspiciousPatterns: Array<{
      type: string;
      description: string;
      location: string;
    }>;
  }> {
    if (!this.llmService) {
      logger.warn('LLM service not available, skipping LLM log analysis');
      return { keyFunctions: [], dataFlow: '', suspiciousPatterns: [] };
    }

    logger.info('Starting LLM-enhanced log analysis...');

    // 构建日志摘要（提取关键信息）
    const logSummary = logs.slice(0, 50).map((log, index) => ({
      index,
      type: log.type,
      text: log.text.substring(0, 300), // 增加长度以获取更多上下文
      url: log.url,
      lineNumber: log.lineNumber,
      stackTrace: log.stackTrace?.slice(0, 3), // 前3层调用栈
    }));

    const systemPrompt = `# Role
You are an expert JavaScript reverse engineer and security analyst specializing in:
- Console log analysis and code behavior understanding
- Anti-debugging technique detection (debugger statements, DevTools detection, timing checks)
- Code obfuscation pattern recognition (string arrays, control flow flattening, VM protection)
- Cryptographic operation identification from runtime logs
- Data flow analysis and sensitive information leakage detection
- Framework and library identification from console output

# Known Patterns
**Anti-Debugging**:
- debugger statements
- DevTools detection (window.outerHeight - window.innerHeight)
- Function.prototype.toString checks
- Timing-based detection (performance.now, Date.now)
- Console.log redirection/blocking

**Obfuscation Indicators**:
- Mangled variable names (_0x1234, _0xabcd)
- String array decoders
- Control flow state machines
- Eval/Function constructor usage

**Crypto Operations**:
- CryptoJS, crypto-js, JSEncrypt, forge library calls
- Web Crypto API usage (crypto.subtle)
- Custom encryption function calls

**Sensitive Operations**:
- localStorage/sessionStorage access
- Cookie manipulation
- XHR/Fetch API calls
- WebSocket connections

# Task
Analyze console logs to:
1. Identify key functions and their purposes
2. Map data flow through the application
3. Detect suspicious patterns (anti-debugging, obfuscation, crypto)
4. Assess security implications

# Analysis Standards
- Use OWASP guidelines for security assessment
- Provide confidence scores for uncertain identifications
- Be precise and avoid hallucination
- Focus on actionable insights`;

    const userPrompt = `# Console Logs to Analyze
\`\`\`json
${JSON.stringify(logSummary, null, 2)}
\`\`\`

# Required Output Schema
Return ONLY valid JSON with this exact structure:

\`\`\`json
{
  "keyFunctions": [
    {
      "name": "function name (e.g., 'encryptPassword', '_0x1a2b')",
      "purpose": "what the function does",
      "confidence": 0.92,
      "evidence": ["log index 5 shows function call", "parameter suggests encryption"],
      "category": "encryption | authentication | data-processing | network | obfuscation | other"
    }
  ],
  "dataFlow": "Concise description of how data flows through the application based on logs",
  "suspiciousPatterns": [
    {
      "type": "anti-debugging | obfuscation | crypto | data-leakage | other",
      "description": "Detailed description of the suspicious pattern",
      "location": "log index or URL",
      "severity": "critical | high | medium | low",
      "evidence": ["specific log entries that support this finding"],
      "recommendation": "how to investigate or mitigate"
    }
  ],
  "frameworkDetection": {
    "detected": true,
    "frameworks": ["React 18.x", "Axios 1.x"],
    "confidence": 0.88,
    "evidence": ["log mentions React DevTools", "axios request interceptor"]
  },
  "securityConcerns": [
    {
      "type": "XSS | Sensitive data exposure | Insecure crypto | Other",
      "description": "what's the concern",
      "severity": "critical | high | medium | low",
      "cwe": "CWE-79",
      "affectedLogs": [1, 5, 12]
    }
  ]
}
\`\`\`

# Example Output
\`\`\`json
{
  "keyFunctions": [
    {
      "name": "encryptUserData",
      "purpose": "Encrypts user credentials before sending to server",
      "confidence": 0.95,
      "evidence": [
        "Log 3: 'Encrypting password...'",
        "Log 5: CryptoJS.AES.encrypt called",
        "Log 7: 'Encrypted data: U2FsdGVk...'"
      ],
      "category": "encryption"
    },
    {
      "name": "_0x1a2b",
      "purpose": "String array decoder (obfuscation)",
      "confidence": 0.88,
      "evidence": [
        "Log 1: Function accesses array with numeric index",
        "Log 2: Returns decoded string",
        "Mangled name suggests obfuscation"
      ],
      "category": "obfuscation"
    }
  ],
  "dataFlow": "User input -> validation -> encryption (AES-256) -> API request -> response decryption -> UI update. Sensitive data (password) is encrypted before transmission.",
  "suspiciousPatterns": [
    {
      "type": "anti-debugging",
      "description": "Code checks for DevTools using window size comparison",
      "location": "Log index 10",
      "severity": "medium",
      "evidence": [
        "Log 10: 'if(window.outerHeight - window.innerHeight > 100)'",
        "This is a common DevTools detection technique"
      ],
      "recommendation": "Investigate why the application tries to detect debugging. May indicate anti-reverse-engineering measures."
    },
    {
      "type": "obfuscation",
      "description": "Heavy use of mangled variable names and string array",
      "location": "Multiple logs",
      "severity": "low",
      "evidence": [
        "Logs 1-5: Variables named _0x1234, _0xabcd",
        "Log 2: String array access pattern"
      ],
      "recommendation": "Code is obfuscated. Use deobfuscation tools or manual analysis."
    }
  ],
  "frameworkDetection": {
    "detected": true,
    "frameworks": ["React 18.2", "CryptoJS 4.1"],
    "confidence": 0.92,
    "evidence": [
      "Log 15: 'Download the React DevTools'",
      "Log 5: 'CryptoJS.AES.encrypt'"
    ]
  },
  "securityConcerns": [
    {
      "type": "Sensitive data exposure",
      "description": "Password appears in console log before encryption",
      "severity": "high",
      "cwe": "CWE-532",
      "affectedLogs": [2]
    }
  ]
}
\`\`\`

Now analyze the logs and return ONLY the JSON output (no additional text).`;

    try {
      const response = await this.llmService.chat([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ], { temperature: 0.2, maxTokens: 2500 });

      const result = JSON.parse(response.content);

      logger.success('LLM log analysis completed', {
        keyFunctions: result.keyFunctions?.length || 0,
        suspiciousPatterns: result.suspiciousPatterns?.length || 0,
      });

      return result;
    } catch (error) {
      logger.error('LLM log analysis failed:', error);
      return { keyFunctions: [], dataFlow: '', suspiciousPatterns: [] };
    }
  }

  /**
   * 🆕 使用LLM扩展关键字列表（动态学习）
   *
   * 优化技术：
   * 1. Context-aware learning - 基于实际网站行为学习
   * 2. Domain-specific keywords - 针对特定领域提取关键字
   * 3. Pattern generalization - 从具体案例推广到通用模式
   */
  async expandKeywordsWithLLM(context: {
    domain: string;
    requests: NetworkRequest[];
    logs: ConsoleMessage[];
  }): Promise<{
    apiKeywords: string[];
    cryptoKeywords: string[];
    frameworkKeywords: string[];
    businessKeywords: string[];
  }> {
    if (!this.llmService) {
      return { apiKeywords: [], cryptoKeywords: [], frameworkKeywords: [], businessKeywords: [] };
    }

    logger.info('Expanding keywords with LLM...');

    // 提取URL路径和参数
    const urlPatterns = context.requests.slice(0, 15).map(r => {
      try {
        const url = new URL(r.url);
        return {
          path: url.pathname,
          params: Array.from(url.searchParams.keys()),
          method: r.method,
        };
      } catch {
        return { path: r.url, params: [], method: r.method };
      }
    });

    // 提取日志中的关键词
    const logKeywords = context.logs.slice(0, 20).map(l => l.text.substring(0, 150));

    const systemPrompt = `# Role
You are a web application security analyst and reverse engineer specializing in:
- API endpoint pattern recognition
- Business logic inference from network traffic
- Framework and library identification
- Cryptographic operation detection
- Domain-specific terminology extraction

# Task
Analyze the provided network requests and console logs to infer relevant keywords that can help filter and prioritize future analysis.

# Methodology
1. **API Keywords**: Extract common API-related terms from URL paths and parameters
2. **Crypto Keywords**: Identify encryption, hashing, signing related terms
3. **Framework Keywords**: Detect framework-specific patterns and terminology
4. **Business Keywords**: Infer business domain terms (e.g., 'order', 'payment', 'user')

# Output Requirements
- Return ONLY valid JSON
- Keywords should be lowercase
- Avoid generic terms (e.g., 'data', 'info')
- Focus on actionable, specific keywords
- Limit to 10-15 keywords per category`;

    const userPrompt = `# Website Domain
${context.domain}

# URL Patterns (${urlPatterns.length} samples)
\`\`\`json
${JSON.stringify(urlPatterns, null, 2)}
\`\`\`

# Console Log Samples (${logKeywords.length} samples)
\`\`\`
${logKeywords.join('\n---\n')}
\`\`\`

# Required Output Schema
\`\`\`json
{
  "apiKeywords": [
    "string (e.g., 'auth', 'login', 'verify', 'validate')"
  ],
  "cryptoKeywords": [
    "string (e.g., 'encrypt', 'decrypt', 'sign', 'hash', 'token')"
  ],
  "frameworkKeywords": [
    "string (e.g., 'react', 'vue', 'axios', 'redux')"
  ],
  "businessKeywords": [
    "string (e.g., 'order', 'payment', 'cart', 'checkout', 'product')"
  ]
}
\`\`\`

# Example Output
\`\`\`json
{
  "apiKeywords": ["auth", "login", "verify", "captcha", "session", "refresh"],
  "cryptoKeywords": ["encrypt", "decrypt", "sign", "signature", "token", "hmac"],
  "frameworkKeywords": ["react", "axios", "redux", "antd"],
  "businessKeywords": ["order", "payment", "cart", "product", "user", "address"]
}
\`\`\`

Now analyze the data and return ONLY the JSON output.`;

    try {
      const response = await this.llmService.chat([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ], { temperature: 0.4, maxTokens: 800 });

      const result = JSON.parse(response.content);

      logger.success('Keywords expanded', {
        api: result.apiKeywords?.length || 0,
        crypto: result.cryptoKeywords?.length || 0,
        framework: result.frameworkKeywords?.length || 0,
      });

      return result;
    } catch (error) {
      logger.error('Keyword expansion failed:', error);
      return { apiKeywords: [], cryptoKeywords: [], frameworkKeywords: [], businessKeywords: [] };
    }
  }

  /**
   * 🆕 综合分析（规则 + LLM）
   */
  async analyzeWithLLM(data: {
    requests: NetworkRequest[];
    responses: NetworkResponse[];
    logs: ConsoleMessage[];
    exceptions: ExceptionInfo[];
  }): Promise<AnalysisResult> {
    logger.info('Starting hybrid analysis (rules + LLM)...');

    // 1. 先用规则过滤
    const ruleBasedResult = this.analyze(data);

    // 2. 如果有LLM，进行增强分析
    if (this.llmService) {
      try {
        // LLM分析请求
        const llmRequestAnalysis = await this.analyzeCriticalRequestsWithLLM(
          ruleBasedResult.criticalRequests
        );

        // LLM分析日志
        const llmLogAnalysis = await this.analyzeCriticalLogsWithLLM(
          ruleBasedResult.criticalLogs
        );

        // 合并结果
        ruleBasedResult.patterns.encryption = [
          ...(ruleBasedResult.patterns.encryption || []),
          ...llmRequestAnalysis.encryption,
        ];

        ruleBasedResult.patterns.signature = [
          ...(ruleBasedResult.patterns.signature || []),
          ...llmRequestAnalysis.signature,
        ];

        ruleBasedResult.patterns.token = [
          ...(ruleBasedResult.patterns.token || []),
          ...llmRequestAnalysis.token,
        ];

        // 添加LLM发现的关键函数
        ruleBasedResult.summary.keyFunctions = [
          ...ruleBasedResult.summary.keyFunctions,
          ...llmLogAnalysis.keyFunctions.map(f => f.name),
        ];

        logger.success('Hybrid analysis completed with LLM enhancement');
      } catch (error) {
        logger.error('LLM enhancement failed, using rule-based results only:', error);
      }
    }

    return ruleBasedResult;
  }
}

