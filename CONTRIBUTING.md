# 贡献指南

[简体中文](CONTRIBUTING.md) | [English](CONTRIBUTING.en.md)

感谢你参与 DBX 工具箱。普通缺陷、功能建议和文档问题可以通过 [GitHub Issues](https://github.com/aiLi0617/dbx-plugin-toolbox/issues) 提交。

如果问题可能涉及密钥、凭据、任意文件访问、进程终止或其他安全影响，请不要创建公开 Issue，请改用[安全策略](SECURITY.md)中的私密报告渠道。

## 开始之前

- 搜索现有 Issue 和 Pull Request，避免重复工作。
- 一个 Pull Request 聚焦一个主题，避免夹带无关格式化或重构。
- 对较大的功能或兼容性变更，建议先创建 Issue 讨论范围。
- 不要提交真实密钥、Token、密码、密钥库、用户文件或 `.dbx-dev/` 内容。

## 开发环境

- Node.js 22+
- Rust 1.89+
- DBX 插件 CLI（`dbx-plugin`）

安装依赖并运行基础检查：

```bash
npm ci
npm run check
cargo test --manifest-path backend/Cargo.toml --locked
```

在 DBX 插件调试宿主中启动项目：

```bash
dbx-plugin dev --path . --port 5190
```

## 修改要求

### 前端与交互

- 保持 Svelte 组件和共享工具的现有组织方式。
- 使用 DBX 注入的主题令牌，不要写死品牌色、前景色或背景色。
- 为交互控件提供键盘操作、可见焦点和可访问名称。
- 文件、图片、文本和二进制输入必须保留明确的大小与数量上限。

### 多语言

- 新增或修改用户可见文本时，同步所有受支持语言，不要只补中英文。
- 保持占位符名称和数量在各语言中一致。
- 修改后运行：

```bash
npm run i18n:sync
npm run i18n:check
```

### Rust Sidecar 与安全

- UI 与 Sidecar 之间只传递完成操作所需的最少数据。
- 密钥库条目通过 `keyId` 引用；不要把明文密钥写入 `localStorage`、Workbench context、事件或日志。
- 文件访问、进程终止和其他高风险操作必须在执行前验证目标，并保留现有的大小、路径和身份检查。
- 不要修改或提交 `.dbx-dev/`。该目录可能包含本地运行数据和明文凭据。

### Manifest 与打包

- `manifest.json` 只使用 Manifest v1 允许的字段，并保持权限最小化。
- 新增运行时资源时，确认其被 `dbx-plugin.toml` 的 `[package].include` 覆盖。
- 不要提交 `dist/`、`.dbxp`、`ui/assets/`、`backend/target/` 或其他可再生构建产物。
- 不要自行添加签名信息或复用已经发布的版本号。

## 测试

根据改动范围补充或更新测试：

- UI、工具逻辑和翻译：`npm run check`
- Rust Sidecar：`cargo test --manifest-path backend/Cargo.toml --locked`
- Manifest、权限或打包内容：运行 DBX 插件 CLI 的项目预检和打包验证
- 平台相关行为：说明已验证的 Windows、macOS 或 Linux 环境，以及尚未覆盖的平台

文档改动至少需要检查 Markdown 链接和示例命令是否有效。

## 提交与 Pull Request

提交信息建议使用简洁的 Conventional Commit 风格，例如：

```text
feat: add a new local utility
fix: validate port ownership before termination
docs: update contribution guide
```

Pull Request 描述应包含：

- 修改目的和用户可见变化
- 主要实现方式
- 已执行的测试及结果
- 安全、隐私和兼容性影响
- UI 改动的截图或录屏（如适用）
- 尚未覆盖的限制或后续工作

提交 Pull Request 即表示你同意按本仓库的 [Apache License 2.0](LICENSE) 许可你的贡献。
