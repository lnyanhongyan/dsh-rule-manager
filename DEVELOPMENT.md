# DSH 插件开发流程总结

## 一、开发流程

### 1. 调研阶段

- 下载几个已发布的社区插件，直接看源码结构
- 确认插件的双端结构：Host（`lib/index.js`）+ Client（`lib/client.js`）
- 确认通信方式：社区插件用 `ctx.webServer.register()` + `fetch()`，不用 Typert `@Remote`
- 确认 Client UI 注册方式：`settings.section` slot
- 确认 CSS 主题系统：用 `--dsw-alias-*` token 而不是硬编码颜色

### 2. 工程搭建

```
plugin-name/
├── src/
│   ├── index.ts          # Host 端
│   └── client/index.ts   # Client 端
├── lib/                  # 构建产物
├── cordis.patch.yml      # DSH 安装配置
├── package.json
├── tsconfig.json
└── tsdown.config.ts
```

### 3. 实现阶段

**Host 端**：

- 用 `ctx.webServer.register()` 注册 HTTP 路由
- 用 `ctx.get('fs')` 读写文件
- 用 `ctx.get('sandboxPolicy').resolve({mode:'danger-full-access'})` 处理沙箱权限
- 用 `harness.handle()` 注册 RPC 方法（如果需要）

**Client 端**：

- 用 `ctx.slots.inject('settings.section', ...)` 注册设置页
- 用 `fetch()` 调用 Host 路由
- 用 CSS `--dsw-alias-*` token 适配亮/暗主题
- 用 `styles.insert()` 注入样式

### 4. 构建阶段

```bash
pnpm install        # 安装依赖
pnpm typecheck      # 类型检查
pnpm build          # tsdown 双端构建
pnpm pack           # 产出 .tgz
```

### 5. 验证阶段

```bash
dsh plugin --profile web add ./plugin-name
# 重启 DSH 后在设置页验证
```

### 6. 发布阶段

```bash
git init && git add . && git commit -m "feat: initial release"
git remote add origin github:用户/仓库
git push -u origin master
```

---

## 二、容易踩的坑

### Client bundle 格式

Client 端必须是 `window.__ModuleLoader__.load({id, factory})` 格式。tsdown 配置里加 `banner/footer/intro` 包装：

