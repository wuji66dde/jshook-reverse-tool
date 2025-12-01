#!/usr/bin/env node

/**
 * JSHook Reverse Tool - MCP服务器入口
 */

import { MCPServer } from './server/MCPServer.js';
import { getConfig, validateConfig } from './utils/config.js';
import { logger } from './utils/logger.js';

// 定义错误类型接口
interface AppError extends Error {
  code?: string;
  message: string;
  name: string;
  stack?: string;
}

async function main() {
  try {
    // 加载配置
    const config = getConfig();
    logger.debug('Configuration loaded:', config);

    // 验证配置
    const validation = validateConfig(config);
    if (!validation.valid) {
      logger.error('Configuration validation failed:');
      validation.errors.forEach((error) => logger.error(`  - ${error}`));
      process.exit(1);
    }

    // 创建并启动MCP服务器
    logger.info('Creating MCP server instance...');
    const server = new MCPServer(config);

    // 处理进程信号
    process.on('SIGINT', async () => {
      logger.info('Received SIGINT, shutting down...');
      await server.close();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      logger.info('Received SIGTERM, shutting down...');
      await server.close();
      process.exit(0);
    });

    // 处理未捕获的异常
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught exception:', error);
      process.exit(1);
    });

    process.on('unhandledRejection', (reason) => {
      logger.error('Unhandled rejection:', reason);
      process.exit(1);
    });

    // 启动服务器
    logger.info('Starting MCP server...');
    await server.start();
    logger.info('MCP server started successfully');

    // 保持进程运行
    logger.info('MCP server is running. Press Ctrl+C to stop.');
  } catch (error) {
    logger.error('Failed to start MCP server:');
    
    // 类型安全的错误处理
    const appError = error as AppError;
    
    logger.error('Error name:', appError.name);
    logger.error('Error message:', appError.message);
    logger.error('Error stack:', appError.stack);
    logger.error('Full error object:', JSON.stringify(error, null, 2));
    
    // 检查特定类型的错误
    if (appError.code === 'EADDRINUSE') {
      logger.error('Port is already in use. Please check if another instance is running.');
    }
    if (appError.message?.includes('credentials')) {
      logger.error('Authentication failed. Please check your API keys or credentials.');
    }
    
    process.exit(1);
  }
}

main();