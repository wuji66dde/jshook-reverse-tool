/**
 * 环境补全模块
 * 自动检测JavaScript代码运行所需的浏览器环境变量，并生成补环境代码
 */

import * as parser from '@babel/parser';
import traverse from '@babel/traverse';
import type {
  EnvironmentEmulatorOptions,
  EnvironmentEmulatorResult,
  DetectedEnvironmentVariables,
  MissingAPI,
  EmulationCode,
} from '../../types/index.js';
import { logger } from '../../utils/logger.js';
import { chromeEnvironmentTemplate } from './templates/chrome-env.js';
import type { LLMService } from '../../services/LLMService.js';
import type { Browser } from 'puppeteer';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

puppeteer.use(StealthPlugin());

/**
 * 环境补全器
 */
export class EnvironmentEmulator {
  private browser?: Browser;
  private llm?: LLMService;

  constructor(llm?: LLMService) {
    this.llm = llm;
    if (llm) {
      logger.info('✅ LLM服务已启用，将使用AI智能推断环境变量');
    }
  }

  /**
   * 分析代码并生成环境补全方案
   */
  async analyze(options: EnvironmentEmulatorOptions): Promise<EnvironmentEmulatorResult> {
    const startTime = Date.now();
    logger.info('🌐 开始环境补全分析...');

    const {
      code,
      targetRuntime = 'both',
      autoFetch = false,
      browserUrl,
      browserType = 'chrome',
      includeComments = true,
      extractDepth = 3,
    } = options;

    try {
      // 1. 检测代码中访问的环境变量
      logger.info('🔍 正在检测环境变量访问...');
      const detectedVariables = this.detectEnvironmentVariables(code);

      // 2. 如果启用自动提取，从真实浏览器中获取环境变量值
      let variableManifest: Record<string, any> = {};
      if (autoFetch && browserUrl) {
        logger.info('🌐 正在从浏览器提取真实环境变量...');
        variableManifest = await this.fetchRealEnvironment(browserUrl, detectedVariables, extractDepth);
      } else {
        // 使用模板值
        variableManifest = this.buildManifestFromTemplate(detectedVariables, browserType);
      }

      // 2.5 使用LLM智能推断缺失的环境变量（如果启用）
      if (this.llm) {
        logger.info('🤖 使用AI智能推断缺失的环境变量...');
        const aiInferredVars = await this.inferMissingVariablesWithAI(
          code,
          detectedVariables,
          variableManifest,
          browserType
        );
        // 合并AI推断的变量（不覆盖已有的）
        Object.assign(variableManifest, { ...aiInferredVars, ...variableManifest });
      }

      // 3. 识别缺失的API
      const missingAPIs = this.identifyMissingAPIs(detectedVariables, variableManifest);

      // 3.5 使用AI为缺失的API生成实现（如果启用）
      if (this.llm && missingAPIs.length > 0) {
        logger.info(`🤖 使用AI为 ${missingAPIs.length} 个缺失的API生成实现...`);
        await this.generateMissingAPIImplementationsWithAI(missingAPIs, code, variableManifest);
      }

      // 4. 生成补环境代码
      logger.info('📝 正在生成补环境代码...');
      const emulationCode = this.generateEmulationCode(
        variableManifest,
        targetRuntime,
        includeComments
      );

      // 5. 生成建议
      const recommendations = this.generateRecommendations(detectedVariables, missingAPIs);

      // 6. 统计信息
      const totalVariables = Object.values(detectedVariables).reduce((sum, arr) => sum + arr.length, 0);
      const autoFilledVariables = Object.keys(variableManifest).length;
      const manualRequiredVariables = missingAPIs.length;

      const result: EnvironmentEmulatorResult = {
        detectedVariables,
        emulationCode,
        missingAPIs,
        variableManifest,
        recommendations,
        stats: {
          totalVariables,
          autoFilledVariables,
          manualRequiredVariables,
        },
      };

      const processingTime = Date.now() - startTime;
      logger.info(`✅ 环境补全分析完成，耗时 ${processingTime}ms`);
      logger.info(`📊 检测到 ${totalVariables} 个环境变量，自动补全 ${autoFilledVariables} 个`);

      return result;
    } catch (error) {
      logger.error('环境补全分析失败', error);
      throw error;
    }
  }

