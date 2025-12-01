/**
 * 配置管理工具
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { config as dotenvConfig } from 'dotenv';
import type { Config } from '../types/index.js';

// 计算项目根目录
// 当前文件编译后位于: dist/utils/config.js
// 项目根目录是: ../../ (向上两级)
const currentFilename = fileURLToPath(import.meta.url);
const currentDirname = dirname(currentFilename);
const projectRoot = join(currentDirname, '..', '..');

// 使用绝对路径加载环境变量
// 这样无论从哪个目录启动服务器，都能正确找到 .env 文件
const envPath = join(projectRoot, '.env');
const result = dotenvConfig({ path: envPath });

// 如果 .env 文件加载失败，输出警告（使用 stderr 不影响 MCP 通信）
if (result.error) {
  console.error(`[Config] Warning: Failed to load .env file from ${envPath}`);
  console.error(`[Config] Error: ${result.error.message}`);
  console.error(`[Config] Will use environment variables or defaults`);
} else {
  // 成功加载时输出信息（仅在调试模式下）
  if (process.env.DEBUG === 'true') {
    console.error(`[Config] Successfully loaded .env from: ${envPath}`);
    console.error(`[Config] Current working directory: ${process.cwd()}`);
    console.error(`[Config] Project root: ${projectRoot}`);
  }
}

/**
 * 获取配置
 */
export function getConfig(): Config {
  // 获取缓存目录，如果是相对路径则转换为绝对路径
  const cacheDir = process.env.CACHE_DIR || '.cache';
  const absoluteCacheDir = cacheDir.startsWith('/') || cacheDir.match(/^[A-Za-z]:/)
    ? cacheDir  // 已经是绝对路径
    : join(projectRoot, cacheDir);  // 相对路径，转换为绝对路径

  return {
    llm: {
      provider: (process.env.DEFAULT_LLM_PROVIDER as 'openai' | 'anthropic') || 'openai',
      openai: {
        apiKey: process.env.OPENAI_API_KEY || '',
        model: process.env.OPENAI_MODEL || 'gpt-4-turbo-preview',
        baseURL: process.env.OPENAI_BASE_URL,
      },
      anthropic: {
        apiKey: process.env.ANTHROPIC_API_KEY || '',
        model: process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-20241022',
      },
    },
    puppeteer: {
      headless: process.env.PUPPETEER_HEADLESS === 'true',
      timeout: parseInt(process.env.PUPPETEER_TIMEOUT || '30000', 10),
    },
    mcp: {
      name: process.env.MCP_SERVER_NAME || 'jshook-reverse-tool',
      version: process.env.MCP_SERVER_VERSION || '0.1.0',
    },
    cache: {
      enabled: process.env.ENABLE_CACHE === 'true',
      dir: absoluteCacheDir,  // 使用绝对路径
      ttl: parseInt(process.env.CACHE_TTL || '3600', 10),
    },
    performance: {
      maxConcurrentAnalysis: parseInt(process.env.MAX_CONCURRENT_ANALYSIS || '3', 10),
      maxCodeSizeMB: parseInt(process.env.MAX_CODE_SIZE_MB || '10', 10),
    },
  };
}

/**
 * 验证配置
 */
export function validateConfig(config: Config): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // 验证LLM配置
  if (config.llm.provider === 'openai') {
    if (!config.llm.openai?.apiKey) {
      errors.push('OpenAI API key is required when using OpenAI provider');
    }
  } else if (config.llm.provider === 'anthropic') {
    if (!config.llm.anthropic?.apiKey) {
      errors.push('Anthropic API key is required when using Anthropic provider');
    }
  }

  // 验证性能配置
  if (config.performance.maxConcurrentAnalysis < 1) {
    errors.push('maxConcurrentAnalysis must be at least 1');
  }

  if (config.performance.maxCodeSizeMB < 1) {
    errors.push('maxCodeSizeMB must be at least 1');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

