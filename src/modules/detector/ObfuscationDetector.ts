/**
 * 混淆检测器 - 识别各种JavaScript混淆技术
 * 支持2024-2025最新混淆类型
 */

import { ObfuscationType, VMFeatures } from '../../types/index.js';
import { logger } from '../../utils/logger.js';
import { JSVMPDeobfuscator } from '../deobfuscator/JSVMPDeobfuscator.js';

export interface DetectionResult {
  types: ObfuscationType[];
  confidence: Record<ObfuscationType, number>;
  features: string[];
  recommendations: string[];
  vmFeatures?: VMFeatures; // JSVMP特征信息
}

export class ObfuscationDetector {
  private jsvmpDetector: JSVMPDeobfuscator;

  constructor() {
    this.jsvmpDetector = new JSVMPDeobfuscator();
  }

  /**
   * 检测代码中的混淆类型
   */
  detect(code: string): DetectionResult {
    const types: ObfuscationType[] = [];
    const confidence: Partial<Record<ObfuscationType, number>> = {};
    const features: string[] = [];
    const recommendations: string[] = [];
    let vmFeatures: VMFeatures | undefined;

    // 1. JavaScript Obfuscator (obfuscator.io)
    if (this.detectJavaScriptObfuscator(code)) {
      types.push('javascript-obfuscator');
      confidence['javascript-obfuscator'] = 0.9;
      features.push('String array with rotation');
      features.push('Control flow flattening');
      recommendations.push('Use webcrack or restringer for deobfuscation');
    }

    // 2. Webpack
    if (this.detectWebpack(code)) {
      types.push('webpack');
      confidence['webpack'] = 0.85;
      features.push('__webpack_require__');
      recommendations.push('Use webpack-bundle-analyzer');
    }

    // 3. UglifyJS
    if (this.detectUglify(code)) {
      types.push('uglify');
      confidence['uglify'] = 0.7;
      features.push('Minified variable names');
      recommendations.push('Use prettier or beautifier');
    }

    // 4. VM Protection (使用JSVMPDeobfuscator进行详细检测)
    const vmDetectionResult = this.detectVMProtectionDetailed(code);
    if (vmDetectionResult) {
      types.push('vm-protection');
      confidence['vm-protection'] = 0.95;
      vmFeatures = vmDetectionResult;
      features.push(`JSVMP with ${vmDetectionResult.instructionCount} instructions`);
      features.push(`Complexity: ${vmDetectionResult.complexity}`);
      recommendations.push('Use JSVMPDeobfuscator for advanced deobfuscation');
    }

    // 5. Invisible Unicode (2025新技术)
    if (this.detectInvisibleUnicode(code)) {
      types.push('invisible-unicode');
      confidence['invisible-unicode'] = 1.0;
      features.push('Zero-width characters');
      recommendations.push('Use AdvancedDeobfuscator.decodeInvisibleUnicode()');
    }

    // 6. Control Flow Flattening
    if (this.detectControlFlowFlattening(code)) {
      types.push('control-flow-flattening');
      confidence['control-flow-flattening'] = 0.8;
      features.push('Switch-case state machine');
      recommendations.push('Requires symbolic execution');
    }

    // 7. String Array Rotation
    if (this.detectStringArrayRotation(code)) {
      types.push('string-array-rotation');
      confidence['string-array-rotation'] = 0.85;
      features.push('Rotated string array');
      recommendations.push('Extract and derotate string array');
    }

    // 8. Dead Code Injection
    if (this.detectDeadCodeInjection(code)) {
      types.push('dead-code-injection');
      confidence['dead-code-injection'] = 0.75;
      features.push('Unreachable code blocks');
      recommendations.push('Use AST-based dead code elimination');
    }

    // 9. Opaque Predicates
    if (this.detectOpaquePredicates(code)) {
      types.push('opaque-predicates');
      confidence['opaque-predicates'] = 0.7;
      features.push('Always-true/false conditions');
      recommendations.push('Use constant folding');
    }

    // 10. JSFuck
    if (this.detectJSFuck(code)) {
      types.push('jsfuck');
      confidence['jsfuck'] = 1.0;
      features.push('Only uses []()!+');
      recommendations.push('Use jsfuck decoder');
    }

    // 11. AAEncode
    if (this.detectAAEncode(code)) {
      types.push('aaencode');
      confidence['aaencode'] = 1.0;
      features.push('Japanese emoticons');
      recommendations.push('Use aaencode decoder');
    }

    // 12. JJEncode
    if (this.detectJJEncode(code)) {
      types.push('jjencode');
      confidence['jjencode'] = 1.0;
      features.push('$={___:++$');
      recommendations.push('Use jjencode decoder');
    }

    // 13. Packer
    if (this.detectPacker(code)) {
      types.push('packer');
      confidence['packer'] = 0.95;
      features.push('eval(function(p,a,c,k,e,d)');
      recommendations.push('Use unpacker tools');
    }

    // 14. Eval Obfuscation
    if (this.detectEvalObfuscation(code)) {
      types.push('eval-obfuscation');
      confidence['eval-obfuscation'] = 0.8;
      features.push('Multiple eval() calls');
      recommendations.push('Hook eval() and log arguments');
    }

    // 15. Base64 Encoding
    if (this.detectBase64Encoding(code)) {
      types.push('base64-encoding');
      confidence['base64-encoding'] = 0.9;
      features.push('atob() or Base64 strings');
      recommendations.push('Decode Base64 strings');
    }

    // 16. Hex Encoding
    if (this.detectHexEncoding(code)) {
      types.push('hex-encoding');
      confidence['hex-encoding'] = 0.85;
      features.push('\\x hex sequences');
      recommendations.push('Decode hex strings');
    }

    // 17. Self-Modifying Code
    if (this.detectSelfModifying(code)) {
      types.push('self-modifying');
      confidence['self-modifying'] = 0.9;
      features.push('Dynamic code generation');
      recommendations.push('Requires runtime analysis');
    }

    // 18. JScrambler
    if (this.detectJScrambler(code)) {
      types.push('jscrambler');
      confidence['jscrambler'] = 0.85;
      features.push('Control flow flattening + Self-defending');
      recommendations.push('Use JScrambler deobfuscator');
    }

    // 19. URLEncode
    if (this.detectURLEncode(code)) {
      types.push('urlencoded');
      confidence['urlencoded'] = 0.95;
      features.push('URL encoded strings');
      recommendations.push('Decode URL encoding');
    }

    // 如果没有检测到任何混淆
    if (types.length === 0) {
      types.push('unknown');
      confidence['unknown'] = 0.5;
      recommendations.push('Code may be clean or use custom obfuscation');
    }

    logger.info(`Detected obfuscation types: ${types.join(', ')}`);

    return {
      types,
      confidence: confidence as Record<ObfuscationType, number>,
      features,
      recommendations,
      vmFeatures,
    };
  }

