/**
 * AI Hook工具处理器
 * 
 * 允许AI客户端：
 * 1. 描述需要Hook的功能
 * 2. 自动生成Hook代码
 * 3. 注入到浏览器
 * 4. 获取Hook捕获的数据
 */

import { AIHookGenerator, AIHookRequest } from '../modules/hook/AIHookGenerator.js';
import type { PageController } from '../modules/collector/PageController.js';
import { logger } from '../utils/logger.js';

export class AIHookToolHandlers {
  private hookGenerator: AIHookGenerator;
  private injectedHooks: Map<string, { code: string; injectionTime: number }> = new Map();

  constructor(private pageController: PageController) {
    this.hookGenerator = new AIHookGenerator();
  }

  /**
   * AI生成Hook代码
   */
  async handleAIHookGenerate(args: Record<string, unknown>) {
    try {
      const request: AIHookRequest = {
        description: args.description as string,
        target: args.target as AIHookRequest['target'],
        behavior: args.behavior as AIHookRequest['behavior'],
        condition: args.condition as AIHookRequest['condition'],
        customCode: args.customCode as AIHookRequest['customCode'],
      };

      const response = this.hookGenerator.generateHook(request);

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: response.success,
            hookId: response.hookId,
            generatedCode: response.generatedCode,
            explanation: response.explanation,
            injectionMethod: response.injectionMethod,
            warnings: response.warnings,
            usage: `使用 ai_hook_inject(hookId: "${response.hookId}") 来注入此Hook`,
          }, null, 2),
        }],
      };
    } catch (error) {
      logger.error('AI Hook generation failed', error);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: false,
            error: error instanceof Error ? error.message : String(error),
          }, null, 2),
        }],
      };
    }
  }

  /**
   * 注入AI生成的Hook
   */
  async handleAIHookInject(args: Record<string, unknown>) {
    try {
      const hookId = args.hookId as string;
      const code = args.code as string;
      const method = (args.method as 'evaluateOnNewDocument' | 'evaluate') || 'evaluate';

      const page = await this.pageController.getPage();

      if (method === 'evaluateOnNewDocument') {
        // 在新文档加载前注入（适用于API Hook）
        await page.evaluateOnNewDocument(code);
        logger.info(`✅ Hook injected (evaluateOnNewDocument): ${hookId}`);
      } else {
        // 在当前页面注入
        await page.evaluate(code);
        logger.info(`✅ Hook injected (evaluate): ${hookId}`);
      }

      this.injectedHooks.set(hookId, {
        code,
        injectionTime: Date.now(),
      });

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
            hookId,
            message: `Hook已注入 (方法: ${method})`,
            injectionTime: new Date().toISOString(),
          }, null, 2),
        }],
      };
    } catch (error) {
      logger.error('Hook injection failed', error);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: false,
            error: error instanceof Error ? error.message : String(error),
          }, null, 2),
        }],
      };
    }
  }

  /**
   * 获取Hook捕获的数据
   */
  async handleAIHookGetData(args: Record<string, unknown>) {
    try {
      const hookId = args.hookId as string;
      const page = await this.pageController.getPage();

      const hookData = await page.evaluate((id) => {
        if (!window.__aiHooks || !window.__aiHooks[id]) {
          return null;
        }
        return {
          hookId: id,
          metadata: window.__aiHookMetadata?.[id],
          records: window.__aiHooks[id],
          totalRecords: window.__aiHooks[id].length,
        };
      }, hookId);

      if (!hookData) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: false,
              message: `Hook未找到或未捕获任何数据: ${hookId}`,
            }, null, 2),
          }],
        };
      }

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
            ...hookData,
          }, null, 2),
        }],
      };
    } catch (error) {
      logger.error('Failed to get hook data', error);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: false,
            error: error instanceof Error ? error.message : String(error),
          }, null, 2),
        }],
      };
    }
  }

  /**
   * 列出所有已注入的Hook
   */
  async handleAIHookList(_args: Record<string, unknown>) {
    try {
      const page = await this.pageController.getPage();

      const allHooks = await page.evaluate(() => {
        if (!window.__aiHookMetadata) {
          return [];
        }

        return Object.keys(window.__aiHookMetadata).map(hookId => ({
          hookId,
          metadata: window.__aiHookMetadata![hookId],
          recordCount: window.__aiHooks?.[hookId]?.length || 0,
        }));
      });

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
            totalHooks: allHooks.length,
            hooks: allHooks,
          }, null, 2),
        }],
      };
    } catch (error) {
      logger.error('Failed to list hooks', error);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: false,
            error: error instanceof Error ? error.message : String(error),
          }, null, 2),
        }],
      };
    }
  }

  /**
   * 清除Hook数据
   */
  async handleAIHookClear(args: Record<string, unknown>) {
    try {
      const hookId = args.hookId as string | undefined;
      const page = await this.pageController.getPage();

      if (hookId) {
        // 清除特定Hook的数据
        await page.evaluate((id) => {
          if (window.__aiHooks && window.__aiHooks[id]) {
            window.__aiHooks[id] = [];
          }
        }, hookId);

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: true,
              message: `Hook数据已清除: ${hookId}`,
            }, null, 2),
          }],
        };
      } else {
        // 清除所有Hook数据
        await page.evaluate(() => {
          if (window.__aiHooks) {
            for (const key in window.__aiHooks) {
              window.__aiHooks[key] = [];
            }
          }
        });

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: true,
              message: '所有Hook数据已清除',
            }, null, 2),
          }],
        };
      }
    } catch (error) {
      logger.error('Failed to clear hook data', error);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: false,
            error: error instanceof Error ? error.message : String(error),
          }, null, 2),
        }],
      };
    }
  }

  /**
   * 禁用/启用Hook
   */
  async handleAIHookToggle(args: Record<string, unknown>) {
    try {
      const hookId = args.hookId as string;
      const enabled = args.enabled as boolean;
      const page = await this.pageController.getPage();

      await page.evaluate((id, enable) => {
        if (window.__aiHookMetadata && window.__aiHookMetadata[id]) {
          window.__aiHookMetadata[id].enabled = enable;
        }
      }, hookId, enabled);

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
            hookId,
            enabled,
            message: `Hook已${enabled ? '启用' : '禁用'}`,
          }, null, 2),
        }],
      };
    } catch (error) {
      logger.error('Failed to toggle hook', error);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: false,
            error: error instanceof Error ? error.message : String(error),
          }, null, 2),
        }],
      };
    }
  }

  /**
   * 导出Hook数据
   */
  async handleAIHookExport(args: Record<string, unknown>) {
    try {
      const hookId = args.hookId as string | undefined;
      const format = (args.format as 'json' | 'csv') || 'json';
      const page = await this.pageController.getPage();

      const exportData = await page.evaluate((id) => {
        if (id) {
          // 导出特定Hook
          return {
            hookId: id,
            metadata: window.__aiHookMetadata?.[id],
            records: window.__aiHooks?.[id] || [],
          };
        } else {
          // 导出所有Hook
          return {
            metadata: window.__aiHookMetadata || {},
            records: window.__aiHooks || {},
          };
        }
      }, hookId);

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
            format,
            data: exportData,
            exportTime: new Date().toISOString(),
          }, null, 2),
        }],
      };
    } catch (error) {
      logger.error('Failed to export hook data', error);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: false,
            error: error instanceof Error ? error.message : String(error),
          }, null, 2),
        }],
      };
    }
  }
}

