/**
 * 缓存管理工具
 */

import { promises as fs } from 'fs';
import { join } from 'path';
import { createHash } from 'crypto';
import type { CacheConfig } from '../types/index.js';
import { logger } from './logger.js';

export class CacheManager {
  private config: CacheConfig;

  constructor(config: CacheConfig) {
    this.config = config;
  }

  /**
   * 初始化缓存目录
   */
  async init(): Promise<void> {
    if (!this.config.enabled) {
      return;
    }

    try {
      await fs.mkdir(this.config.dir, { recursive: true });
      logger.debug(`Cache directory initialized: ${this.config.dir}`);
    } catch (error) {
      logger.error('Failed to initialize cache directory', error);
    }
  }

  /**
   * 生成缓存键
   */
  private generateKey(key: string): string {
    return createHash('md5').update(key).digest('hex');
  }

  /**
   * 获取缓存文件路径
   */
  private getCachePath(key: string): string {
    const hashedKey = this.generateKey(key);
    return join(this.config.dir, `${hashedKey}.json`);
  }

  /**
   * 获取缓存
   */
  async get<T>(key: string): Promise<T | null> {
    if (!this.config.enabled) {
      return null;
    }

    try {
      const cachePath = this.getCachePath(key);
      const data = await fs.readFile(cachePath, 'utf-8');
      const cached = JSON.parse(data);

      // 检查是否过期
      if (Date.now() - cached.timestamp > this.config.ttl * 1000) {
        await this.delete(key);
        return null;
      }

      logger.debug(`Cache hit: ${key}`);
      return cached.value as T;
    } catch (error) {
      logger.debug(`Cache miss: ${key}`);
      return null;
    }
  }

  /**
   * 设置缓存
   */
  async set<T>(key: string, value: T): Promise<void> {
    if (!this.config.enabled) {
      return;
    }

    try {
      const cachePath = this.getCachePath(key);
      const data = {
        timestamp: Date.now(),
        value,
      };
      await fs.writeFile(cachePath, JSON.stringify(data), 'utf-8');
      logger.debug(`Cache set: ${key}`);
    } catch (error) {
      logger.error('Failed to set cache', error);
    }
  }

  /**
   * 删除缓存
   */
  async delete(key: string): Promise<void> {
    if (!this.config.enabled) {
      return;
    }

    try {
      const cachePath = this.getCachePath(key);
      await fs.unlink(cachePath);
      logger.debug(`Cache deleted: ${key}`);
    } catch (error) {
      // 忽略文件不存在的错误
    }
  }

  /**
   * 清空所有缓存
   */
  async clear(): Promise<void> {
    if (!this.config.enabled) {
      return;
    }

    try {
      const files = await fs.readdir(this.config.dir);
      await Promise.all(files.map((file) => fs.unlink(join(this.config.dir, file))));
      logger.info('Cache cleared');
    } catch (error) {
      logger.error('Failed to clear cache', error);
    }
  }
}

