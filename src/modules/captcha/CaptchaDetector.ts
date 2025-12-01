/**
 * 验证码检测器 - 2024-2025最新版本
 * 
 * 功能：
 * - 检测滑块验证码
 * - 检测图形验证码
 * - 检测reCAPTCHA/hCaptcha
 * - 检测页面重定向到验证页
 * - 检测Cloudflare/Akamai等CDN验证
 */

import { Page } from 'puppeteer';
import { logger } from '../../utils/logger.js';

export interface CaptchaDetectionResult {
  detected: boolean;
  type?: 'slider' | 'image' | 'recaptcha' | 'hcaptcha' | 'cloudflare' | 'page_redirect' | 'url_redirect' | 'unknown';
  selector?: string;
  title?: string;
  url?: string;
  confidence: number; // 0-100
  vendor?: 'geetest' | 'tencent' | 'aliyun' | 'cloudflare' | 'akamai' | 'datadome' | 'perimeter-x' | 'recaptcha' | 'hcaptcha' | 'unknown';
  details?: any;
  falsePositiveReason?: string; // 误报原因
}

export class CaptchaDetector {
  // 排除的选择器 - 避免误报 (如视频播放器、轮播图等)
  private static readonly EXCLUDE_SELECTORS = [
    // 视频相关
    '[class*="video"]',
    '[class*="player"]',
    '[id*="video"]',
    '[id*="player"]',
    // 轮播图/滑动组件
    '[class*="swiper"]',
    '[class*="carousel"]',
    '[class*="banner"]',
    '[class*="gallery"]',
    // 抖音特定
    '[class*="douyin"]',
    '[class*="tiktok"]',
    // 滚动条
    '[class*="scroll"]',
    '[class*="scrollbar"]',
    // 进度条
    '[class*="progress"]',
    '[class*="range"]',
    // 音量控制
    '[class*="volume"]',
  ];

  // 2024-2025最新的验证码选择器 (优化版 - 更精确)
  private static readonly CAPTCHA_SELECTORS = {
    // 滑块验证码 (移除过于宽泛的选择器)
    slider: [
      // 明确的验证码选择器
      '.captcha-slider',
      '.verify-slider',
      '#captcha-slider',
      '.slide-verify',
      // 厂商特定选择器
      '#nc_1_wrapper', // 阿里云滑块
      '.nc-container', // 阿里云
      '.geetest_slider', // 极验滑块
      '.geetest_holder', // 极验
      '.tcaptcha-transform', // 腾讯滑块
      '.JDJRV-slide-inner', // 京东
      '.yidun_slider', // 网易易盾
      // 组合选择器 (更精确)
      '[class*="captcha"][class*="slider"]',
      '[class*="verify"][class*="slider"]',
      '[id*="captcha"][id*="slider"]',
      '[id*="verify"][id*="slider"]',
    ],
    
    // 图形验证码
    image: [
      '[class*="captcha-image"]',
      '[id*="captcha-image"]',
      '.verify-img',
      '.captcha-img',
      'img[src*="captcha"]',
      'img[alt*="验证码"]',
      'img[alt*="captcha"]',
    ],
    
    // reCAPTCHA
    recaptcha: [
      'iframe[src*="recaptcha"]',
      '.g-recaptcha',
      '#g-recaptcha',
      '[class*="recaptcha"]',
      'iframe[title*="reCAPTCHA"]',
    ],
    
    // hCaptcha
    hcaptcha: [
      'iframe[src*="hcaptcha"]',
      '.h-captcha',
      '#h-captcha',
      '[class*="hcaptcha"]',
      'iframe[title*="hCaptcha"]',
    ],
    
    // Cloudflare
    cloudflare: [
      '#challenge-form',
      '.cf-challenge',
      '[id*="cf-challenge"]',
      'iframe[src*="challenges.cloudflare.com"]',
      '#cf-wrapper',
      '.ray-id', // Cloudflare Ray ID
    ],
    
    // 通用验证码容器
    generic: [
      '[class*="captcha"]',
      '[id*="captcha"]',
      '[class*="verify"]',
      '[id*="verify"]',
      '[class*="challenge"]',
      '[id*="challenge"]',
      'iframe[src*="captcha"]',
      'iframe[src*="verify"]',
    ],
  };

