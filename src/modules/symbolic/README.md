# 符号执行引擎模块

## 📖 概述

符号执行引擎是JSHook逆向工具的高级分析模块，专门用于分析JavaScript虚拟机保护（JSVMP）代码，通过符号执行技术推断原始代码逻辑。

## 🎯 核心功能

### 1. SymbolicExecutor（通用符号执行器）

**功能**：
- 符号值表示和管理
- 路径约束收集
- 约束求解（简化SMT求解器）
- 路径探索（深度优先搜索）
- 覆盖率计算

**使用示例**：
```typescript
import { SymbolicExecutor } from './SymbolicExecutor.js';

const executor = new SymbolicExecutor();

const result = await executor.execute({
  code: `
    function test(x) {
      if (x > 10) {
        return x + 5;
      } else {
        return x - 5;
      }
    }
  `,
  maxPaths: 100,
  maxDepth: 50,
  timeout: 30000,
  enableConstraintSolving: true,
});

console.log(`生成路径: ${result.paths.length}`);
console.log(`覆盖率: ${(result.coverage * 100).toFixed(1)}%`);
console.log(`可行路径: ${result.stats.feasiblePaths}`);
```

**核心特性**：
- ✅ AST节点类型识别（变量声明、条件分支、循环、赋值）
- ✅ 符号状态管理（PC、栈、寄存器、内存）
- ✅ 路径约束生成
- ✅ 约束一致性检查
- ✅ 路径可行性分析
- ✅ 覆盖率统计

### 2. JSVMPSymbolicExecutor（JSVMP专用符号执行器）

**功能**：
- JSVMP指令集识别
- VM指令符号执行
- 原始逻辑推断
- 控制流分析

**支持的JSVMP操作码**：
```typescript
// 栈操作
PUSH = 0x01    // 压栈
POP = 0x02     // 出栈
DUP = 0x03     // 复制栈顶

// 算术运算
ADD = 0x10     // 加法
SUB = 0x11     // 减法
MUL = 0x12     // 乘法
DIV = 0x13     // 除法
MOD = 0x14     // 取模

// 逻辑运算
AND = 0x20     // 与
OR = 0x21      // 或
NOT = 0x22     // 非
XOR = 0x23     // 异或

// 比较运算
EQ = 0x30      // 等于
NE = 0x31      // 不等于
LT = 0x32      // 小于
LE = 0x33      // 小于等于
GT = 0x34      // 大于
GE = 0x35      // 大于等于

// 控制流
JMP = 0x40     // 无条件跳转
JZ = 0x41      // 零跳转
JNZ = 0x42     // 非零跳转
CALL = 0x43    // 函数调用
RET = 0x44     // 返回

// 内存操作
LOAD = 0x50    // 加载变量
STORE = 0x51   // 存储变量
LOAD_CONST = 0x52  // 加载常量
```

**使用示例**：
```typescript
import { JSVMPSymbolicExecutor, JSVMPOpcode } from './JSVMPSymbolicExecutor.js';

const executor = new JSVMPSymbolicExecutor();

// 定义VM指令序列
const instructions = [
  { opcode: JSVMPOpcode.PUSH, operands: [10], location: 0 },
  { opcode: JSVMPOpcode.PUSH, operands: [5], location: 1 },
  { opcode: JSVMPOpcode.ADD, operands: [], location: 2 },
  { opcode: JSVMPOpcode.HALT, operands: [], location: 3 },
];

const result = await executor.executeJSVMP({
  instructions,
  vmType: 'custom',
  maxSteps: 1000,
  timeout: 30000,
});

console.log('推断的原始逻辑:');
console.log(result.inferredLogic);
console.log(`置信度: ${(result.confidence * 100).toFixed(1)}%`);
```

## 🔬 技术原理

### 符号执行流程

