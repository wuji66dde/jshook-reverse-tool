/**
 * JSVMP专用符号执行器
 * 专门用于分析JavaScript虚拟机保护的代码
 * 
 * 功能：
 * 1. 识别VM指令集
 * 2. 符号执行VM指令
 * 3. 推断原始代码逻辑
 * 4. 生成约束条件
 */
import { SymbolicExecutor, SymbolicValue, SymbolicState, Constraint } from './SymbolicExecutor.js';
import { logger } from '../../utils/logger.js';
import type { VMType } from '../../types/index.js';

// ==================== JSVMP指令类型 ====================

/**
 * JSVMP操作码
 */
export enum JSVMPOpcode {
  // 栈操作
  PUSH = 0x01,      // 压栈
  POP = 0x02,       // 出栈
  DUP = 0x03,       // 复制栈顶

  // 算术运算
  ADD = 0x10,       // 加法
  SUB = 0x11,       // 减法
  MUL = 0x12,       // 乘法
  DIV = 0x13,       // 除法
  MOD = 0x14,       // 取模

  // 逻辑运算
  AND = 0x20,       // 与
  OR = 0x21,        // 或
  NOT = 0x22,       // 非
  XOR = 0x23,       // 异或

  // 比较运算
  EQ = 0x30,        // 等于
  NE = 0x31,        // 不等于
  LT = 0x32,        // 小于
  LE = 0x33,        // 小于等于
  GT = 0x34,        // 大于
  GE = 0x35,        // 大于等于

  // 控制流
  JMP = 0x40,       // 无条件跳转
  JZ = 0x41,        // 零跳转
  JNZ = 0x42,       // 非零跳转
  CALL = 0x43,      // 函数调用
  RET = 0x44,       // 返回

  // 内存操作
  LOAD = 0x50,      // 加载变量
  STORE = 0x51,     // 存储变量
  LOAD_CONST = 0x52, // 加载常量

  // 其他
  NOP = 0x00,       // 空操作
  HALT = 0xFF,      // 停机
}

/**
 * JSVMP指令
 */
export interface JSVMPInstruction {
  opcode: JSVMPOpcode;
  operands: any[];
  location: number;
}

/**
 * JSVMP符号执行选项
 */
export interface JSVMPSymbolicExecutorOptions {
  instructions: JSVMPInstruction[];  // VM指令序列
  vmType?: VMType;                   // VM类型
  maxSteps?: number;                 // 最大执行步数
  timeout?: number;                  // 超时时间
}

/**
 * JSVMP符号执行结果
 */
export interface JSVMPSymbolicExecutorResult {
  finalState: SymbolicState;         // 最终状态
  executionTrace: SymbolicState[];   // 执行轨迹
  inferredLogic: string;             // 推断的原始逻辑
  constraints: Constraint[];         // 约束条件
  confidence: number;                // 置信度
  warnings: string[];                // 警告
}

// ==================== JSVMP符号执行器 ====================

export class JSVMPSymbolicExecutor extends SymbolicExecutor {
  /**
   * 执行JSVMP符号执行
   */
  async executeJSVMP(options: JSVMPSymbolicExecutorOptions): Promise<JSVMPSymbolicExecutorResult> {
    const startTime = Date.now();
    const {
      instructions,
      vmType = 'custom',
      maxSteps = 1000,
      timeout = 30000,
    } = options;

    logger.info('🔬 开始JSVMP符号执行...');
    logger.info(`📋 指令数量: ${instructions.length}`);
    logger.info(`🏷️ VM类型: ${vmType}`);

    const warnings: string[] = [];
    const executionTrace: SymbolicState[] = [];

    try {
      // 1. 初始化VM状态
      let state: SymbolicState = {
        pc: 0,
        stack: [],
        registers: new Map(),
        memory: new Map(),
        pathConstraints: [],
      };

      // 2. 执行指令
      let steps = 0;
      while (state.pc < instructions.length && steps < maxSteps) {
        // 检查超时
        if (Date.now() - startTime > timeout) {
          warnings.push('JSVMP符号执行超时');
          break;
        }

        // 获取当前指令
        const instruction = instructions[state.pc];
        if (!instruction) {
          warnings.push(`指令不存在: PC=${state.pc}`);
          break;
        }

        // 记录状态
        executionTrace.push(this.cloneStateInternal(state));

        // 执行指令
        state = this.executeInstruction(state, instruction);

        // 检查停机
        if (instruction.opcode === JSVMPOpcode.HALT) {
          break;
        }

        steps++;
      }
      // 3. 推断原始逻辑
      const inferredLogic = this.inferLogic(executionTrace, instructions);
      // 4. 收集约束
      const constraints = this.collectAllConstraints(executionTrace);
      // 5. 计算置信度
      const confidence = this.calculateConfidence(executionTrace, instructions);
      const executionTime = Date.now() - startTime;
      logger.info(`✅ JSVMP符号执行完成，耗时 ${executionTime}ms`);
      logger.info(`📊 执行步数: ${steps}`);
      logger.info(`📈 置信度: ${(confidence * 100).toFixed(1)}%`);

      return {
        finalState: state,
        executionTrace,
        inferredLogic,
        constraints,
        confidence,
        warnings,
      };
    } catch (error) {
      logger.error('JSVMP符号执行失败', error);
      throw error;
    }
  }