  // 验证码相关的关键词 (扩展版)
  private static readonly CAPTCHA_KEYWORDS = {
    title: [
      // 中文关键词
      '验证', '安全验证', '滑动验证', '点击验证', '人机验证', '行为验证',
      '智能验证', '拖动验证', '图形验证', '验证中', '正在验证',
      // 英文关键词
      'captcha', 'challenge', 'verify', 'verification', 'robot', 'human',
      'security check', 'bot check', 'anti-bot', 'cloudflare',
      // 厂商特定
      'geetest', 'recaptcha', 'hcaptcha', 'turnstile',
    ],
    url: [
      // 通用验证码URL特征
      'captcha', 'challenge', 'verify', 'verification',
      'robot-check', 'security-check', 'bot-check',
      // CDN/防护服务
      'cdn-cgi/challenge', 'cloudflare', 'akamai',
      // 厂商特定
      'geetest', 'recaptcha', 'hcaptcha', 'turnstile',
      'datadome', 'perimeter', 'px-captcha',
    ],
    text: [
      // 中文提示
      '请完成安全验证', '拖动滑块', '点击验证', '滑动验证',
      '请按住滑块', '向右滑动', '拖动滑块完成验证',
      '点击按钮进行验证', '完成验证', '人机验证',
      '请证明你不是机器人', '安全检查中',
      // 英文提示
      'Please verify', 'Verify you are human', 'Complete the security check',
      'Slide to verify', 'Click to verify', 'Drag the slider',
      'Prove you are human', 'I am not a robot',
      'Checking your browser', 'Just a moment',
      // Cloudflare特定
      'Checking if the site connection is secure',
      'This process is automatic',
      // 厂商特定
      'Protected by', 'Powered by',
    ],
  };

  // 排除关键词 - 避免误报
  private static readonly EXCLUDE_KEYWORDS = {
    title: [
      '验证码登录', // 登录页面的验证码输入框
      '手机验证码',
      '邮箱验证码',
      '短信验证码',
      '获取验证码',
      '发送验证码',
      '输入验证码',
      'verification code', // 验证码输入
      'enter code',
      'sms code',
    ],
    url: [
      'verify-email', // 邮箱验证链接
      'verify-phone',
      'email-verification',
      'account-verification',
      'verify-account',
    ],
    text: [
      '请输入验证码', // 普通验证码输入框
      '获取验证码',
      '发送验证码',
      '验证码已发送',
      '重新发送验证码',
      'Enter verification code',
      'Get code',
      'Send code',
    ],
  };

  /**
   * 检测页面是否包含验证码
   */
  async detect(page: Page): Promise<CaptchaDetectionResult> {
    try {
      logger.info('🔍 开始检测验证码...');

      // 1. 检查URL
      const urlCheck = await this.checkUrl(page);
      if (urlCheck.detected) {
        return urlCheck;
      }

      // 2. 检查页面标题
      const titleCheck = await this.checkTitle(page);
      if (titleCheck.detected) {
        return titleCheck;
      }

      // 3. 检查DOM元素
      const domCheck = await this.checkDOMElements(page);
      if (domCheck.detected) {
        return domCheck;
      }

      // 4. 检查页面文本内容
      const textCheck = await this.checkPageText(page);
      if (textCheck.detected) {
        return textCheck;
      }

      // 5. 检查特定厂商的验证码
      const vendorCheck = await this.checkVendorSpecific(page);
      if (vendorCheck.detected) {
        return vendorCheck;
      }

      logger.info('✅ 未检测到验证码');
      return { detected: false, confidence: 0 };
    } catch (error) {
      logger.error('验证码检测失败', error);
      return { detected: false, confidence: 0 };
    }
  }

  /**
   * 检查URL是否包含验证码特征
   */
  private async checkUrl(page: Page): Promise<CaptchaDetectionResult> {
    const url = page.url();
    const lowerUrl = url.toLowerCase();

    // 先检查排除关键词
    for (const excludeKeyword of CaptchaDetector.EXCLUDE_KEYWORDS.url) {
      if (lowerUrl.includes(excludeKeyword)) {
        logger.debug(`✅ URL包含排除关键词,非验证码: ${excludeKeyword}`);
        return { detected: false, confidence: 0, falsePositiveReason: `排除关键词: ${excludeKeyword}` };
      }
    }

    for (const keyword of CaptchaDetector.CAPTCHA_KEYWORDS.url) {
      if (lowerUrl.includes(keyword)) {
        // 判断具体类型
        let type: CaptchaDetectionResult['type'] = 'url_redirect';
        let vendor: CaptchaDetectionResult['vendor'] = 'unknown';
        let confidence = 70; // 降低初始置信度

        if (url.includes('cloudflare') || url.includes('cdn-cgi')) {
          type = 'cloudflare';
          vendor = 'cloudflare';
          confidence = 95; // Cloudflare特征明显,提高置信度
        } else if (url.includes('recaptcha')) {
          type = 'recaptcha';
          vendor = 'recaptcha';
          confidence = 95;
        } else if (url.includes('hcaptcha')) {
          type = 'hcaptcha';
          vendor = 'hcaptcha';
          confidence = 95;
        } else if (url.includes('geetest')) {
          type = 'slider';
          vendor = 'geetest';
          confidence = 90;
        }

        // 如果置信度低于80,需要进一步验证
        if (confidence < 80) {
          const domCheck = await this.verifyByDOM(page);
          if (!domCheck) {
            logger.debug(`⚠️ URL包含关键词但DOM验证失败,可能是误报: ${keyword}`);
            return { detected: false, confidence: 0, falsePositiveReason: `URL关键词但无DOM验证: ${keyword}` };
          }
          confidence = 85; // DOM验证通过,提高置信度
        }

        logger.warn(`⚠️ URL包含验证码关键词: ${keyword} (置信度: ${confidence}%)`);
        return {
          detected: true,
          type,
          url,
          vendor,
          confidence,
        };
      }
    }

    return { detected: false, confidence: 0 };
  }

