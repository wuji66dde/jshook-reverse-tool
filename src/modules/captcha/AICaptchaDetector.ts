/**
 * AI驱动的验证码检测器
 *
 * 功能：
 * - 使用AI视觉识别验证码
 * - 避免基于规则的误报
 * - 支持截图分析
 * - 多模态LLM分析
 */

import { Page } from 'puppeteer';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { logger } from '../../utils/logger.js';
import { LLMService } from '../../services/LLMService.js';

export interface AICaptchaDetectionResult {
  detected: boolean;
  type?: 'slider' | 'image' | 'recaptcha' | 'hcaptcha' | 'cloudflare' | 'text_input' | 'none';
  confidence: number; // 0-100
  reasoning: string; // AI的推理过程
  location?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  screenshot?: string; // 截图文件路径（不再是base64）
  screenshotPath?: string; // 截图文件的绝对路径
  vendor?: string;
  suggestions?: string[]; // 处理建议
}

export class AICaptchaDetector {
  private llm: LLMService;
  private screenshotDir: string;

  constructor(llm: LLMService, screenshotDir: string = './screenshots') {
    this.llm = llm;
    this.screenshotDir = screenshotDir;
  }

  /**
   * 保存截图到文件
   */
  private async saveScreenshot(screenshotBase64: string): Promise<string> {
    try {
      // 确保截图目录存在
      await mkdir(this.screenshotDir, { recursive: true });

      // 生成文件名（时间戳）
      const timestamp = Date.now();
      const filename = `captcha-${timestamp}.png`;
      const filepath = join(this.screenshotDir, filename);

      // 将base64转换为Buffer并保存
      const buffer = Buffer.from(screenshotBase64, 'base64');
      await writeFile(filepath, buffer);

      logger.info(`📸 截图已保存: ${filepath}`);
      return filepath;
    } catch (error) {
      logger.error('保存截图失败', error);
      throw error;
    }
  }

