/**
 * 浏览器模式管理器
 * 
 * 功能：
 * - 管理无头/有头模式切换
 * - 检测验证码并自动切换显示模式
 * - 保持会话状态（Cookies、LocalStorage等）
 * - 提供用户交互提示
 */

import puppeteer, { Browser, Page, PuppeteerLaunchOptions } from 'puppeteer';
import { logger } from '../../utils/logger.js';
import { CaptchaDetector, CaptchaDetectionResult } from '../captcha/CaptchaDetector.js';

export interface BrowserModeConfig {
  autoDetectCaptcha?: boolean; // 是否自动检测验证码（默认true）
  autoSwitchHeadless?: boolean; // 是否自动切换显示模式（默认true）
  captchaTimeout?: number; // 等待用户完成验证的超时时间（默认300秒）
  defaultHeadless?: boolean; // 默认是否使用无头模式（默认true）
  askBeforeSwitchBack?: boolean; // 验证完成后是否询问用户再切换回无头模式（默认true）
}

export class BrowserModeManager {
  private browser: Browser | null = null;
  private currentPage: Page | null = null;
  private isHeadless: boolean = true;
  private config: Required<BrowserModeConfig>;
  private captchaDetector: CaptchaDetector;
  private launchOptions: PuppeteerLaunchOptions;
  private sessionData: {
    cookies?: any[];
    localStorage?: Record<string, string>;
    sessionStorage?: Record<string, string>;
  } = {};

  constructor(
    config: BrowserModeConfig = {},
    launchOptions: PuppeteerLaunchOptions = {}
  ) {
    this.config = {
      autoDetectCaptcha: config.autoDetectCaptcha ?? true,
      autoSwitchHeadless: config.autoSwitchHeadless ?? true,
      captchaTimeout: config.captchaTimeout ?? 300000, // 5分钟
      defaultHeadless: config.defaultHeadless ?? true,
      askBeforeSwitchBack: config.askBeforeSwitchBack ?? true,
    };
    
    this.isHeadless = this.config.defaultHeadless;
    this.captchaDetector = new CaptchaDetector();
    this.launchOptions = launchOptions;
  }

  /**
   * 启动浏览器
   */
  async launch(): Promise<Browser> {
    const headlessMode = this.isHeadless;
    
    logger.info(`🚀 启动浏览器 (${headlessMode ? '无头' : '有头'}模式)...`);
    
    const options: PuppeteerLaunchOptions = {
      ...this.launchOptions,
      headless: headlessMode,
      args: [
        ...(this.launchOptions.args || []),
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
      ],
      ignoreDefaultArgs: ['--enable-automation'],
    };
    
    this.browser = await puppeteer.launch(options);
    
    logger.info('✅ 浏览器启动成功');
    
    return this.browser;
  }

  /**
   * 创建新页面并注入反检测脚本
   */
  async newPage(): Promise<Page> {
    if (!this.browser) {
      await this.launch();
    }
    
    const page = await this.browser!.newPage();
    this.currentPage = page;
    
    // 注入反检测脚本
    await this.injectAntiDetectionScripts(page);
    
    // 恢复会话数据
    if (this.sessionData.cookies && this.sessionData.cookies.length > 0) {
      await page.setCookie(...this.sessionData.cookies);
    }
    
    return page;
  }

  /**
   * 导航到URL并自动检测验证码
   */
  async goto(url: string, page?: Page): Promise<Page> {
    const targetPage = page || this.currentPage;
    
    if (!targetPage) {
      throw new Error('No page available. Call newPage() first.');
    }
    
    logger.info(`🌐 导航到: ${url}`);
    
    await targetPage.goto(url, { waitUntil: 'networkidle2' });
    
    // 自动检测验证码
    if (this.config.autoDetectCaptcha) {
      await this.checkAndHandleCaptcha(targetPage, url);
    }
    
    return targetPage;
  }

  /**
   * 检测并处理验证码
   */
  async checkAndHandleCaptcha(page: Page, originalUrl: string): Promise<void> {
    const captchaResult = await this.captchaDetector.detect(page);
    
    if (captchaResult.detected) {
      logger.warn(`⚠️ 检测到验证码 (类型: ${captchaResult.type}, 置信度: ${captchaResult.confidence}%)`);
      
      if (captchaResult.vendor) {
        logger.warn(`   厂商: ${captchaResult.vendor}`);
      }
      
      if (this.config.autoSwitchHeadless && this.isHeadless) {
        await this.switchToHeaded(page, originalUrl, captchaResult);
      } else {
        logger.info('💡 提示: 请手动完成验证码');
        await this.captchaDetector.waitForCompletion(page, this.config.captchaTimeout);
      }
    }
  }

  /**
   * 切换到有头模式
   */
  private async switchToHeaded(
    currentPage: Page,
    url: string,
    captchaInfo: CaptchaDetectionResult
  ): Promise<void> {
    logger.info('🔄 切换到有头模式以完成验证码...');
    
    // 保存会话数据
    await this.saveSessionData(currentPage);
    
    // 关闭当前浏览器
    await this.browser?.close();
    
    // 重新启动浏览器（有头模式）
    this.isHeadless = false;
    await this.launch();
    
    // 创建新页面
    const newPage = await this.newPage();
    
    // 导航到原始URL
    await newPage.goto(url, { waitUntil: 'networkidle2' });
    
    // 显示提示信息
    this.showCaptchaPrompt(captchaInfo);
    
    // 等待用户完成验证
    const completed = await this.captchaDetector.waitForCompletion(
      newPage,
      this.config.captchaTimeout
    );
    
    if (completed) {
      logger.info('✅ 验证完成，继续执行...');
      
      // 询问是否切换回无头模式
      if (this.config.askBeforeSwitchBack && this.config.defaultHeadless) {
        // 这里可以通过MCP返回给用户选择
        // 暂时默认不切换回去，保持有头模式方便调试
        logger.info('💡 保持有头模式，方便后续操作');
      }
    } else {
      logger.error('❌ 验证码完成超时');
      throw new Error('Captcha completion timeout');
    }
  }

