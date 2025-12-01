/**
 * WatchExpressionManager - 监视表达式管理
 * 
 * 功能：
 * 1. 添加/删除/启用/禁用监视表达式
 * 2. 在每次暂停时自动求值所有监视表达式
 * 3. 追踪表达式值的变化历史
 * 
 * 设计原则：
 * - 依赖 RuntimeInspector 进行表达式求值
 * - 自动在断点暂停时求值
 * - 提供值变化检测
 */

import type { RuntimeInspector } from './RuntimeInspector.js';
import { logger } from '../../utils/logger.js';

/**
 * 监视表达式
 */
export interface WatchExpression {
  id: string;
  expression: string;
  name: string;
  enabled: boolean;
  lastValue: any;
  lastError: Error | null;
  valueHistory: Array<{ value: any; timestamp: number }>;
  createdAt: number;
}

/**
 * 监视表达式求值结果
 */
export interface WatchResult {
  watchId: string;
  name: string;
  expression: string;
  value: any;
  error: Error | null;
  valueChanged: boolean;
  timestamp: number;
}

/**
 * 监视表达式管理器
 */
export class WatchExpressionManager {
  private watches: Map<string, WatchExpression> = new Map();
  private watchCounter = 0;

  constructor(private runtimeInspector: RuntimeInspector) {}

  /**
   * 添加监视表达式
   */
  addWatch(expression: string, name?: string): string {
    const watchId = `watch_${++this.watchCounter}`;
    
    this.watches.set(watchId, {
      id: watchId,
      expression,
      name: name || expression,
      enabled: true,
      lastValue: undefined,
      lastError: null,
      valueHistory: [],
      createdAt: Date.now(),
    });

    logger.info(`Watch expression added: ${watchId}`, { expression, name });
    return watchId;
  }

  /**
   * 删除监视表达式
   */
  removeWatch(watchId: string): boolean {
    const deleted = this.watches.delete(watchId);
    if (deleted) {
      logger.info(`Watch expression removed: ${watchId}`);
    }
    return deleted;
  }

  /**
   * 启用/禁用监视表达式
   */
  setWatchEnabled(watchId: string, enabled: boolean): boolean {
    const watch = this.watches.get(watchId);
    if (!watch) return false;

    watch.enabled = enabled;
    logger.info(`Watch expression ${enabled ? 'enabled' : 'disabled'}: ${watchId}`);
    return true;
  }

  /**
   * 获取所有监视表达式
   */
  getAllWatches(): WatchExpression[] {
    return Array.from(this.watches.values());
  }

  /**
   * 获取特定监视表达式
   */
  getWatch(watchId: string): WatchExpression | undefined {
    return this.watches.get(watchId);
  }

  /**
   * 求值所有启用的监视表达式
   *
   * @param callFrameId 可选的调用帧 ID（在断点暂停时使用）
   * @param timeout 单个表达式的超时时间（毫秒，默认5000ms）
   */
  async evaluateAll(callFrameId?: string, timeout = 5000): Promise<WatchResult[]> {
    const results: WatchResult[] = [];

    for (const watch of this.watches.values()) {
      if (!watch.enabled) continue;

      try {
        // 🔧 修复：添加超时控制，防止表达式求值卡死
        const value = await Promise.race([
          this.runtimeInspector.evaluate(watch.expression, callFrameId),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error(`Evaluation timeout after ${timeout}ms`)), timeout)
          ),
        ]);

        // 检测值是否变化
        const valueChanged = !this.deepEqual(value, watch.lastValue);

        // 更新历史
        if (valueChanged) {
          watch.valueHistory.push({
            value,
            timestamp: Date.now(),
          });

          // 限制历史记录数量（最多保留 100 条）
          if (watch.valueHistory.length > 100) {
            watch.valueHistory.shift();
          }
        }

        // 更新最后的值和错误
        watch.lastValue = value;
        watch.lastError = null;

        results.push({
          watchId: watch.id,
          name: watch.name,
          expression: watch.expression,
          value,
          error: null,
          valueChanged,
          timestamp: Date.now(),
        });
      } catch (error) {
        watch.lastError = error as Error;

        results.push({
          watchId: watch.id,
          name: watch.name,
          expression: watch.expression,
          value: null,
          error: error as Error,
          valueChanged: false,
          timestamp: Date.now(),
        });
      }
    }

    return results;
  }

  /**
   * 清除所有监视表达式
   */
  clearAll(): void {
    this.watches.clear();
    logger.info('All watch expressions cleared');
  }

  /**
   * 获取监视表达式的值变化历史
   */
  getValueHistory(watchId: string): Array<{ value: any; timestamp: number }> | null {
    const watch = this.watches.get(watchId);
    return watch ? watch.valueHistory : null;
  }

  /**
   * 深度比较两个值是否相等
   */
  private deepEqual(a: any, b: any): boolean {
    if (a === b) return true;
    if (a == null || b == null) return false;
    if (typeof a !== 'object' || typeof b !== 'object') return false;

    const keysA = Object.keys(a);
    const keysB = Object.keys(b);

    if (keysA.length !== keysB.length) return false;

    for (const key of keysA) {
      if (!keysB.includes(key)) return false;
      if (!this.deepEqual(a[key], b[key])) return false;
    }

    return true;
  }

  /**
   * 导出监视表达式配置
   */
  exportWatches(): Array<{ expression: string; name: string; enabled: boolean }> {
    return Array.from(this.watches.values()).map(watch => ({
      expression: watch.expression,
      name: watch.name,
      enabled: watch.enabled,
    }));
  }

  /**
   * 导入监视表达式配置
   */
  importWatches(watches: Array<{ expression: string; name?: string; enabled?: boolean }>): void {
    for (const watch of watches) {
      const watchId = this.addWatch(watch.expression, watch.name);
      if (watch.enabled === false) {
        this.setWatchEnabled(watchId, false);
      }
    }
    logger.info(`Imported ${watches.length} watch expressions`);
  }
}