```
1. 代码解析
   ↓
2. 初始化符号状态
   ↓
3. 路径探索（DFS）
   ├─ 执行一步
   ├─ 生成符号值
   ├─ 收集路径约束
   └─ 检查分支条件
   ↓
4. 约束求解
   ├─ 检查约束一致性
   └─ 标记路径可行性
   ↓
5. 生成分析结果
   ├─ 执行路径
   ├─ 符号值
   ├─ 约束条件
   └─ 覆盖率统计
```

### JSVMP指令执行流程

```
1. 指令序列输入
   ↓
2. 初始化VM状态
   ├─ PC = 0
   ├─ Stack = []
   ├─ Registers = {}
   └─ Memory = {}
   ↓
3. 指令循环执行
   ├─ 获取当前指令
   ├─ 执行指令操作
   │  ├─ PUSH: 压栈
   │  ├─ ADD: 弹出两个值，相加，压栈
   │  ├─ LOAD: 从内存加载到栈
   │  └─ JZ: 条件跳转
   ├─ 更新PC
   └─ 记录执行轨迹
   ↓
4. 推断原始逻辑
   ├─ 分析执行轨迹
   ├─ 识别代码模式
   └─ 生成高级代码
```

## 📊 数据结构

### SymbolicValue（符号值）
```typescript
{
  id: "sym-0",
  type: "number",
  name: "x + 5",
  constraints: [
    {
      type: "range",
      expression: "x > 10",
      description: "条件分支约束"
    }
  ],
  possibleValues: [15, 20, 25],
  source: "x"
}
```

### SymbolicState（符号状态）
```typescript
{
  pc: 5,
  stack: [sym-0, sym-1],
  registers: Map { "r0" => sym-2 },
  memory: Map { "x" => sym-3 },
  pathConstraints: [
    { type: "custom", expression: "x > 10", description: "条件为真" }
  ]
}
```

### ExecutionPath（执行路径）
```typescript
{
  id: "path-0",
  states: [state0, state1, state2],
  constraints: [constraint1, constraint2],
  isFeasible: true,
  coverage: 0.75
}
```

## 🎓 实战案例

### 案例1：分析简单条件分支

**输入代码**：
```javascript
function check(x) {
  if (x > 10) {
    return "large";
  } else {
    return "small";
  }
}
```

**符号执行结果**：
- 路径1: x > 10 → return "large"
- 路径2: x <= 10 → return "small"
- 覆盖率: 100%

### 案例2：分析JSVMP加密算法

**VM指令**：
```
PUSH 0x41      // 'A'
PUSH 0x03      // 偏移量
ADD            // 'A' + 3 = 'D'
HALT
```

**推断逻辑**：
```javascript
// Caesar密码，偏移量为3
function encrypt(char) {
  return String.fromCharCode(char.charCodeAt(0) + 3);
}
```

## 🚀 性能优化

1. **路径剪枝**：
   - 最大路径数限制（默认100）
   - 最大深度限制（默认50）
   - 超时控制（默认30秒）

2. **约束简化**：
   - 早期矛盾检测
   - 约束去重
   - 简化SMT求解

3. **内存优化**：
   - 状态克隆优化
   - 符号值去重
   - 约束集合压缩

## 📝 注意事项

1. **符号执行的局限性**：
   - 路径爆炸问题（指数级增长）
   - 约束求解复杂度高
   - 无法处理所有动态特性

2. **JSVMP分析的挑战**：
   - 自定义VM指令集多样
   - 需要人工辅助识别指令
   - 复杂VM可能需要多次迭代

3. **最佳实践**：
   - 先用ObfuscationDetector检测VM类型
   - 结合LLMService进行辅助分析
   - 逐步增加maxPaths和maxDepth
   - 使用timeout避免无限循环

## 🔗 相关模块

- **JSVMPDeobfuscator**: JSVMP反混淆器
- **ObfuscationDetector**: 混淆检测器
- **LLMService**: AI辅助分析
- **CodeAnalyzer**: 代码分析器

## 📚 参考资料

- 符号执行基础理论
- Z3约束求解器
- JSVMP逆向工程实战
- 抖音bdms.js分析案例

