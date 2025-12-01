/**
 * 增强的环境补全模块
 * 动态、智能、AI驱动的浏览器环境模拟
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
import type { LLMService } from '../../services/LLMService.js';
import type { Browser } from 'puppeteer';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { BrowserEnvironmentRulesManager, type BrowserType } from './BrowserEnvironmentRules.js';
import { BrowserAPIDatabase } from './BrowserAPIDatabase.js';
import { AIEnvironmentAnalyzer } from './AIEnvironmentAnalyzer.js';

puppeteer.use(StealthPlugin());

/**
 * 增强的环境补全器
 */
export class EnvironmentEmulatorEnhanced {
  private browser?: Browser;
  private rulesManager: BrowserEnvironmentRulesManager;
  private apiDatabase: BrowserAPIDatabase;
  private aiAnalyzer: AIEnvironmentAnalyzer;

  constructor(private llm?: LLMService) {
    this.rulesManager = new BrowserEnvironmentRulesManager();
    this.apiDatabase = new BrowserAPIDatabase();
    this.aiAnalyzer = new AIEnvironmentAnalyzer(llm);
  }

  /**
   * 分析代码并生成环境补全方案
   */
  async analyze(options: EnvironmentEmulatorOptions): Promise<EnvironmentEmulatorResult> {
    const startTime = Date.now();
    logger.info('🌐 开始增强环境补全分析...');

    const {
      code,
      targetRuntime = 'both',
      autoFetch = false,
      browserUrl,
      browserType = 'chrome',
      includeComments = true,
      extractDepth = 3,
      useAI = true,
    } = options;

    try {
      // 1. 检测代码中访问的环境变量
      logger.info('🔍 正在检测环境变量访问...');
      const detectedVariables = this.detectEnvironmentVariables(code);

      // 2. 从真实浏览器或规则引擎获取环境变量值
      let variableManifest: Record<string, any> = {};
      if (autoFetch && browserUrl) {
        logger.info('🌐 正在从浏览器提取真实环境变量...');
        variableManifest = await this.fetchRealEnvironment(browserUrl, detectedVariables, extractDepth);
      } else {
        logger.info('📋 使用规则引擎生成环境变量...');
        variableManifest = this.buildManifestFromRules(detectedVariables, browserType);
      }

      // 3. 识别缺失的API
      const missingAPIs = this.identifyMissingAPIs(detectedVariables, variableManifest);

      // 4. AI分析（可选）
      let aiAnalysis = null;
      if (useAI && this.llm) {
        logger.info('🤖 正在进行AI分析...');
        aiAnalysis = await this.aiAnalyzer.analyze(code, detectedVariables, missingAPIs, browserType);
        
        // 合并AI推荐的变量
        Object.assign(variableManifest, aiAnalysis.recommendedVariables);
      }

      // 5. 生成补环境代码
      logger.info('📝 正在生成补环境代码...');
      const emulationCode = this.generateEmulationCode(
        variableManifest,
        missingAPIs,
        targetRuntime,
        includeComments,
        browserType,
        aiAnalysis
      );

      // 6. 生成建议
      const recommendations = await this.generateRecommendations(
        detectedVariables,
        missingAPIs,
        aiAnalysis
      );

      // 7. 统计信息
      const totalVariables = Object.values(detectedVariables).reduce((sum, arr) => sum + arr.length, 0);
      const autoFilledVariables = Object.keys(variableManifest).length;
      const manualRequiredVariables = missingAPIs.length;

      const result: EnvironmentEmulatorResult & { aiAnalysis?: any } = {
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
        ...(aiAnalysis && { aiAnalysis }),
      };

      const processingTime = Date.now() - startTime;
      logger.info(`✅ 环境补全分析完成，耗时 ${processingTime}ms`);
      logger.info(`📊 检测到 ${totalVariables} 个环境变量，自动补全 ${autoFilledVariables} 个`);

      if (aiAnalysis) {
        logger.info(`🤖 AI分析置信度: ${(aiAnalysis.confidence * 100).toFixed(1)}%`);
        logger.info(`🛡️ 检测到 ${aiAnalysis.antiCrawlFeatures.length} 个反爬虫特征`);
      }

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
        MemberExpression(path) {
          const fullPath = self.getMemberExpressionPath(path.node);
          if (fullPath) {
            accessedPaths.add(fullPath);
          }
        },

        Identifier(path) {
          const name = path.node.name;
          const globalObjects = [
            'window', 'document', 'navigator', 'location', 'screen', 
            'console', 'localStorage', 'sessionStorage', 'performance',
            'crypto', 'indexedDB', 'XMLHttpRequest', 'fetch'
          ];
          
          if (globalObjects.includes(name)) {
            if (path.scope.hasBinding(name)) {
              return;
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

    const globalObjects = ['window', 'document', 'navigator', 'location', 'screen', 'performance', 'console'];
    if (parts.length > 0 && parts[0] && globalObjects.includes(parts[0])) {
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

    for (const key of Object.keys(detected) as Array<keyof DetectedEnvironmentVariables>) {
      detected[key] = Array.from(new Set(detected[key])).sort();
    }
  }

  /**
   * 从规则引擎构建环境变量清单
   */
  private buildManifestFromRules(
    detected: DetectedEnvironmentVariables,
    browserType: BrowserType
  ): Record<string, any> {
    const manifest: Record<string, any> = {};

    const allPaths = [
      ...detected.window,
      ...detected.document,
      ...detected.navigator,
      ...detected.location,
      ...detected.screen,
      ...detected.other,
    ];

    for (const path of allPaths) {
      const rule = this.rulesManager.getRule(path);
      if (rule) {
        let value = rule.defaultValue;
        
        // 如果是函数，调用它生成值
        if (typeof value === 'function') {
          value = value(browserType, '120.0.0.0');
        }
        
        manifest[path] = value;
      } else {
        // 尝试从API数据库获取
        const api = this.apiDatabase.getAPI(path);
        if (api && api.implementation) {
          manifest[path] = api.implementation;
        }
      }
    }

    return manifest;
  }

  /**
   * 从真实浏览器提取环境变量
   */
  private async fetchRealEnvironment(
    _url: string,
    _detected: DetectedEnvironmentVariables,
    _depth: number
  ): Promise<Record<string, any>> {
    // TODO: 复用原有的fetchRealEnvironment实现
    // 这里保持与原EnvironmentEmulator相同的逻辑
    logger.warn('fetchRealEnvironment 尚未实现，返回空对象');
    return {};
  }

  /**
   * 识别缺失的API
   */
  private identifyMissingAPIs(
    detected: DetectedEnvironmentVariables,
    manifest: Record<string, any>
  ): MissingAPI[] {
    const missing: MissingAPI[] = [];

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
        const api = this.apiDatabase.getAPI(path);
        const type = api?.type === 'method' ? 'function' : 
                    api?.type === 'constructor' ? 'object' : 'property';

        missing.push({
          name: path.split('.').pop() || path,
          type,
          path,
          suggestion: this.getSuggestionForMissingAPI(path, type, api),
        });
      }
    }

    return missing;
  }

  /**
   * 获取缺失API的补充建议
   */
  private getSuggestionForMissingAPI(path: string, type: string, api?: any): string {
    if (api?.implementation) {
      return `使用推荐实现: ${api.implementation}`;
    }

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
    missingAPIs: MissingAPI[],
    targetRuntime: 'nodejs' | 'python' | 'both',
    includeComments: boolean,
    browserType: BrowserType,
    aiAnalysis: any
  ): EmulationCode {
    let nodejs = '';
    let python = '';

    if (targetRuntime === 'nodejs' || targetRuntime === 'both') {
      nodejs = this.generateNodeJSCodeEnhanced(manifest, missingAPIs, includeComments, browserType, aiAnalysis);
    }

    if (targetRuntime === 'python' || targetRuntime === 'both') {
      python = this.generatePythonCodeEnhanced(manifest, missingAPIs, includeComments, browserType, aiAnalysis);
    }

    return { nodejs, python };
  }

  /**
   * 生成增强的Node.js补环境代码
   */
  private generateNodeJSCodeEnhanced(
    manifest: Record<string, any>,
    _missingAPIs: MissingAPI[], // 保留参数以便未来扩展
    includeComments: boolean,
    browserType: BrowserType,
    aiAnalysis: any
  ): string {
    const lines: string[] = [];

    if (includeComments) {
      lines.push('/**');
      lines.push(' * 浏览器环境补全代码 (Node.js) - AI增强版');
      lines.push(` * 生成时间: ${new Date().toISOString()}`);
      lines.push(` * 目标浏览器: ${browserType}`);
      lines.push(' * 基于真实浏览器环境 + AI智能分析');
      if (aiAnalysis) {
        lines.push(` * AI置信度: ${(aiAnalysis.confidence * 100).toFixed(1)}%`);
      }
      lines.push(' */');
      lines.push('');
    }

    // 1. 初始化全局对象
    lines.push('// ========== 第一部分：初始化全局对象 ==========');
    lines.push('const window = global;');
    lines.push('const document = {};');
    lines.push('const navigator = {};');
    lines.push('const location = {};');
    lines.push('const screen = {};');
    lines.push('const performance = {};');
    lines.push('');

    // 2. 补全基础window对象
    lines.push('// ========== 第二部分：补全window对象 ==========');
    lines.push('window.window = window;');
    lines.push('window.self = window;');
    lines.push('window.top = window;');
    lines.push('window.parent = window;');
    lines.push('window.document = document;');
    lines.push('window.navigator = navigator;');
    lines.push('window.location = location;');
    lines.push('window.screen = screen;');
    lines.push('window.performance = performance;');
    lines.push('');

    // 3. 补全常见方法
    lines.push('// ========== 第三部分：补全常见方法 ==========');
    const commonMethods = this.apiDatabase.getAPIsByType('method')
      .filter(api => api.path.startsWith('window.'))
      .slice(0, 15);

    for (const api of commonMethods) {
      if (api.implementation) {
        const impl = typeof api.implementation === 'string' ? api.implementation : 'function() {}';
        lines.push(`window.${api.name} = ${impl};`);
      }
    }
    lines.push('');

    // 4. 补全环境变量
    lines.push('// ========== 第四部分：补全环境变量 ==========');
    const categories = this.categorizeManifest(manifest);

    for (const [category, vars] of Object.entries(categories)) {
      if (vars.length === 0) continue;

      if (includeComments) {
        lines.push(`// ${category} 对象属性`);
      }

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

    // 5. AI推荐的API
    if (aiAnalysis?.recommendedAPIs && aiAnalysis.recommendedAPIs.length > 0) {
      lines.push('// ========== 第五部分：AI推荐的API实现 ==========');
      for (const rec of aiAnalysis.recommendedAPIs) {
        if (includeComments) {
          lines.push(`// ${rec.reason}`);
        }
        lines.push(rec.implementation);
        lines.push('');
      }
    }

    // 6. 反爬虫对策
    if (aiAnalysis?.antiCrawlFeatures && aiAnalysis.antiCrawlFeatures.length > 0) {
      lines.push('// ========== 第六部分：反爬虫对策 ==========');
      for (const feature of aiAnalysis.antiCrawlFeatures) {
        if (feature.severity === 'high' || feature.severity === 'critical') {
          if (includeComments) {
            lines.push(`// ${feature.feature} - ${feature.mitigation}`);
          }
        }
      }
      lines.push('');
    }

    // 7. 导出
    lines.push('// ========== 第七部分：导出 ==========');
    lines.push('module.exports = { window, document, navigator, location, screen, performance };');
    lines.push('');

    return lines.join('\n');
  }

  /**
   * 生成增强的Python补环境代码
   */
  private generatePythonCodeEnhanced(
    manifest: Record<string, any>,
    _missingAPIs: MissingAPI[],
    includeComments: boolean,
    browserType: BrowserType,
    aiAnalysis: any
  ): string {
    const lines: string[] = [];

    if (includeComments) {
      lines.push('"""');
      lines.push('浏览器环境补全代码 (Python + execjs) - AI增强版');
      lines.push(`生成时间: ${new Date().toISOString()}`);
      lines.push(`目标浏览器: ${browserType}`);
      if (aiAnalysis) {
        lines.push(`AI置信度: ${(aiAnalysis.confidence * 100).toFixed(1)}%`);
      }
      lines.push('"""');
      lines.push('');
    }

    lines.push('import execjs');
    lines.push('');
    lines.push('env_code = """');

    // 嵌入JavaScript代码
    lines.push('// 初始化全局对象');
    lines.push('const window = global;');
    lines.push('const document = {};');
    lines.push('const navigator = {};');
    lines.push('const location = {};');
    lines.push('const screen = {};');
    lines.push('');

    // 补全环境变量
    const categories = this.categorizeManifest(manifest);
    for (const [category, vars] of Object.entries(categories)) {
      if (vars.length === 0) continue;
      lines.push(`// ${category} 对象属性`);
      for (const [path, value] of vars) {
        const parts = path.split('.');
        if (parts.length >= 2) {
          const objName = parts[0];
          const propPath = parts.slice(1).join('.');
          lines.push(`${objName}.${propPath} = ${this.formatValueForJS(value)};`);
        }
      }
      lines.push('');
    }

    lines.push('"""');
    lines.push('');
    lines.push('# 使用示例');
    lines.push('ctx = execjs.compile(env_code)');
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
      performance: [],
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
      } else if (path.startsWith('performance.')) {
        categories.performance!.push([path, value]);
      } else {
        categories.other!.push([path, value]);
      }
    }

    return categories;
  }

  /**
   * 格式化值为JavaScript代码
   */
  private formatValueForJS(value: any, depth = 0): string {
    if (depth > 5) return 'null';

    if (value === null) return 'null';
    if (value === undefined) return 'undefined';

    if (typeof value === 'string') {
      return JSON.stringify(value);
    }

    if (typeof value === 'number') {
      return isNaN(value) ? 'NaN' : isFinite(value) ? String(value) : 'null';
    }

    if (typeof value === 'boolean') {
      return String(value);
    }

    if (typeof value === 'function') {
      return 'function() {}';
    }

    if (Array.isArray(value)) {
      const items = value.slice(0, 50).map(item => this.formatValueForJS(item, depth + 1));
      return `[${items.join(', ')}]`;
    }

    if (typeof value === 'object') {
      const entries = Object.entries(value).slice(0, 100);
      const props = entries.map(([k, v]) => {
        const key = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(k) ? k : JSON.stringify(k);
        return `${key}: ${this.formatValueForJS(v, depth + 1)}`;
      });
      return `{${props.join(', ')}}`;
    }

    return 'null';
  }

  /**
   * 生成建议
   */
  private async generateRecommendations(
    detected: DetectedEnvironmentVariables,
    missingAPIs: MissingAPI[],
    aiAnalysis: any
  ): Promise<string[]> {
    if (aiAnalysis?.suggestions && aiAnalysis.suggestions.length > 0) {
      return aiAnalysis.suggestions;
    }

    return await this.aiAnalyzer.generateSuggestions(detected, missingAPIs, 'chrome');
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