  /**
   * 使用AI检测验证码
   */
  async detect(page: Page): Promise<AICaptchaDetectionResult> {
    try {
      logger.info('🤖 使用AI检测验证码...');

      // 1. 截取页面截图
      const screenshot = await page.screenshot({
        encoding: 'base64',
        fullPage: false, // 只截取可见区域
      });

      // 2. 获取页面基本信息
      const pageInfo = await this.getPageInfo(page);

      // 3. 使用AI分析
      const analysis = await this.analyzeWithAI(screenshot as string, pageInfo);

      logger.info(`AI检测结果: ${analysis.detected ? '检测到验证码' : '未检测到验证码'} (置信度: ${analysis.confidence}%)`);

      return analysis;
    } catch (error) {
      logger.error('AI验证码检测失败', error);
      return {
        detected: false,
        confidence: 0,
        reasoning: `检测失败: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * 获取页面信息
   */
  private async getPageInfo(page: Page): Promise<{
    url: string;
    title: string;
    bodyText: string;
    hasIframes: boolean;
    suspiciousElements: string[];
  }> {
    const url = page.url();
    const title = await page.title();
    
    const info = await page.evaluate(() => {
      // 获取页面文本（限制长度）
      const bodyText = document.body.innerText.substring(0, 1000);

      // 检查iframe
      const hasIframes = document.querySelectorAll('iframe').length > 0;

      // 查找可疑元素
      const suspiciousElements: string[] = [];
      
      // 检查常见验证码容器
      const captchaSelectors = [
        '[class*="captcha"]',
        '[id*="captcha"]',
        '[class*="verify"]',
        '[id*="verify"]',
        '[class*="challenge"]',
        'iframe[src*="recaptcha"]',
        'iframe[src*="hcaptcha"]',
        '.geetest_holder',
        '#nc_1_wrapper',
      ];

      for (const selector of captchaSelectors) {
        const elements = document.querySelectorAll(selector);
        if (elements.length > 0) {
          suspiciousElements.push(`${selector} (${elements.length}个)`);
        }
      }

      return {
        bodyText,
        hasIframes,
        suspiciousElements,
      };
    });

    return {
      url,
      title,
      ...info,
    };
  }

  /**
   * 使用AI分析截图和页面信息
   */
  private async analyzeWithAI(
    screenshot: string,
    pageInfo: {
      url: string;
      title: string;
      bodyText: string;
      hasIframes: boolean;
      suspiciousElements: string[];
    }
  ): Promise<AICaptchaDetectionResult> {
    const prompt = this.buildAnalysisPrompt(pageInfo);

    try {
      logger.info('🤖 开始AI验证码检测...');

      // 调用多模态LLM（支持图片分析）
      const response = await this.llm.analyzeImage(screenshot, prompt);

      logger.info('✅ AI分析完成，正在解析结果...');

      // 解析AI响应（不返回base64）
      return this.parseAIResponse(response, '');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('❌ MCP内部AI分析失败:', errorMessage);

      // 检查是否是模型不支持的错误
      if (errorMessage.includes('does not support image analysis')) {
        logger.warn('⚠️ 当前LLM模型不支持图片分析');
        logger.info('🎯 策略: 保存截图文件，让外部AI智能体分析');

        // ✅ 保存截图到文件（不返回base64）
        const screenshotPath = await this.saveScreenshot(screenshot);

        // 返回特殊结果，包含截图文件路径和提示词
        return {
          detected: false, // 暂时标记为未检测到
          type: 'none',
          confidence: 0,
          reasoning: '⚠️ MCP内部LLM不支持图片分析，需要外部AI智能体协助。\n\n' +
                    '📸 截图已保存到文件（见screenshotPath字段）\n' +
                    '📝 已提供分析提示词\n\n' +
                    '请使用支持Vision的AI模型（如GPT-4o、Claude 3）分析截图文件，判断是否包含验证码。\n\n' +
                    '---\n\n' +
                    `${prompt}\n\n` +
                    '---\n\n' +
                    '💡 提示: 请查看screenshotPath字段中的图片文件，并根据上述提示词进行分析。',
          screenshotPath, // ✅ 返回截图文件路径（不是base64）
          vendor: 'external-ai-required',
          suggestions: [
            `请使用支持Vision的AI模型分析截图文件: ${screenshotPath}`,
            '参考reasoning字段中的分析提示词',
            '分析完成后，手动判断是否需要处理验证码',
            '或配置MCP使用支持Vision的模型: gpt-4o, claude-3-opus等'
          ]
        };
      }

      // 其他错误，降级到基于文本的分析
      logger.info('🔄 使用降级方案: 基于规则的验证码检测');
      return this.fallbackTextAnalysis(pageInfo);
    }
  }

  /**
   * 构建AI分析提示词（专业版 - 参考LLMService的提示词风格）
   */
  private buildAnalysisPrompt(pageInfo: {
    url: string;
    title: string;
    bodyText: string;
    hasIframes: boolean;
    suspiciousElements: string[];
  }): string {
    return `# 验证码检测专家系统

## 任务目标
分析网页截图，精确判断是否包含人机验证码（CAPTCHA），避免误报。

## 输入数据
\`\`\`json
{
  "url": "${pageInfo.url}",
  "title": "${pageInfo.title}",
  "hasIframes": ${pageInfo.hasIframes},
  "suspiciousElements": ${JSON.stringify(pageInfo.suspiciousElements)},
  "bodyTextPreview": "${pageInfo.bodyText.substring(0, 200).replace(/"/g, '\\"')}..."
}
\`\`\`

## 验证码分类体系

### 1. 交互式验证码（Interactive CAPTCHA）
**1.1 滑块验证码（Slider CAPTCHA）**
- **特征**: 拖动滑块完成拼图、滑动到指定位置
- **厂商**: 极验(Geetest)、阿里云、腾讯、网易易盾
- **视觉标识**: 滑块轨道、拼图缺口、"向右滑动"提示
- **DOM特征**: \`.geetest_slider\`, \`.nc_1_wrapper\`, \`.tcaptcha-transform\`

**1.2 图形验证码（Image CAPTCHA）**
- **特征**: 点击图片中的特定对象（如"点击所有红绿灯"）
- **厂商**: reCAPTCHA v2、hCaptcha
- **视觉标识**: 3x3或4x4图片网格、选择提示文字
- **DOM特征**: \`iframe[src*="recaptcha"]\`, \`.h-captcha\`

**1.3 文本验证码（Text CAPTCHA）**
- **特征**: 输入图片中显示的字符/数字
- **视觉标识**: 扭曲的文字图片、输入框
- **注意**: 区分于"短信验证码输入框"

### 2. 自动验证码（Automatic CAPTCHA）
**2.1 reCAPTCHA v3**
- **特征**: 无用户交互，右下角显示reCAPTCHA徽章
- **视觉标识**: "Protected by reCAPTCHA" 徽章

**2.2 Cloudflare Turnstile**
- **特征**: "正在检查您的浏览器" / "Checking your browser"
- **视觉标识**: Cloudflare logo、进度条、Ray ID

### 3. 非验证码（False Positives - 常见误报）
**3.1 普通表单元素**
- ❌ 登录表单、搜索框、输入框
- ❌ "请输入验证码"文字（这是短信验证码输入提示）
- ❌ "获取验证码"按钮（发送短信验证码）

**3.2 媒体控件**
- ❌ 视频播放器进度条、音量滑块
- ❌ 图片轮播图、画廊滑动
- ❌ 页面滚动条

**3.3 UI组件**
- ❌ Range slider、Progress bar
- ❌ Carousel、Swiper
- ❌ 普通按钮、链接

## 分析流程

### Step 1: 视觉特征识别
1. 扫描截图中是否有以下视觉元素：
   - 滑块轨道 + 拼图缺口
   - 图片网格 + 选择提示
   - "我不是机器人"复选框
   - "正在检查您的浏览器"文字
   - Cloudflare/reCAPTCHA logo

### Step 2: 上下文分析
1. 检查页面URL是否包含验证码特征：
   - \`/captcha\`, \`/challenge\`, \`/verify\`
   - \`cdn-cgi/challenge\` (Cloudflare)
   - \`recaptcha.net\`, \`hcaptcha.com\`

2. 检查页面标题是否包含验证码关键词：
   - "验证"、"安全检查"、"人机验证"
   - "Verify", "Challenge", "Security Check"

3. 检查可疑元素：
   - 如果suspiciousElements为空 → 大概率不是验证码
   - 如果包含明确的验证码选择器 → 需要视觉确认

### Step 3: 排除误报
1. 检查是否为短信验证码输入场景：
   - 文字包含"请输入验证码"、"获取验证码"
   - 只有输入框，无交互式验证组件
   - → 判定为 \`detected: false\`

2. 检查是否为媒体/UI组件：
   - 视频播放器、轮播图、滚动条
   - → 判定为 \`detected: false\`

### Step 4: 置信度评估
- **90-100%**: 明确的验证码视觉特征 + DOM特征匹配
- **70-89%**: 视觉特征明显，但DOM特征不完全匹配
- **50-69%**: 有可疑元素，但视觉不明确
- **0-49%**: 无明显验证码特征

## 输出格式

**严格按照以下JSON Schema输出**:

\`\`\`json
{
  "detected": boolean,
  "type": "slider" | "image" | "recaptcha" | "hcaptcha" | "cloudflare" | "text_input" | "none",
  "confidence": number,
  "reasoning": string,
  "location": {
    "x": number,
    "y": number,
    "width": number,
    "height": number
  } | null,
  "vendor": "geetest" | "tencent" | "aliyun" | "recaptcha" | "hcaptcha" | "cloudflare" | "unknown",
  "suggestions": string[]
}
\`\`\`

### 字段说明
- **detected**: 是否检测到验证码（布尔值）
- **type**: 验证码类型（枚举值）
- **confidence**: 置信度（0-100整数）
- **reasoning**: 推理过程（200字以内，说明判断依据）
- **location**: 验证码在截图中的位置（像素坐标，如果无法确定则为null）
- **vendor**: 验证码厂商（如果无法识别则为"unknown"）
- **suggestions**: 处理建议（字符串数组，2-3条）

### 示例输出

**示例1: 检测到滑块验证码**
\`\`\`json
{
  "detected": true,
  "type": "slider",
  "confidence": 95,
  "reasoning": "截图中央有明显的滑块验证码组件：1) 左侧有拼图缺口的背景图；2) 底部有滑块轨道和'向右滑动完成验证'提示；3) DOM中包含.geetest_slider选择器。综合判断为极验滑块验证码。",
  "location": {
    "x": 450,
    "y": 300,
    "width": 320,
    "height": 180
  },
  "vendor": "geetest",
  "suggestions": [
    "等待用户手动完成滑块验证",
    "使用captcha_wait工具等待验证完成",
    "如果是自动化场景，建议使用验证码识别服务"
  ]
}
\`\`\`

**示例2: 误报 - 短信验证码输入框**
\`\`\`json
{
  "detected": false,
  "type": "none",
  "confidence": 95,
  "reasoning": "页面包含'请输入验证码'和'获取验证码'按钮，但这是短信验证码输入场景，不是人机验证码。截图中只有普通输入框和按钮，无交互式验证组件。",
  "location": null,
  "vendor": "unknown",
  "suggestions": [
    "这是普通的短信验证码输入页面，无需特殊处理",
    "可以正常填写表单并提交"
  ]
}
\`\`\`

**示例3: 普通页面**
\`\`\`json
{
  "detected": false,
  "type": "none",
  "confidence": 98,
  "reasoning": "截图显示的是正常的网页内容，包含导航栏、内容区域和页脚。无任何验证码视觉特征，suspiciousElements为空，URL和标题也无验证码关键词。",
  "location": null,
  "vendor": "unknown",
  "suggestions": [
    "页面正常，无需处理",
    "可以继续执行后续操作"
  ]
}
\`\`\`

## 关键原则

1. **保守判断**: 不确定时倾向于 \`detected: false\`，避免误报
2. **视觉优先**: 截图证据 > DOM特征 > 文本关键词
3. **上下文结合**: 综合URL、标题、DOM、视觉特征判断
4. **明确推理**: reasoning必须说明具体的判断依据
5. **实用建议**: suggestions要提供可操作的处理方案

现在，请分析提供的截图并输出JSON结果。`;
  }

  /**
   * 解析AI响应
   */
  private parseAIResponse(response: string, screenshotPath: string): AICaptchaDetectionResult {
    try {
      // 提取JSON部分
      const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/) ||
                       response.match(/\{[\s\S]*\}/);

      if (!jsonMatch) {
        throw new Error('无法从AI响应中提取JSON');
      }

      const jsonStr = jsonMatch[1] || jsonMatch[0];
      const result = JSON.parse(jsonStr);

      return {
        detected: result.detected || false,
        type: result.type || 'none',
        confidence: result.confidence || 0,
        reasoning: result.reasoning || '无推理信息',
        location: result.location,
        vendor: result.vendor,
        suggestions: result.suggestions || [],
        screenshotPath: screenshotPath || undefined,
      };
    } catch (error) {
      logger.error('解析AI响应失败', error);

      // 尝试从文本中提取关键信息
      const detected = response.toLowerCase().includes('detected') &&
                      response.toLowerCase().includes('true');

      return {
        detected,
        confidence: detected ? 50 : 80,
        reasoning: `AI响应解析失败，基于文本判断: ${response.substring(0, 200)}`,
        screenshotPath: screenshotPath || undefined,
      };
    }
  }

  /**
   * 降级到基于文本的分析（当图片分析失败时）
   */
  private fallbackTextAnalysis(pageInfo: {
    url: string;
    title: string;
    bodyText: string;
    hasIframes: boolean;
    suspiciousElements: string[];
  }): AICaptchaDetectionResult {
    logger.warn('降级到基于文本的分析');

    // 简单的规则判断
    const hasCaptchaElements = pageInfo.suspiciousElements.length > 0;
    const hasCaptchaKeywords = 
      pageInfo.title.toLowerCase().includes('captcha') ||
      pageInfo.title.toLowerCase().includes('verify') ||
      pageInfo.bodyText.toLowerCase().includes('滑动验证') ||
      pageInfo.bodyText.toLowerCase().includes('人机验证');

    const detected = hasCaptchaElements && hasCaptchaKeywords;

    return {
      detected,
      confidence: detected ? 60 : 90,
      reasoning: `降级分析: ${detected ? '检测到可疑元素和关键词' : '未检测到明显验证码特征'}`,
      suggestions: detected 
        ? ['建议人工确认', '可能需要手动处理']
        : ['页面正常，无需处理'],
    };
  }

  /**
   * 等待验证码完成
   */
  async waitForCompletion(page: Page, timeout: number = 300000): Promise<boolean> {
    logger.info('⏳ 等待用户完成验证码...');

    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      const result = await this.detect(page);

      if (!result.detected || result.confidence < 50) {
        logger.info('✅ 验证码已完成或不存在');
        return true;
      }

      // 每3秒检查一次
      await new Promise(resolve => setTimeout(resolve, 3000));
    }

    logger.error('❌ 验证码完成超时');
    return false;
  }
}

