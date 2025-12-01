/**
 * 调试器工具定义（P1 - 12个工具）
 * 
 * 工具分类：
 * 1. 调试器控制（7个）: enable, disable, pause, resume, step_into, step_over, step_out
 * 2. 断点管理（3个）: breakpoint_set, breakpoint_remove, breakpoint_list
 * 3. 运行时检查（2个）: get_call_stack, get_scope_variables
 */

import type { Tool } from '@modelcontextprotocol/sdk/types.js';

export const debuggerTools: Tool[] = [
  // ==================== 调试器控制（7个） ====================
  
  {
    name: 'debugger_enable',
    description: 'Enable the debugger (must be called before setting breakpoints)',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  
  {
    name: 'debugger_disable',
    description: 'Disable the debugger and clear all breakpoints',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  
  {
    name: 'debugger_pause',
    description: 'Pause execution at the next statement',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  
  {
    name: 'debugger_resume',
    description: 'Resume execution (continue)',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  
  {
    name: 'debugger_step_into',
    description: 'Step into the next function call',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  
  {
    name: 'debugger_step_over',
    description: 'Step over the next function call',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  
  {
    name: 'debugger_step_out',
    description: 'Step out of the current function',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },

  // ==================== 断点管理（3个） ====================
  
  {
    name: 'breakpoint_set',
    description: 'Set a breakpoint at a specific location. Supports URL-based and scriptId-based breakpoints with optional conditions.',
    inputSchema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'URL of the script (e.g., "app.js", "https://example.com/script.js")',
        },
        scriptId: {
          type: 'string',
          description: 'Script ID (alternative to URL, get from get_all_scripts)',
        },
        lineNumber: {
          type: 'number',
          description: 'Line number (0-based)',
        },
        columnNumber: {
          type: 'number',
          description: 'Column number (0-based, optional)',
        },
        condition: {
          type: 'string',
          description: 'Conditional breakpoint expression (e.g., "x > 100")',
        },
      },
      required: ['lineNumber'],
    },
  },
  
  {
    name: 'breakpoint_remove',
    description: 'Remove a breakpoint by its ID',
    inputSchema: {
      type: 'object',
      properties: {
        breakpointId: {
          type: 'string',
          description: 'Breakpoint ID (from breakpoint_set or breakpoint_list)',
        },
      },
      required: ['breakpointId'],
    },
  },
  
  {
    name: 'breakpoint_list',
    description: 'List all active breakpoints',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },

  // ==================== 运行时检查（2个） ====================
  
  {
    name: 'get_call_stack',
    description: 'Get the current call stack (only available when paused at a breakpoint)',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  // ==================== 🆕 高级调试功能（额外增强） ====================
  
  {
    name: 'debugger_evaluate',
    description: 'Evaluate an expression in the context of the current call frame (only when paused)',
    inputSchema: {
      type: 'object',
      properties: {
        expression: {
          type: 'string',
          description: 'JavaScript expression to evaluate (e.g., "x + y", "user.name")',
        },
        callFrameId: {
          type: 'string',
          description: 'Call frame ID (optional - defaults to top frame)',
        },
      },
      required: ['expression'],
    },
  },
  
  {
    name: 'debugger_evaluate_global',
    description: 'Evaluate an expression in the global context (does not require paused state)',
    inputSchema: {
      type: 'object',
      properties: {
        expression: {
          type: 'string',
          description: 'JavaScript expression to evaluate',
        },
      },
      required: ['expression'],
    },
  },
  
  {
    name: 'debugger_wait_for_paused',
    description: 'Wait for the debugger to pause (useful after setting breakpoints and triggering code)',
    inputSchema: {
      type: 'object',
      properties: {
        timeout: {
          type: 'number',
          description: 'Timeout in milliseconds (default: 30000)',
          default: 30000,
        },
      },
    },
  },
  
  {
    name: 'debugger_get_paused_state',
    description: 'Get the current paused state (check if debugger is paused and why)',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  
  {
    name: 'breakpoint_set_on_exception',
    description: 'Pause on exceptions (all exceptions or only uncaught)',
    inputSchema: {
      type: 'object',
      properties: {
        state: {
          type: 'string',
          description: 'Exception pause state',
          enum: ['none', 'uncaught', 'all'],
          default: 'none',
        },
      },
      required: ['state'],
    },
  },
  
  {
    name: 'get_object_properties',
    description: 'Get all properties of an object (when paused, use objectId from variables)',
    inputSchema: {
      type: 'object',
      properties: {
        objectId: {
          type: 'string',
          description: 'Object ID (from get_scope_variables)',
        },
      },
      required: ['objectId'],
    },
  },

  // ==================== ✨ 增强功能工具（5个） ====================

  {
    name: 'get_scope_variables_enhanced',
    description: `获取作用域变量（增强版 - 支持错误处理和对象展开）

✨ 增强功能：
1. 自动跳过无法访问的作用域（避免 "Could not find object" 错误）
2. 支持展开对象属性（可选）
3. 返回详细的错误信息和成功率
4. 提供调用帧信息

使用场景：
- 在断点处查看所有变量
- 调试复杂的作用域链
- 分析闭包变量

示例：
get_scope_variables_enhanced()  // 获取顶层帧的所有变量
get_scope_variables_enhanced(callFrameId="xxx", includeObjectProperties=true)  // 展开对象`,
    inputSchema: {
      type: 'object',
      properties: {
        callFrameId: {
          type: 'string',
          description: '调用帧 ID（可选，不指定则使用顶层帧）',
        },
        includeObjectProperties: {
          type: 'boolean',
          description: '是否展开对象属性（默认 false）',
          default: false,
        },
        maxDepth: {
          type: 'number',
          description: '对象属性展开的最大深度（默认 1）',
          default: 1,
        },
        skipErrors: {
          type: 'boolean',
          description: '是否跳过错误的作用域（默认 true）',
          default: true,
        },
      },
    },
  },

  {
    name: 'debugger_save_session',
    description: `保存当前调试会话到文件

保存内容：
- 所有断点（位置、条件）
- 异常断点设置
- 会话元数据

用途：
- 保存调试配置以便后续使用
- 分享调试设置给团队成员
- 备份复杂的断点配置

示例：
debugger_save_session()  // 自动保存到 ./debugger-sessions/session-{timestamp}.json
debugger_save_session(filePath="my-debug-session.json", metadata={description: "Login flow debugging"})`,
    inputSchema: {
      type: 'object',
      properties: {
        filePath: {
          type: 'string',
          description: '保存路径（可选，默认保存到 ./debugger-sessions/）',
        },
        metadata: {
          type: 'object',
          description: '会话元数据（可选，如 description、tags 等）',
        },
      },
    },
  },

  {
    name: 'debugger_load_session',
    description: `加载调试会话

支持两种方式：
1. 从文件加载：提供 filePath
2. 从 JSON 加载：提供 sessionData

加载后会：
- 清除现有断点
- 恢复保存的断点
- 恢复异常断点设置

示例：
debugger_load_session(filePath="my-debug-session.json")
debugger_load_session(sessionData="{...}")`,
    inputSchema: {
      type: 'object',
      properties: {
        filePath: {
          type: 'string',
          description: '会话文件路径',
        },
        sessionData: {
          type: 'string',
          description: '会话 JSON 数据（字符串）',
        },
      },
    },
  },

  {
    name: 'debugger_export_session',
    description: `导出当前调试会话为 JSON 对象

返回包含所有断点和设置的 JSON 对象，可用于：
- 查看当前调试配置
- 复制到其他地方
- 手动编辑后重新导入

示例：
debugger_export_session()
debugger_export_session(metadata={description: "API debugging session"})`,
    inputSchema: {
      type: 'object',
      properties: {
        metadata: {
          type: 'object',
          description: '会话元数据（可选）',
        },
      },
    },
  },

  {
    name: 'debugger_list_sessions',
    description: `列出所有已保存的调试会话

返回 ./debugger-sessions/ 目录下的所有会话文件，包括：
- 文件路径
- 创建时间
- 元数据

用于：
- 查看可用的调试会话
- 选择要加载的会话

示例：
debugger_list_sessions()`,
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  // ==================== 🆕 高级调试功能（15个新工具） ====================

  // Watch Expressions（5个工具）
  {
    name: 'watch_add',
    description: `🆕 Add a watch expression to monitor variable values

Usage:
- Monitor key variables during debugging
- Automatically evaluate on each pause
- Track value changes over time

Example:
watch_add(expression="window.byted_acrawler", name="acrawler对象")`,
    inputSchema: {
      type: 'object',
      properties: {
        expression: {
          type: 'string',
          description: 'JavaScript expression to watch (e.g., "window.obj", "arguments[0]")',
        },
        name: {
          type: 'string',
          description: 'Optional friendly name for the watch expression',
        },
      },
      required: ['expression'],
    },
  },

  {
    name: 'watch_remove',
    description: 'Remove a watch expression by ID',
    inputSchema: {
      type: 'object',
      properties: {
        watchId: {
          type: 'string',
          description: 'Watch expression ID (from watch_add or watch_list)',
        },
      },
      required: ['watchId'],
    },
  },

  {
    name: 'watch_list',
    description: 'List all watch expressions',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },

  {
    name: 'watch_evaluate_all',
    description: `Evaluate all enabled watch expressions

Returns:
- Current values of all watch expressions
- Value change indicators
- Error information if evaluation fails

Best used when paused at a breakpoint.`,
    inputSchema: {
      type: 'object',
      properties: {
        callFrameId: {
          type: 'string',
          description: 'Optional call frame ID (from get_call_stack)',
        },
      },
    },
  },

  {
    name: 'watch_clear_all',
    description: 'Clear all watch expressions',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },

  // XHR/Fetch Breakpoints（3个工具）
  {
    name: 'xhr_breakpoint_set',
    description: `🆕 Set XHR/Fetch breakpoint (pause before network requests)

Usage:
- Intercept API calls
- Debug request parameter generation
- Trace network request logic

Supports wildcard patterns:
- "*api*" - matches any URL containing "api"
- "*/aweme/v1/*" - matches specific API path
- "*" - matches all requests

Example:
xhr_breakpoint_set(urlPattern="*aweme/v1/*")`,
    inputSchema: {
      type: 'object',
      properties: {
        urlPattern: {
          type: 'string',
          description: 'URL pattern (supports wildcards *)',
        },
      },
      required: ['urlPattern'],
    },
  },

  {
    name: 'xhr_breakpoint_remove',
    description: 'Remove XHR breakpoint by ID',
    inputSchema: {
      type: 'object',
      properties: {
        breakpointId: {
          type: 'string',
          description: 'XHR breakpoint ID',
        },
      },
      required: ['breakpointId'],
    },
  },

  {
    name: 'xhr_breakpoint_list',
    description: 'List all XHR breakpoints',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },

  // Event Listener Breakpoints（4个工具）
  {
    name: 'event_breakpoint_set',
    description: `🆕 Set event listener breakpoint (pause on event)

Common event names:
- Mouse: click, dblclick, mousedown, mouseup, mousemove
- Keyboard: keydown, keyup, keypress
- Timer: setTimeout, setInterval, requestAnimationFrame
- WebSocket: message, open, close, error

Example:
event_breakpoint_set(eventName="click")
event_breakpoint_set(eventName="setTimeout")`,
    inputSchema: {
      type: 'object',
      properties: {
        eventName: {
          type: 'string',
          description: 'Event name (e.g., "click", "setTimeout")',
        },
        targetName: {
          type: 'string',
          description: 'Optional target name (e.g., "WebSocket")',
        },
      },
      required: ['eventName'],
    },
  },

  {
    name: 'event_breakpoint_set_category',
    description: `Set breakpoints for entire event category

Categories:
- mouse: All mouse events (click, mousedown, etc.)
- keyboard: All keyboard events (keydown, keyup, etc.)
- timer: All timer events (setTimeout, setInterval, etc.)
- websocket: All WebSocket events (message, open, etc.)

Example:
event_breakpoint_set_category(category="mouse")`,
    inputSchema: {
      type: 'object',
      properties: {
        category: {
          type: 'string',
          enum: ['mouse', 'keyboard', 'timer', 'websocket'],
          description: 'Event category',
        },
      },
      required: ['category'],
    },
  },

  {
    name: 'event_breakpoint_remove',
    description: 'Remove event breakpoint by ID',
    inputSchema: {
      type: 'object',
      properties: {
        breakpointId: {
          type: 'string',
          description: 'Event breakpoint ID',
        },
      },
      required: ['breakpointId'],
    },
  },

  {
    name: 'event_breakpoint_list',
    description: 'List all event breakpoints',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },

  // Blackboxing（3个工具）
  {
    name: 'blackbox_add',
    description: `🆕 Blackbox scripts (skip during debugging)

Usage:
- Skip third-party library code
- Focus on business logic
- Improve debugging efficiency

Common patterns:
- "*jquery*.js" - jQuery
- "*react*.js" - React
- "*node_modules/*" - All npm packages
- "*webpack*" - Webpack bundles

Example:
blackbox_add(urlPattern="*node_modules/*")`,
    inputSchema: {
      type: 'object',
      properties: {
        urlPattern: {
          type: 'string',
          description: 'URL pattern to blackbox (supports wildcards *)',
        },
      },
      required: ['urlPattern'],
    },
  },

  {
    name: 'blackbox_add_common',
    description: `Blackbox all common libraries (one-click)

Includes:
- jquery, react, vue, angular
- lodash, underscore, moment
- webpack, node_modules, vendor bundles

Example:
blackbox_add_common()`,
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },

  {
    name: 'blackbox_list',
    description: 'List all blackboxed patterns',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
];

