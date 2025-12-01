/**
 * AI环境分析器
 * 使用LLM智能推断缺失的环境变量和API
 */

import type { LLMService } from '../../services/LLMService.js';
import type { DetectedEnvironmentVariables, MissingAPI } from '../../types/index.js';
import type { BrowserType } from './BrowserEnvironmentRules.js';
import { logger } from '../../utils/logger.js';

/**
 * AI分析结果
 */
export interface AIAnalysisResult {
  /** 推荐的环境变量 */
  recommendedVariables: Record<string, any>;
  
  /** 推荐的API实现 */
  recommendedAPIs: Array<{
    path: string;
    implementation: string;
    reason: string;
  }>;
  
  /** 检测到的反爬虫特征 */
  antiCrawlFeatures: Array<{
    feature: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    description: string;
    mitigation: string;
  }>;
  
  /** 建议 */
  suggestions: string[];
  
  /** 置信度 (0-1) */
  confidence: number;
}

/**
 * AI环境分析器
 */
export class AIEnvironmentAnalyzer {
  constructor(private llm?: LLMService) {}

  /**
   * 分析代码并推断环境需求
   */
  async analyze(
    code: string,
    detected: DetectedEnvironmentVariables,
    missing: MissingAPI[],
    browserType: BrowserType = 'chrome'
  ): Promise<AIAnalysisResult> {
    if (!this.llm) {
      logger.warn('LLM服务未配置，跳过AI分析');
      return this.getEmptyResult();
    }

    try {
      logger.info('🤖 开始AI环境分析...');

      const prompt = this.buildAnalysisPrompt(code, detected, missing, browserType);
      const response = await this.llm.chat([{ role: 'user', content: prompt }]);

      const result = this.parseAIResponse(response.content);
      logger.info(`✅ AI分析完成，置信度: ${(result.confidence * 100).toFixed(1)}%`);

      return result;
    } catch (error) {
      logger.error('AI分析失败', error);
      return this.getEmptyResult();
    }
  }

