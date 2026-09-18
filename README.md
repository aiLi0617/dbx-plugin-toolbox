# 工具箱

DBX 工作台插件：转换、编解码、格式化、生成、文本，以及本机加密密钥库。

插件 ID：`io.github.aili0617.toolbox`

## 开发

需要 Node.js 22+ 与 Rust。

Windows 上若 `dbx-plugin package` 报 `os error 216`，把当前工具链的 `bin` 目录放到 PATH 里 rustup 的 `cargo.exe` shim 之前，例如 `%USERPROFILE%\.rustup\toolchains\stable-x86_64-pc-windows-msvc\bin`。`dbx-plugin dev` 会把工作目录规范成 `\\?\D:\...`，因此 `[dev]` 里不用 `npm.cmd`，而是先切回普通盘符路径再跑 Vite。

```bash
npm install
dbx-plugin dev --path . --port 5190
```

前端源码在 `src/`，构建产物写入 `ui/`。改 UI 后 watch 构建会打印 `DBX_UI_BUILD_SUCCESS` 并重载。密钥材料只存在 Sidecar 加密文件中（用户数据目录 `io.github.aili0617.toolbox/keystore`），不要提交、不要打进 `.dbxp`。

打包未签名候选：

```bash
npm ci
npm run build
dbx-plugin package .
```

## 安全

- 工作台 `permissions` 为空；不做 HTTP、不执行系统命令。
- 密钥库用主密码（Argon2id + AES-GCM）加密；界面只显示名称、算法、指纹。
- AES / SM4 / HMAC 可选用密钥库（只传 `keyId`）或当次输入。
- 不要把密钥写入 `localStorage`、Workbench context 或日志。

源码仓库与商店仓库分离：本仓库只放插件源码；上架走 `t8y2/dbx-store`。