  /**
   * 详细检测VM Protection（使用JSVMPDeobfuscator）
   */
  private detectVMProtectionDetailed(code: string): VMFeatures | null {
    try {
      // 使用JSVMPDeobfuscator的检测逻辑
      // 这里我们需要访问其私有方法，所以创建一个临时实例并调用
      const result = (this.jsvmpDetector as any).detectJSVMP(code);
      return result;
    } catch (error) {
      logger.warn('VM Protection详细检测失败，使用简单检测', error);
      // 回退到简单检测
      if (this.detectVMProtection(code)) {
        return {
          instructionCount: 0,
          interpreterLocation: 'Unknown',
          complexity: 'medium',
          hasSwitch: true,
          hasInstructionArray: false,
          hasProgramCounter: false,
        };
      }
      return null;
    }
  }

  // ==================== 检测方法 ====================

  private detectJavaScriptObfuscator(code: string): boolean {
    const patterns = [
      /_0x[a-f0-9]{4,6}/i, // 十六进制变量名
      /var\s+_0x[a-f0-9]+\s*=\s*\[/i, // 字符串数组
      /\(function\s*\(_0x[a-f0-9]+,\s*_0x[a-f0-9]+\)/i, // IIFE包装
      /while\s*\(!!\[\]\)/i, // 控制流
    ];

    return patterns.filter(p => p.test(code)).length >= 2;
  }

  private detectWebpack(code: string): boolean {
    return (
      code.includes('__webpack_require__') ||
      code.includes('webpackJsonp') ||
      /\/\*\*\*\*\*\*\/\s*\(/m.test(code)
    );
  }

  private detectUglify(code: string): boolean {
    // 检查是否有大量单字母变量
    const singleLetterVars = code.match(/\b[a-z]\b/g);
    return (singleLetterVars?.length || 0) > 50;
  }

  private detectVMProtection(code: string): boolean {
    const vmPatterns = [
      /while\s*\(\s*true\s*\)\s*\{[\s\S]*?switch\s*\(/i,
      /var\s+\w+\s*=\s*\[\s*\d+(?:\s*,\s*\d+){10,}\s*\]/i,
      /\w+\[pc\+\+\]/i,
      /stack\.push|stack\.pop/i,
    ];

    return vmPatterns.filter(p => p.test(code)).length >= 2;
  }

  private detectInvisibleUnicode(code: string): boolean {
    const invisibleChars = ['\u200B', '\u200C', '\u200D', '\u2060', '\uFEFF'];
    return invisibleChars.some(char => code.includes(char));
  }

  private detectControlFlowFlattening(code: string): boolean {
    return /while\s*\(\s*!!\s*\[\s*\]\s*\)\s*\{[\s\S]*?switch\s*\(/i.test(code);
  }

  private detectStringArrayRotation(code: string): boolean {
    return (
      /var\s+\w+\s*=\s*\[.*?\];[\s\S]*?\(\s*function\s*\(\s*\w+,\s*\w+\s*\)/i.test(
        code
      ) && /\w+\s*=\s*\w+\s*\+\s*0x[0-9a-f]+/i.test(code)
    );
  }

  private detectDeadCodeInjection(code: string): boolean {
    return (
      /if\s*\(\s*false\s*\)\s*\{/i.test(code) ||
      /if\s*\(\s*!!\s*\[\s*\]\s*\)\s*\{/i.test(code)
    );
  }

  private detectOpaquePredicates(code: string): boolean {
    return /if\s*\(\s*\d+\s*[<>!=]+\s*\d+\s*\)/i.test(code);
  }

  private detectJSFuck(code: string): boolean {
    // JSFuck只使用 []()!+
    const jsfuckChars = /^[\[\]\(\)!+\s]+$/;
    return jsfuckChars.test(code.substring(0, 1000));
  }

  private detectAAEncode(code: string): boolean {
    // AAEncode使用日文颜文字
    return /゚ω゚|ﾟωﾟ/.test(code);
  }

  private detectJJEncode(code: string): boolean {
    return /\$=\{___:\+\+\$/.test(code);
  }

  private detectPacker(code: string): boolean {
    return /eval\s*\(\s*function\s*\(\s*p\s*,\s*a\s*,\s*c\s*,\s*k\s*,\s*e\s*,\s*d\s*\)/i.test(
      code
    );
  }

  private detectEvalObfuscation(code: string): boolean {
    const evalCount = (code.match(/\beval\s*\(/g) || []).length;
    return evalCount >= 3;
  }

  private detectBase64Encoding(code: string): boolean {
    return (
      code.includes('atob(') ||
      /[A-Za-z0-9+/]{50,}={0,2}/.test(code) // Base64字符串
    );
  }

  private detectHexEncoding(code: string): boolean {
    const hexCount = (code.match(/\\x[0-9a-f]{2}/gi) || []).length;
    return hexCount > 20;
  }

  private detectSelfModifying(code: string): boolean {
    return (
      code.includes('Function(') ||
      code.includes('new Function') ||
      /eval\s*\(\s*[^)]*\+/.test(code)
    );
  }

  /**
   * 检测JScrambler混淆
   */
  private detectJScrambler(code: string): boolean {
    let score = 0;

    // 1. 检测控制流平坦化 + while(true)
    if (/while\s*\(\s*!!\s*\[\s*\]\s*\)/.test(code) || /while\s*\(\s*true\s*\)\s*{[\s\S]*?switch/.test(code)) {
      score += 3;
    }

    // 2. 检测自我防御代码
    if (code.includes('debugger') && code.includes('constructor')) {
      score += 2;
    }

    // 3. 检测字符串加密
    if (/function\s+\w+\s*\([^)]*\)\s*{[\s\S]*?charCodeAt[\s\S]*?fromCharCode/.test(code)) {
      score += 2;
    }

    // 4. 检测函数重排序标记
    if (code.includes('Function.prototype.toString') || code.includes('.toString.call')) {
      score += 1;
    }

    return score >= 3;
  }

  /**
   * 检测URLEncode混淆
   */
  private detectURLEncode(code: string): boolean {
    // 检测大量的%编码
    const percentMatches = code.match(/%[0-9A-Fa-f]{2}/g);
    return (percentMatches?.length || 0) > 10;
  }

  /**
   * 生成检测报告
   */
  generateReport(result: DetectionResult): string {
    let report = '=== Obfuscation Detection Report ===\n\n';

    report += `Detected Types (${result.types.length}):\n`;
    result.types.forEach(type => {
      const conf = result.confidence[type] || 0;
      report += `  - ${type}: ${(conf * 100).toFixed(0)}% confidence\n`;
    });

    report += `\nFeatures:\n`;
    result.features.forEach(feature => {
      report += `  - ${feature}\n`;
    });

    report += `\nRecommendations:\n`;
    result.recommendations.forEach(rec => {
      report += `  - ${rec}\n`;
    });

    return report;
  }
}