  /**
   * 显示验证码提示
   */
  private showCaptchaPrompt(captchaInfo: CaptchaDetectionResult): void {
    console.log('\n' + '='.repeat(60));
    console.log('⚠️  检测到验证码，请手动完成验证');
    console.log('='.repeat(60));
    console.log(`类型: ${captchaInfo.type}`);
    if (captchaInfo.vendor) {
      console.log(`厂商: ${captchaInfo.vendor}`);
    }
    console.log(`置信度: ${captchaInfo.confidence}%`);
    console.log('\n💡 提示:');
    console.log('   1. 浏览器窗口已自动打开');
    console.log('   2. 请在浏览器中完成验证码');
    console.log('   3. 验证完成后，脚本将自动继续执行');
    console.log('   4. 超时时间: ' + (this.config.captchaTimeout / 1000) + '秒');
    console.log('='.repeat(60) + '\n');
  }

  /**
   * 保存会话数据
   */
  private async saveSessionData(page: Page): Promise<void> {
    try {
      // 保存Cookies
      this.sessionData.cookies = await page.cookies();
      
      // 保存LocalStorage和SessionStorage
      const storageData = await page.evaluate(() => {
        const local: Record<string, string> = {};
        const session: Record<string, string> = {};
        
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key) {
            local[key] = localStorage.getItem(key) || '';
          }
        }
        
        for (let i = 0; i < sessionStorage.length; i++) {
          const key = sessionStorage.key(i);
          if (key) {
            session[key] = sessionStorage.getItem(key) || '';
          }
        }
        
        return { local, session };
      });
      
      this.sessionData.localStorage = storageData.local;
      this.sessionData.sessionStorage = storageData.session;
      
      logger.info('💾 会话数据已保存');
    } catch (error) {
      logger.error('保存会话数据失败', error);
    }
  }

  /**
   * 注入反检测脚本（2024-2025最新版本）
   */
  private async injectAntiDetectionScripts(page: Page): Promise<void> {
    await page.evaluateOnNewDocument(() => {
      // 1. 隐藏 webdriver
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined,
      });

      // 2. 模拟 Chrome 对象
      (window as any).chrome = {
        runtime: {
          connect: () => {},
          sendMessage: () => {},
          onMessage: {
            addListener: () => {},
            removeListener: () => {},
          },
        },
        loadTimes: function() {
          return {
            commitLoadTime: Date.now() / 1000,
            connectionInfo: 'http/1.1',
            finishDocumentLoadTime: Date.now() / 1000,
            finishLoadTime: Date.now() / 1000,
            firstPaintAfterLoadTime: 0,
            firstPaintTime: Date.now() / 1000,
            navigationType: 'Other',
            npnNegotiatedProtocol: 'unknown',
            requestTime: 0,
            startLoadTime: Date.now() / 1000,
            wasAlternateProtocolAvailable: false,
            wasFetchedViaSpdy: false,
            wasNpnNegotiated: false,
          };
        },
        csi: function() {
          return {
            onloadT: Date.now(),
            pageT: Date.now(),
            startE: Date.now(),
            tran: 15,
          };
        },
      };

      // 3. 模拟 Plugins
      Object.defineProperty(navigator, 'plugins', {
        get: () => [
          {
            0: { type: 'application/pdf', suffixes: 'pdf', description: 'Portable Document Format' },
            description: 'Portable Document Format',
            filename: 'internal-pdf-viewer',
            length: 1,
            name: 'Chrome PDF Plugin',
          },
          {
            0: { type: 'application/x-google-chrome-pdf', suffixes: 'pdf', description: '' },
            description: '',
            filename: 'internal-pdf-viewer',
            length: 1,
            name: 'Chrome PDF Viewer',
          },
          {
            0: { type: 'application/x-nacl', suffixes: '', description: 'Native Client Executable' },
            1: { type: 'application/x-pnacl', suffixes: '', description: 'Portable Native Client Executable' },
            description: '',
            filename: 'internal-nacl-plugin',
            length: 2,
            name: 'Native Client',
          },
        ],
      });

      // 4. 修复 Permissions API
      const originalQuery = window.navigator.permissions.query;
      window.navigator.permissions.query = (parameters: any) =>
        parameters.name === 'notifications'
          ? Promise.resolve({ state: (Notification as any).permission } as PermissionStatus)
          : originalQuery(parameters);

      // 5. 语言设置
      Object.defineProperty(navigator, 'languages', {
        get: () => ['en-US', 'en'],
      });
    });
    
    logger.info('🛡️ 反检测脚本已注入');
  }

  /**
   * 关闭浏览器
   */
  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.currentPage = null;
      logger.info('🔒 浏览器已关闭');
    }
  }

  /**
   * 获取当前浏览器实例
   */
  getBrowser(): Browser | null {
    return this.browser;
  }

  /**
   * 获取当前页面
   */
  getCurrentPage(): Page | null {
    return this.currentPage;
  }

  /**
   * 检查是否为无头模式
   */
  isHeadlessMode(): boolean {
    return this.isHeadless;
  }
}