  /**
   * 构建分析提示词 - 优化版
   *
   * 基于2024-2025最佳实践:
   * 1. Role-based prompting: 明确专业领域
   * 2. Structured output: 严格JSON Schema
   * 3. Domain expertise: 反爬虫和环境检测专业知识
   * 4. Few-shot learning: 提供示例
   * 5. Chain-of-Thought: 引导逐步分析
   */
  private buildAnalysisPrompt(
    code: string,
    detected: DetectedEnvironmentVariables,
    missing: MissingAPI[],
    browserType: BrowserType
  ): string {
    const codeSnippet = code.length > 5000 ? code.substring(0, 5000) + '\n\n// ... (code truncated for analysis)' : code;

    const systemPrompt = `# Role
You are an expert JavaScript reverse engineer and anti-detection specialist with 10+ years of experience in:
- Browser environment emulation and fingerprinting
- Anti-bot and anti-scraping technique analysis
- JavaScript obfuscation and deobfuscation
- Browser API implementation and polyfills
- Web security and privacy technologies

# Expertise Areas
- **Browser Fingerprinting**: Canvas, WebGL, Audio, Font, CSS fingerprinting
- **Environment Detection**: WebDriver, Headless Chrome, Puppeteer detection
- **API Emulation**: DOM, BOM, Web APIs (Crypto, Storage, Performance, etc.)
- **Anti-Detection**: Stealth techniques, environment consistency checks
- **Browser Internals**: Chrome, Firefox, Safari implementation differences

# Task
Analyze the provided JavaScript code to:
1. Identify ALL browser environment variables and APIs being accessed
2. Detect anti-bot and fingerprinting techniques
3. Recommend realistic values for missing environment variables
4. Provide working JavaScript implementations for missing APIs
5. Assess detection risks and provide mitigation strategies

# Analysis Standards
- Follow W3C Web API specifications
- Use real browser behavior patterns (not placeholder values)
- Ensure environment consistency (e.g., userAgent matches platform)
- Detect common anti-bot libraries (Cloudflare, PerimeterX, DataDome, etc.)
- Identify fingerprinting scripts (FingerprintJS, CreepJS, etc.)`;

    const userPrompt = `# Target Browser
${browserType.toUpperCase()} (Latest stable version, 2024-2025)

# Detected Environment Variable Access
\`\`\`json
${JSON.stringify(detected, null, 2)}
\`\`\`

# Missing APIs (Need Implementation)
\`\`\`json
${JSON.stringify(missing.map(m => ({ path: m.path, type: m.type })), null, 2)}
\`\`\`

# Code to Analyze
\`\`\`javascript
${codeSnippet}
\`\`\`

# Required Output Schema
Return ONLY valid JSON with this EXACT structure (all fields required):

\`\`\`json
{
  "recommendedVariables": {
    "navigator.userAgent": "string - realistic UA matching target browser",
    "navigator.platform": "string - must match UA (Win32, MacIntel, Linux x86_64)",
    "navigator.vendor": "string - Google Inc. for Chrome, empty for Firefox",
    "window.chrome": "object | undefined - Chrome-specific object",
    "navigator.webdriver": "boolean - MUST be false or undefined for stealth",
    "navigator.plugins": "PluginArray - realistic plugin list, not empty array",
    "...": "other detected variables with realistic values"
  },
  "recommendedAPIs": [
    {
      "path": "string - full API path (e.g., 'window.requestAnimationFrame')",
      "implementation": "string - complete working JavaScript code",
      "reason": "string - why this API is needed and how it's used in the code",
      "priority": "critical | high | medium | low",
      "complexity": "simple | moderate | complex"
    }
  ],
  "antiCrawlFeatures": [
    {
      "feature": "string - specific technique name",
      "type": "fingerprinting | detection | obfuscation | challenge",
      "severity": "critical | high | medium | low",
      "description": "string - detailed technical description",
      "location": "string - line number or function name if identifiable",
      "mitigation": "string - specific bypass technique with code example",
      "confidence": 0.95
    }
  ],
  "environmentConsistency": {
    "issues": [
      {
        "variable1": "navigator.userAgent",
        "variable2": "navigator.platform",
        "issue": "UA indicates Windows but platform is MacIntel",
        "fix": "Ensure platform matches UA OS"
      }
    ],
    "score": 85
  },
  "suggestions": [
    "string - actionable recommendation 1",
    "string - actionable recommendation 2",
    "string - actionable recommendation 3"
  ],
  "confidence": 0.85,
  "summary": "2-3 sentence summary of findings and main risks"
}
\`\`\`

# Example Output (for reference)
\`\`\`json
{
  "recommendedVariables": {
    "navigator.userAgent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "navigator.platform": "Win32",
    "navigator.vendor": "Google Inc.",
    "navigator.webdriver": false,
    "navigator.plugins": "[{name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer', length: 1}]",
    "window.chrome": "{runtime: {}, loadTimes: function(){}, csi: function(){}}",
    "navigator.hardwareConcurrency": 8,
    "navigator.deviceMemory": 8
  },
  "recommendedAPIs": [
    {
      "path": "window.requestAnimationFrame",
      "implementation": "window.requestAnimationFrame = function(callback) { return setTimeout(callback, 16); };",
      "reason": "Code uses rAF for animation timing, detected at line 45",
      "priority": "high",
      "complexity": "simple"
    }
  ],
  "antiCrawlFeatures": [
    {
      "feature": "Canvas Fingerprinting",
      "type": "fingerprinting",
      "severity": "high",
      "description": "Code draws text on canvas and extracts toDataURL() for fingerprinting",
      "location": "line 123, function generateFingerprint()",
      "mitigation": "Inject consistent canvas noise or override toDataURL() to return fixed hash",
      "confidence": 0.98
    },
    {
      "feature": "WebDriver Detection",
      "type": "detection",
      "severity": "critical",
      "description": "Checks navigator.webdriver property",
      "location": "line 67",
      "mitigation": "Object.defineProperty(navigator, 'webdriver', {get: () => false})",
      "confidence": 1.0
    }
  ],
  "environmentConsistency": {
    "issues": [],
    "score": 95
  },
  "suggestions": [
    "Use Puppeteer Stealth plugin to automatically handle common detections",
    "Implement consistent navigator.plugins array with at least 3 realistic plugins",
    "Override canvas toDataURL() to return consistent fingerprint across sessions"
  ],
  "confidence": 0.92,
  "summary": "Code implements Canvas and WebDriver detection. High risk of bot detection. Requires comprehensive environment emulation with stealth techniques."
}
\`\`\`

# Analysis Methodology
1. **First Pass**: Scan for known anti-bot library signatures (Cloudflare Turnstile, reCAPTCHA, etc.)
2. **Second Pass**: Identify fingerprinting techniques (Canvas, WebGL, Audio, Font)
3. **Third Pass**: Map all environment variable accesses and their usage context
4. **Fourth Pass**: Generate realistic values ensuring cross-variable consistency
5. **Fifth Pass**: Provide working API implementations based on W3C specs
6. **Final Pass**: Assess overall detection risk and prioritize mitigations

# Important Notes
- DO NOT use placeholder values like "example.com" or "test123"
- DO ensure navigator.userAgent matches navigator.platform and navigator.vendor
- DO provide complete, working JavaScript code for API implementations
- DO identify specific anti-bot products if detected (Cloudflare, PerimeterX, etc.)
- DO NOT hallucinate - only report features you actually detect in the code

Now analyze the code and return ONLY the JSON output (no markdown, no explanations).`;

    return systemPrompt + '\n\n' + userPrompt;
  }

