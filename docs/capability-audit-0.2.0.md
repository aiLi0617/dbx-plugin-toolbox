# DBX Toolbox 0.2.0 能力审计

本审计以 64 个公开入口为边界，检查入口可达、输入限制、错误反馈、复制/保存、演示、离线行为、国际化与自动化测试。P1 新工具、GIF 深度编辑、PDF 与联网查询不属于 0.2.0。

## 横向门禁

| 项目 | 0.2.0 结果 |
|---|---|
| 工具入口 | 64/64 均由 `TOOL_REGISTRY` 注册并具有 lazy loader；测试锁定数量与唯一性 |
| 组件参数 | `viewPropsForTool` 提供统一参数契约，`App.svelte` 不再按 view 类型分支渲染 |
| 输入限制 | 注册表为文件、编辑器、密码学与图片工具声明上限；视图在执行前反馈错误 |
| 国际化 | 源码文案全部进入离线词典；未人工翻译语言使用明确英文 fallback |
| 打包 | `.dbxp` 强制不超过 20 MiB，中央目录内出现 `.rten` 即失败，并输出压缩后依赖构成 |
| OCR 隐私 | 仅固定 GitHub Release 模型下载联网；用户内容与识别过程不联网；不声明前端 `host.network` |

## 入口矩阵

| 分类 | 入口 | 审计结论 |
|---|---|---|
| 数据 | json, data-convert, code-format, spreadsheet, chart | 输入限制、保存/复制、演示与错误反馈已覆盖 |
| 编解码 | base64, url, html-entities, sql-escape, data-uri, punycode, quoted-printable | 双向转换完整；Punycode 新增逐标签 DNS 长度与混合脚本告警 |
| 计算 | timestamp, color, cron, base-convert, phone, bandwidth, network-calc, windows-port | 本地计算、边界校验与错误提示已覆盖 |
| 文本 | whitespace, gzip, regex, diff, markdown, unicode-inspect | Gzip 新增二进制文件流；Diff 新增 unified/JSON/统计；Markdown 新增 Front Matter/目录/统计/安全 HTML；Unicode 新增字节/字素/Normalization/风险 |
| 开发 | user-agent, device-info, keyboard-event, http-request, docker-convert, git-reference, web-meta, html-playground | 共享视图由 loader 隔离；请求与预览均有能力限制或沙箱说明 |
| 安全 | hash, file-type, jwt, aes, hmac-sha256, rsa, totp, cert, jwk, key-generator, xor | 文件类型新增批量、MIME 双查与扩展名伪装报告；JWT/JWK/证书保留本地约束、选钥与字段审计 |
| 生成 | uuid, password, random-bytes, qrcode, lorem, fake-data | 明确生成参数、复制/保存与安全随机来源 |
| 图片 | image-process, image-generate, image-compress, image-grid, image-pixelate, image-base64, image-stitch, gif-tools, image-ocr | 批处理限制与保存覆盖；OCR 改为快速/高精度分层按需模型 |
| 配置/参考 | dotenv, semver, chmod, http-status | SemVer 新增递增、预发布、范围交集与候选筛选逻辑；其余保持离线验证与演示 |

## OCR 模型注册表

| 档位 | 文件 | 字节 | SHA-256 |
|---|---|---:|---|
| 基础 | detection-ppocrv5.rten | 4,877,120 | `06ceb2a0cf56bcd340ace6bf5ac8eea90377fbed931e4ee80b99eb75ef2d090a` |
| 快速 | recognition-mobile-opset13.rten | 16,555,844 | `19369953e95c4f376fb5310b2740c711b40a1fba6e311c6bb58baed949a85ba6` |
| 高精度 | recognition-server-opset13.rten | 84,552,004 | `5dad41c89a41ae468a626affb91867b36fe067b54d032138862e61f50c312f6b` |

模型状态区分未安装、已安装与需要更新。基础档删除会连带删除高精度档；识别进行时拒绝删除。下载使用随机临时文件、最大字节限制、RTEN 文件头/大小/SHA-256 校验、`fsync` 与原子发布，失败或取消会清理临时文件。

## 验证记录

- 前端：离线文案门禁、269 项 Node 测试、Vite production build。
- 后端：79 项 Rust 单元测试通过、1 项官方模型集成测试由独立 CI 执行；CI 同时执行 fmt、clippy 与双平台测试。
- 模型：独立 Linux CI 只下载一次三份官方资产，校验 SHA-256，并运行快速/高精度真实推理。
- Windows 候选包：6,020,562 bytes（5.74 MiB）；压缩构成为 `bin` 3.93 MiB、`ui` 1.80 MiB，其余不足 0.01 MiB；包内无 `.rten`。
