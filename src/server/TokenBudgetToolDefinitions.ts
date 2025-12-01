/**
 * Token 预算管理工具定义
 * 
 * 提供 3 个工具：
 * 1. get_token_budget_stats - 获取 Token 使用统计
 * 2. manual_token_cleanup - 手动清理缓存
 * 3. reset_token_budget - 重置 Token 预算
 */

import { Tool } from '@modelcontextprotocol/sdk/types.js';

export const tokenBudgetTools: Tool[] = [
  {
    name: 'get_token_budget_stats',
    description: `获取 Token 预算统计信息

**功能**:
- 实时监控 Token 使用情况
- 查看工具调用历史
- 获取优化建议

⚠️  **重要说明**:
此工具只追踪**工具返回的数据大小**，不包括：
- 系统提示词（约 10K tokens）
- 用户历史对话
- AI 的思考过程
- MCP 协议开销

**实际 Token 使用可能比显示的高 20-30%**

**返回信息**:
- currentUsage: 当前 Token 使用量（仅工具数据）
- maxTokens: 最大 Token 限制 (200K)
- usagePercentage: 使用百分比（估算值）
- toolCallCount: 工具调用次数
- topTools: Token 使用最多的工具
- warnings: 已触发的预警级别
- recentCalls: 最近的工具调用
- suggestions: 优化建议

**使用场景**:
- 定期检查 Token 使用情况
- 在执行大数据操作前检查剩余空间
- 根据建议优化工具使用

**示例**:
\`\`\`
get_token_budget_stats()
→ 返回完整的 Token 使用统计
\`\`\``,
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },

  {
    name: 'manual_token_cleanup',
    description: `手动触发 Token 清理

**功能**:
- 清理 DetailedDataManager 缓存
- 清理旧的工具调用记录（保留最近 5 分钟）
- 重新计算 Token 使用量

**使用场景**:
- Token 使用率接近 90% 时
- 准备执行大数据操作前
- 想要释放内存时

**效果**:
- 通常可以释放 10-30% 的 Token
- 不影响当前浏览器会话
- 不影响调试器状态

**返回信息**:
- before: 清理前的使用情况
- after: 清理后的使用情况
- freed: 释放的 Token 数量和百分比

**示例**:
\`\`\`
manual_token_cleanup()
→ 清理缓存，释放 Token
\`\`\``,
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },

  {
    name: 'reset_token_budget',
    description: `重置 Token 预算（慎用）

**功能**:
- 重置 Token 计数器为 0
- 清空所有工具调用历史
- 清除所有预警标记

**警告**:
- ⚠️  这不会清理实际的上下文数据
- ⚠️  只是重置计数器，实际 Token 使用不变
- ⚠️  仅用于测试或新会话开始时

**使用场景**:
- 开始新的逆向任务时
- 测试 Token 追踪功能时
- 确认要开始全新会话时

**建议**:
- 通常不需要使用此工具
- 优先使用 manual_token_cleanup
- 如果需要完全重置，建议重启 MCP 服务器

**示例**:
\`\`\`
reset_token_budget()
→ 重置 Token 预算计数器
\`\`\``,
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
];

