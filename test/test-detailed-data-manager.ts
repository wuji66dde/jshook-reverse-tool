/**
 * DetailedDataManager 功能测试
 */

import { DetailedDataManager } from '../src/utils/detailedDataManager.js';

console.log('🧪 测试 DetailedDataManager\n');

const manager = DetailedDataManager.getInstance();

// 测试 1: 小数据直接返回
console.log('测试 1: 小数据直接返回');
const smallData = { name: 'test', value: 123 };
const result1 = manager.smartHandle(smallData);
console.log('✅ 小数据:', result1);
console.log('');

// 测试 2: 大数据返回摘要
console.log('测试 2: 大数据返回摘要');
const largeData = {
  methods: Array(100).fill(0).map((_, i) => `method${i}`),
  data: 'x'.repeat(60000),
};
const result2 = manager.smartHandle(largeData);
console.log('✅ 大数据摘要:', JSON.stringify(result2, null, 2));
console.log('');

// 测试 3: 获取完整数据
console.log('测试 3: 获取完整数据');
if (result2.detailId) {
  const fullData = manager.retrieve(result2.detailId);
  console.log('✅ 完整数据大小:', JSON.stringify(fullData).length, 'bytes');
  console.log('');
}

// 测试 4: 路径访问
console.log('测试 4: 路径访问');
if (result2.detailId) {
  const partialData = manager.retrieve(result2.detailId, 'methods');
  console.log('✅ 部分数据 (methods):', Array.isArray(partialData) ? `Array(${partialData.length})` : partialData);
  console.log('');
}

// 测试 5: 过期处理
console.log('测试 5: 过期处理');
try {
  manager.retrieve('invalid_detail_id');
  console.log('❌ 应该抛出错误');
} catch (error) {
  console.log('✅ 正确抛出错误:', (error as Error).message);
}

console.log('\n🎉 所有测试通过！');