  /**
   * 解析AI响应
   */
  private parseAIResponse(response: string): AIAnalysisResult {
    try {
      // 提取JSON部分
      const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/) || 
                       response.match(/\{[\s\S]*\}/);
      
      if (!jsonMatch) {
        logger.warn('AI响应中未找到JSON');
        return this.getEmptyResult();
      }

      const jsonStr = jsonMatch[1] || jsonMatch[0];
      const parsed = JSON.parse(jsonStr);

      return {
        recommendedVariables: parsed.recommendedVariables || {},
        recommendedAPIs: parsed.recommendedAPIs || [],
        antiCrawlFeatures: parsed.antiCrawlFeatures || [],
        suggestions: parsed.suggestions || [],
        confidence: parsed.confidence || 0.5,
      };
    } catch (error) {
      logger.error('解析AI响应失败', error);
      return this.getEmptyResult();
    }
  }

  /**
   * 获取空结果
   */
  private getEmptyResult(): AIAnalysisResult {
    return {
      recommendedVariables: {},
      recommendedAPIs: [],
      antiCrawlFeatures: [],
      suggestions: [],
      confidence: 0,
    };
  }

  /**
   * 分析反爬虫特征 - 优化版
   *
   * 专业领域: 反爬虫技术识别和绕过
   * 基于2024-2025最新反爬虫技术
   */
  async analyzeAntiCrawl(code: string): Promise<AIAnalysisResult['antiCrawlFeatures']> {
    if (!this.llm) {
      return [];
    }

    try {
      const systemPrompt = `# Role
You are an expert in web anti-bot and anti-scraping technologies with deep knowledge of:
- Commercial anti-bot solutions (Cloudflare, PerimeterX, DataDome, Akamai, etc.)
- Browser fingerprinting techniques (Canvas, WebGL, Audio, Font, CSS, etc.)
- Bot detection methods (behavioral analysis, TLS fingerprinting, etc.)
- Stealth and evasion techniques

# Known Anti-Bot Techniques (2024-2025)
1. **Browser Fingerprinting**
   - Canvas fingerprinting (toDataURL, getImageData)
   - WebGL fingerprinting (renderer, vendor, extensions)
   - Audio fingerprinting (AudioContext, OscillatorNode)
   - Font fingerprinting (measureText, font enumeration)
   - CSS fingerprinting (getComputedStyle)

2. **Environment Detection**
   - WebDriver detection (navigator.webdriver)
   - Headless detection (chrome.runtime, permissions)
   - Automation tool detection (window.cdc_, $cdc_, __webdriver_)
   - Plugin detection (navigator.plugins length check)

3. **Behavioral Analysis**
   - Mouse movement patterns (entropy, velocity, acceleration)
   - Keyboard timing analysis
   - Scroll behavior patterns
   - Touch event simulation detection

4. **Advanced Techniques**
   - TLS/SSL fingerprinting (JA3, JA3S)
   - HTTP/2 fingerprinting
   - Timing attacks (performance.now() precision)
   - Memory/CPU profiling
   - Stack trace analysis

# Task
Analyze the code and identify ALL anti-bot and fingerprinting techniques with high precision.`;

      const userPrompt = `# Code to Analyze
\`\`\`javascript
${code.substring(0, 3000)}${code.length > 3000 ? '\n\n// ... (truncated)' : ''}
\`\`\`

# Required Output Schema
Return ONLY valid JSON array with this structure:

\`\`\`json
[
  {
    "feature": "string - specific technique name (e.g., 'Canvas Fingerprinting via toDataURL')",
    "type": "fingerprinting | detection | behavioral | challenge | obfuscation",
    "severity": "critical | high | medium | low",
    "description": "string - detailed technical description of what the code does",
    "location": "string - line number, function name, or code pattern",
    "mitigation": "string - specific bypass code or technique",
    "confidence": 0.95,
    "vendor": "string | null - if identifiable (Cloudflare, PerimeterX, etc.)"
  }
]
\`\`\`

# Example Output
\`\`\`json
[
  {
    "feature": "Canvas Fingerprinting",
    "type": "fingerprinting",
    "severity": "high",
    "description": "Creates canvas element, draws text with specific font, extracts pixel data via toDataURL() and hashes it for unique browser identification",
    "location": "function getCanvasFingerprint(), lines 45-67",
    "mitigation": "Override HTMLCanvasElement.prototype.toDataURL to return consistent hash: const originalToDataURL = HTMLCanvasElement.prototype.toDataURL; HTMLCanvasElement.prototype.toDataURL = function() { return 'data:image/png;base64,iVBORw0KGgoAAAANS...' };",
    "confidence": 0.98,
    "vendor": null
  },
  {
    "feature": "WebDriver Detection",
    "type": "detection",
    "severity": "critical",
    "description": "Checks navigator.webdriver property which is true in Selenium/Puppeteer",
    "location": "if(navigator.webdriver) at line 23",
    "mitigation": "Delete property before page load: Object.defineProperty(navigator, 'webdriver', {get: () => undefined});",
    "confidence": 1.0,
    "vendor": null
  },
  {
    "feature": "Cloudflare Turnstile Challenge",
    "type": "challenge",
    "severity": "critical",
    "description": "Cloudflare's CAPTCHA alternative that validates browser environment",
    "location": "cf-turnstile widget initialization",
    "mitigation": "Requires solving Turnstile challenge via 2captcha or manual intervention",
    "confidence": 0.92,
    "vendor": "Cloudflare"
  }
]
\`\`\`

# Analysis Guidelines
- Be specific: "Canvas toDataURL fingerprinting" not just "Canvas detection"
- Provide working mitigation code when possible
- Identify vendor if signature matches known products
- Only report techniques you actually see in the code
- Use confidence scores honestly (0.7-0.8 for uncertain, 0.9+ for definite)

Now analyze and return ONLY the JSON array.`;

      const response = await this.llm.chat([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ]);

      const jsonMatch = response.content.match(/```json\s*([\s\S]*?)\s*```/) ||
                       response.content.match(/\[[\s\S]*\]/);

      if (jsonMatch) {
        const jsonStr = jsonMatch[1] || jsonMatch[0];
        return JSON.parse(jsonStr);
      }

      return [];
    } catch (error) {
      logger.error('反爬虫特征分析失败', error);
      return [];
    }
  }

  /**
   * 推断API实现 - 优化版
   *
   * 基于W3C规范和真实浏览器行为
   */
  async inferAPIImplementation(
    apiPath: string,
    context: string
  ): Promise<string | null> {
    if (!this.llm) {
      return null;
    }

    try {
      const systemPrompt = `# Role
You are a browser API implementation expert with deep knowledge of:
- W3C Web API specifications
- Browser internals (V8, SpiderMonkey, JavaScriptCore)
- DOM, BOM, and Web APIs implementation details
- Cross-browser compatibility
- Anti-detection and stealth techniques

# Task
Provide a realistic, working JavaScript implementation for the requested browser API that:
1. Follows W3C specifications
2. Matches real browser behavior
3. Passes anti-detection checks
4. Is production-ready (handles edge cases)
5. Is concise but complete

# Implementation Standards
- Return realistic values (not null/undefined unless spec requires)
- Handle all parameter variations
- Include proper error handling
- Match browser-specific behavior when needed
- Consider performance implications`;

      const userPrompt = `# API to Implement
\`${apiPath}\`

# Usage Context
\`\`\`javascript
${context.substring(0, 1000)}${context.length > 1000 ? '\n// ... (truncated)' : ''}
\`\`\`

# Requirements
1. Provide ONLY the JavaScript implementation code
2. Code must be production-ready and handle edge cases
3. Match real browser behavior (not a mock/stub)
4. Include JSDoc comment explaining the implementation
5. Consider anti-detection (e.g., function.toString() should look native)

# Output Format
Return ONLY JavaScript code in a code block, no explanations outside the code.

# Example Output
\`\`\`javascript
/**
 * Implementation of window.requestAnimationFrame
 * Polyfill that mimics browser behavior using setTimeout
 * @param {FrameRequestCallback} callback - Function to call before next repaint
 * @returns {number} Request ID for cancellation
 */
window.requestAnimationFrame = window.requestAnimationFrame || function(callback) {
  const start = Date.now();
  return setTimeout(function() {
    callback(Date.now() - start);
  }, 16); // ~60fps
};

// Make it look native
Object.defineProperty(window.requestAnimationFrame, 'toString', {
  value: function() { return 'function requestAnimationFrame() { [native code] }'; }
});
\`\`\`

Now provide the implementation for \`${apiPath}\`:`;

      const response = await this.llm.chat([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ]);

      // 提取代码块
      const codeMatch = response.content.match(/```(?:javascript|js)?\s*([\s\S]*?)\s*```/);
      if (codeMatch && codeMatch[1]) {
        return codeMatch[1].trim();
      }

      // 如果没有代码块，返回整个内容（可能直接是代码）
      const trimmed = response.content.trim();
      // 移除可能的解释性文字
      if (trimmed.includes('function') || trimmed.includes('const') || trimmed.includes('var')) {
        return trimmed;
      }

      return null;
    } catch (error) {
      logger.error('API实现推断失败', error);
      return null;
    }
  }

  /**
   * 生成环境补全建议 - 优化版
   *
   * 提供可操作的、优先级明确的建议
   */
  async generateSuggestions(
    detected: DetectedEnvironmentVariables,
    missing: MissingAPI[],
    browserType: BrowserType
  ): Promise<string[]> {
    if (!this.llm) {
      return this.getDefaultSuggestions(detected, missing);
    }

    try {
      const systemPrompt = `# Role
You are a browser automation and anti-detection expert providing actionable recommendations.

# Task
Generate 3-5 specific, prioritized recommendations for browser environment emulation.

# Recommendation Criteria
1. **Actionable**: Provide specific steps or code snippets
2. **Prioritized**: Most critical issues first
3. **Realistic**: Based on real-world anti-bot scenarios
4. **Concise**: One clear sentence per recommendation
5. **Technical**: Include specific API names or techniques`;

      const userPrompt = `# Environment Analysis
- **Target Browser**: ${browserType.toUpperCase()}
- **Detected Variables**: ${Object.values(detected).flat().length} environment variables accessed
- **Missing APIs**: ${missing.length} APIs need implementation

# Missing API Details
${missing.slice(0, 20).map(m => `- \`${m.path}\` (${m.type})`).join('\n')}
${missing.length > 20 ? `\n... and ${missing.length - 20} more` : ''}