  /**
   * 检查页面标题
   */
  private async checkTitle(page: Page): Promise<CaptchaDetectionResult> {
    const title = await page.title();
    const lowerTitle = title.toLowerCase();

    // 先检查排除关键词
    for (const excludeKeyword of CaptchaDetector.EXCLUDE_KEYWORDS.title) {
      if (lowerTitle.includes(excludeKeyword.toLowerCase())) {
        logger.debug(`✅ 标题包含排除关键词,非验证码: ${excludeKeyword}`);
        return { detected: false, confidence: 0, falsePositiveReason: `排除关键词: ${excludeKeyword}` };
      }
    }

    for (const keyword of CaptchaDetector.CAPTCHA_KEYWORDS.title) {
      if (lowerTitle.includes(keyword)) {
        // 需要进一步验证
        const domCheck = await this.verifyByDOM(page);
        if (!domCheck) {
          logger.debug(`⚠️ 标题包含关键词但DOM验证失败,可能是误报: ${keyword}`);
          return { detected: false, confidence: 0, falsePositiveReason: `标题关键词但无DOM验证: ${keyword}` };
        }

        logger.warn(`⚠️ 页面标题包含验证码关键词: ${keyword}`);
        return {
          detected: true,
          type: 'page_redirect',
          title,
          confidence: 85,
        };
      }
    }

    return { detected: false, confidence: 0 };
  }

  /**
   * 检查DOM元素
   */
  private async checkDOMElements(page: Page): Promise<CaptchaDetectionResult> {
    // 检查滑块验证码
    for (const selector of CaptchaDetector.CAPTCHA_SELECTORS.slider) {
      const element = await page.$(selector);
      if (element) {
        const isVisible = await element.isIntersectingViewport();
        if (isVisible) {
          // 进一步验证是否真的是滑块验证码
          const isRealSlider = await this.verifySliderElement(page, selector);
          if (!isRealSlider) {
            logger.debug(`⚠️ 元素匹配但不是真正的滑块验证码: ${selector}`);
            continue;
          }

          logger.warn(`⚠️ 检测到滑块验证码: ${selector}`);

          // 判断厂商
          let vendor: CaptchaDetectionResult['vendor'] = 'unknown';
          if (selector.includes('geetest')) vendor = 'geetest';
          else if (selector.includes('nc_') || selector.includes('aliyun')) vendor = 'aliyun';
          else if (selector.includes('tcaptcha') || selector.includes('tencent')) vendor = 'tencent';

          return {
            detected: true,
            type: 'slider',
            selector,
            vendor,
            confidence: 95,
          };
        }
      }
    }

    // 检查reCAPTCHA
    for (const selector of CaptchaDetector.CAPTCHA_SELECTORS.recaptcha) {
      const element = await page.$(selector);
      if (element) {
        logger.warn(`⚠️ 检测到reCAPTCHA: ${selector}`);
        return {
          detected: true,
          type: 'recaptcha',
          selector,
          vendor: 'recaptcha',
          confidence: 98,
        };
      }
    }

    // 检查hCaptcha
    for (const selector of CaptchaDetector.CAPTCHA_SELECTORS.hcaptcha) {
      const element = await page.$(selector);
      if (element) {
        logger.warn(`⚠️ 检测到hCaptcha: ${selector}`);
        return {
          detected: true,
          type: 'hcaptcha',
          selector,
          vendor: 'hcaptcha',
          confidence: 98,
        };
      }
    }

    // 检查Cloudflare
    for (const selector of CaptchaDetector.CAPTCHA_SELECTORS.cloudflare) {
      const element = await page.$(selector);
      if (element) {
        logger.warn(`⚠️ 检测到Cloudflare验证: ${selector}`);
        return {
          detected: true,
          type: 'cloudflare',
          selector,
          vendor: 'cloudflare',
          confidence: 97,
        };
      }
    }

    return { detected: false, confidence: 0 };
  }

