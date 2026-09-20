# 工具箱（Toolbox）

[DBX](https://github.com/t8y2/dbx) 工作台插件：本地开发常用小工具 + 加密密钥库。全部在本机处理，工作台不声明网络权限。

| | |
| --- | --- |
| 插件 ID | `io.github.aili0617.toolbox` |
| 版本 | `0.1.0` |
| 要求 | DBX `>=0.5.68`，Host API `1` |
| 源码 / 主页 | https://github.com/aiLi0617/dbx-plugin-toolbox |
| 许可证 | Apache-2.0 |

## 功能一览

共 7 类、约 38 个工具页；首页支持搜索、收藏、最近使用与分类筛选。

### 数据与代码

| 工具 | 说明 |
| --- | --- |
| JSON 工作台 | 格式化 / 压缩 / 校验、树形编辑、JSONPath、导出 TypeScript / SQL 等 |
| 数据格式转换 | JSON / YAML / CSV / TSV / NDJSON / XML / TOML 互转（输入上限 5 MB；结构或精度可能丢失时会明确报错） |
| 代码格式化 | SQL、XML、YAML、HTML、CSS、JavaScript、TypeScript |
| 电子表格 | 本地打开 / 编辑 / 导出 XLSX、CSV、TSV、JSON；支持批量粘贴、撤销重做、工作表管理、搜索筛选。导入 XLSX 只保留单元格值，不保留公式、样式、图片或合并单元格 |

### 编码与转义

Base64 / Base32 / Base58 / Hex、URL、HTML / Unicode / JS / JSON / CSS 转义、SQL 字符串转义、Data URI、Punycode / IDN、Quoted-Printable。

### 转换与计算

Unix 时间戳与日期互转（含时区、加减与时间差）、颜色（HEX / RGB / CMYK / HSV，色环与屏幕取色）、Cron 可视化与下次触发预览、2–36 进制转换、IPv4 / IPv6 CIDR 与受限子网切分（不会枚举超大网段）。

### 文本工具

空白与行处理、去重排序、命名风格、字数统计、正则测试、文本 Diff、Markdown 预览、Unicode 码位检查。

### 安全与校验

| 工具 | 说明 |
| --- | --- |
| 哈希 | MD5 / SHA / SM3 / CRC32（文本或文件） |
| JWT | 解码、签发、验签（HS / RS / PS） |
| 对称加密 | AES / SM4（GCM / CBC / ECB） |
| HMAC | SHA-1 / SHA-256 / SHA-384 / SHA-512 / SM3 |
| 非对称加密 | RSA（OAEP / PKCS#1）、SM2；解密输出可选 UTF-8 / Hex / Base64 |
| TOTP | 根据密钥生成当前动态口令 |
| 证书与 SSH | X.509 有效期 / SAN / 指纹，SSH 公钥指纹 |
| JWK / JWKS | 校验；RSA JWK ↔ PKCS#8 / SPKI PEM |
| 密钥生成 | AES / SM4 / HMAC 对称密钥，RSA / SM2 密钥对（可写入密钥库） |
| XOR | 仅供调试对照 |

### 生成工具

UUID / ULID / NanoID、随机密码与随机字节、二维码与条码（PNG / SVG 导出；本机批量识别 QR / Data Matrix / PDF417；汉信码目前只支持生成）、可重复的占位 / 推广文案。

### 图片

| 工具 | 说明 |
| --- | --- |
| 图片处理 | 裁剪、缩放、旋转、翻转、水印；输出 PNG / JPEG / WebP；最多 20 张本地批处理 |
| 占位图 | 按像素尺寸与目标体积生成占位图 |

### 密钥库

Sidecar 侧本机加密保管密钥材料（用户数据目录 `io.github.aili0617.toolbox/keystore`）。主密码使用 Argon2id + AES-GCM；界面只显示名称、算法与指纹。AES / SM4 / HMAC 运算可选用密钥库（只传 `keyId`）或当次输入。

## 架构

```
┌─────────────────────┐     Host API      ┌──────────────────┐
│  UI（Svelte + Vite） │ ◄───────────────► │  DBX 宿主        │
│  src/ → ui/         │                   └────────┬─────────┘
└─────────────────────┘                            │ stdin/stdout
                                                   │ JSON-RPC
                                          ┌────────▼─────────┐
                                          │ Rust Sidecar     │
                                          │ crypto / vault   │
                                          │ prefs / fsutil   │
                                          └──────────────────┘
```

- **前端**：`src/`（Svelte 5），构建产物写入被 gitignore 的 `ui/`
- **后端**：`backend/`（Rust），打包为 `bin/dbx-plugin-toolbox`
- **贡献点**：单个 `workbench` 入口；`permissions` 为空
- **Sidecar 方法**：`toolbox/json`、`toolbox/hash`、`toolbox/crypto`、`toolbox/cert`、`toolbox/keys/*`、`toolbox/prefs/*`、`toolbox/save-file`、`toolbox/reveal-file`、`toolbox/copy-image`

## 使用注意

- 普通工具的输入与选项仅在本次工作台会话内保留；关闭或刷新后清除。加密、JWT、TOTP、口令与密钥生成页离开时清除输入。
- 搜索可直接进入匹配的子功能。
- 编辑器使用 Tab 缩进、Shift+Tab 减少缩进；先按 Esc 再按 Tab 可移出编辑器。
- 保存二维码后选择「打开所在文件夹」会调用系统文件管理器定位该文件。
- 不要把密钥写入 `localStorage`、Workbench context 或日志。

## 开发

需要 **Node.js 22+** 与 **Rust**（stable）。

```bash
npm install
npm test          # Node 内置 test runner
npm run build     # Vite → ui/
npm run check     # test + build

# 在 DBX 插件调试宿主中热重载
dbx-plugin dev --path . --port 5190
```

改 UI 后 watch 构建会打印 `DBX_UI_BUILD_SUCCESS` 并重载。密钥材料只存在 Sidecar 加密文件中，不要提交、不要打进 `.dbxp`。

### Windows 注意事项

若 `dbx-plugin package` 报 `os error 216`，把当前工具链的 `bin` 目录放到 PATH 里 rustup 的 `cargo.exe` shim 之前，例如：

`%USERPROFILE%\.rustup\toolchains\stable-x86_64-pc-windows-msvc\bin`

`dbx-plugin dev` 会把工作目录规范成 `\\?\D:\...`，因此 `[dev]` 里不用 `npm.cmd`，而是先切回普通盘符路径再跑 Vite（见 `dbx-plugin.toml`）。

### 目录结构

```
├── assets/              # 图标等静态资源
├── backend/             # Rust Sidecar
├── src/                 # Svelte UI 源码
├── tests/               # 前端单测
├── manifest.json        # 插件清单（运行时契约）
├── dbx-plugin.toml      # 打包 / dev 构建配置（不进入包）
└── package.json
```

## 打包与发布

发版、写入商店更新说明（`releaseNotes`）、以及在 DBX 插件中心查看的完整步骤，见 [docs/release-notes-ops.md](docs/release-notes-ops.md)。

本地打未签名候选包：

```bash
npm ci
npm run build
dbx-plugin package .
```

产物在 `dist/`（`<id>-<ver>-<target>.dbxp` 与 `.artifact.json`）。构建产物全部位于被忽略的 `ui/`；发布流程会在打包前重新构建，干净 checkout 不必提交生成文件。

未签名包仅供本地开发：插件中心 → 设置 → 第三方与开发者选项 → 允许安装未签名开发包。

源码仓库与商店仓库分离：本仓库只放插件源码；上架走 [`t8y2/dbx-store`](https://github.com/t8y2/dbx-store)。GitHub Release 触发 `.github/workflows/plugin-release.yml` 调用官方可复用工作流打包。

## 安全摘要

- 工作台不主动联网；敏感运算在本地 Sidecar 完成。
- 密钥库用主密码加密；明文密钥不落 UI 持久化存储。
- 加密相关页面离开即清输入，降低屏幕共享与会话残留风险。
