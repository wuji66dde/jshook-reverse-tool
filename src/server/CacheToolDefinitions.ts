/**
 * 缓存管理 MCP 工具定义
 */

import type { Tool } from '@modelcontextprotocol/sdk/types.js';

export const cacheTools: Tool[] = [
  {
    name: 'get_cache_stats',
    description: `获取全局缓存统计信息

**功能**:
- 查看所有缓存的使用情况
- 获取缓存命中率
- 查看缓存大小和条目数
- 获取优化建议

**返回信息**:
- totalEntries: 总缓存条目数
- totalSize: 总缓存大小（字节）
- totalSizeMB: 总缓存大小（MB）
- hitRate: 全局缓存命中率
- caches: 各个缓存的详细统计
  - name: 缓存名称
  - entries: 条目数
  - size: 大小（字节）
  - sizeMB: 大小（MB）
  - hitRate: 命中率
  - ttl: 过期时间（毫秒）
- recommendations: 优化建议

**使用场景**:
- 定期检查缓存健康状况
- 执行大操作前检查缓存空间
- 性能优化时分析缓存效率

**示例**:
\`\`\`typescript
get_cache_stats()
// 返回：
{
  "totalEntries": 150,
  "totalSize": 52428800,
  "totalSizeMB": "50.00",
  "hitRate": 0.75,
  "caches": [
    {
      "name": "DetailedDataManager",
      "entries": 50,
      "size": 2621440,
      "sizeMB": "2.50",
      "hitRate": 0.8,
      "ttl": 600000
    },
    {
      "name": "CodeCache",
      "entries": 80,
      "size": 41943040,
      "sizeMB": "40.00",
      "hitRate": 0.7
    },
    {
      "name": "CodeCompressor",
      "entries": 20,
      "size": 7864320,
      "sizeMB": "7.50",
      "hitRate": 0.75
    }
  ],
  "recommendations": [
    "✅ Cache health is good. No action needed."
  ]
}
\`\`\``,
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },

  {
    name: 'smart_cache_cleanup',
    description: `智能缓存清理

**功能**:
- 自动清理过期数据
- 清理低命中率缓存
- 清理大体积缓存
- 达到目标大小后停止

**清理策略**（按优先级）:
1. 清理过期数据
2. 清理低命中率缓存（命中率 < 平均值 * 30%）
3. 清理大体积缓存（最大的 2 个）

**参数**:
- targetSize: 目标大小（字节，可选）
  - 默认：全局最大大小的 70%（350MB）
  - 建议：当缓存使用率 > 70% 时调用

**返回信息**:
- before: 清理前大小（字节）
- after: 清理后大小（字节）
- freed: 释放的大小（字节）
- freedPercentage: 释放的百分比

**使用场景**:
- 缓存使用率 > 70% 时
- Token 使用率 > 80% 时
- 执行大操作前释放空间

**示例**:
\`\`\`typescript
smart_cache_cleanup()
// 返回：
{
  "before": 419430400,
  "after": 314572800,
  "freed": 104857600,
  "freedPercentage": 21
}
\`\`\``,
    inputSchema: {
      type: 'object',
      properties: {
        targetSize: {
          type: 'number',
          description: '目标大小（字节，可选）',
        },
      },
    },
  },

  {
    name: 'clear_all_caches',
    description: `清除所有缓存

**功能**:
- 清除所有缓存数据
- 释放所有内存
- 重置所有统计

**警告**:
⚠️  此操作不可逆！会清除所有缓存数据，包括：
- DetailedDataManager（大数据缓存）
- CodeCache（代码缓存）
- CodeCompressor（压缩缓存）

**使用场景**:
- 切换到新网站时
- 开始新的逆向任务时
- 缓存数据损坏时
- 需要完全重置时

**建议**:
- 优先使用 smart_cache_cleanup 而非此工具
- 只在必要时使用此工具

**示例**:
\`\`\`typescript
clear_all_caches()
// 返回：
{
  "success": true,
  "message": "All caches cleared"
}
\`\`\``,
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
];