```js
outputOptions: {
  banner: `window.__ModuleLoader__.load({ id: "${PLUGIN_ID}", factory: (require) => {`,
  footer: 'return module.exports; } });',
  intro: 'var module = { exports: {} }; var exports = module.exports;',
}
```

### `ctx.get` vs `inject`

`ctx.get('xxx')` 是可选读取，服务未就绪时返回 `undefined`。关键服务必须用 `inject` 声明，否则 `apply()` 在服务不可用时就执行了。

```js
// 错误：可能拿到 undefined
const ws = ctx.get('workspaceRegistry')

// 正确：等服务就绪后再执行
export const inject = ['webServer', 'fs', 'workspaceRegistry']
```

### Windows 上 bash 不可用

DSH 的 bash 执行器在 Windows 上可能找不到 `bash`，导致 `rm` 等命令失败。尽量用 Node.js 原生 API（如 `fs.unlink()`），不要依赖 shell 命令。

### sandbox 权限不足

写 DSH_HOME 等非 workspace 目录时，默认的 `sandboxPolicy.resolve()` 会拒绝。需要传入 `{ mode: 'danger-full-access' }`。

### package.json 缺少 `dsh.bundle`

没有 `dsh.bundle.patch` 声明，`dsh plugin add` 不会把插件加入 profile bundle layer，只当成普通依赖。

```json
"dsh": {
  "bundle": { "patch": "./cordis.patch.yml" },
  "client": { "platform": "web", "immediately": true }
}
```

### Typert `/remote` 不可用

官方 Typert 生成器在 npm 上版本过旧，外部开发者无法用 `@Remote` 装饰器。改用社区模式：`ctx.webServer.register()` + `fetch()`。

### GitHub 403 权限错误

Fine-grained token 需要单独给仓库配置 `Contents: Read and write` 权限，或者用 classic token（`ghp_` 开头，勾选 `repo`）。

### npm IPv6 连接失败

DNS 返回 IPv6 地址但本机无 IPv6 路由。设置 `NODE_OPTIONS=--dns-result-order=ipv4first` 或配置 HTTP 代理。

### 中文编码问题（PowerShell 测试）

curl 测试时中文变 `????` 或 JSON 解析失败，原因是 UTF-8 BOM。用 `New-Object System.Text.UTF8Encoding($false)` 写无 BOM 文件。

---

## 三、关键命令速查

```bash
# 安装依赖
pnpm install

# 构建
pnpm typecheck && pnpm build

# 打包
pnpm pack

# 安装到 DSH
dsh plugin --profile web add ./plugin-name
dsh plugin --profile web add github:user/repo

# 重启 DSH
dsh web --port 3081

# 发布到 GitHub
git init && git add . && git commit -m "feat: initial release"
git remote add origin github:user/repo
git push -u origin master
```

---

## 四、项目结构（以 dsh-rule-manager 为例）

```
dsh-rule-manager/
├── src/
│   ├── index.ts              # Host 端：HTTP 路由 + 业务逻辑
│   └── client/
│       └── index.ts          # Client 端：设置页 UI
├── lib/
│   ├── index.mjs             # Host ESM 产物
│   ├── index.d.mts           # Host 类型声明
│   └── client.js             # Client __ModuleLoader__ 产物
├── cordis.patch.yml          # DSH 安装配置
├── package.json              # dsh.client + dsh.bundle 声明
├── tsconfig.json
├── tsdown.config.ts          # 双端构建配置
├── README.md
└── DEVELOPMENT.md            # 本文档
```

---

## 五、package.json 模板

```json
{
  "name": "@deepseek-ai/dsh-plugin-name",
  "version": "0.1.0",
  "description": "DSH plugin description",
  "license": "MIT",
  "type": "module",
  "main": "lib/index.mjs",
  "types": "lib/index.d.mts",
  "exports": {
    ".": {
      "types": "./lib/index.d.mts",
      "default": "./lib/index.mjs"
    },
    "./client": {
      "types": "./lib/types/client/index.d.ts",
      "default": "./lib/client.js"
    },
    "./package.json": "./package.json"
  },
  "files": [
    "lib/index.mjs",
    "lib/index.d.mts",
    "lib/client.js",
    "cordis.patch.yml"
  ],
  "dsh": {
    "bundle": {
      "patch": "./cordis.patch.yml"
    },
    "client": {
      "inject": [
        "@deepseek-ai/dsh-client-runtime",
        "@deepseek-ai/dsh-client-ui-slots",
        "@deepseek-ai/dsh-client-ui-settings",
        "@deepseek-ai/dsh-client-locale"
      ],
      "platform": "web",
      "immediately": true
    }
  }
}
```

---

## 六、tsdown.config.ts 模板

```ts
import { defineConfig } from 'tsdown'

const PLUGIN_ID = '@deepseek-ai/dsh-plugin-name'

export default defineConfig([
  {
    name: `${PLUGIN_ID}/host`,
    entry: { index: 'src/index.ts' },
    outDir: 'lib',
    format: ['esm'],
    platform: 'node',
    target: 'es2022',
    dts: true,
    clean: false,
    deps: {
      neverBundle: (id) =>
        id === '@deepseek-ai/cordis' ||
        id === '@deepseek-ai/dsh-host-webserver' ||
        id.startsWith('@deepseek-ai/dsh-'),
    },
  },
  {
    name: `${PLUGIN_ID}/client`,
    entry: { client: 'src/client/index.ts' },
    outDir: 'lib',
    format: 'cjs',
    platform: 'browser',
    target: 'es2022',
    dts: true,
    clean: false,
    deps: {
      neverBundle: (id) => id === 'react' || id.startsWith('@deepseek-ai/dsh-'),
      alwaysBundle: (id) => id !== 'react' && !id.startsWith('@deepseek-ai/dsh-'),
    },
    outputOptions: {
      entryFileNames: 'client.js',
      banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(PLUGIN_ID)}, factory: (require) => {`,
      footer: 'return module.exports; } });',
      intro: 'var module = { exports: {} }; var exports = module.exports;',
    },
  },
])
```

---

## 七、cordis.patch.yml 模板

```yaml
- insert:
    - id: plugin-name
      name: '@deepseek-ai/dsh-plugin-name'
```
