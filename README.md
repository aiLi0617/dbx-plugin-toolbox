# DBX 工具箱

> 面向开发者的本地工具集合与加密密钥库。数据格式转换、文本处理、编码编解码、图片处理与密码学操作均在本机完成。

DBX 工具箱（Toolbox）是 [DBX](https://github.com/t8y2/dbx) 的 Workbench 插件。它将日常开发中分散的小工具整合在一个工作台里，并提供由 Rust Sidecar 支持的本地加密密钥库；插件不声明网络权限，也不会主动上传处理内容。

| 项目 | 值 |
| --- | --- |
| 插件 ID | `io.github.aili0617.toolbox` |
| 当前版本 | `0.1.0` |
| 运行要求 | DBX `>= 0.5.68`、Host API `1` |
| 源码与主页 | [aiLi0617/dbx-plugin-toolbox](https://github.com/aiLi0617/dbx-plugin-toolbox) |
| 许可证 | [Apache-2.0](LICENSE) |

## 目录

- [核心特点](#核心特点)
- [安装与使用](#安装与使用)
- [功能概览](#功能概览)
- [隐私与安全](#隐私与安全)
- [架构](#架构)
- [本地开发](#本地开发)
- [打包与发布](#打包与发布)
- [项目结构](#项目结构)

## 核心特点

- **本地优先**：工作台不声明网络权限；格式转换、图像处理和密码学运算均在本机执行。
- **覆盖高频场景**：提供 7 类、约 38 个工具页，支持搜索、收藏、最近使用与分类筛选。
- **精度与边界明确**：数据转换设有 5 MB 输入上限；可能造成结构或数字精度丢失的操作会给出明确提示或拒绝执行。
- **密钥不离开 Sidecar**：密钥库通过 `keyId` 引用密钥，避免将明文密钥放入 UI 持久化存储或 Workbench context。
- **适合桌面工作流**：支持本地文件导入导出、二维码/条码生成与识别、批量图片处理和电子表格编辑。

## 安装与使用

### 通过 DBX 插件中心

在 DBX 中打开“插件中心”，搜索“工具箱”或 “Toolbox”，然后完成安装。安装后，从工作台打开“DBX 工具箱”。

### 安装本地开发包

从源码打包后，在 DBX 中依次打开“插件中心 → 设置 → 第三方与开发者选项”，启用未签名开发包安装，再选择生成的 `.dbxp` 文件。

> 未签名包仅用于本地开发和验证。正式发布版本及版本更新说明以 DBX 插件中心为准。

### 使用提示

- 首页搜索可直接定位到匹配的工具或子功能。
- 编辑器支持 Tab 缩进与 Shift+Tab 减少缩进；先按 Esc 再按 Tab 可将焦点移出编辑器。
- 普通工具的输入只在当前工作台会话中保留。加密、JWT、TOTP、口令与密钥生成页面会在离开时清除敏感输入。
- 保存二维码后，“打开所在文件夹”会调用系统文件管理器定位文件。

## 功能概览

### 数据与代码

| 工具 | 能力 |
| --- | --- |
| JSON 工作台 | 格式化、压缩、校验、树形编辑、JSONPath，以及导出 TypeScript、SQL 等 |
| 数据格式转换 | JSON、YAML、CSV、TSV、NDJSON、XML、TOML 互转 |
| 代码格式化 | SQL、XML、YAML、HTML、CSS、JavaScript、TypeScript |
| 电子表格 | 本地打开、编辑与导出 XLSX、CSV、TSV、JSON；支持批量粘贴、撤销重做、工作表管理、搜索和筛选 |

> XLSX 导入只保留单元格值；公式、样式、图片和合并单元格不会保留。

### 编码、转换与计算

- **编码与转义**：Base64 / Base32 / Base58 / Hex、URL、HTML、Unicode、JavaScript、JSON、CSS、SQL 字符串、Data URI、Punycode / IDN、Quoted-Printable。
- **时间与颜色**：Unix 时间戳与日期互转、时区与时间差计算；HEX / RGB / CMYK / HSV 转换、色环与屏幕取色。
- **开发计算**：Cron 表达式可视化与下次触发预览、2–36 进制转换、IPv4 / IPv6 CIDR 计算及受限子网切分。

> CIDR 工具不会枚举超大网段，以避免无意中耗尽本机资源。

### 文本与内容

- 空白和行处理、去重排序、命名风格转换、字数统计。
- 正则表达式测试、文本 Diff、Markdown 预览、Unicode 码位检查。
- UUID / ULID / NanoID、随机密码和随机字节生成。
- 可重复的占位文本与推广文案生成。

### 图像与码制

| 工具 | 能力 |
| --- | --- |
| 二维码与条码 | 生成 QR 与条码并导出 PNG / SVG；本地批量识别 QR、Data Matrix、PDF417；汉信码目前仅支持生成 |
| 图片处理 | 裁剪、缩放、旋转、翻转和水印；输出 PNG、JPEG、WebP；最多可处理 20 张本地图片 |
| 占位图 | 按像素尺寸和目标文件体积生成占位图 |

### 安全与加密

| 工具 | 能力 |
| --- | --- |
| 哈希与 HMAC | MD5、SHA、SM3、CRC32；HMAC-SHA-1 / SHA-256 / SHA-384 / SHA-512 / SM3，支持文本或文件 |
| JWT | 解码、签发与验签，覆盖 HS、RS、PS 算法族 |
| 对称加密 | AES / SM4，支持 GCM、CBC、ECB 模式 |
| 非对称加密 | RSA（OAEP / PKCS#1）与 SM2；解密结果可按 UTF-8、Hex、Base64 显示 |
| 密钥与证书 | AES / SM4 / HMAC 对称密钥、RSA / SM2 密钥对生成；X.509、SSH 公钥、JWK / JWKS 检查与转换 |
| 其他 | TOTP 动态口令与仅用于调试对照的 XOR |

### 加密密钥库

密钥库由 Sidecar 在本机用户数据目录 `io.github.aili0617.toolbox/keystore` 中保存。主密码采用 **Argon2id + AES-GCM** 保护密钥材料；界面只显示密钥名称、算法和指纹。

AES、SM4 和 HMAC 可选择密钥库中的条目或一次性输入的密钥。选择密钥库条目时，前端仅传递 `keyId`，由 Sidecar 完成密钥读取与运算。

## 隐私与安全

- 插件不主动联网，且 `manifest.json` 中的 `permissions` 为空。
- 敏感操作由本地 Rust Sidecar 执行；明文密钥不会写入 `localStorage`、Workbench context 或日志。
- 加密相关页面离开后会清除输入，降低屏幕共享和会话残留风险。
- 密钥库是本地保护机制，不替代组织级密钥管理、备份策略或安全审计。请妥善保管主密码，并勿将真实生产密钥用于不受信任的环境。

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

- **前端**：Svelte 5 + Vite，源码位于 `src/`；构建产物写入已忽略的 `ui/`。
- **后端**：Rust Sidecar 位于 `backend/`，打包为 `bin/dbx-plugin-toolbox`。
- **贡献点**：一个 `workbench` 入口，无运行时网络权限。
- **Sidecar 接口**：包括 `toolbox/json`、`toolbox/hash`、`toolbox/crypto`、`toolbox/cert`、`toolbox/keys/*`、`toolbox/prefs/*` 与本地文件相关接口。

## 本地开发

### 环境要求

- Node.js 22+
- Rust stable
- DBX 插件 CLI（`dbx-plugin`）

### 安装、测试与调试

```bash
npm install
npm test          # Node 内置 test runner
npm run build     # Vite 构建到 ui/
npm run check     # test + build

# 在 DBX 插件调试宿主中启动并热重载
dbx-plugin dev --path . --port 5190
```

修改 UI 后，watch 构建成功会输出 `DBX_UI_BUILD_SUCCESS` 并触发重载。密钥材料只应存在于 Sidecar 加密文件中；不要将其提交到仓库，也不要打进 `.dbxp`。

### Windows 说明

若 `dbx-plugin package` 出现 `os error 216`，请让当前 Rust toolchain 的 `bin` 目录在 `PATH` 中位于 rustup 的 `cargo.exe` shim 之前，例如：

```text
%USERPROFILE%\.rustup\toolchains\stable-x86_64-pc-windows-msvc\bin
```

DBX 调试命令会把工作目录规范为 `\\?\D:\...`。因此项目在 `dbx-plugin.toml` 中通过 Node 先切回普通盘符路径，再启动 Vite；请勿将该配置简单替换为 `npm.cmd`。

## 打包与发布

在干净依赖环境中构建未签名候选包：

```bash
npm ci
npm run build
dbx-plugin package .
```

产物位于 `dist/`，包括 `<id>-<version>-<target>.dbxp` 及对应的 `.artifact.json`。`ui/` 是可再生构建产物，干净 checkout 不需要提交它。

本仓库只包含插件源码；商店上架通过 [t8y2/dbx-store](https://github.com/t8y2/dbx-store) 完成。GitHub Release 会触发 [`.github/workflows/plugin-release.yml`](.github/workflows/plugin-release.yml) 打包流程。

完整的版本号、候选包、`releaseNotes` 和商店发布操作，请参阅 [发版与更新说明手册](docs/release-notes-ops.md)。

## 项目结构

```
├── assets/              # 图标等静态资源
├── backend/             # Rust Sidecar 与密钥库实现
├── docs/                # 发布和测试文档
├── shared/              # 随插件 CLI 对齐的本地 SDK
├── src/                 # Svelte UI 源码
├── tests/               # 前端单元测试
├── manifest.json        # 插件运行时清单与权限契约
├── dbx-plugin.toml      # 打包与开发构建配置
└── package.json         # 前端依赖与脚本
```

## 贡献

欢迎通过 [Issues](https://github.com/aiLi0617/dbx-plugin-toolbox/issues) 报告问题或提出建议。提交改动前，请至少运行：

```bash
npm run check
```

涉及密钥、密码学或本地文件访问的修改，请同时说明安全影响、测试范围与兼容性考虑。

## 许可证

本项目采用 [Apache License 2.0](LICENSE) 发布。