  /**
   * 检测代码中访问的环境变量
   */
  private detectEnvironmentVariables(code: string): DetectedEnvironmentVariables {
    const detected: DetectedEnvironmentVariables = {
      window: [],
      document: [],
      navigator: [],
      location: [],
      screen: [],
      other: [],
    };

    const accessedPaths = new Set<string>();

    try {
      const ast = parser.parse(code, {
        sourceType: 'unambiguous',
        plugins: ['jsx', 'typescript'],
      });

      const self = this;
      traverse(ast, {
        // 检测成员表达式：window.xxx, document.xxx等
        MemberExpression(path) {
          const fullPath = self.getMemberExpressionPath(path.node);
          if (fullPath) {
            accessedPaths.add(fullPath);
          }
        },

        // 检测标识符：直接访问全局变量
        Identifier(path) {
          const name = path.node.name;
          // 只记录全局对象
          if (['window', 'document', 'navigator', 'location', 'screen', 'console', 'localStorage', 'sessionStorage'].includes(name)) {
            if (path.scope.hasBinding(name)) {
              return; // 是局部变量，跳过
            }
            accessedPaths.add(name);
          }
        },
      });

      // 分类整理
      for (const path of accessedPaths) {
        if (path.startsWith('window.')) {
          detected.window.push(path);
        } else if (path.startsWith('document.')) {
          detected.document.push(path);
        } else if (path.startsWith('navigator.')) {
          detected.navigator.push(path);
        } else if (path.startsWith('location.')) {
          detected.location.push(path);
        } else if (path.startsWith('screen.')) {
          detected.screen.push(path);
        } else {
          detected.other.push(path);
        }
      }

      // 去重并排序
      for (const key of Object.keys(detected) as Array<keyof DetectedEnvironmentVariables>) {
        detected[key] = Array.from(new Set(detected[key])).sort();
      }
    } catch (error) {
      logger.warn('AST解析失败，使用正则表达式回退', error);
      // 回退到正则表达式检测
      this.detectWithRegex(code, detected);
    }

    return detected;
  }

  /**
   * 获取成员表达式的完整路径
   */
  private getMemberExpressionPath(node: any): string | null {
    const parts: string[] = [];

    let current = node;
    while (current) {
      if (current.type === 'MemberExpression') {
        if (current.property.type === 'Identifier') {
          parts.unshift(current.property.name);
        } else if (current.property.type === 'StringLiteral') {
          parts.unshift(current.property.value);
        }
        current = current.object;
      } else if (current.type === 'Identifier') {
        parts.unshift(current.name);
        break;
      } else {
        break;
      }
    }

    if (parts.length > 0 && parts[0] && ['window', 'document', 'navigator', 'location', 'screen'].includes(parts[0])) {
      return parts.join('.');
    }

    return null;
  }

  /**
   * 使用正则表达式检测（回退方案）
   */
  private detectWithRegex(code: string, detected: DetectedEnvironmentVariables): void {
    const patterns = [
      { regex: /window\.[a-zA-Z_$][a-zA-Z0-9_$]*/g, category: 'window' as const },
      { regex: /document\.[a-zA-Z_$][a-zA-Z0-9_$]*/g, category: 'document' as const },
      { regex: /navigator\.[a-zA-Z_$][a-zA-Z0-9_$]*/g, category: 'navigator' as const },
      { regex: /location\.[a-zA-Z_$][a-zA-Z0-9_$]*/g, category: 'location' as const },
      { regex: /screen\.[a-zA-Z_$][a-zA-Z0-9_$]*/g, category: 'screen' as const },
    ];

    for (const { regex, category } of patterns) {
      const matches = code.match(regex) || [];
      detected[category].push(...matches);
    }

    // 去重
    for (const key of Object.keys(detected) as Array<keyof DetectedEnvironmentVariables>) {
      detected[key] = Array.from(new Set(detected[key])).sort();
    }
  }

  /**
   * 从模板构建环境变量清单
   */
  private buildManifestFromTemplate(
    detected: DetectedEnvironmentVariables,
    _browserType: string
  ): Record<string, any> {
    const manifest: Record<string, any> = {};
    const template = chromeEnvironmentTemplate; // 目前只支持Chrome，未来可根据browserType选择

    // 处理每个检测到的路径
    const allPaths = [
      ...detected.window,
      ...detected.document,
      ...detected.navigator,
      ...detected.location,
      ...detected.screen,
      ...detected.other,
    ];

    for (const path of allPaths) {
      const value = this.getValueFromTemplate(path, template);
      if (value !== undefined) {
        manifest[path] = value;
      }
    }

    return manifest;
  }

  /**
   * 从模板中获取值
   */
  private getValueFromTemplate(path: string, template: any): any {
    const parts = path.split('.');
    let current = template;

    for (const part of parts) {
      if (part === 'window') {
        current = template.window;
      } else if (part === 'document') {
        current = template.document;
      } else if (part === 'navigator') {
        current = template.navigator;
      } else if (part === 'location') {
        current = template.location;
      } else if (part === 'screen') {
        current = template.screen;
      } else if (current && typeof current === 'object' && part in current) {
        current = current[part];
      } else {
        return undefined;
      }
    }

    return current;
  }

  /**
   * 从真实浏览器提取环境变量（完整实现 - 基于抖音/头条实战案例）
   */
  private async fetchRealEnvironment(
    url: string,
    detected: DetectedEnvironmentVariables,
    depth: number
  ): Promise<Record<string, any>> {
    const manifest: Record<string, any> = {};

    try {
      if (!this.browser) {
        this.browser = await puppeteer.launch({
          headless: true,
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-blink-features=AutomationControlled', // 反检测：禁用自动化控制特征
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu',
          ],
        });
      }

      const page = await this.browser.newPage();

      // 反检测：设置真实的User-Agent
      await page.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      );