  /**
   * 检查页面文本内容
   */
  private async checkPageText(page: Page): Promise<CaptchaDetectionResult> {
    const bodyText = await page.evaluate(() => document.body.innerText);

    // 先检查排除关键词
    for (const excludeKeyword of CaptchaDetector.EXCLUDE_KEYWORDS.text) {
      if (bodyText.includes(excludeKeyword)) {
        logger.debug(`✅ 文本包含排除关键词,非验证码: ${excludeKeyword}`);
        return { detected: false, confidence: 0, falsePositiveReason: `排除关键词: ${excludeKeyword}` };
      }
    }

    for (const keyword of CaptchaDetector.CAPTCHA_KEYWORDS.text) {
      if (bodyText.includes(keyword)) {
        // 文本匹配的置信度较低,需要DOM验证
        const domCheck = await this.verifyByDOM(page);
        if (!domCheck) {
          logger.debug(`⚠️ 文本包含关键词但DOM验证失败,可能是误报: ${keyword}`);
          return { detected: false, confidence: 0, falsePositiveReason: `文本关键词但无DOM验证: ${keyword}` };
        }

        logger.warn(`⚠️ 页面文本包含验证码关键词: ${keyword}`);
        return {
          detected: true,
          type: 'unknown',
          confidence: 75,
          details: { keyword },
        };
      }
    }

    return { detected: false, confidence: 0 };
  }

  /**
   * 检查特定厂商的验证码
   */
  private async checkVendorSpecific(page: Page): Promise<CaptchaDetectionResult> {
    // 检查极验 (Geetest)
    const geetestCheck = await page.evaluate(() => {
      return !!(window as any).initGeetest || document.querySelector('.geetest_holder');
    });
    
    if (geetestCheck) {
      logger.warn('⚠️ 检测到极验验证码');
      return {
        detected: true,
        type: 'slider',
        vendor: 'geetest',
        confidence: 95,
      };
    }

    // 检查腾讯验证码
    const tencentCheck = await page.evaluate(() => {
      return !!(window as any).TencentCaptcha || document.querySelector('.tcaptcha-transform');
    });
    
    if (tencentCheck) {
      logger.warn('⚠️ 检测到腾讯验证码');
      return {
        detected: true,
        type: 'slider',
        vendor: 'tencent',
        confidence: 95,
      };
    }

    return { detected: false, confidence: 0 };
  }

  /**
   * 等待验证码完成
   */
  async waitForCompletion(page: Page, timeout: number = 300000): Promise<boolean> {
    logger.info('⏳ 等待用户完成验证码...');

    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      const result = await this.detect(page);

      if (!result.detected) {
        logger.info('✅ 验证码已完成');
        return true;
      }

      // 每2秒检查一次
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    logger.error('❌ 验证码完成超时');
    return false;
  }

  /**
   * 通过DOM验证是否真的存在验证码元素
   * 返回true表示确实存在验证码
   */
  private async verifyByDOM(page: Page): Promise<boolean> {
    try {
      // 检查是否存在任何验证码相关的DOM元素
      const hasSlider = await page.evaluate(() => {
        const sliderSelectors = [
          '.captcha-slider',
          '.geetest_slider',
          '.tcaptcha-transform',
          '#nc_1_wrapper',
          '.slide-verify',
        ];
        return sliderSelectors.some(sel => document.querySelector(sel) !== null);
      });

      const hasRecaptcha = await page.evaluate(() => {
        return !!document.querySelector('iframe[src*="recaptcha"]') ||
               !!document.querySelector('.g-recaptcha');
      });

      const hasHcaptcha = await page.evaluate(() => {
        return !!document.querySelector('iframe[src*="hcaptcha"]') ||
               !!document.querySelector('.h-captcha');
      });

      const hasCloudflare = await page.evaluate(() => {
        return !!document.querySelector('#challenge-form') ||
               !!document.querySelector('.cf-challenge');
      });

      return hasSlider || hasRecaptcha || hasHcaptcha || hasCloudflare;
    } catch (error) {
      logger.error('DOM验证失败', error);
      return false;
    }
  }

