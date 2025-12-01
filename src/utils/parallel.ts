/**
 * 并行处理工具
 * 
 * 功能:
 * - 并发控制
 * - 任务队列
 * - 错误处理
 * - 进度跟踪
 */

import { logger } from './logger.js';

export interface ParallelOptions {
  maxConcurrency?: number; // 最大并发数
  timeout?: number; // 超时时间（毫秒）
  retryOnError?: boolean; // 错误时是否重试
  maxRetries?: number; // 最大重试次数
}

export interface TaskResult<T> {
  success: boolean;
  data?: T;
  error?: Error;
  duration: number;
}

/**
 * 并行执行任务
 */
export async function parallelExecute<T, R>(
  items: T[],
  executor: (item: T, index: number) => Promise<R>,
  options: ParallelOptions = {}
): Promise<TaskResult<R>[]> {
  const {
    maxConcurrency = 3,
    timeout = 60000,
    retryOnError = false,
    maxRetries = 2,
  } = options;

  const results: TaskResult<R>[] = [];
  const executing: Promise<void>[] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item === undefined) continue;

    const task = (async () => {
      const startTime = Date.now();
      let lastError: Error | undefined;

      for (let attempt = 0; attempt <= (retryOnError ? maxRetries : 0); attempt++) {
        try {
          // 超时控制
          const result = await Promise.race([
            executor(item, i),
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error('Task timeout')), timeout)
            ),
          ]);

          results[i] = {
            success: true,
            data: result,
            duration: Date.now() - startTime,
          };
          return;
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));
          if (attempt < (retryOnError ? maxRetries : 0)) {
            logger.warn(`Task ${i} failed, retrying (${attempt + 1}/${maxRetries})...`);
            await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
          }
        }
      }

      // 所有重试都失败
      results[i] = {
        success: false,
        error: lastError,
        duration: Date.now() - startTime,
      };
    })();

    executing.push(task);

    // 控制并发数
    if (executing.length >= maxConcurrency) {
      await Promise.race(executing);
      executing.splice(
        executing.findIndex((p) => p === task),
        1
      );
    }
  }

  // 等待所有任务完成
  await Promise.all(executing);

  return results;
}

/**
 * 批量处理任务（分批执行）
 */
export async function batchProcess<T, R>(
  items: T[],
  executor: (batch: T[]) => Promise<R[]>,
  batchSize: number = 10
): Promise<R[]> {
  const results: R[] = [];

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    logger.debug(`Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(items.length / batchSize)}`);

    try {
      const batchResults = await executor(batch);
      results.push(...batchResults);
    } catch (error) {
      logger.error(`Batch processing failed at index ${i}`, error);
      throw error;
    }
  }

  return results;
}

/**
 * 任务队列
 */
export class TaskQueue<T, R> {
  private queue: Array<{
    item: T;
    resolve: (value: R) => void;
    reject: (error: Error) => void;
  }> = [];
  private running = 0;
  private maxConcurrency: number;
  private executor: (item: T) => Promise<R>;

  constructor(executor: (item: T) => Promise<R>, maxConcurrency: number = 3) {
    this.executor = executor;
    this.maxConcurrency = maxConcurrency;
  }

  /**
   * 添加任务
   */
  async add(item: T): Promise<R> {
    return new Promise((resolve, reject) => {
      this.queue.push({ item, resolve, reject });
      this.process();
    });
  }

  /**
   * 处理队列
   */
  private async process(): Promise<void> {
    if (this.running >= this.maxConcurrency || this.queue.length === 0) {
      return;
    }

    const task = this.queue.shift();
    if (!task) return;

    this.running++;

    try {
      const result = await this.executor(task.item);
      task.resolve(result);
    } catch (error) {
      task.reject(error instanceof Error ? error : new Error(String(error)));
    } finally {
      this.running--;
      this.process();
    }
  }

  /**
   * 获取队列状态
   */
  getStatus() {
    return {
      queueLength: this.queue.length,
      running: this.running,
      maxConcurrency: this.maxConcurrency,
    };
  }

  /**
   * 清空队列
   */
  clear(): void {
    this.queue.forEach((task) => {
      task.reject(new Error('Queue cleared'));
    });
    this.queue = [];
  }
}

/**
 * 限流器（Rate Limiter）
 */
export class RateLimiter {
  private tokens: number;
  private maxTokens: number;
  private refillRate: number; // 每秒补充的令牌数
  private lastRefill: number;

  constructor(maxTokens: number, refillRate: number) {
    this.maxTokens = maxTokens;
    this.tokens = maxTokens;
    this.refillRate = refillRate;
    this.lastRefill = Date.now();
  }

  /**
   * 补充令牌
   */
  private refill(): void {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    const tokensToAdd = elapsed * this.refillRate;

    this.tokens = Math.min(this.maxTokens, this.tokens + tokensToAdd);
    this.lastRefill = now;
  }

  /**
   * 尝试获取令牌
   */
  async acquire(tokens: number = 1): Promise<void> {
    while (true) {
      this.refill();

      if (this.tokens >= tokens) {
        this.tokens -= tokens;
        return;
      }

      // 等待一段时间后重试
      const waitTime = ((tokens - this.tokens) / this.refillRate) * 1000;
      await new Promise((resolve) => setTimeout(resolve, Math.min(waitTime, 1000)));
    }
  }

  /**
   * 获取当前令牌数
   */
  getTokens(): number {
    this.refill();
    return this.tokens;
  }
}