      // 反检测：隐藏webdriver属性和其他自动化特征
      await page.evaluateOnNewDocument(() => {
        // 1. 隐藏webdriver属性
        Object.defineProperty(navigator, 'webdriver', {
          get: () => undefined,
          configurable: true,
        });

        // 2. 模拟Chrome对象（很多网站会检测window.chrome）
        (window as any).chrome = {
          runtime: {
            connect: () => {},
            sendMessage: () => {},
            onMessage: {
              addListener: () => {},
              removeListener: () => {},
            },
          },
          loadTimes: function () {
            return {
              commitLoadTime: Date.now() / 1000 - Math.random() * 10,
              connectionInfo: 'http/1.1',
              finishDocumentLoadTime: Date.now() / 1000 - Math.random() * 5,
              finishLoadTime: Date.now() / 1000 - Math.random() * 3,
              firstPaintAfterLoadTime: 0,
              firstPaintTime: Date.now() / 1000 - Math.random() * 8,
              navigationType: 'Other',
              npnNegotiatedProtocol: 'http/1.1',
              requestTime: Date.now() / 1000 - Math.random() * 15,
              startLoadTime: Date.now() / 1000 - Math.random() * 12,
              wasAlternateProtocolAvailable: false,
              wasFetchedViaSpdy: false,
              wasNpnNegotiated: true,
            };
          },
          csi: function () {
            return {
              onloadT: Date.now(),
              pageT: Math.random() * 1000,
              startE: Date.now() - Math.random() * 5000,
              tran: 15,
            };
          },
          app: {
            isInstalled: false,
            InstallState: {
              DISABLED: 'disabled',
              INSTALLED: 'installed',
              NOT_INSTALLED: 'not_installed',
            },
            RunningState: {
              CANNOT_RUN: 'cannot_run',
              READY_TO_RUN: 'ready_to_run',
              RUNNING: 'running',
            },
          },
        };

        // 3. 模拟真实的plugins（Headless Chrome的plugins为空）
        Object.defineProperty(navigator, 'plugins', {
          get: () => {
            const pluginArray = [
              {
                0: {
                  type: 'application/x-google-chrome-pdf',
                  suffixes: 'pdf',
                  description: 'Portable Document Format',
                  enabledPlugin: null,
                },
                description: 'Portable Document Format',
                filename: 'internal-pdf-viewer',
                length: 1,
                name: 'Chrome PDF Plugin',
              },
              {
                0: {
                  type: 'application/pdf',
                  suffixes: 'pdf',
                  description: '',
                  enabledPlugin: null,
                },
                description: '',
                filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai',
                length: 1,
                name: 'Chrome PDF Viewer',
              },
              {
                0: {
                  type: 'application/x-nacl',
                  suffixes: '',
                  description: 'Native Client Executable',
                  enabledPlugin: null,
                },
                1: {
                  type: 'application/x-pnacl',
                  suffixes: '',
                  description: 'Portable Native Client Executable',
                  enabledPlugin: null,
                },
                description: '',
                filename: 'internal-nacl-plugin',
                length: 2,
                name: 'Native Client',
              },
            ];
            return pluginArray;
          },
          configurable: true,
        });

        // 4. 模拟真实的languages
        Object.defineProperty(navigator, 'languages', {
          get: () => ['zh-CN', 'zh', 'en-US', 'en'],
          configurable: true,
        });

        // 5. 覆盖permissions查询（某些网站会检测）
        const originalQuery = (window.navigator.permissions as any).query;
        (window.navigator.permissions as any).query = (parameters: any) =>
          parameters.name === 'notifications'
            ? Promise.resolve({ state: Notification.permission } as any)
            : originalQuery(parameters);

        // 6. 添加常见的全局对象（抖音/头条会检测）
        (window as any).requestAnimationFrame =
          (window as any).requestAnimationFrame ||
          function (callback: FrameRequestCallback) {
            return setTimeout(callback, 16);
          };

        (window as any).cancelAnimationFrame =
          (window as any).cancelAnimationFrame ||
          function (id: number) {
            clearTimeout(id);
          };

        // 7. 模拟_sdkGlueVersionMap（头条特有）
        (window as any)._sdkGlueVersionMap = (window as any)._sdkGlueVersionMap || {};
      });

      await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

      // 收集所有需要提取的路径
      const allPaths = [
        ...detected.window,
        ...detected.document,
        ...detected.navigator,
        ...detected.location,
        ...detected.screen,
        ...detected.other,
      ];