  /**
   * 验证滑块元素是否真的是验证码滑块
   */
  private async verifySliderElement(page: Page, selector: string): Promise<boolean> {
    try {
      const excludeSelectors = CaptchaDetector.EXCLUDE_SELECTORS;

      const result = await page.evaluate((sel, excludeSels) => {
        const element = document.querySelector(sel);
        if (!element) return false;

        // 1. 检查是否匹配排除选择器
        for (const excludeSel of excludeSels) {
          if (element.matches(excludeSel)) {
            console.log(`[CaptchaDetector] 元素匹配排除选择器: ${excludeSel}`);
            return false;
          }
          // 检查父元素
          if (element.closest(excludeSel)) {
            console.log(`[CaptchaDetector] 父元素匹配排除选择器: ${excludeSel}`);
            return false;
          }
        }

        // 2. 检查元素是否可见
        const rect = element.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return false;

        // 3. 检查类名和ID - 排除视频/播放器相关
        const className = element.className.toLowerCase();
        const id = element.id.toLowerCase();
        const excludeKeywords = [
          'video', 'player', 'swiper', 'carousel', 'banner',
          'gallery', 'douyin', 'tiktok', 'scroll', 'progress',
          'range', 'volume', 'seek', 'timeline'
        ];

        for (const keyword of excludeKeywords) {
          if (className.includes(keyword) || id.includes(keyword)) {
            console.log(`[CaptchaDetector] 类名/ID包含排除关键词: ${keyword}`);
            return false;
          }
        }

        // 4. 检查是否有验证码相关的明确特征
        const hasCaptchaKeyword =
          className.includes('captcha') ||
          className.includes('verify') ||
          className.includes('challenge') ||
          id.includes('captcha') ||
          id.includes('verify') ||
          id.includes('challenge');

        // 5. 检查是否有拖动相关的属性或样式
        const style = window.getComputedStyle(element);
        const hasDraggableStyle =
          style.cursor === 'move' ||
          style.cursor === 'grab' ||
          style.cursor === 'grabbing';

        // 6. 检查是否有滑块相关的类名
        const hasSliderClass =
          className.includes('slider') ||
          className.includes('slide');

        // 7. 检查是否有拖动事件监听器或属性
        const hasDragAttribute =
          element.hasAttribute('draggable') ||
          element.hasAttribute('data-slide') ||
          element.hasAttribute('data-captcha') ||
          element.hasAttribute('data-verify');

        // 8. 检查父元素是否有验证码容器特征
        let parent = element.parentElement;
        let hasParentCaptcha = false;
        for (let i = 0; i < 3 && parent; i++) {
          const parentClass = parent.className.toLowerCase();
          const parentId = parent.id.toLowerCase();

          if (parentClass.includes('captcha') ||
              parentClass.includes('verify') ||
              parentClass.includes('challenge') ||
              parentId.includes('captcha') ||
              parentId.includes('verify')) {
            hasParentCaptcha = true;
            break;
          }
          parent = parent.parentElement;
        }

        // 9. 检查元素尺寸 - 验证码滑块通常有特定尺寸范围
        const width = rect.width;
        const height = rect.height;
        const hasReasonableSize =
          (width >= 30 && width <= 500) &&
          (height >= 30 && height <= 200);

        if (!hasReasonableSize) {
          console.log(`[CaptchaDetector] 尺寸不合理: ${width}x${height}`);
          return false;
        }

        // 10. 综合判断 - 必须满足以下条件之一:
        // 条件A: 有明确的验证码关键词 + 滑块特征
        const conditionA = hasCaptchaKeyword && (hasSliderClass || hasDraggableStyle);

        // 条件B: 有父级验证码容器 + 滑块特征 + 拖动属性
        const conditionB = hasParentCaptcha && hasSliderClass && hasDragAttribute;

        // 条件C: 厂商特定选择器 (已经很明确了)
        const isVendorSpecific =
          className.includes('geetest') ||
          className.includes('nc_') ||
          className.includes('tcaptcha') ||
          className.includes('yidun') ||
          id.includes('nc_1_wrapper');

        const isValid = conditionA || conditionB || isVendorSpecific;

        if (!isValid) {
          console.log(`[CaptchaDetector] 验证失败 - captcha:${hasCaptchaKeyword}, slider:${hasSliderClass}, parent:${hasParentCaptcha}`);
        }

        return isValid;
      }, selector, excludeSelectors);

      return result;
    } catch (error) {
      logger.error('验证滑块元素失败', error);
      return false;
    }
  }
}