# Key Patterns Detected
- Navigator access: ${detected.navigator.length} properties
- Window access: ${detected.window.length} properties
- Document access: ${detected.document.length} properties
- Screen access: ${detected.screen.length} properties

# Required Output
Return ONLY a JSON array of 3-5 actionable recommendations:

\`\`\`json
[
  "Recommendation 1 with specific action",
  "Recommendation 2 with specific action",
  "Recommendation 3 with specific action"
]
\`\`\`

# Example Output
\`\`\`json
[
  "Set navigator.webdriver to false using Object.defineProperty() before page load to avoid Selenium detection",
  "Implement navigator.plugins with at least 3 realistic plugins (PDF, Chrome PDF Viewer, Native Client) to pass plugin enumeration checks",
  "Override canvas toDataURL() to return consistent fingerprint hash across sessions to avoid canvas fingerprinting",
  "Use Puppeteer Stealth plugin or manually patch window.chrome object to include runtime, loadTimes, and csi properties",
  "Ensure navigator.userAgent, navigator.platform, and navigator.vendor are consistent (e.g., Windows UA must have Win32 platform)"
]
\`\`\`

# Guidelines
- Focus on high-impact, easy-to-implement fixes first
- Mention specific tools (Puppeteer Stealth, undetected-chromedriver) when relevant
- Include code snippets in recommendations when helpful
- Prioritize anti-detection over completeness

Now generate recommendations:`;

      const response = await this.llm.chat([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ]);

      const jsonMatch = response.content.match(/```json\s*([\s\S]*?)\s*```/) ||
                       response.content.match(/\[[\s\S]*\]/);

      if (jsonMatch) {
        const jsonStr = jsonMatch[1] || jsonMatch[0];
        const suggestions = JSON.parse(jsonStr);
        // 确保返回的是字符串数组
        if (Array.isArray(suggestions) && suggestions.every(s => typeof s === 'string')) {
          return suggestions;
        }
      }

      return this.getDefaultSuggestions(detected, missing);
    } catch (error) {
      logger.error('生成建议失败', error);
      return this.getDefaultSuggestions(detected, missing);
    }
  }

  /**
   * 获取默认建议
   */
  private getDefaultSuggestions(
    detected: DetectedEnvironmentVariables,
    missing: MissingAPI[]
  ): string[] {
    const suggestions: string[] = [];

    const totalVars = Object.values(detected).flat().length;
    if (totalVars > 50) {
      suggestions.push('检测到大量环境变量访问，建议使用真实浏览器环境提取功能');
    }

    if (missing.length > 10) {
      suggestions.push(`有${missing.length}个API需要补充，建议优先补充高重要性的API`);
    }

    if (detected.navigator.some(v => v.includes('webdriver'))) {
      suggestions.push('检测到webdriver检测，建议设置navigator.webdriver = false');
    }

    if (detected.navigator.some(v => v.includes('plugins'))) {
      suggestions.push('检测到plugins访问，建议补充真实的插件列表');
    }

    if (detected.window.some(v => v.includes('chrome'))) {
      suggestions.push('检测到chrome对象访问，建议补充window.chrome对象');
    }

    return suggestions;
  }
}

