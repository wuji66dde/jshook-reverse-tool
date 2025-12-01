# JSHook Reverse Tool

<div align="center">

** AI-Powered JavaScript Reverse Engineering Tool**

让 AI 助手成为你的浏览器逆向专家 | Let AI be your browser reverse engineering expert

[![npm version](https://img.shields.io/npm/v/jshook-reverse-tool.svg)](https://www.npmjs.com/package/jshook-reverse-tool)
[![npm downloads](https://img.shields.io/npm/dm/jshook-reverse-tool.svg)](https://www.npmjs.com/package/jshook-reverse-tool)
[![MCP Registry](https://img.shields.io/badge/MCP-Registry-blue)](https://registry.modelcontextprotocol.io/servers/io.github.wuji1.jshook-reverse-tool)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue)](https://www.typescriptlang.org/)
[![MCP](https://img.shields.io/badge/MCP-Protocol-orange)](https://modelcontextprotocol.io/)

[快速开始](#快速开始) • [核心功能](#核心功能) • [使用场景](#使用场景) • [文档](#文档)

</div>

---

## ⚡ 一键安装

### 从 npm 安装

```bash
# 使用 npx（无需安装）
npx jshook-reverse-tool

# 或全局安装
npm install -g jshook-reverse-tool
```

### 从 MCP Registry 安装（推荐）

本工具已发布到 [MCP 官方注册表](https://registry.modelcontextprotocol.io/servers/io.github.wuji1.jshook-reverse-tool)，支持 Claude Desktop 等 MCP 客户端直接发现和安装。

在支持 MCP Registry 的客户端中搜索 `jshook-reverse-tool` 即可找到并安装。

配置 Claude Desktop 后即可使用 80+ 专业逆向工具 → [查看配置教程](#快速开始)

---

## 什么是 JSHook？

JSHook 是一个基于 **MCP (Model Context Protocol)** 的 JavaScript 逆向工程工具，通过 **80+ 个专业工具**，让 Claude、ChatGPT 等 AI 助手能够自动化完成复杂的网页分析、调试和逆向任务。

### 为什么选择 JSHook？

- **AI 原生设计** - 专为 AI 助手优化，自然语言即可操作
- **反检测能力** - 集成 2024-2025 最新反爬虫技术
- **深度调试** - Chrome DevTools Protocol 完整集成
- **网络拦截** - 捕获所有 HTTP 请求/响应
- **智能 Hook** - AI 自动生成 Hook 代码
- **验证码识别** - AI 视觉识别各类验证码

---

## 核心功能

### 1. 浏览器自动化 (35 个工具)

完整的浏览器控制能力，从页面导航到 DOM 操作，从截图到设备模拟。

```javascript
// 示例：自动化登录流程
browser_launch()
stealth_inject()  // 注入反检测脚本
page_navigate(url="https://example.com/login")
page_type(selector="#username", text="user@example.com")
page_type(selector="#password", text="********")
page_click(selector="#loginBtn")
```

**亮点功能**:
- ✅ 2024-2025 最新反检测技术（隐藏 webdriver、Canvas指纹处理）
- ✅ AI 视觉验证码识别（滑块/图形/reCAPTCHA）
- ✅ 智能等待和自动重试
- ✅ 移动设备模拟

### 2. 专业调试器 (38 个工具)

基于 Chrome DevTools Protocol，提供 IDE 级别的调试能力。

```javascript
// 示例：调试加密算法
debugger_enable()

// 在所有加密API调用处暂停
xhr_breakpoint_set(urlPattern="*/api/sign*")
event_breakpoint_set(eventName="fetch")

// 监控关键变量
watch_add(expression="window.crypto_params", name="加密参数")

// 等待断点命中
debugger_wait_for_paused()
get_call_stack()  // 查看调用栈
watch_evaluate_all()  // 查看所有监控变量
```

**亮点功能**:
- ✅ 代码断点、条件断点、异常断点
- ✅ XHR/Fetch 断点（拦截网络请求）
- ✅ 事件断点（点击、定时器、WebSocket）
- ✅ Watch 表达式、调用栈分析
- ✅ Blackboxing（屏蔽第三方库）
- ✅ 调试会话保存/加载

### 3. 网络监控 (6 个工具)

捕获和分析所有 HTTP 流量，支持请求过滤和响应解析。

```javascript
// 示例：分析 API 请求
network_enable()
page_navigate(url="https://api.example.com")

// 过滤包含 "api" 的请求
network_get_requests(url="api", method="POST")

// 查看响应体
network_get_response_body(requestId="xxx")

// 统计分析
network_get_stats()
```

**亮点功能**:
- ✅ 捕获请求头、POST 数据、响应体
- ✅ 智能过滤（URL、方法、类型）
- ✅ 统计分析（请求数、失败率、耗时）

### 4. AI Hook 生成器 (7 个工具)

用自然语言描述需求，AI 自动生成专业的 Hook 代码。

```javascript
// 示例：Hook Fetch API
ai_hook_generate({
  description: "监控所有 API 请求，记录 URL 和参数",
  target: { type: "api", name: "fetch" },
  behavior: {
    captureArgs: true,
    captureReturn: true,
    logToConsole: true
  },
  condition: {
    urlPattern: ".*api.*"
  }
})

// 注入 Hook（必须在页面加载前）
ai_hook_inject(hookId="fetch-hook", method="evaluateOnNewDocument")

// 获取捕获的数据
ai_hook_get_data(hookId="fetch-hook")
```

**支持的 Hook 类型**:
- 🎯 函数 Hook（`btoa`, `atob`, `eval`）
- 🎯 API Hook（`fetch`, `XMLHttpRequest`, `WebSocket`）
- 🎯 对象方法（`crypto.subtle.encrypt`）
- 🎯 属性拦截、事件监听

### 5. 性能分析 (4 个工具)

Web Vitals 指标、代码覆盖率、内存快照。

```javascript
performance_get_metrics(includeTimeline=true)
performance_start_coverage()  // 启动覆盖率收集
// ... 操作页面 ...
performance_stop_coverage()   // 获取未使用的代码
performance_take_heap_snapshot()  // 内存分析
```

### 6. 缓存与预算管理 (6 个工具)

智能管理 Token 预算和缓存，防止上下文溢出。

```javascript
get_token_budget_stats()  // 查看 Token 使用情况
get_cache_stats()         // 查看缓存统计

// Token 使用率 > 80% 时
manual_token_cleanup()    // 清理 Token
smart_cache_cleanup()     // 智能清理缓存
```

---

## 使用场景

### 🔓 网页逆向

- 分析混淆加密的 JavaScript 代码
- 定位加密算法和签名生成逻辑
- 提取 API 请求参数

### 🕷️ 爬虫开发

- 突破反爬虫检测（webdriver、Canvas指纹）
- 自动处理验证码（滑块/图形/reCAPTCHA）
- 捕获动态加载数据

### 🛡️ 安全测试

- 漏洞挖掘和渗透测试
- XSS/CSRF 检测
- API 安全分析

### ⚡ 性能优化

- 识别无用代码（代码覆盖率）
- 分析加载性能（Web Vitals）
- 内存泄漏检测

---

## 快速开始

### 环境要求

- **Node.js**: >= 18.0.0
- **操作系统**: Windows / macOS / Linux
- **LLM API**: OpenAI 或 Anthropic API Key

### 安装方式

#### 方式一：直接使用 npx（推荐）⭐

无需安装，直接配置即可使用。编辑 Claude Desktop 配置文件 `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "jshook": {
      "command": "npx",
      "args": ["-y", "jshook-reverse-tool"],
      "env": {
        "OPENAI_API_KEY": "sk-...",
        "DEFAULT_LLM_PROVIDER": "openai"
      }
    }
  }
}
```

#### 方式二：全局安装

```bash
npm install -g jshook-reverse-tool
```

配置文件：
```json
{
  "mcpServers": {
    "jshook": {
      "command": "jshook-reverse-tool",
      "env": {
        "OPENAI_API_KEY": "sk-...",
        "DEFAULT_LLM_PROVIDER": "openai"
      }
    }
  }
}
```

#### 方式三：从源码安装（开发者）

```bash
git clone https://github.com/wuji1/jshook-reverse-tool.git
cd jshook-reverse-tool
npm install
npm run build
```

配置文件：
```json
{
  "mcpServers": {
    "jshook": {
      "command": "node",
      "args": ["C:/path/to/jshook/dist/index.js"],
      "env": {
        "OPENAI_API_KEY": "sk-...",
        "DEFAULT_LLM_PROVIDER": "openai"
      }
    }
  }
}
```

### 环境变量配置

在 MCP 配置的 `env` 字段中设置以下变量：

**必需配置**:
```json
{
  "OPENAI_API_KEY": "sk-...",              // OpenAI API Key
  "DEFAULT_LLM_PROVIDER": "openai"         // 使用 openai
}
```

或使用 Anthropic:
```json
{
  "ANTHROPIC_API_KEY": "sk-ant-...",       // Anthropic API Key
  "DEFAULT_LLM_PROVIDER": "anthropic"      // 使用 anthropic
}
```

**可选配置**:
```json
{
  "PUPPETEER_HEADLESS": "false",           // 是否无头模式
  "PUPPETEER_TIMEOUT": "30000",            // 超时时间(毫秒)
  "ENABLE_CACHE": "true",                  // 启用缓存
  "LOG_LEVEL": "info"                      // 日志级别
}
```

### 启动使用

重启 Claude Desktop，现在可以使用自然语言调用 JSHook 的所有工具了！

```
你：帮我分析 https://example.com 的加密算法

Claude：
1. 启动浏览器并注入反检测脚本
2. 访问目标网站
3. 获取所有脚本，查找加密相关代码
4. 设置断点拦截加密函数调用
5. 分析加密逻辑...
```

---

## 典型工作流

### 场景 1: 分析加密算法

```
用户：帮我分析 https://api.example.com 的签名算法

AI 自动执行：
1. browser_launch() + stealth_inject()
2. network_enable() + debugger_enable()
3. page_navigate("https://api.example.com")
4. get_all_scripts() → 找到可疑脚本
5. xhr_breakpoint_set(urlPattern="*/api/*") → 拦截 API 请求
6. watch_add("window.signParams") → 监控签名参数
7. 触发请求 → debugger_wait_for_paused()
8. 分析调用栈和变量 → 定位签名算法
```

### 场景 2: 验证码自动检测

```
用户：访问 https://login.example.com 并告诉我是否有验证码

AI 自动执行：
1. browser_launch()
2. page_navigate("https://login.example.com")
3. captcha_detect() → AI 视觉识别
   → 返回: { detected: true, type: "slider", vendor: "geetest" }
4. captcha_wait(timeout=300000) → 等待用户完成
```

### 场景 3: Hook API 调用

```
用户：监控所有 Fetch 请求，记录 URL 和参数

AI 自动执行：
1. ai_hook_generate({
     description: "监控所有 Fetch 请求",
     target: { type: "api", name: "fetch" },
     behavior: { captureArgs: true, captureReturn: true }
   })
2. ai_hook_inject(method="evaluateOnNewDocument")
3. page_navigate("https://target.com")
4. 用户操作页面...
5. ai_hook_get_data() → 获取所有捕获的请求
```

---

## 项目结构

```
jshook-reverse-tool/
├── src/
│   ├── index.ts                 # MCP 服务器入口
│   ├── server/
│   │   ├── MCPServer.ts         # 主服务器类
│   │   ├── *ToolDefinitions.ts  # 工具定义
│   │   └── *ToolHandlers.ts     # 工具实现
│   ├── modules/                 # 核心模块
│   │   ├── collector/           # 浏览器自动化
│   │   ├── debugger/            # 调试器
│   │   ├── hook/                # Hook 管理
│   │   ├── crypto/              # 加密检测
│   │   └── captcha/             # 验证码识别
│   ├── services/
│   │   └── LLMService.ts        # AI 服务封装
│   └── utils/                   # 工具函数
├── docs/                        # 文档
│   ├── MCP功能介绍.md           # 完整功能文档
│   ├── 技术文档.md              # 技术实现细节
│   └── 浏览器逆向实战教程.md     # 实战案例
├── test/                        # 测试用例
└── package.json
```

---

## 开发命令

```bash
# 开发模式（自动重启）
npm run dev

# 构建项目
npm run build

# 运行测试
npm test

# 代码检查
npm run lint

# 格式化代码
npm run format

# 完整检查（lint + build + verify）
npm run check
```

---

## 文档

- 📘 [MCP 功能介绍](./docs/MCP功能介绍.md) - 80+ 工具完整说明
- 📗 [浏览器逆向实战教程](./docs/浏览器逆向实战教程.md) - 实战案例

---

## 常见问题

### Q: 网络监控没有捕获到请求？

**A**: 必须在 `page_navigate` **前**调用 `network_enable()`，或使用：
```javascript
page_navigate(url="...", enableNetworkMonitoring=true)
```

### Q: 验证码检测失败？

**A**: 确保使用支持 Vision API 的模型（GPT-4o、Claude 3.5 Sonnet）。如果使用不支持视觉的模型（如 DeepSeek），会返回截图让你手动分析。

### Q: Token 用完了怎么办？

**A**:
```javascript
manual_token_cleanup()    // 清理 Token
smart_cache_cleanup()     // 智能清理缓存
clear_all_caches()        // 完全重置（慎用）
```

### Q: 如何跳过第三方库代码？

**A**:
```javascript
blackbox_add_common()  // 一键屏蔽常见库
// 或手动添加
blackbox_add(urlPattern="*jquery*")
```

---

## 安全与法律

JSHook 是一个**合法的逆向工程和安全研究工具**。

### ✅ 合法使用场景

- 渗透测试授权项目
- 安全研究和漏洞分析
- CTF 竞赛和教育培训
- 自己网站的性能优化
- 爬虫开发和调试

### ❌ 禁止用途

- 未授权的攻击和破解
- 大规模爬取他人数据
- 绕过付费墙和版权保护
- DoS 攻击和供应链投毒

**使用本工具即表示你理解并遵守相关法律法规。**

---

## 技术栈

- **运行时**: Node.js 18+, TypeScript 5.0+
- **浏览器自动化**: Puppeteer, Chrome DevTools Protocol
- **AI 集成**: OpenAI API, Anthropic API
- **MCP 协议**: @modelcontextprotocol/sdk
- **AST 处理**: @babel/parser, @babel/traverse
- **测试**: Jest

---

## 贡献

欢迎贡献代码、报告问题或提出建议！




1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 打开 Pull Request

---

## 许可证

本项目采用 MIT 许可证 - 详见 [LICENSE](LICENSE) 文件

---

## 致谢

- [Puppeteer](https://github.com/puppeteer/puppeteer) - 浏览器自动化
- [Chrome DevTools Protocol](https://chromedevtools.github.io/devtools-protocol/) - 调试协议
- [Model Context Protocol](https://modelcontextprotocol.io/) - AI 工具协议
- [Babel](https://babeljs.io/) - JavaScript 编译器

---

<div align="center">

**如果这个项目对你有帮助，请给一个 ⭐ Star！**

Made with ❤️ by JSHook Team

</div>
