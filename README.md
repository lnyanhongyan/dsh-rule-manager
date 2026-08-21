# @deepseek-ai/dsh-rule-manager

DeepSeek Harness (DSH) 规则管理插件。在设置页提供带 UI 的规则管理界面，支持**全局**和**项目**两个作用域，每条规则一个 `.md` 文件，保存后自动聚合到 `AGENTS.md`，由 DSH 原生机制注入模型指令。

## 功能

- ✅ **每条规则一个文件**（`rules/*.md`），易于维护
- ✅ **全局规则**：存放在 `{DSH_HOME}/rules/`，对当前 DSH 实例的所有会话生效
- ✅ **项目规则**：存放在各工作区的 `rules/`，只对该工作区的会话生效
- ✅ **自动聚合**：增删改规则后，自动重新聚合到对应的 `AGENTS.md`
- ✅ **DSH 原生注入**：`AGENTS.md` 由 DSH 内置的 `agent-instructions` 机制自动加载
- ✅ **主题适配**：支持亮色/暗色主题，使用系统主题 token
- ✅ **自定义弹窗**：新增/删除使用自定义样式的弹窗，不依赖浏览器默认样式

## 安装

```bash
# 方式 1：从本地 tarball 安装
dsh plugin --profile web add ./deepseek-ai-dsh-rule-manager-0.1.0.tgz

# 方式 2：从本地目录安装（开发用）
dsh plugin --profile web add ./dsh-rule-manager

# 方式 3：从 GitHub 安装
dsh plugin --profile web add github:你的用户名/dsh-rule-manager
```

安装后重启 DSH：

```bash
dsh web --port 3081
```

## 使用

1. 打开浏览器，进入 DSH Web 界面
2. 点击左侧边栏底部的 **设置** 图标
3. 在设置面板中找到 **规则管理** 页面
4. 切换 **全局** / **项目** 标签
5. 点击 **+ 新增规则**，输入规则名（自动补全 `.md`）
6. 编辑规则内容，点击 **保存**
7. 保存后自动聚合到对应的 `AGENTS.md`，DSH 会自动注入模型指令

### 文件结构

```
# 全局规则（对当前 DSH 实例的所有会话生效）
{DSH_HOME}/rules/
  ├── code-style.md       # 代码风格规则
  ├── security.md         # 安全规则
  └── ...

# 项目规则（只对该工作区的会话生效）
{项目目录}/rules/
  ├── code-style.md
  └── ...

# 自动生成的 AGENTS.md（由插件聚合，不要手动编辑）
{DSH_HOME}/AGENTS.md
{项目目录}/AGENTS.md
```

### 规则内容格式

每条规则是一个 Markdown 文件，建议以 `# 规则名` 开头：

```markdown
# 代码风格

- 使用 2 空格缩进
- 变量命名使用 camelCase
- 使用单引号
```

如果规则文件不以 `#` 开头，插件会自动添加 `# 文件名` 作为标题。

## 工作原理

```
┌─────────────────────────────────────────────────────────┐
│  UI（设置页）                                             │
│  新增/编辑/删除规则                                        │
└─────────────────┬───────────────────────────────────────┘
                  │ HTTP /rules/* 路由
                  ▼
┌─────────────────────────────────────────────────────────┐
│  Host 端                                                  │
│  1. 写入 rules/<name>.md（每条规则一个文件）                 │
│  2. 聚合 rules/*.md → AGENTS.md（按文件名排序）              │
└─────────────────┬───────────────────────────────────────┘
                  │ DSH 原生 agent-instructions 机制
                  ▼
┌─────────────────────────────────────────────────────────┐
│  模型指令注入                                              │
│  - 全局 AGENTS.md → 所有会话                                │
│  - 项目 AGENTS.md → 该项目工作区的会话（按 cwd 区分）          │
└─────────────────────────────────────────────────────────┘
```

## 项目结构

```
dsh-rule-manager/
├── src/
│   ├── index.ts          # Host 端：HTTP 路由 + 聚合逻辑
│   └── client/
│       └── index.ts      # Client 端：设置页 UI
├── lib/                  # 构建产物（由 tsdown 生成）
│   ├── index.mjs         # Host ESM 产物
│   ├── index.d.mts       # Host 类型声明
│   └── client.js         # Client __ModuleLoader__ 包
├── cordis.patch.yml      # DSH 安装配置
├── package.json
├── tsconfig.json
├── tsdown.config.ts
└── README.md
```

## 开发

```bash
# 安装依赖
pnpm install

# 类型检查
pnpm typecheck

# 构建
pnpm build

# 打包（产出 .tgz）
pnpm pack
```

## 依赖

- `@deepseek-ai/cordis` ^4.0.1
- `@deepseek-ai/dsh-host-webserver` ^0.1.0-rc.7（Host 端 HTTP 路由）
- `@deepseek-ai/dsh-client-runtime` ^0.1.0-rc.7（Client 端 slots）
- `@deepseek-ai/dsh-client-ui-slots` ^0.1.0-rc.7（Client 端 slot 系统）
- `@deepseek-ai/dsh-client-ui-settings` ^0.1.0-rc.7（Client 端设置页）
- `@deepseek-ai/dsh-client-locale` ^0.1.0-rc.7（Client 端国际化）
- `react` ^18.2.0

## 许可证

MIT

## 已知限制

- 删除功能使用 Node.js 的 `unlink`，在某些沙箱环境下可能受限
- 项目工作区需要在 DSH 中注册过（通过 `dsh web` 启动时自动注册）
- `AGENTS.md` 是自动生成的，不建议手动编辑（会被插件覆盖）