      // 在浏览器中执行脚本提取环境变量（完整实现）
      const extractedValues = await page.evaluate(
        (paths: string[], maxDepth: number) => {
          const result: Record<string, any> = {};
          const seen = new WeakSet(); // 用于检测循环引用

          /**
           * 提取指定路径的值
           */
          function extractValue(path: string): any {
            try {
              const parts = path.split('.');
              let current: any = window;

              for (const part of parts) {
                if (current && typeof current === 'object' && part in current) {
                  current = current[part];
                } else {
                  return undefined;
                }
              }

              // 序列化值（处理函数、循环引用等）
              return serializeValue(current, maxDepth, seen);
            } catch (error) {
              return `[Error: ${(error as Error).message}]`;
            }
          }

          /**
           * 序列化值（完整实现，处理各种边界情况）
           */
          function serializeValue(value: any, depth: number, seenObjects: WeakSet<any>): any {
            if (depth <= 0) return '[Max Depth]';

            if (value === null) return null;
            if (value === undefined) return undefined;

            const type = typeof value;

            // 基本类型直接返回
            if (type === 'string' || type === 'number' || type === 'boolean') {
              return value;
            }

            // 函数类型：保留函数名和toString
            if (type === 'function') {
              try {
                return {
                  __type: 'Function',
                  name: value.name || 'anonymous',
                  toString: value.toString().substring(0, 200), // 限制长度
                };
              } catch (e) {
                return '[Function]';
              }
            }

            // 检测循环引用
            if (type === 'object' && seenObjects.has(value)) {
              return '[Circular Reference]';
            }

            // 数组类型
            if (Array.isArray(value)) {
              seenObjects.add(value);
              const arr = value.slice(0, 20).map((item) => serializeValue(item, depth - 1, seenObjects));
              if (value.length > 20) {
                arr.push(`[... ${value.length - 20} more items]`);
              }
              return arr;
            }

            // 对象类型
            if (type === 'object') {
              seenObjects.add(value);
              const serialized: Record<string, any> = {};

              // 获取所有属性（包括不可枚举的）
              const allKeys = Object.getOwnPropertyNames(value);
              const limitedKeys = allKeys.slice(0, 100); // 限制键数量防止过大

              for (const key of limitedKeys) {
                try {
                  const descriptor = Object.getOwnPropertyDescriptor(value, key);

                  if (descriptor) {
                    // 处理getter属性
                    if (descriptor.get) {
                      try {
                        serialized[key] = serializeValue(value[key], depth - 1, seenObjects);
                      } catch (e) {
                        serialized[key] = '[Getter Error]';
                      }
                    }
                    // 处理普通属性
                    else if (descriptor.value !== undefined) {
                      serialized[key] = serializeValue(descriptor.value, depth - 1, seenObjects);
                    }
                  }
                } catch (e) {
                  serialized[key] = `[Error: ${(e as Error).message}]`;
                }
              }

              if (allKeys.length > 100) {
                serialized['__more'] = `[... ${allKeys.length - 100} more properties]`;
              }

              return serialized;
            }

            // 其他类型转为字符串
            try {
              return String(value);
            } catch (e) {
              return '[Unserializable]';
            }
          }

          // 提取所有检测到的路径
          for (const path of paths) {
            result[path] = extractValue(path);
          }

          // 额外提取常见的反爬环境变量（基于抖音/头条实战经验）
          const commonAntiCrawlVars = [
            'navigator.userAgent',
            'navigator.platform',
            'navigator.vendor',
            'navigator.hardwareConcurrency',
            'navigator.deviceMemory',
            'navigator.maxTouchPoints',
            'navigator.language',
            'navigator.languages',
            'navigator.onLine',
            'navigator.cookieEnabled',
            'navigator.doNotTrack',
            'screen.width',
            'screen.height',
            'screen.availWidth',
            'screen.availHeight',
            'screen.colorDepth',
            'screen.pixelDepth',
            'screen.orientation.type',
            'window.innerWidth',
            'window.innerHeight',
            'window.outerWidth',
            'window.outerHeight',
            'window.devicePixelRatio',
            'window.screenX',
            'window.screenY',
            'document.referrer',
            'document.cookie',
            'document.title',
            'document.URL',
            'document.documentURI',
            'document.domain',
            'location.href',
            'location.protocol',
            'location.host',
            'location.hostname',
            'location.port',
            'location.pathname',
            'location.search',
            'location.hash',
            'location.origin',
          ];

          for (const varPath of commonAntiCrawlVars) {
            if (!result[varPath]) {
              result[varPath] = extractValue(varPath);
            }
          }

          return result;
        },
        allPaths,
        depth
      );

      Object.assign(manifest, extractedValues);