  /**
   * 执行单条VM指令
   */
  private executeInstruction(state: SymbolicState, instruction: JSVMPInstruction): SymbolicState {
    const newState = this.cloneStateInternal(state);

    switch (instruction.opcode) {
      case JSVMPOpcode.PUSH:
        this.executePush(newState, instruction.operands[0]);
        break;

      case JSVMPOpcode.POP:
        this.executePop(newState);
        break;

      case JSVMPOpcode.ADD:
        this.executeAdd(newState);
        break;

      case JSVMPOpcode.SUB:
        this.executeSub(newState);
        break;

      case JSVMPOpcode.MUL:
        this.executeMul(newState);
        break;

      case JSVMPOpcode.LOAD:
        this.executeLoad(newState, instruction.operands[0]);
        break;

      case JSVMPOpcode.STORE:
        this.executeStore(newState, instruction.operands[0]);
        break;

      case JSVMPOpcode.JMP:
        newState.pc = instruction.operands[0];
        return newState;

      case JSVMPOpcode.JZ:
        this.executeJZ(newState, instruction.operands[0]);
        return newState;

      case JSVMPOpcode.CALL:
        this.executeCall(newState, instruction.operands[0]);
        break;

      default:
        logger.warn(`未知操作码: 0x${instruction.opcode.toString(16)}`);
    }

    newState.pc++;
    return newState;
  }

  /**
   * PUSH指令：压栈
   */
  private executePush(state: SymbolicState, value: any): void {
    const symbolicValue = this.createSymbolicValue('unknown', `const_${value}`, String(value));
    symbolicValue.possibleValues = [value];
    state.stack.push(symbolicValue);
  }

  /**
   * POP指令：出栈
   */
  private executePop(state: SymbolicState): SymbolicValue | undefined {
    return state.stack.pop();
  }

  /**
   * ADD指令：加法
   */
  private executeAdd(state: SymbolicState): void {
    const b = state.stack.pop();
    const a = state.stack.pop();

    if (a && b) {
      const result = this.createSymbolicValue('number', `${a.name} + ${b.name}`);
      this.addConstraint(result, 'custom', `${result.name} = ${a.name} + ${b.name}`, '加法运算');
      state.stack.push(result);
    }
  }

  /**
   * SUB指令：减法
   */
  private executeSub(state: SymbolicState): void {
    const b = state.stack.pop();
    const a = state.stack.pop();

    if (a && b) {
      const result = this.createSymbolicValue('number', `${a.name} - ${b.name}`);
      this.addConstraint(result, 'custom', `${result.name} = ${a.name} - ${b.name}`, '减法运算');
      state.stack.push(result);
    }
  }

  /**
   * MUL指令：乘法
   */
  private executeMul(state: SymbolicState): void {
    const b = state.stack.pop();
    const a = state.stack.pop();

    if (a && b) {
      const result = this.createSymbolicValue('number', `${a.name} * ${b.name}`);
      this.addConstraint(result, 'custom', `${result.name} = ${a.name} * ${b.name}`, '乘法运算');
      state.stack.push(result);
    }
  }

  /**
   * LOAD指令：加载变量
   */
  private executeLoad(state: SymbolicState, varName: string): void {
    const value = state.memory.get(varName);
    if (value) {
      state.stack.push(value);
    } else {
      const symbolicValue = this.createSymbolicValue('unknown', varName, varName);
      state.stack.push(symbolicValue);
    }
  }

  /**
   * STORE指令：存储变量
   */
  private executeStore(state: SymbolicState, varName: string): void {
    const value = state.stack.pop();
    if (value) {
      state.memory.set(varName, value);
    }
  }

  /**
   * JZ指令：零跳转
   */
  private executeJZ(state: SymbolicState, target: number): void {
    const condition = state.stack.pop();
    if (condition) {
      // 添加路径约束
      const constraint: Constraint = {
        type: 'equality',
        expression: `${condition.name} == 0`,
        description: '零跳转条件',
      };
      state.pathConstraints.push(constraint);

      // 简化：总是跳转
      state.pc = target;
    }
  }

  /**
   * CALL指令：函数调用
   */
  private executeCall(_state: SymbolicState, funcName: string): void {
    logger.info(`📞 调用函数: ${funcName}`);
    // 简化实现：不处理函数调用
  }

  /**
   * 推断原始逻辑
   */
  private inferLogic(trace: SymbolicState[], instructions: JSVMPInstruction[]): string {
    const lines: string[] = [];

    for (let i = 0; i < Math.min(trace.length, 10); i++) {
      const state = trace[i];
      if (!state) continue;

      const instruction = instructions[state.pc];

      if (instruction) {
        lines.push(`// Step ${i}: ${JSVMPOpcode[instruction.opcode] || 'UNKNOWN'}`);
      }
    }

    return lines.join('\n') || '// 无法推断原始逻辑';
  }

  /**
   * 收集所有约束
   */
  private collectAllConstraints(trace: SymbolicState[]): Constraint[] {
    const constraints: Constraint[] = [];

    for (const state of trace) {
      constraints.push(...state.pathConstraints);

      for (const value of state.stack) {
        constraints.push(...value.constraints);
      }
    }

    return constraints;
  }

  /**
   * 计算置信度
   */
  private calculateConfidence(trace: SymbolicState[], instructions: JSVMPInstruction[]): number {
    // 基于执行覆盖率计算置信度
    const coverage = trace.length / instructions.length;
    return Math.min(coverage, 1.0);
  }

  /**
   * 克隆状态（内部方法）
   */
  private cloneStateInternal(state: SymbolicState): SymbolicState {
    return {
      pc: state.pc,
      stack: [...state.stack],
      registers: new Map(state.registers),
      memory: new Map(state.memory),
      pathConstraints: [...state.pathConstraints],
    };
  }
}

