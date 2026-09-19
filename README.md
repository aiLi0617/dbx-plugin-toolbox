# 工具箱

DBX 工作台插件：转换与计算、编码与转义、数据与代码、安全与校验、生成工具、文本处理，以及本机加密密钥库。

- 数据格式转换有独立入口，支持 JSON / YAML / CSV / TSV / NDJSON / XML / TOML；输入限制为 5 MB，并在可能丢失结构或精度时明确报错。
- 表格工具支持 XLSX / CSV / TSV / JSON 的本地编辑、批量粘贴、撤销重做、工作表管理、搜索筛选和导出；导入 XLSX 后只保留单元格值，不保留公式、样式、图片或合并单元格。
- 图片工具支持可视化裁剪、缩放、旋转、翻转、水印、PNG / JPEG / WebP 输出，以及最多 20 张图片的本地批处理。
- 网络工具支持 IPv4 / IPv6 CIDR、地址范围和受限子网切分；不会枚举超大网段。
- 二维码支持 PNG 与 SVG 导出，并可在本机批量识别 QR、Data Matrix 和 PDF417；汉信码目前只支持生成。
- 安全互操作支持 JWK / JWKS 校验、RSA JWK 与 PKCS#8/SPKI PEM 转换；RSA / SM2 解密可选择 UTF-8、Hex 或 Base64 输出。
- 时间工具保留时间戳与北京时间互转；代码格式化支持 JavaScript / TypeScript。
- Lorem 默认使用 DBX 推广文案，也可重复生成自定义内容。
- 普通工具的输入和选项仅在本次工作台会话内保留；关闭或刷新后清除。加密、JWT、TOTP、口令和密钥生成页面离开时清除输入。搜索可直接进入匹配的子功能。
- 编辑器使用 Tab 缩进、Shift+Tab 减少缩进；先按 Esc 再按 Tab 可移出编辑器。

插件 ID：`io.github.aili0617.toolbox`

## 开发

需要 Node.js 22+ 与 Rust。

Windows 上若 `dbx-plugin package` 报 `os error 216`，把当前工具链的 `bin` 目录放到 PATH 里 rustup 的 `cargo.exe` shim 之前，例如 `%USERPROFILE%\.rustup\toolchains\stable-x86_64-pc-windows-msvc\bin`。`dbx-plugin dev` 会把工作目录规范成 `\\?\D:\...`，因此 `[dev]` 里不用 `npm.cmd`，而是先切回普通盘符路径再跑 Vite。

```bash
npm install
npm test
npm run build
dbx-plugin dev --path . --port 5190
```

前端源码在 `src/`，构建产物写入 `ui/`。改 UI 后 watch 构建会打印 `DBX_UI_BUILD_SUCCESS` 并重载。密钥材料只存在 Sidecar 加密文件中（用户数据目录 `io.github.aili0617.toolbox/keystore`），不要提交、不要打进 `.dbxp`。

打包未签名候选：

```bash
npm ci
npm run build
dbx-plugin package .
```

构建产物全部位于被忽略的 `ui/` 目录；发布流程会在打包前重新构建，干净 checkout 不需要提交生成文件。

## 安全

- 工作台 `permissions` 为空且不主动联网；用户保存二维码后选择“打开所在文件夹”时，会调用系统文件管理器定位该文件。
- 密钥库用主密码（Argon2id + AES-GCM）加密；界面只显示名称、算法、指纹。
- AES / SM4 / HMAC 可选用密钥库（只传 `keyId`）或当次输入。
- 不要把密钥写入 `localStorage`、Workbench context 或日志。

源码仓库与商店仓库分离：本仓库只放插件源码；上架走 `t8y2/dbx-store`。