      await page.close();
      logger.info(`✅ 成功从浏览器提取 ${Object.keys(manifest).length} 个环境变量`);
    } catch (error) {
      logger.warn('从浏览器提取环境变量失败，使用模板值', error);
      return this.buildManifestFromTemplate(detected, 'chrome');
    }

    return manifest;
  }

  /**
   * 识别缺失的API
   */
  private identifyMissingAPIs(
    detected: DetectedEnvironmentVariables,
    manifest: Record<string, any>
  ): MissingAPI[] {
    const missing: MissingAPI[] = [];

    // 收集所有检测到的路径
    const allPaths = [
      ...detected.window,
      ...detected.document,
      ...detected.navigator,
      ...detected.location,
      ...detected.screen,
      ...detected.other,
    ];

    for (const path of allPaths) {
      if (!(path in manifest) || manifest[path] === undefined) {
        // 判断类型
        let type: 'function' | 'object' | 'property' = 'property';
        if (path.includes('()')) {
          type = 'function';
        } else if (path.endsWith('Element') || path.endsWith('List')) {
          type = 'object';
        }

        missing.push({
          name: path.split('.').pop() || path,
          type,
          path,
          suggestion: this.getSuggestionForMissingAPI(path, type),
        });
      }
    }

    return missing;
  }

  /**
   * 获取缺失API的补充建议
   */
  private getSuggestionForMissingAPI(path: string, type: string): string {
    if (type === 'function') {
      return `补充为空函数: ${path} = function() {}`;
    } else if (type === 'object') {
      return `补充为空对象: ${path} = {}`;
    } else {
      return `补充为null或合适的值: ${path} = null`;
    }
  }

  /**
   * 生成补环境代码
   */
  private generateEmulationCode(
    manifest: Record<string, any>,
    targetRuntime: 'nodejs' | 'python' | 'both',
    includeComments: boolean
  ): EmulationCode {
    let nodejs = '';
    let python = '';

    if (targetRuntime === 'nodejs' || targetRuntime === 'both') {
      nodejs = this.generateNodeJSCode(manifest, includeComments);
    }

    if (targetRuntime === 'python' || targetRuntime === 'both') {
      python = this.generatePythonCode(manifest, includeComments);
    }

    return { nodejs, python };
  }

  /**
   * 生成Node.js补环境代码（完整实现 - 基于抖音/头条实战案例）
   */
  private generateNodeJSCode(manifest: Record<string, any>, includeComments: boolean): string {
    const lines: string[] = [];

    if (includeComments) {
      lines.push('/**');
      lines.push(' * 浏览器环境补全代码 (Node.js)');
      lines.push(' * 自动生成于 ' + new Date().toISOString());
      lines.push(' * 基于真实浏览器环境提取');
      lines.push(' * 适用于抖音、头条等JSVMP混淆的JS代码');
      lines.push(' */');
      lines.push('');
    }

    // 1. 初始化全局对象
    lines.push('// 1. 初始化全局对象');
    lines.push('const window = global;');
    lines.push('const document = {};');
    lines.push('const navigator = {};');
    lines.push('const location = {};');
    lines.push('const screen = {};');
    lines.push('');

    // 2. 补全window对象
    if (includeComments) {
      lines.push('// 2. 补全window对象');
    }
    lines.push('window.window = window;');
    lines.push('window.self = window;');
    lines.push('window.top = window;');
    lines.push('window.parent = window;');
    lines.push('window.document = document;');
    lines.push('window.navigator = navigator;');
    lines.push('window.location = location;');
    lines.push('window.screen = screen;');
    lines.push('');

    // 3. 补全常见的window方法（抖音/头条会检测）
    if (includeComments) {
      lines.push('// 3. 补全常见的window方法');
    }
    lines.push('window.requestAnimationFrame = function(callback) {');
    lines.push('  return setTimeout(callback, 16);');
    lines.push('};');
    lines.push('');
    lines.push('window.cancelAnimationFrame = function(id) {');
    lines.push('  clearTimeout(id);');
    lines.push('};');
    lines.push('');
    lines.push('window.setTimeout = setTimeout;');
    lines.push('window.setInterval = setInterval;');
    lines.push('window.clearTimeout = clearTimeout;');
    lines.push('window.clearInterval = clearInterval;');
    lines.push('');

    // 4. 补全XMLHttpRequest（头条会检测）
    if (includeComments) {
      lines.push('// 4. 补全XMLHttpRequest');
    }
    lines.push('window.XMLHttpRequest = function() {');
    lines.push('  this.open = function() {};');
    lines.push('  this.send = function() {};');
    lines.push('  this.setRequestHeader = function() {};');
    lines.push('};');
    lines.push('');

    // 5. 补全_sdkGlueVersionMap（头条特有）
    if (includeComments) {
      lines.push('// 5. 补全_sdkGlueVersionMap（头条特有）');
    }
    lines.push('window._sdkGlueVersionMap = {};');
    lines.push('');

    // 6. 补全chrome对象（反检测）
    if (includeComments) {
      lines.push('// 6. 补全chrome对象（反检测）');
    }
    lines.push('window.chrome = {');
    lines.push('  runtime: {},');
    lines.push('  loadTimes: function() {},');
    lines.push('  csi: function() {},');
    lines.push('  app: {}');
    lines.push('};');
    lines.push('');

    // 7. 按类别补全环境变量
    if (includeComments) {
      lines.push('// 7. 补全从真实浏览器提取的环境变量');
    }

    const categories = this.categorizeManifest(manifest);

    for (const [category, vars] of Object.entries(categories)) {
      if (vars.length === 0) continue;

      if (includeComments) {
        lines.push(`// ${category} 对象属性`);
      }

      for (const [path, value] of vars) {
        const parts = path.split('.');
        if (parts.length === 1) continue; // 跳过顶级对象

        const objName = parts[0];
        const propPath = parts.slice(1).join('.');

        // 生成嵌套属性赋值
        if (parts.length === 2) {
          lines.push(`${objName}.${propPath} = ${this.formatValueForJS(value)};`);
        } else {
          // 处理深层嵌套
          const parentPath = parts.slice(0, -1).join('.');
          const lastProp = parts[parts.length - 1];
          lines.push(`if (!${parentPath}) ${parentPath} = {};`);
          lines.push(`${parentPath}.${lastProp} = ${this.formatValueForJS(value)};`);
        }
      }

      lines.push('');
    }

    // 8. 导出（如果需要）
    if (includeComments) {
      lines.push('// 8. 导出环境对象（可选）');
    }
    lines.push('module.exports = { window, document, navigator, location, screen };');
    lines.push('');

    return lines.join('\n');
  }

  /**
   * 生成Python补环境代码（完整实现 - 基于抖音/头条实战案例）
   */
  private generatePythonCode(manifest: Record<string, any>, includeComments: boolean): string {
    const lines: string[] = [];

    if (includeComments) {
      lines.push('"""');
      lines.push('浏览器环境补全代码 (Python + execjs/PyExecJS)');
      lines.push('自动生成于 ' + new Date().toISOString());
      lines.push('基于真实浏览器环境提取');
      lines.push('适用于抖音、头条等JSVMP混淆的JS代码');
      lines.push('');
      lines.push('使用方法:');
      lines.push('1. pip install PyExecJS');
      lines.push('2. 将混淆的JS代码保存为 obfuscated.js');
      lines.push('3. 运行此脚本调用加密函数');
      lines.push('"""');
      lines.push('');
    }

    lines.push('import execjs');
    lines.push('');

    if (includeComments) {
      lines.push('# ========== 第一部分：补全浏览器环境 ==========');
    }

    lines.push('env_code = """');
    lines.push('// 1. 初始化全局对象');
    lines.push('const window = global;');
    lines.push('const document = {};');
    lines.push('const navigator = {};');
    lines.push('const location = {};');
    lines.push('const screen = {};');
    lines.push('');

    lines.push('// 2. 补全window对象');
    lines.push('window.window = window;');
    lines.push('window.self = window;');
    lines.push('window.top = window;');
    lines.push('window.parent = window;');
    lines.push('window.document = document;');
    lines.push('window.navigator = navigator;');
    lines.push('window.location = location;');
    lines.push('window.screen = screen;');
    lines.push('');

    lines.push('// 3. 补全常见的window方法（抖音/头条会检测）');
    lines.push('window.requestAnimationFrame = function(callback) {');
    lines.push('  return setTimeout(callback, 16);');
    lines.push('};');
    lines.push('');
    lines.push('window.cancelAnimationFrame = function(id) {');
    lines.push('  clearTimeout(id);');
    lines.push('};');
    lines.push('');
    lines.push('window.setTimeout = setTimeout;');
    lines.push('window.setInterval = setInterval;');
    lines.push('window.clearTimeout = clearTimeout;');
    lines.push('window.clearInterval = clearInterval;');
    lines.push('');

    lines.push('// 4. 补全XMLHttpRequest（头条会检测）');
    lines.push('window.XMLHttpRequest = function() {');
    lines.push('  this.open = function() {};');
    lines.push('  this.send = function() {};');
    lines.push('  this.setRequestHeader = function() {};');
    lines.push('};');
    lines.push('');

    lines.push('// 5. 补全_sdkGlueVersionMap（头条特有）');
    lines.push('window._sdkGlueVersionMap = {};');
    lines.push('');

    lines.push('// 6. 补全chrome对象（反检测）');
    lines.push('window.chrome = {');
    lines.push('  runtime: {},');
    lines.push('  loadTimes: function() {},');
    lines.push('  csi: function() {},');
    lines.push('  app: {}');
    lines.push('};');
    lines.push('');

    // 按类别补全环境变量
    lines.push('// 7. 补全从真实浏览器提取的环境变量');
    const categories = this.categorizeManifest(manifest);

    for (const [category, vars] of Object.entries(categories)) {
      if (vars.length === 0) continue;

      lines.push(`// ${category} 对象属性`);

      for (const [path, value] of vars) {
        const parts = path.split('.');
        if (parts.length === 1) continue;

        const objName = parts[0];
        const propPath = parts.slice(1).join('.');

        if (parts.length === 2) {
          lines.push(`${objName}.${propPath} = ${this.formatValueForJS(value)};`);
        } else {
          const parentPath = parts.slice(0, -1).join('.');
          const lastProp = parts[parts.length - 1];
          lines.push(`if (!${parentPath}) ${parentPath} = {};`);
          lines.push(`${parentPath}.${lastProp} = ${this.formatValueForJS(value)};`);
        }
      }

      lines.push('');
    }

    lines.push('"""');
    lines.push('');

    if (includeComments) {
      lines.push('# ========== 第二部分：加载混淆的JS代码 ==========');
    }

    lines.push('# 读取混淆的JS文件');
    lines.push('with open("obfuscated.js", "r", encoding="utf-8") as f:');
    lines.push('    obfuscated_code = f.read()');
    lines.push('');

    lines.push('# 合并环境代码和混淆代码');
    lines.push('full_code = env_code + obfuscated_code');
    lines.push('');

    if (includeComments) {
      lines.push('# ========== 第三部分：创建JavaScript执行上下文 ==========');
    }

    lines.push('# 编译JavaScript代码');
    lines.push('ctx = execjs.compile(full_code)');
    lines.push('');

    if (includeComments) {
      lines.push('# ========== 第四部分：调用加密函数 ==========');
      lines.push('# 示例：调用抖音a_bogus加密函数');
    }

    lines.push('def get_a_bogus(url, user_agent):');
    lines.push('    """');
    lines.push('    调用JS中的sign函数生成a_bogus参数');
    lines.push('    ');
    lines.push('    Args:');
    lines.push('        url: 请求的URL');
    lines.push('        user_agent: User-Agent字符串');
    lines.push('    ');
    lines.push('    Returns:');
    lines.push('        加密后的a_bogus字符串');
    lines.push('    """');
    lines.push('    try:');
    lines.push('        # 调用window.byted_acrawler.sign方法');
    lines.push('        result = ctx.call("window.byted_acrawler.sign", {');
    lines.push('            "url": url,');
    lines.push('            "user_agent": user_agent');
    lines.push('        })');
    lines.push('        return result');
    lines.push('    except Exception as e:');
    lines.push('        print(f"加密失败: {e}")');
    lines.push('        return None');
    lines.push('');

    if (includeComments) {
      lines.push('# ========== 第五部分：使用示例 ==========');
    }

    lines.push('if __name__ == "__main__":');
    lines.push('    # 测试参数');
    lines.push('    test_url = "https://www.douyin.com/aweme/v1/web/aweme/detail/"');
    lines.push('    test_ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"');
    lines.push('    ');
    lines.push('    # 生成a_bogus');
    lines.push('    a_bogus = get_a_bogus(test_url, test_ua)');
    lines.push('    print(f"a_bogus: {a_bogus}")');
    lines.push('');

    return lines.join('\n');
  }

  /**
   * 将manifest按类别分组
   */
  private categorizeManifest(manifest: Record<string, any>): Record<string, Array<[string, any]>> {
    const categories: Record<string, Array<[string, any]>> = {
      window: [],
      document: [],
      navigator: [],
      location: [],
      screen: [],
      other: [],
    };

    for (const [path, value] of Object.entries(manifest)) {
      if (path.startsWith('window.')) {
        categories.window!.push([path, value]);
      } else if (path.startsWith('document.')) {
        categories.document!.push([path, value]);
      } else if (path.startsWith('navigator.')) {
        categories.navigator!.push([path, value]);
      } else if (path.startsWith('location.')) {
        categories.location!.push([path, value]);
      } else if (path.startsWith('screen.')) {
        categories.screen!.push([path, value]);
      } else {
        categories.other!.push([path, value]);
      }
    }

    return categories;
  }

  /**
   * 格式化值为JavaScript代码（简化版）
   */
  private formatValue(value: any): string {
    if (value === null) return 'null';
    if (value === undefined) return 'undefined';

    const type = typeof value;
    if (type === 'string') {
      return `"${value.replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`;
    }
    if (type === 'number' || type === 'boolean') {
      return String(value);
    }
    if (type === 'function' || value === '[Function]') {
      return 'function() {}';
    }

    if (Array.isArray(value)) {
      const items = value.slice(0, 10).map((item) => this.formatValue(item));
      return `[${items.join(', ')}]`;
    }

    if (type === 'object') {
      const entries = Object.entries(value).slice(0, 20);
      const props = entries.map(([k, v]) => `${k}: ${this.formatValue(v)}`);
      return `{${props.join(', ')}}`;
    }

    return 'null';
  }

  /**
   * 格式化值为JavaScript代码（完整版 - 处理更多边界情况）
   */
  private formatValueForJS(value: any, depth = 0): string {
    if (depth > 5) return 'null'; // 防止无限递归

    if (value === null) return 'null';
    if (value === undefined) return 'undefined';

    // 处理特殊标记
    if (typeof value === 'string') {
      if (value === '[Function]' || value.startsWith('[Function:')) {
        return 'function() {}';
      }
      if (value === '[Circular Reference]') {
        return '{}';
      }
      if (value === '[Max Depth]' || value === '[Error]' || value.startsWith('[Error:')) {
        return 'null';
      }
      if (value === '[Getter Error]') {
        return 'undefined';
      }
      // 普通字符串
      return JSON.stringify(value);
    }

    if (typeof value === 'number') {
      return isNaN(value) ? 'NaN' : isFinite(value) ? String(value) : 'null';
    }

    if (typeof value === 'boolean') {
      return String(value);
    }

    // 处理函数对象
    if (value && typeof value === 'object' && value.__type === 'Function') {
      return 'function() {}';
    }

    // 处理数组
    if (Array.isArray(value)) {
      const items = value
        .slice(0, 50)
        .map((item) => this.formatValueForJS(item, depth + 1))
        .filter((item) => item !== 'undefined');
      return `[${items.join(', ')}]`;
    }

    // 处理对象
    if (typeof value === 'object') {
      const entries = Object.entries(value)
        .filter(([k]) => !k.startsWith('__')) // 过滤内部属性
        .slice(0, 100);

      if (entries.length === 0) {
        return '{}';
      }

      const props = entries
        .map(([k, v]) => {
          const formattedValue = this.formatValueForJS(v, depth + 1);
          // 处理特殊键名
          const key = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(k) ? k : JSON.stringify(k);
          return `${key}: ${formattedValue}`;
        })
        .filter((prop) => !prop.endsWith(': undefined'));

      return `{${props.join(', ')}}`;
    }

    return 'null';
  }

  /**
   * 生成建议
   */
  private generateRecommendations(
    detected: DetectedEnvironmentVariables,
    missingAPIs: MissingAPI[]
  ): string[] {
    const recommendations: string[] = [];

    const totalVars = Object.values(detected).reduce((sum, arr) => sum + arr.length, 0);
    if (totalVars > 50) {
      recommendations.push('检测到大量环境变量访问，建议使用真实浏览器环境提取功能');
    }

    if (missingAPIs.length > 0) {
      recommendations.push(`有 ${missingAPIs.length} 个API需要手动补充`);
    }

    return recommendations;
  }

  /**
   * 使用AI为缺失的API生成实现
   */
  private async generateMissingAPIImplementationsWithAI(
    missingAPIs: MissingAPI[],
    code: string,
    manifest: Record<string, any>
  ): Promise<void> {
    if (!this.llm || missingAPIs.length === 0) {
      return;
    }

    try {
      // 限制一次处理的API数量，避免提示词过长
      const apisToGenerate = missingAPIs.slice(0, 10);

      const systemPrompt = `# Role
You are a browser API implementation expert.

# Task
Generate realistic JavaScript implementations for missing browser APIs.

# Requirements
1. Follow W3C specifications
2. Match real browser behavior
3. Handle edge cases
4. Include proper error handling
5. Make functions look native (toString returns "[native code]")`;

      const userPrompt = `# Missing APIs
${JSON.stringify(apisToGenerate.map(api => ({ path: api.path, type: api.type })), null, 2)}

# Code Context
\`\`\`javascript
${code.substring(0, 1500)}${code.length > 1500 ? '\n// ... (truncated)' : ''}
\`\`\`

# Required Output
Return ONLY valid JSON object mapping API paths to implementations:

\`\`\`json
{
  "window.requestAnimationFrame": "function(callback) { return setTimeout(callback, 16); }",
  "navigator.getBattery": "function() { return Promise.resolve({ level: 1, charging: true }); }",
  "...": "other implementations"
}
\`\`\`

Return ONLY the JSON object:`;

      const response = await this.llm.chat([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ]);

      const jsonMatch = response.content.match(/```json\s*([\s\S]*?)\s*```/) ||
                       response.content.match(/\{[\s\S]*\}/);

      if (jsonMatch) {
        const jsonStr = jsonMatch[1] || jsonMatch[0];
        const implementations = JSON.parse(jsonStr);

        // 将AI生成的实现添加到manifest
        let addedCount = 0;
        for (const [path, impl] of Object.entries(implementations)) {
          if (typeof impl === 'string' && impl.trim()) {
            manifest[path] = impl;
            addedCount++;
          }
        }

        logger.info(`✅ AI成功生成 ${addedCount} 个API实现`);
      }
    } catch (error) {
      logger.error('AI生成API实现失败', error);
    }
  }

  /**
   * 使用AI智能推断缺失的环境变量
   */
  private async inferMissingVariablesWithAI(
    code: string,
    detected: DetectedEnvironmentVariables,
    existingManifest: Record<string, any>,
    browserType: string
  ): Promise<Record<string, any>> {
    if (!this.llm) {
      return {};
    }

    try {
      // 找出已检测但未填充的变量
      const allDetectedPaths = [
        ...detected.window,
        ...detected.document,
        ...detected.navigator,
        ...detected.location,
        ...detected.screen,
        ...detected.other,
      ];

      const missingPaths = allDetectedPaths.filter(path => !(path in existingManifest));

      if (missingPaths.length === 0) {
        logger.info('所有检测到的变量都已填充，无需AI推断');
        return {};
      }

      logger.info(`🤖 AI推断 ${missingPaths.length} 个缺失的环境变量...`);

      const systemPrompt = `# Role
You are a browser environment expert specializing in realistic browser API value generation.

# Task
Generate realistic values for missing browser environment variables based on code analysis.

# Requirements
1. Values must be realistic and match real browser behavior
2. Ensure consistency across related variables (e.g., UA matches platform)
3. Consider anti-detection (avoid obvious fake values)
4. Follow W3C specifications for API return types`;

      const userPrompt = `# Target Browser
${browserType.toUpperCase()}

# Missing Variables (need values)
${JSON.stringify(missingPaths, null, 2)}

# Code Context (for understanding usage)
\`\`\`javascript
${code.substring(0, 2000)}${code.length > 2000 ? '\n// ... (truncated)' : ''}
\`\`\`

# Existing Variables (for consistency)
${JSON.stringify(existingManifest, null, 2)}

# Required Output
Return ONLY valid JSON object with missing variable paths as keys and realistic values:

\`\`\`json
{
  "navigator.userAgent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36...",
  "navigator.platform": "Win32",
  "window.innerWidth": 1920,
  "...": "other missing variables"
}
\`\`\`

# Guidelines
- Use realistic values matching target browser
- Ensure cross-variable consistency
- Consider code usage patterns
- Avoid placeholder values like "test" or "example"

Return ONLY the JSON object:`;

      const response = await this.llm.chat([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ]);

      // 提取JSON
      const jsonMatch = response.content.match(/```json\s*([\s\S]*?)\s*```/) ||
                       response.content.match(/\{[\s\S]*\}/);

      if (jsonMatch) {
        const jsonStr = jsonMatch[1] || jsonMatch[0];
        const inferredVars = JSON.parse(jsonStr);
        logger.info(`✅ AI成功推断 ${Object.keys(inferredVars).length} 个环境变量`);
        return inferredVars;
      }

      logger.warn('AI响应中未找到有效的JSON');
      return {};
    } catch (error) {
      logger.error('AI推断环境变量失败', error);
      return {};
    }
  }

  /**
   * 清理资源
   */
  async cleanup(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = undefined;
    }
  }
}

