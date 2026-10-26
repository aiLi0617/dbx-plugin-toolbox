# DBX 工具箱全量体验审查

审查日期：2026-10-26（Asia/Shanghai）。审查对象：当前工作区源码快照，147 个入口、141 个可见入口、6 个兼容入口、60 类注册视图。

## 结论

**已有 DBX 主题和工作台基础，但尚不能认定全部工具的风格、交互与功能一致达标。** 大部分传统编辑/转换工具使用统一 tokens、30px 插件控件、共享编辑器与复制反馈；新增计算、内容和文件工具出现独立卡片风格及流程不一致。已确认的问题优先级最高的是 JSON 数值误判、Git 命令裁切、任务浮钮遮挡和 PDF 会话容量冲突。

本报告记录 **4 项 P1、7 项 P2、3 项 P3**，未确认 P0。P1 是影响正确性或核心使用流程；P2 是明显体验/流程问题；P3 是增强建议。问题清单与未验证能力分开，未发现问题不等于完整功能认证。

### 实际完成的覆盖

- 147/147 入口通过公开 context 导航访问，包括6个兼容入口；141个可见工具也在目录中核对。
- 147 × 2种主题 × 3种尺寸 = **882 张逐页布局截图**，尺寸为1280×800、900×650、640×600；另外保存有效输入流程、专项问题和公共页面截图。
- 147/147 入口有浏览器流程记录，涵盖可用示例、有效文件/密钥输入、输出和可用复制按钮；复杂功能按下文说明记录限制，**不等同147条完整导出验收全部通过**。
- 核对全部注册视图及依赖/参数映射，生成源码扫描清单；人工深入检查公共组件和发现问题的逻辑。并非对全部代码逐行安全审计。
- 设置对话框连续15次 Tab 焦点保持内部，Escape关闭；搜索无结果反馈、Enter打开单位换算及目录141张卡片均实测。
- 自定义主色、字体和直角配置已测试；英文重点补查工作日、单位、PDF签名检查、语音、Git和日期弹层。

### 尚未完成的验收与明确边界

| 能力 | 本轮实际验证 | 仍需验证 |
|---|---|---|
| 真实 DBX 当前构建 | 读取真实桌面窗口，核对宿主源码与插件组件注入规则 | 已安装工具箱入口的自动化点击超时；未安装本轮构建。正式 WebView、宿主重开、真实 token 推送仍待验收 |
| 保存到磁盘 | 处理结果/可用保存入口、PNG编码、共享保存实现及后端测试 | 未逐工具完成操作系统保存对话框、落盘文件重开与覆盖取消；不能宣称所有导出成功 |
| OCR | 隔离目录无模型状态、安装入口、图像导入与选项、传输与取消源码及测试 | 未下载模型，未跑真实推理、模型下载取消/失败恢复与准确率样本 |
| 密钥库/TOTP账户 | 手动TOTP口令生成、相邻周期、锁定界面、共享代码与既有测试 | 主密码创建、账户持久化、备份恢复及真实桌面自动锁的端到端操作未执行；未触碰用户真实保险库 |
| 密码学 | 合法测试材料的加密、签名、派生、生成与输出/复制；后端算法测试 | 每种编码、全部参数组合、逐入口加解密闭环及跨软件互操作未穷举 |
| PDF | 15个入口的小样例载入/处理，原生/Worker两路径；会话容量探针；单样例合并通过 | 双文件合并补验未完成（旧样例追加及自动化状态影响，未判产品缺陷）；大文档、加密文档错误密码、真实签名证书链与外部阅读器落盘复验未全部完成 |
| 图像/GIF/语音 | 九宫格ZIP生成入口、占位图实际800×600输出及最小体积提示、图片处理预览、帧生成、GIF压缩/裁剪/帧提取、小文件输入；本地语音静音开始/暂停/停止 | 大图内存峰值、长动画、不同浏览器编解码差异及语音实际听感未验 |
| 长任务可靠性 | 生命周期与取消源码/既有测试，任务遮挡实测 | 未对所有复杂工具执行完整“取消—重试—成功”压力矩阵 |
| 端口工具 | 只读查询界面和独立后端测试 | 不终止用户进程，不将实际终止操作计为通过 |

这些是本轮覆盖缺口，不伪装成产品缺陷；因此原计划中“全部完整核心流程及所有复杂失败模式均通过”的验收条件仍未全部满足。

## 基准与可复现性

- 工具箱 HEAD：`8e9a65d7c90ddddba3fd896ef46e846128e386f8`，包含未提交改动。源码快照时间：2026-10-26 15:04:43（北京时间）。逐文件SHA-256见 [source-baseline.json](../output/playwright/audit-20261026/source-baseline.json)。
- 本地 DBX HEAD：`ff99d00b59abc329c104b77ced1487f78967ac83`。对照 [../dbx/apps/desktop/src/styles/tokens.css](D:/Work/Project/github/dbx-plugin-toolbox/../dbx/apps/desktop/src/styles/tokens.css)、[../dbx/apps/desktop/src/components/ui/button/index.ts](D:/Work/Project/github/dbx-plugin-toolbox/../dbx/apps/desktop/src/components/ui/button/index.ts) 及 [../dbx/apps/desktop/src/lib/plugins/pluginHostBridge.ts:695](D:/Work/Project/github/dbx-plugin-toolbox/../dbx/apps/desktop/src/lib/plugins/pluginHostBridge.ts:695)。
- DBX 主应用默认按钮32px，**插件 kit 按钮30px**；本项目30px并非天然不符合DBX。字号、焦点和圆角应依照插件契约及宿主设置，不能只凭一个测试正则判断。
- 开发宿主使用已安装的官方dev-runtime及独立Sidecar，端口5198；iframe保持 `sandbox=allow-scripts` 与CSP；仅将iframe铺满浏览器以使检查尺寸等于插件工作区。导航和环境变化通过桥接消息契约，不改产品组件。
- 审查资源全部放入独立output目录；UI从固定快照构建。隔离数据目录预置迁移完成标记，避免读取或迁入真实用户保险库。未发布、未安装候选插件、未修改产品源码。正常构建曾生成被忽略的UI产物。
- 工作区存在并行更新；快照后变动文件记录见 [source-drift.json](../output/playwright/audit-20261026/source-drift.json)。代码链接可能随之后编辑移动，复现应以快照和哈希为准。

### 自动化基线

| 检查 | 结果 | 解释 |
|---|---|---|
| npm test | 466项：458通过、5失败、3跳过 | [frontend-tests.log](../output/playwright/audit-20261026/frontend-tests.log) |
| npm run i18n:check | 失败 | 2945条源文案已登记；8个语言英文fallback超预算，见 [i18n.log](../output/playwright/audit-20261026/i18n.log) |
| npm run build | 通过 | [build.log](../output/playwright/audit-20261026/build.log)；固定快照构建也通过，见 [snapshot-build.log](../output/playwright/audit-20261026/snapshot-build.log) |
| cargo test（沙箱） | 89通过、12失败、1忽略 | 临时目录/端口权限限制，不能直接判为产品缺陷 |
| cargo test（宿主复核） | **101通过、0失败、1忽略** | [backend-tests-host.log](../output/playwright/audit-20261026/backend-tests-host.log) |
| 快照重点门禁 | 24项：19通过、5失败 | [snapshot-guards.log](../output/playwright/audit-20261026/snapshot-guards.log) |

5个前端失败需要区分：UnitConverter固定颜色fallback、Stopwatch前景色阴影、DatePicker焦点规则是样式约定漂移；CompoundInterest使用了等价的一次性Demo消费写法，测试却强制单一声明/比较语法；MathExpression的错误在写入状态前已localizeError，测试误把读取 error.message 当成未本地化。**后两项不计用户缺陷，应修测试语义**。未将测试通过等同视觉通过。

## 确认问题与整改建议

| 编号 | 优先级 | 类型 | 问题 |
|---|---|---|---|
| F01 | P1 | 功能缺陷 | JSON 对比静默漏掉大整数及超大指数的差异 |
| F02 | P1 | 布局缺陷 | Git 速查卡片被压缩，命令和复制操作遭裁切 |
| F03 | P1 | 交互缺陷 | 任务管理浮钮遮挡页面右下角的执行按钮 |
| F04 | P1 | 资源生命周期缺陷 | PDF 跨页面保留会话与后端 4 会话上限冲突，错误提示误导 |
| F05 | P2 | 交互缺陷 | 图片工具首次导入文件即误触“覆盖未保存内容”确认 |
| F06 | P2 | 结果状态缺陷 | 显式执行工具修改输入后仍展示旧成功结果 |
| F07 | P2 | DBX 主题适配偏差 | 多页固定圆角和独立装饰不服从宿主外观设置 |
| F08 | P2 | 开发宿主样式缺陷 | 基础主按钮文字颜色被高优先级 inherit 覆盖 |
| F09 | P2 | 输入反馈缺陷 | 日期输入无效时静默恢复旧日期 |
| F10 | P2 | 国际化缺陷 | 日期弹层固定中文，英文环境仍显示“关闭 / 今天” |
| F11 | P2 | 功能流程薄弱 | GIF 裁剪只有坐标数值，没有可交互裁剪框 |
| F12 | P3 | 结果呈现增强 | 密码强度与 IBAN 结果主要裸露 JSON，缺少面向用户的结论 |
| F13 | P3 | 计算口径增强 | 基准比较仅按 ops/s 排名，复利按整月取整 |
| F14 | P3 | 页面信息与布局增强 | 部分新工具重复标题、过多说明及内部实现术语占据首屏 |

### F01 · P1 · JSON 对比静默漏掉大整数及超大指数的差异

- **影响入口**：`json-diff`
- **复现**：左侧输入 {"id":9007199254740992}，右侧输入 {"id":9007199254740993}，点击“开始对比”。
- **实际表现**：页面显示“对比结果 0 / 两份 JSON 内容一致”。{"x":1e400} 与 {"x":2e400} 也返回空差异。
- **影响/预期**：数据库 ID、订单号和数值核对会得到错误结论。格式化已经使用 lossless-json，但实际比较仍用普通 JSON.parse。
- **代码证据**：[src/lib/developerExpansion.js:21](D:/Work/Project/github/dbx-plugin-toolbox/src/lib/developerExpansion.js:21)；[src/lib/JsonDiffView.svelte:33](D:/Work/Project/github/dbx-plugin-toolbox/src/lib/JsonDiffView.svelte:33)。
- **实测证据**：[screenshots/probe-json-diff-integer.png](../output/playwright/audit-20261026/screenshots/probe-json-diff-integer.png)；[source-probes.json](../output/playwright/audit-20261026/source-probes.json)；[ui-probes.json](../output/playwright/audit-20261026/ui-probes.json)。
- **整改**：统一使用保真 JSON 解析和数值比较；保留原始数字文本，禁止在比较前转成 Number。
- **验收**：上述两组输入均报告字段修改且保留原始数字；补测大整数、指数、负零、数组和键顺序。

### F02 · P1 · Git 速查卡片被压缩，命令和复制操作遭裁切

- **影响入口**：`git-reference`
- **复现**：打开 Git 速查，不筛选分类；分别查看 1280×800、900×600、640×600。
- **实际表现**：首批卡片高度分别约 87.5、54.2、24.8px，内部内容高度为 229–697px；header 自身最小高度约 74px，命令列表被 overflow:hidden 裁切。
- **影响/预期**：小窗口只能看到卡片顶部，主功能“查阅、复制命令”不可正常使用；大窗口也裁掉多数命令。
- **代码证据**：[src/lib/UtilitySuiteView.svelte:638](D:/Work/Project/github/dbx-plugin-toolbox/src/lib/UtilitySuiteView.svelte:638)。
- **实测证据**：[screenshots/probe-git-640.png](../output/playwright/audit-20261026/screenshots/probe-git-640.png)；[screenshots/probe-git-1280.png](../output/playwright/audit-20261026/screenshots/probe-git-1280.png)；[ui-probes.json](../output/playwright/audit-20261026/ui-probes.json)。
- **整改**：为 Git 列表设置明确可滚动的 flex 子区和不可收缩卡片；避免网格行按剩余高度压缩内容。
- **验收**：三种尺寸全部命令均可滚动到达、可复制；搜索及分类切换后保留正常卡片高度。

### F03 · P1 · 任务管理浮钮遮挡页面右下角的执行按钮

- **影响入口**：`chacha20-poly1305`、`xchacha20-poly1305`、`aes-gcm-siv`、`aes-siv`、`aes-ccm`、`modern-aead`、`argon2id-kdf`、`scrypt-kdf`、`pbkdf2-kdf`、`hkdf`、`kdf`、`key-wrap`、`storage-crypto`、`format-preserving`、`aes-cmac`、`aes-128-gmac`、`aes-256-gmac`、`aes-mac`
- **复现**：先执行一次 PDF/GIF 任务，使右下角出现“任务管理”；再打开 ChaCha20-Poly1305，输入合法密钥和明文，点击执行。
- **实际表现**：Playwright 的真实鼠标点击被 task-center 内的 toggle 按钮拦截；9 个入口已直接复现。键盘聚焦后按 Enter 可以执行并生成结果。
- **影响/预期**：跨工具使用后核心操作失效；首次空白会话可能看不到，属于状态相关问题。
- **代码证据**：[src/lib/TaskCenter.svelte:51](D:/Work/Project/github/dbx-plugin-toolbox/src/lib/TaskCenter.svelte:51)；[src/lib/ModernCryptoView.svelte:199](D:/Work/Project/github/dbx-plugin-toolbox/src/lib/ModernCryptoView.svelte:199)。
- **实测证据**：[screenshots/chacha20-poly1305-mouse-blocked.png](../output/playwright/audit-20261026/screenshots/chacha20-poly1305-mouse-blocked.png)；[flow-42.json](../output/playwright/audit-20261026/flow-42.json)；[flow-48.json](../output/playwright/audit-20261026/flow-48.json)；[flow-60.json](../output/playwright/audit-20261026/flow-60.json)。
- **整改**：把任务入口放入预留的工作台状态栏，或为内容和底部操作预留遮挡安全区；浮层不应覆盖可操作区域。
- **验收**：先完成后台任务，再在三种尺寸用鼠标执行所有右下角主操作；不能依赖键盘绕过。

### F04 · P1 · PDF 跨页面保留会话与后端 4 会话上限冲突，错误提示误导

- **影响入口**：`pdf-merge`、`pdf-split`、`pdf-organize`、`pdf-rotate`、`pdf-delete`、`pdf-extract`、`pdf-watermark`、`pdf-page-numbers`、`pdf-crop`、`pdf-visual-signature`、`pdf-images`、`pdf-compress`、`pdf-encrypt`、`pdf-decrypt`、`pdf-signature-check`
- **复现**：连续在 5 个不同的原生 PDF 工具中载入样例且不关闭旧页面。后端独立探针也连续执行 5 次 toolbox/pdf/begin。
- **实际表现**：前 4 次成功，第 5 次报 Too many PDF sessions are active；释放一个会话后重试成功。前端显示“PDF 输入超出 Sidecar 限制，请减少文件数、总体积或页数”。
- **影响/预期**：用户会误以为当前小文件过大；隐藏 PDF 页面仍持有 nativeSession，普通页面淘汰机制又排除了这些后台工具。
- **代码证据**：[backend/src/pdf.rs:265](D:/Work/Project/github/dbx-plugin-toolbox/backend/src/pdf.rs:265)；[src/lib/PdfToolView.svelte:147](D:/Work/Project/github/dbx-plugin-toolbox/src/lib/PdfToolView.svelte:147)；[src/lib/viewRegistry.js:86](D:/Work/Project/github/dbx-plugin-toolbox/src/lib/viewRegistry.js:86)；[src/lib/i18nErrors.js:1109](D:/Work/Project/github/dbx-plugin-toolbox/src/lib/i18nErrors.js:1109)。
- **实测证据**：[pdf-session-probe.json](../output/playwright/audit-20261026/pdf-session-probe.json)；[pdf-session-probe.mjs](../output/playwright/audit-20261026/pdf-session-probe.mjs)。
- **整改**：建立前后端统一会话预算；保留未保存结果时允许明确关闭旧会话或重新上传，不静默销毁结果。单独本地化会话容量错误，提供可操作的释放入口。
- **验收**：连续切换 9 个原生 PDF 入口不出现误导的文件上限错误；已保存/取消/关闭后释放资源，未保存结果仍可恢复。

### F05 · P2 · 图片工具首次导入文件即误触“覆盖未保存内容”确认

- **影响入口**：`image-process`、`image-compress`、`image-grid`、`image-pixelate`、`image-base64`、`image-stitch`、`gif-tools`
- **复现**：在空白图片工具中首次选择本地样例文件。
- **实际表现**：文件选择触发 input 后，通用 edit 先将会话标记 dirty；随后的 change 被 protectFile 拦截，弹出“保留当前工作 / 放弃并继续”。7 个入口均在流程记录中复现。
- **影响/预期**：没有旧内容也要求放弃，增加每次首用阻力，削弱真正覆盖警告的可信度。
- **代码证据**：[src/lib/ToolSession.svelte:9](D:/Work/Project/github/dbx-plugin-toolbox/src/lib/ToolSession.svelte:9)；[src/lib/ToolSession.svelte:24](D:/Work/Project/github/dbx-plugin-toolbox/src/lib/ToolSession.svelte:24)。
- **实测证据**：[screenshots/image-process-file-confirmation.png](../output/playwright/audit-20261026/screenshots/image-process-file-confirmation.png)；[flow-78.json](../output/playwright/audit-20261026/flow-78.json)；[flow-84.json](../output/playwright/audit-20261026/flow-84.json)。
- **整改**：文件 input 不应在其变更处理前被通用文本编辑监听标记 dirty；基于导入前状态决定是否确认。
- **验收**：首次导入不确认；已有未保存图片时替换仍确认；取消后保留原图及结果。

### F06 · P2 · 显式执行工具修改输入后仍展示旧成功结果

- **影响入口**：`iban`、`bcrypt`、`password-strength`、`bip39`
- **复现**：IBAN 加载示例并执行，出现 valid:true；将输入改为 INVALID，不再次执行。
- **实际表现**：旧结果保持不变，仍可复制，页面未标记“结果对应上一次输入”。IBAN 已实际复现，其余入口共用同一 output 状态和 run 流程。
- **影响/预期**：用户可能复制或误读过期校验结果。显式计算本身合理，但结果必须标注来源或失效。
- **代码证据**：[src/lib/SecurityExpansionView.svelte:28](D:/Work/Project/github/dbx-plugin-toolbox/src/lib/SecurityExpansionView.svelte:28)；[src/lib/SecurityExpansionView.svelte:94](D:/Work/Project/github/dbx-plugin-toolbox/src/lib/SecurityExpansionView.svelte:94)。
- **实测证据**：[screenshots/probe-iban-stale.png](../output/playwright/audit-20261026/screenshots/probe-iban-stale.png)；[ui-probes.json](../output/playwright/audit-20261026/ui-probes.json)。
- **整改**：保存执行参数签名；输入或相关选项变化后将旧结果置为过期，并禁用复制或提示重新执行。
- **验收**：修改任一参与计算的字段后不会显示为当前成功结果；重复执行和失败均正确替换旧结果。

### F07 · P2 · 多页固定圆角和独立装饰不服从宿主外观设置

- **影响入口**：`unit-converter`、`stopwatch`、`benchmark`、`compound-interest`、`emoji-picker`
- **复现**：通过宿主 env 注入 0px 圆角、紫色主色及 Arial/Courier 字体，查看单位换算、秒表、基准和 Emoji。
- **实际表现**：颜色和字体正确跟随；普通按钮变为直角，但 converter 仍为12px、timer-card为16px、benchmark面板为8px、Emoji面板为12px。复利面板也写死12px。秒表阴影取 foreground，深色时容易出现浅色光晕。
- **影响/预期**：新增页面像多个独立小网站，和 DBX 紧凑工作台的层级与外观配置不一致。固定胶囊状态标记不一概判错，主要问题是容器与表单控件。
- **代码证据**：[src/lib/UnitConverterView.svelte:101](D:/Work/Project/github/dbx-plugin-toolbox/src/lib/UnitConverterView.svelte:101)；[src/lib/StopwatchView.svelte:97](D:/Work/Project/github/dbx-plugin-toolbox/src/lib/StopwatchView.svelte:97)；[src/lib/BenchmarkView.svelte:73](D:/Work/Project/github/dbx-plugin-toolbox/src/lib/BenchmarkView.svelte:73)。
- **实测证据**：[screenshots/probe-custom-unit-converter.png](../output/playwright/audit-20261026/screenshots/probe-custom-unit-converter.png)；[screenshots/probe-custom-stopwatch.png](../output/playwright/audit-20261026/screenshots/probe-custom-stopwatch.png)；[ui-probes.json](../output/playwright/audit-20261026/ui-probes.json)。
- **整改**：页面容器、分段控件采用 radius tokens；中性阴影统一使用共享阴影；统一紧凑表单和结果面板。
- **验收**：直角和圆角主题都同步生效；明暗模式不出现白色浮光；同类工具的留白和控件密度一致。

### F08 · P2 · 基础主按钮文字颜色被高优先级 inherit 覆盖

- **影响入口**：公共样式：全部147入口，具体是否出现取决于是否使用主按钮。
- **复现**：在没有真实 DBX 组件 kit 的开发宿主中打开 Basic Auth，查看“生成认证头”。
- **实际表现**：浅色按钮背景 rgb(23,23,23)，文字 rgb(10,10,10)；深色背景 rgb(208,208,214)，文字 rgb(215,215,219)。实际文字未采用 primary-foreground。
- **影响/预期**：调试宿主主按钮近乎无字；影响视觉验收与可发现性。真实 DBX 注入的 .dbx-btn--primary 规则优先级较高，可以覆盖该问题，因此不推断所有正式宿主都复现。
- **代码证据**：[src/app.css:182](D:/Work/Project/github/dbx-plugin-toolbox/src/app.css:182)；[src/app.css:374](D:/Work/Project/github/dbx-plugin-toolbox/src/app.css:374)。
- **实测证据**：[ui-probes.json](../output/playwright/audit-20261026/ui-probes.json)；[screenshots/basic-auth-light-1280.png](../output/playwright/audit-20261026/screenshots/basic-auth-light-1280.png)。
- **整改**：降低通用文字 reset 的选择器优先级，或为主按钮 fallback 提供能压过 reset 的规则，同时保持宿主可覆盖。
- **验收**：开发宿主与真实 DBX 中主按钮均使用正确前景配色；检查主/危险/禁用/悬停状态。

### F09 · P2 · 日期输入无效时静默恢复旧日期

- **影响入口**：`business-days`、`lunar-calendar`
- **复现**：日期文本框输入 2026-02-30，按 Tab 或 Enter。
- **实际表现**：字段恢复原日期，没有 aria-invalid、错误文字或状态提示；用户可能继续按旧日期计算。
- **影响/预期**：输入意图未被接受但缺少原因，特别容易误算工作日。
- **代码证据**：[src/lib/DatePicker.svelte:53](D:/Work/Project/github/dbx-plugin-toolbox/src/lib/DatePicker.svelte:53)。
- **实测证据**：[ui-probes.json](../output/playwright/audit-20261026/ui-probes.json)。
- **整改**：保留非法草稿并给出具体日期错误；合法提交前不更新绑定值，清楚区分当前输入与上次有效结果。
- **验收**：不存在日期、越界年份、格式错误都可见且可访问地提示；合法日期正常提交。

### F10 · P2 · 日期弹层固定中文，英文环境仍显示“关闭 / 今天”

- **影响入口**：`business-days`、`lunar-calendar`
- **复现**：切换为英文，打开日期弹层。
- **实际表现**：主体月份/星期能本地化，底部按钮仍固定为中文，导航 aria-label 也直接写英语。
- **影响/预期**：英文界面混入中文；现有文案扫描通过不能证明运行时完全本地化。
- **代码证据**：[src/lib/DatePicker.svelte:107](D:/Work/Project/github/dbx-plugin-toolbox/src/lib/DatePicker.svelte:107)。
- **实测证据**：[screenshots/probe-datepicker-en.png](../output/playwright/audit-20261026/screenshots/probe-datepicker-en.png)；[ui-probes.json](../output/playwright/audit-20261026/ui-probes.json)。
- **整改**：将日期控件所有可见文本和辅助标签接入 locale 文案；补运行时语言切换检查。
- **验收**：中文、英文切换后弹层按钮和辅助标签均正确变化，无需刷新。

### F11 · P2 · GIF 裁剪只有坐标数值，没有可交互裁剪框

- **影响入口**：`gif-crop`
- **复现**：载入 GIF 后设置 X、Y、宽、高。
- **实际表现**：仅展示原 GIF 与数值表单；没有可拖动选区、边界叠加或操作前的裁剪预览，用户靠试错输入坐标。
- **影响/预期**：算法可用，但图像裁剪的核心空间交互薄弱；静态图片编辑已有可借鉴的选区交互。
- **代码证据**：[src/lib/GifEditorView.svelte:298](D:/Work/Project/github/dbx-plugin-toolbox/src/lib/GifEditorView.svelte:298)。
- **实测证据**：[screenshots/gif-crop-light-1280.png](../output/playwright/audit-20261026/screenshots/gif-crop-light-1280.png)；[flow-126.json](../output/playwright/audit-20261026/flow-126.json)。
- **整改**：以首帧或可选帧作为裁剪画布，添加缩放适配、选区拖动及数值双向同步；处理后保留动画时长。
- **验收**：无需猜坐标即可完成裁剪，窄窗口能操作，边界错误有即时提示。

### F12 · P3 · 密码强度与 IBAN 结果主要裸露 JSON，缺少面向用户的结论

- **影响入口**：`password-strength`、`iban`
- **复现**：运行合法示例。
- **实际表现**：输出原始 score / guesses / feedback 或 valid / checksumValid JSON，缺少明显结论层与字段释义。
- **影响/预期**：功能存在，但理解成本高；中文用户还需理解英文结果键。
- **代码证据**：[src/lib/SecurityExpansionView.svelte:54](D:/Work/Project/github/dbx-plugin-toolbox/src/lib/SecurityExpansionView.svelte:54)。
- **实测证据**：[screenshots/password-strength-light-1280.png](../output/playwright/audit-20261026/screenshots/password-strength-light-1280.png)；[screenshots/iban-light-1280.png](../output/playwright/audit-20261026/screenshots/iban-light-1280.png)。
- **整改**：增加结论、关键指标和可执行建议；原始 JSON 放在折叠详情，并保留复制。
- **验收**：用户不读 JSON 也能判断强度或有效性；详细数据仍可查看、复制。

### F13 · P3 · 基准比较仅按 ops/s 排名，复利按整月取整

- **影响入口**：`benchmark`、`compound-interest`
- **复现**：基准输入耗时型样本；复利年数输入 0.04。
- **实际表现**：基准固定“越大越快”；复利按 Math.round(years*12) 计算，0.04 年变为0个月。UI 未完整突出这些口径。
- **影响/预期**：对耗时、延迟类基准不适用；短期复利结果可能与用户期望不同。属于能力边界与说明增强，不当作任意精度计算器缺陷。
- **代码证据**：[src/lib/calculators.js:340](D:/Work/Project/github/dbx-plugin-toolbox/src/lib/calculators.js:340)；[src/lib/calculators.js:327](D:/Work/Project/github/dbx-plugin-toolbox/src/lib/calculators.js:327)。
- **实测证据**：[source-probes.json](../output/playwright/audit-20261026/source-probes.json)；[screenshots/benchmark-light-1280.png](../output/playwright/audit-20261026/screenshots/benchmark-light-1280.png)。
- **整改**：增加吞吐/耗时指标方向；复利明确月粒度并显示实际月数，或约束年数为整月步长。
- **验收**：排名方向与所选指标一致；输入不足整月时明确提示实际计算期间。

### F14 · P3 · 部分新工具重复标题、过多说明及内部实现术语占据首屏

- **影响入口**：`figlet`、`lunar-calendar`、`text-speech`、`http-status`、`ipv6-ula`、`temperature`
- **复现**：从工具箱标题栏进入相应页面，尤其在640×600。
- **实际表现**：部分页面再次放置大标题、介绍、徽章与较大卡片间距；农历页出现 lunarConvert()、REQUEST/RESPONSE。温度页还包在通用 expansion-page 内，形成额外留白层。
- **影响/预期**：工具输入与主要结果需要更多滚动，信息密度与 DBX 工作台不一致；内部函数名不能帮助用户完成日期换算。
- **代码证据**：[src/lib/LunarCalendarView.svelte:108](D:/Work/Project/github/dbx-plugin-toolbox/src/lib/LunarCalendarView.svelte:108)；[src/lib/CalculatorSuiteView.svelte:137](D:/Work/Project/github/dbx-plugin-toolbox/src/lib/CalculatorSuiteView.svelte:137)。
- **实测证据**：[screenshots/lunar-calendar-light-1280.png](../output/playwright/audit-20261026/screenshots/lunar-calendar-light-1280.png)；[screenshots/temperature-light-1280.png](../output/playwright/audit-20261026/screenshots/temperature-light-1280.png)；[screenshots/figlet-light-1280.png](../output/playwright/audit-20261026/screenshots/figlet-light-1280.png)。
- **整改**：保留工作台标题，将页面说明压缩为一行；原始数据折叠且默认收起；删除面向用户的实现术语，统一页面 padding 层级。
- **验收**：640×600 首屏可见主要输入和核心操作；技术详情只在用户展开时出现。

## 功能薄弱与已声明的限制

| 工具/能力 | 判断 | 建议 |
|---|---|---|
| JSON对比 | 已有功能正确性缺陷，优先级最高 | 先修保真比较，再增强过滤/导出 |
| Git速查 | 主要短板是布局阻断，不缺命令内容 | 先恢复全部命令可达，之后再优化收藏/检索 |
| GIF裁剪 | 数值处理已能跑通，空间交互弱 | 首帧选区和动画预览；不急于增加更多参数 |
| 密码强度/IBAN | JSON有数据但结论呈现弱，输入变化后有旧结果风险 | 结果有效性优先，其次做结论卡片 |
| PDF压缩 | 实现以清理元数据/缩略图与重写结构为主；页面已说明扫描件不保证缩小 | 这是已披露能力边界；若产品目标为扫描件压缩，再增加降采样和质量选项 |
| PDF签名检查 | 本地解析/内容完整性不等于系统信任、撤销、时间戳认证；报告已明确声明未执行这些检查 | 保留边界说明，不能改成笼统“签名可信” |
| PDF可视签名 | 属于图片/手写盖章，不等于证书数字签名 | 保持命名区分，增加页面定位预览属于增强 |
| OCR | 需单独下载模型；干净安装不能立即识别，但界面有模型管理与禁用状态 | 提供有体积、下载状态和重试的首用流程；真实识别准确率仍待样本评测 |
| 工作日/农历 | 中国法定假期依赖内置年份，农历范围1900–2100；均有边界提示 | 不把超范围当缺陷，增加数据版本可见性与维护回归 |
| 网络工具 | cURL工具是代码转换；设备信息来自WebView；并非完整HTTP客户端或系统硬件检测 | 当前命名/说明应持续精确，不将未承诺能力计为缺陷 |
| Web Meta图片预览 | 生成HTML可用；远程图片在插件CSP下不允许普通外链img | 增加本地图片预览或清楚说明，避免为预览放宽权限 |
| 基准比较/复利 | 当前只覆盖吞吐与月粒度模型 | 增加指标方向/计算期间说明；详见F13 |
| 批量/大文件 | 存在输入和像素限制，但不能用几个小样例推断大文件可靠性 | 为文件类建立可重复的小/中/大样例及取消恢复验收 |

## 分批整改路线

1. **第一批：正确性和核心阻断**。修F01、F02、F03、F04；为JSON大整数、Git内容高度、任务遮挡和PDF多页面预算增加行为回归。完成后人工复验明暗主题三尺寸。
2. **第二批：公共交互**。修F05、F06、F08、F09、F10；先解决首次导入和过期结果，再处理控件反馈与国际化。共同组件修复后列明受影响入口，不能只验一个页面。
3. **第三批：视觉一致性**。修F07、F14；提炼紧凑表单、双栏工作区、文件预览、结果面板模板。使用现有tokens，保留工具特有的画布/图表色彩。
4. **第四批：能力增强与补验**。按F11–F13补GIF裁剪、结果解释和计算口径；补齐真实DBX、磁盘导出、OCR推理、保险库、取消恢复矩阵。先完成这些验收，再考虑扩充新工具。

不建议同时重做全部页面。公共组件问题修复收益最大，算法缺陷与生命周期问题必须先于视觉翻新。

## 全部工具覆盖矩阵

“布局6态”表示该入口实际截图覆盖明暗×三种尺寸；不表示零缺陷。“样例操作已验”只表示本轮记录的正常操作，不涵盖所有参数和磁盘导出。F08为开发宿主公共主按钮问题；关联列表按可能使用范围列出，不代表每页每个控件都失效。

| # | 工具（ID） | 入口 | 布局6态 | 交互/功能记录 | 复制反馈 | 关联问题 |
|---|---|---|---|---|---|---|
| 1 | JSON 工作台（`json`） | 可见 | 6/6 | 样例操作已验 | 未验证/不适用 | F08 |
| 2 | 数据格式转换（`data-convert`） | 可见 | 6/6 | 输出/复制已验 | 已复制 | F08 |
| 3 | 代码格式化（`code-format`） | 可见 | 6/6 | 输出/复制已验 | 已复制 | F08 |
| 4 | 电子表格（`spreadsheet`） | 可见 | 6/6 | 只读/默认态；补充见备注 | 未验证/不适用 | F08 |
| 5 | 图表生成器（`chart`） | 可见 | 6/6 | 只读/默认态；补充见备注 | 未验证/不适用 | F08 |
| 6 | Base 编解码（`base64`） | 可见 | 6/6 | 输出/复制已验 | 已复制 | F08 |
| 7 | URL 编解码（`url`） | 可见 | 6/6 | 输出/复制已验 | 已复制 | F08 |
| 8 | 字符转义（`html-entities`） | 可见 | 6/6 | 输出/复制已验 | 已复制 | F08 |
| 9 | SQL 转义（`sql-escape`） | 可见 | 6/6 | 输出/复制已验 | 已复制 | F08 |
| 10 | Data URI（`data-uri`） | 可见 | 6/6 | 输出/复制已验 | 已复制 | F08 |
| 11 | Punycode / IDN（`punycode`） | 可见 | 6/6 | 只读/默认态；补充见备注 | 未验证/不适用 | F08 |
| 12 | Quoted-Printable（`quoted-printable`） | 可见 | 6/6 | 输出/复制已验 | 已复制 | F08 |
| 13 | 时间戳转换（`timestamp`） | 可见 | 6/6 | 输出/复制已验 | 已复制 | F08 |
| 14 | 颜色与对比度（`color`） | 可见 | 6/6 | 只读/默认态；补充见备注 | 未验证/不适用 | F08 |
| 15 | Cron 表达式（`cron`） | 可见 | 6/6 | 输出/复制已验 | 已复制 | F08 |
| 16 | 进制转换（`base-convert`） | 可见 | 6/6 | 样例操作已验 | 未验证/不适用 | F08 |
| 17 | 电话号码解析（`phone`） | 可见 | 6/6 | 输出/复制已验 | 已复制 | F08 |
| 18 | 带宽与传输（`bandwidth`） | 可见 | 6/6 | 输出/复制已验 | 已复制 | F08 |
| 19 | IP 子网计算（`network-calc`） | 可见 | 6/6 | 样例操作已验 | 未验证/不适用 | F08 |
| 20 | 端口进程（`windows-port`） | 可见 | 6/6 | 端口只读查询；终止未执行 | 未验证/不适用 | F08 |
| 21 | User-Agent 解析器（`user-agent`） | 可见 | 6/6 | 输出/复制已验 | 已复制 | F08 |
| 22 | 设备信息（`device-info`） | 可见 | 6/6 | 输出/复制已验 | 已复制 | F08 |
| 23 | 键盘事件检查器（`keyboard-event`） | 可见 | 6/6 | 键盘事件触发已验 | 已复制 | F08 |
| 24 | 文本处理（`whitespace`） | 可见 | 6/6 | 输出/复制已验 | 已复制 | F08 |
| 25 | 文本 Gzip（`gzip`） | 可见 | 6/6 | 样例操作已验 | 未验证/不适用 | F08 |
| 26 | 正则测试（`regex`） | 可见 | 6/6 | 输出/复制已验 | 已复制 | F08 |
| 27 | 文本对比（`diff`） | 可见 | 6/6 | 输出/复制已验 | 复制结构化 JSON | F08 |
| 28 | Markdown 编辑与预览（`markdown`） | 可见 | 6/6 | 输出/复制已验 | 复制 HTML | F08 |
| 29 | Unicode 检查（`unicode-inspect`） | 可见 | 6/6 | 输出/复制已验 | 已复制 | F08 |
| 30 | cURL 转代码（`http-request`） | 可见 | 6/6 | 输出/复制已验 | 已复制 | F08 |
| 31 | Docker Run 与 Compose 互转（`docker-convert`） | 可见 | 6/6 | 输出/复制已验 | 已复制 | F08 |
| 32 | Git 速查（`git-reference`） | 可见 | 6/6 | 布局确认缺陷；列表/复制受裁切 | 已复制 | F02、F08 |
| 33 | Web Meta 生成器（`web-meta`） | 可见 | 6/6 | 输出/复制已验 | 已复制 | F08 |
| 34 | HTML 在线预览（`html-playground`） | 可见 | 6/6 | 只读/默认态；补充见备注 | 未验证/不适用 | F08 |
| 35 | 哈希校验（`hash`） | 可见 | 6/6 | 输出/复制已验 | 已复制 | F08 |
| 36 | 文件格式识别（`file-type`） | 可见 | 6/6 | 只读/默认态；补充见备注 | 未验证/不适用 | F08 |
| 37 | JWT 解码、签发与验签（`jwt`） | 可见 | 6/6 | 输出/复制已验 | 已复制 | F08 |
| 38 | AES 加密（`aes`） | 可见 | 6/6 | 输出/复制已验 | 已复制 | F08 |
| 39 | SM4 国密加密（`sm4`） | 可见 | 6/6 | 输出/复制已验 | 已复制 | F08 |
| 40 | HMAC 消息认证（`hmac-sha256`） | 可见 | 6/6 | 输出/复制已验 | 已复制 | F08 |
| 41 | RSA-OAEP 加密与解密（`rsa-oaep`） | 可见 | 6/6 | 输出/复制已验 | 已复制 | F08 |
| 42 | RSA-PKCS#1 v1.5 加密与解密（`rsa-pkcs1`） | 可见 | 6/6 | 输出/复制已验 | 已复制 | F08 |
| 43 | RSA 加密（`rsa`） | 兼容 | 6/6 | 输出/复制已验 | 已复制 | F08 |
| 44 | SM2 国密加密（`sm2`） | 可见 | 6/6 | 输出/复制已验 | 已复制 | F08 |
| 45 | ChaCha20-Poly1305 加密（`chacha20-poly1305`） | 可见 | 6/6 | 鼠标受阻；键盘完成 | 已复制 | F03、F08 |
| 46 | XChaCha20-Poly1305 加密（`xchacha20-poly1305`） | 可见 | 6/6 | 鼠标受阻；键盘完成 | 已复制 | F03、F08 |
| 47 | AES-256-GCM-SIV 加密（`aes-gcm-siv`） | 可见 | 6/6 | 鼠标受阻；键盘完成 | 已复制 | F03、F08 |
| 48 | AES-256-SIV 加密（`aes-siv`） | 可见 | 6/6 | 鼠标受阻；键盘完成 | 已复制 | F03、F08 |
| 49 | AES-256-CCM 加密（`aes-ccm`） | 可见 | 6/6 | 鼠标受阻；键盘完成 | 已复制 | F03、F08 |
| 50 | 现代认证加密（`modern-aead`） | 兼容 | 6/6 | 鼠标受阻；键盘完成 | 已复制 | F03、F08 |
| 51 | Argon2id 密钥派生（`argon2id-kdf`） | 可见 | 6/6 | 输出/复制已验 | 已复制 | F03、F08 |
| 52 | scrypt 密钥派生（`scrypt-kdf`） | 可见 | 6/6 | 输出/复制已验 | 已复制 | F03、F08 |
| 53 | PBKDF2-HMAC-SHA256 密钥派生（`pbkdf2-kdf`） | 可见 | 6/6 | 样例操作已验 | 未验证/不适用 | F03、F08 |
| 54 | HKDF-SHA256 密钥派生（`hkdf`） | 可见 | 6/6 | 样例操作已验 | 未验证/不适用 | F03、F08 |
| 55 | 密钥派生 KDF（`kdf`） | 兼容 | 6/6 | 输出/复制已验 | 已复制 | F03、F08 |
| 56 | RSA-PSS-SHA256 签名与验签（`rsa-pss-signature`） | 可见 | 6/6 | 输出/复制已验 | 已复制 | F08 |
| 57 | RSA-PKCS#1 v1.5-SHA256 签名与验签（`rsa-pkcs1-signature`） | 可见 | 6/6 | 输出/复制已验 | 已复制 | F08 |
| 58 | SM2-SM3 签名与验签（`sm2-sm3-signature`） | 可见 | 6/6 | 输出/复制已验 | 已复制 | F08 |
| 59 | 数字签名与验签（`signature`） | 兼容 | 6/6 | 输出/复制已验 | 已复制 | F08 |
| 60 | AES 密钥包装（`key-wrap`） | 可见 | 6/6 | 输出/复制已验 | 已复制 | F03、F08 |
| 61 | AES-XTS 存储加密（`storage-crypto`） | 可见 | 6/6 | 输出/复制已验 | 已复制 | F03、F08 |
| 62 | AES-FF1 格式保持加密（`format-preserving`） | 可见 | 6/6 | 输出/复制已验 | 已复制 | F03、F08 |
| 63 | AES-CMAC 消息认证（`aes-cmac`） | 可见 | 6/6 | 输出/复制已验 | 已复制 | F03、F08 |
| 64 | AES-128-GMAC 消息认证（`aes-128-gmac`） | 可见 | 6/6 | 鼠标受阻；键盘完成 | 已复制 | F03、F08 |
| 65 | AES-256-GMAC 消息认证（`aes-256-gmac`） | 可见 | 6/6 | 鼠标受阻；键盘完成 | 已复制 | F03、F08 |
| 66 | AES-CMAC / GMAC 消息认证（`aes-mac`） | 兼容 | 6/6 | 鼠标受阻；键盘完成 | 已复制 | F03、F08 |
| 67 | HPKE 混合公钥加密（`hpke`） | 可见 | 6/6 | 输出/复制已验 | 已复制 | F08 |
| 68 | ML-KEM 后量子密钥封装（`ml-kem`） | 可见 | 6/6 | 输出/复制已验 | 已复制 | F08 |
| 69 | TOTP 验证码生成（`totp`） | 可见 | 6/6 | 手动口令已验；持久账户待验 | 未验证/不适用 | F08 |
| 70 | 证书与 SSH 检查（`cert`） | 可见 | 6/6 | 输出/复制已验 | 已复制 | F08 |
| 71 | JWK / JWKS 校验与转换（`jwk`） | 可见 | 6/6 | 输出/复制已验 | 已复制 | F08 |
| 72 | AES / SM4 / HMAC 密钥生成（`symmetric-key-generator`） | 可见 | 6/6 | 输出/复制已验 | 已复制 | F08 |
| 73 | RSA 密钥对生成（`rsa-key-generator`） | 可见 | 6/6 | 输出/复制已验 | 已复制 | F08 |
| 74 | SM2 国密密钥对生成（`sm2-key-generator`） | 可见 | 6/6 | 输出/复制已验 | 已复制 | F08 |
| 75 | 密钥生成（`key-generator`） | 兼容 | 6/6 | 输出/复制已验 | 已复制 | F08 |
| 76 | XOR（调试）（`xor`） | 可见 | 6/6 | 样例操作已验 | 未验证/不适用 | F08 |
| 77 | 唯一 ID（`uuid`） | 可见 | 6/6 | 输出/复制已验 | 已复制 | F08 |
| 78 | 随机密码（`password`） | 可见 | 6/6 | 输出/复制已验 | 已复制 | F08 |
| 79 | 随机字节（`random-bytes`） | 可见 | 6/6 | 输出/复制已验 | 已复制 | F08 |
| 80 | 二维码 / 条码（`qrcode`） | 可见 | 6/6 | 样例操作已验 | 未验证/不适用 | F08 |
| 81 | 重复文本（`lorem`） | 可见 | 6/6 | 输出/复制已验 | 已复制 | F08 |
| 82 | 假数据生成（`fake-data`） | 可见 | 6/6 | 输出/复制已验 | 已复制 | F08 |
| 83 | 图片编辑（`image-process`） | 可见 | 6/6 | 确认后完成样例 | 未验证/不适用 | F05、F08 |
| 84 | 占位图（`image-generate`） | 可见 | 6/6 | 样例操作已验；补充探针已验 | 未验证/不适用 | F08 |
| 85 | 图片压缩与格式转换（`image-compress`） | 可见 | 6/6 | 确认后完成样例 | 未验证/不适用 | F05、F08 |
| 86 | 图片切图（`image-grid`） | 可见 | 6/6 | 确认后完成样例；补充探针已验 | 未验证/不适用 | F05、F08 |
| 87 | 图片像素化（`image-pixelate`） | 可见 | 6/6 | 确认后完成样例 | 未验证/不适用 | F05、F08 |
| 88 | 图片与 Base64（`image-base64`） | 可见 | 6/6 | 确认后完成样例 | 已复制 | F05、F08 |
| 89 | 图片拼接（`image-stitch`） | 可见 | 6/6 | 确认后完成样例 | 未验证/不适用 | F05、F08 |
| 90 | GIF 动画生成（`gif-tools`） | 可见 | 6/6 | 确认后完成样例 | 未验证/不适用 | F05、F08 |
| 91 | 图片文字识别（`image-ocr`） | 可见 | 6/6 | 模型管理/文件已验；识别待验；补充探针已验 | 复制 | F08 |
| 92 | .env 管理（`dotenv`） | 可见 | 6/6 | 样例操作已验 | 未验证/不适用 | F08 |
| 93 | 语义版本比较（`semver`） | 可见 | 6/6 | 输出/复制已验 | 已复制 | F08 |
| 94 | chmod 权限计算（`chmod`） | 可见 | 6/6 | 输出/复制已验 | 已复制 | F08 |
| 95 | HTTP 状态码速查（`http-status`） | 可见 | 6/6 | 输出/复制已验 | 已复制 | F08、F14 |
| 96 | JSON 结构对比（`json-diff`） | 可见 | 6/6 | 输出/复制已验 | 已复制 | F01、F08 |
| 97 | YAML 树形查看（`yaml-tree`） | 可见 | 6/6 | 输出/复制已验 | 已复制 | F08 |
| 98 | Basic Auth 生成器（`basic-auth`） | 可见 | 6/6 | 输出/复制已验 | 已复制 | F08 |
| 99 | SafeLink 解码（`safelink`） | 可见 | 6/6 | 输出/复制已验 | 已复制 | F08 |
| 100 | 正则语法速查（`regex-reference`） | 可见 | 6/6 | 输出/复制已验 | 已复制 | F08 |
| 101 | Wi-Fi 二维码（`wifi-qr`） | 可见 | 6/6 | 样例操作已验 | 未验证/不适用 | F08 |
| 102 | 罗马数字转换（`roman`） | 可见 | 6/6 | 输出/复制已验 | 已复制 | F08 |
| 103 | MAC 地址生成（`mac-generator`） | 可见 | 6/6 | 输出/复制已验 | 已复制 | F08 |
| 104 | IPv6 ULA 生成（`ipv6-ula`） | 可见 | 6/6 | 输出/复制已验 | 已复制 | F08、F14 |
| 105 | IPv4 范围与汇总（`ipv4-range`） | 可见 | 6/6 | 输出/复制已验 | 已复制 | F08 |
| 106 | 数学表达式计算（`math-expression`） | 可见 | 6/6 | 输出/复制已验 | 已复制 | F08 |
| 107 | 单位换算（`unit-converter`） | 可见 | 6/6 | 输出/复制已验 | 复制 | F07、F08 |
| 108 | 百分比计算（`percentage`） | 可见 | 6/6 | 输出/复制已验 | 已复制 | F08 |
| 109 | 数值统计（`statistics`） | 可见 | 6/6 | 输出/复制已验 | 已复制 | F08 |
| 110 | 工作日计算（`business-days`） | 可见 | 6/6 | 输出/复制已验 | 已复制 | F08、F09、F10 |
| 111 | 温度换算（`temperature`） | 可见 | 6/6 | 输出/复制已验 | 已复制 | F08、F14 |
| 112 | ETA 预计完成时间（`eta`） | 可见 | 6/6 | 样例操作已验 | 未验证/不适用 | F08 |
| 113 | 秒表与计次（`stopwatch`） | 可见 | 6/6 | 样例操作已验 | 未验证/不适用 | F07、F08 |
| 114 | 基准测试结果对比（`benchmark`） | 可见 | 6/6 | 输出/复制已验 | 已复制 | F07、F08、F13 |
| 115 | 复利计算（`compound-interest`） | 可见 | 6/6 | 输出/复制已验 | 已复制 | F07、F08、F13 |
| 116 | Bcrypt 哈希与校验（`bcrypt`） | 可见 | 6/6 | 输出/复制已验 | 已复制 | F06、F08 |
| 117 | 密码强度分析（`password-strength`） | 可见 | 6/6 | 输出/复制已验 | 已复制 | F06、F08、F12 |
| 118 | IBAN 校验（`iban`） | 可见 | 6/6 | 输出/复制已验 | 已复制 | F06、F08、F12 |
| 119 | BIP39 助记词（`bip39`） | 可见 | 6/6 | 输出/复制已验 | 已复制 | F06、F08 |
| 120 | Figlet 字符横幅（`figlet`） | 可见 | 6/6 | 输出/复制已验 | 已复制 | F08、F14 |
| 121 | 数字缩写（Numeronym）（`numeronym`） | 可见 | 6/6 | 输出/复制已验 | 已复制 | F08 |
| 122 | 英文单复数转换（`english-plural`） | 可见 | 6/6 | 输出/复制已验 | 已复制 | F08 |
| 123 | 邮箱规范化（`email-normalizer`） | 可见 | 6/6 | 输出/复制已验 | 已复制 | F08 |
| 124 | URL 提取（`url-extractor`） | 可见 | 6/6 | 输出/复制已验 | 已复制 | F08 |
| 125 | Emoji 选择器（`emoji-picker`） | 可见 | 6/6 | 只读/默认态；补充见备注 | 未验证/不适用 | F07、F08 |
| 126 | 配色方案生成（`color-palette`） | 可见 | 6/6 | 输出/复制已验 | 已复制 | F08 |
| 127 | HTML 富文本编辑器（`rich-text`） | 可见 | 6/6 | 只读/默认态；补充见备注 | 未验证/不适用 | F08 |
| 128 | 农历阳历转换（`lunar-calendar`） | 可见 | 6/6 | 输出/复制已验 | 已复制 | F08、F09、F10、F14 |
| 129 | GIF 压缩（`gif-compress`） | 可见 | 6/6 | 样例操作已验 | 未验证/不适用 | F08 |
| 130 | GIF 裁剪（`gif-crop`） | 可见 | 6/6 | 样例操作已验 | 未验证/不适用 | F08、F11 |
| 131 | GIF 帧编辑（`gif-frames`） | 可见 | 6/6 | 样例操作已验 | 未验证/不适用 | F08 |
| 132 | 文字朗读（`text-speech`） | 可见 | 6/6 | 本地语音开始/暂停/停止已验（静音） | 未验证/不适用 | F08、F14 |
| 133 | PDF 合并（`pdf-merge`） | 可见 | 6/6 | 完成处理；磁盘保存待验 | 未验证/不适用 | F04、F08 |
| 134 | PDF 拆分（`pdf-split`） | 可见 | 6/6 | 完成处理；磁盘保存待验 | 未验证/不适用 | F04、F08 |
| 135 | PDF 页面整理（`pdf-organize`） | 可见 | 6/6 | 完成处理；磁盘保存待验 | 未验证/不适用 | F04、F08 |
| 136 | PDF 页面旋转（`pdf-rotate`） | 可见 | 6/6 | 完成处理；磁盘保存待验 | 未验证/不适用 | F04、F08 |
| 137 | PDF 删除页面（`pdf-delete`） | 可见 | 6/6 | 完成处理；磁盘保存待验 | 未验证/不适用 | F04、F08 |
| 138 | PDF 提取页面（`pdf-extract`） | 可见 | 6/6 | 完成处理；磁盘保存待验 | 未验证/不适用 | F04、F08 |
| 139 | PDF 文字水印（`pdf-watermark`） | 可见 | 6/6 | 完成处理；磁盘保存待验 | 未验证/不适用 | F04、F08 |
| 140 | PDF 添加页码（`pdf-page-numbers`） | 可见 | 6/6 | 完成处理；磁盘保存待验 | 未验证/不适用 | F04、F08 |
| 141 | PDF 页面裁剪（`pdf-crop`） | 可见 | 6/6 | 完成处理；磁盘保存待验 | 未验证/不适用 | F04、F08 |
| 142 | PDF 手写与图片签名（`pdf-visual-signature`） | 可见 | 6/6 | 完成处理；磁盘保存待验 | 未验证/不适用 | F04、F08 |
| 143 | PDF 转图片（`pdf-images`） | 可见 | 6/6 | 完成处理；磁盘保存待验 | 未验证/不适用 | F04、F08 |
| 144 | PDF 压缩（`pdf-compress`） | 可见 | 6/6 | 完成处理；磁盘保存待验 | 未验证/不适用 | F04、F08 |
| 145 | PDF 密码加密（`pdf-encrypt`） | 可见 | 6/6 | 完成处理；磁盘保存待验 | 未验证/不适用 | F04、F08 |
| 146 | PDF 密码解密（`pdf-decrypt`） | 可见 | 6/6 | 完成处理；磁盘保存待验 | 未验证/不适用 | F04、F08 |
| 147 | PDF 数字签名检查（`pdf-signature-check`） | 可见 | 6/6 | 完成处理；磁盘保存待验 | 已复制 | F04、F08 |

完整机器可读记录：[coverage.json](../output/playwright/audit-20261026/coverage.json)、[coverage.csv](../output/playwright/audit-20261026/coverage.csv)。视图及依赖扫描：[static-inventory.json](../output/playwright/audit-20261026/static-inventory.json)。问题清单：[findings.json](../output/playwright/audit-20261026/findings.json)。

### 证据索引

- 逐页截图：[screenshots/](../output/playwright/audit-20261026/screenshots/)；按工具ID、主题、尺寸命名。
- 视觉联系表：[contact-sheets/](../output/playwright/audit-20261026/contact-sheets/)，便于并排比较；原图用于判断细节。
- 逐入口初始/示例/布局记录：`batch-0.json … batch-144.json`，每批6个入口。
- 有效输入流程与输出：`flow-0.json … flow-144.json`；`mouseBlocked`保存真实点击失败，`keyboard fallback`标识绕过后的功能验证，不能计为鼠标交互通过。
- 专项：[ui-probes.json](../output/playwright/audit-20261026/ui-probes.json)、[shell-probes.json](../output/playwright/audit-20261026/shell-probes.json)、[source-probes.json](../output/playwright/audit-20261026/source-probes.json)、[pdf-session-probe.json](../output/playwright/audit-20261026/pdf-session-probe.json)、[final-probes.json](../output/playwright/audit-20261026/final-probes.json)。
- 首轮脚本曾因`.pane`重名、文件选择器和隐藏input误定位中断；最终882态记录已重跑补齐，不将这些脚本错误列为产品缺陷。

### 本轮交付验收

- [x] 全部147入口均有覆盖记录，141可见入口数量已核对。
- [x] 全部入口明暗×三尺寸采集完成，重要问题有源码和实际证据。
- [x] 输出优先级、复现、影响、建议、验收条件与分批路线。
- [x] 保留未提交源码改动；未发布或安装候选包。
- [ ] 全部入口磁盘导出、重开文件验证。
- [ ] 当前源码构建在真实DBX WebView中的完整复验。
- [ ] OCR真实模型、保险库全流程、全部复杂长任务失败/取消恢复矩阵。

覆盖校验：147行覆盖齐全；882个布局样本齐全；147行浏览器流程记录齐全。

## F01–F14 修复记录（2026-10-26）

本节记录审查后的实现，前文保留为修复前基线。14 项均已落实到当前工作区代码，未创建 Git 提交、发布或安装候选包，保留原有未提交工作。实现完成不等于所有验收完成；原生保存、真实 DBX 和最终构建全尺寸复验的剩余限制见下文。

修复输出目录为 [output/fix-ui-20261026](../output/fix-ui-20261026/)，与初次审查目录分离。最终源码摘要见 [final-source-hashes.json](../output/fix-ui-20261026/final-source-hashes.json)。DBX 对照仓库仍为 `ff99d00b59abc329c104b77ced1487f78967ac83`；本轮没有修改宿主源码或插件权限。

### 修改与逐项证据

| 项目 | 实现与代码位置 | 验证及剩余限制 |
|---|---|---|
| F01 · JSON 精度 | `developerExpansion.js`、`jsonPrecision.js`、`JsonDiffView.svelte`：保真解析、比较、格式化、展示和结果复制；LosslessNumber 不参与对象字段递归。使用 lossless-json 比较归一化系数，指数以 BigInt 归一化，绕过库对超大指数转 Number 的限制。 | 行为测试覆盖 `1 / 1.0 / 1e0`、正负零、大整数、`1e999` 和超过 2^53 的指数。浏览器实际区分 9007199254740992 / 9007199254740993。[ui-probes.json](../output/fix-ui-20261026/ui-probes.json)、[截图](../output/fix-ui-20261026/screenshots/probe-json-diff-integer.png)。 |
| F02 · Git 裁切 | `UtilitySuiteView.svelte`：网格成为独立滚动区，使用内容行高，卡片和标题不收缩。 | 1280、900、640 宽度均实测，卡片高度随内容展开（例如 621px），滚动区内容高度可达 6106px；全部 66 条命令保留。见 ui-probes 的 `git-reference-layout` 和 [640 截图](../output/fix-ui-20261026/screenshots/probe-git-640.png)。 |
| F03 · 操作遮挡 | `App.svelte`、`TaskCenter.svelte`：任务入口位于 main 的正常文档流底部状态栏，列表向上展开。 | PDF 任务产生后，正文下边界和状态栏上边界均为 611px；正文主按钮中心命中实际按钮，真实鼠标点击成功。[pdf-probes.json](../output/fix-ui-20261026/pdf-probes.json)、[截图](../output/fix-ui-20261026/screenshots/task-footer-mouse.png)。 |
| F04 · PDF 会话 | 新增 `pdfSessionPool.js`，接入 `nativePdf.js`、`PdfToolView.svelte`、`sessionState.js`。串行准入与释放，保留四会话上限；仅自动释放没有未保存结果、没有运行任务的会话。占用清单提供返回、保存、确认关闭和重试，关闭回调等待清理完成。 | 实际创建旋转、拆分、提取、裁剪四份未保存结果，第五个页面列出四个占用工具；确认关闭后重试成功。随后自动回收闲置页，回到原页仍保留 sample.pdf，可重新读取。并发准入、容量拒绝、清理失败保留占用亦有行为测试。[pdf-probes.json](../output/fix-ui-20261026/pdf-probes.json)、[容量截图](../output/fix-ui-20261026/screenshots/pdf-fifth-blocked.png)。原生保存后的回收尚未完成端到端验收。 |
| F05 · 首次导入 | `ToolSession.svelte`、`sessionInteractions.js`：file input 不写入通用 dirty；替换保护继续根据已有会话状态判断。 | 行为测试区分首次导入和已有未保存内容；首次导入 GIF 无确认弹层，PDF 多页首次导入可直接完成。见 critical-probes 的 `firstImportConfirmation:false`。 |
| F06 · 过期结果 | `SecurityExpansionView.svelte`：四类工具记录完整执行参数；异步使用捕获参数，生成助记词也防止覆盖执行期间的编辑。旧结果保留且明确标为过期；`CopyButton.svelte` 支持 disabled，并在复制处理函数内再次检查。 | IBAN、bcrypt、密码强度、BIP39 均实测执行前可复制、编辑后禁用复制。另有参数快照行为测试。[critical-probes.json](../output/fix-ui-20261026/critical-probes.json)。 |
| F07 · 主题一致性 | 单位换算、秒表、基准、复利、Emoji 的容器采用 radius tokens，秒表采用共享中性阴影；保留图表和状态颜色。 | 五页注入紫色主色、Arial / Courier 字体和 0px 圆角，抽查容器与工作台按钮均为 0px。见 ui-probes 的 `custom-theme-font-radius`；主题守卫测试通过。 |
| F08 · 主按钮文字 | `app.css`：基础控件继承重置改用 `:where(...)`，不覆盖主按钮前景 token。 | 明暗模式分别得到浅字深底、深字浅底，计算色与 primary-foreground token 相符。见 ui-probes 的 `primary-button-contrast`。真实 DBX 当前修复构建未加载。 |
| F09 · 日期草稿 | `DatePicker.svelte` 保留非法草稿和关联错误，合法提交才更新 value；`BusinessDaysView.svelte`、`LunarCalendarView.svelte` 绑定有效性，草稿未提交或非法时不继续展示旧日期计算结果。 | 输入 2026-02-30 并失焦后原文保留，显示范围错误，未静默恢复旧日期；640×600 弹层底边 584px，位于视口内。见 ui-probes 的 `datepicker-boundary-validation`。 |
| F10 · 日期本地化 | DatePicker 导航、年份/月选择和底部按钮进入翻译体系，保留 Escape 返回触发按钮的逻辑；焦点样式使用共享 token。 | 英文实测底部为 Close / Today，导航标签已本地化。见 [英文截图](../output/fix-ui-20261026/screenshots/probe-datepicker-en.png)。 |
| F11 · GIF 可视裁剪 | 新增 `CropSelection.svelte`、`cropGeometry.js`；首帧底图，支持拖动、右下角缩放、边界限制、原图像素坐标和数值双向同步；方向键移动、Alt 缩放、Shift 加速。预览高度控制在约 300px。 | 16×16 隔离 GIF 拖拽得到 8×8，方向键后坐标为 1,1，数值改宽 6 后选区宽 37.5%，实际生成 GIF 为 6×8。[gif-probe.json](../output/fix-ui-20261026/gif-probe.json)、[截图](../output/fix-ui-20261026/screenshots/gif-crop-final.png)。原生磁盘保存与重开未计为通过。 |
| F12 · 结果呈现 | 安全工具增加状态、IBAN 有效性/国家代码/实际与预期长度/校验和，以及密码强度等级/分数/估算猜测次数/本地化建议。原始 JSON 默认折叠，展开状态绑定保留；库的英文详细建议只在英文摘要显示，原始结果完整保留。 | IBAN 和密码强度实测生成摘要；编辑后状态变为过期，原始值仍可查看且复制禁用。四工具专项通过。最终非英文建议显示条件仅完成构建检查，未再次浏览器复验。 |
| F13 · 计算口径 | `calculators.js`、`BenchmarkView.svelte` 增加吞吐量/耗时模式，默认吞吐量；耗时升序且相对性能为最佳耗时/当前耗时。复利保留月粒度算法，在非整月年数输入时明确提示取整月数，继续输出实际月数。 | 排名和相对性能有行为测试，原有计算测试通过。新模式与月数提示已构建；最终双语和全尺寸鼠标复验尚待补齐。 |
| F14 · 页面密度 | Figlet、朗读、IPv6 ULA、HTTP 状态、温度去除重复标题；六页压缩外层留白和间距，温度移除额外 padding，农历移除实现术语，原始数据默认折叠。 | 全量布局采集后继续做了最终密度微调；英文 640px 的朗读等页面有补验，不能据此宣称最终六页所有尺寸均验收完成。最终密度全尺寸复验待补。 |

### 自动化回归结果

- 前端 `npm test`：473 项，470 通过、0 失败、3 跳过。新增 JSON 精度、PDF 准入/释放、首次导入、结果失效、基准排名和裁剪边界行为测试，见 `tests/audit-fixes.test.js`。未删除失败断言。
- Demo 消费守卫兼容同一声明中的逗号变量以及两种比较顺序；错误本地化守卫增加变量词边界，避免将派生显示变量 currentError 的后缀当成原始 error 赋值。保护要求仍保留。
- `npm run build`：通过。最终仍有原先 CipherView、YamlTreeView 的无效 CSS 选择器警告，未借此修改无关实现。
- 后端 `cargo test --manifest-path backend/Cargo.toml`：101 通过、0 失败、1 忽略。运行本地权限测试使用宿主权限，数据为隔离测试样例，未对用户进程执行端口终止操作。
- `npm run i18n:check`：来源登记通过，2983 条已登记；质量预算仍失败，属于修复前已有的八语言英文回退积压。新增 43 条文案均已补齐八种非英文翻译，无新增回退，现存各语言回退总数比审查快照减少 4。没有放宽预算。见 [translation-delta.json](../output/fix-ui-20261026/translation-delta.json)。

日志：[frontend-final.log](../output/fix-ui-20261026/frontend-final.log)、[build-final.log](../output/fix-ui-20261026/build-final.log)、[backend-tests.log](../output/fix-ui-20261026/backend-tests.log)、[i18n-check.log](../output/fix-ui-20261026/i18n-check.log)。

### 页面覆盖与验收边界

修复首轮构建完成了全部 147 入口、明暗主题和三种尺寸，共 882 份截图，没有捕获页面运行时异常或批处理异常。逐入口记录见 [coverage.json](../output/fix-ui-20261026/coverage.json)、[coverage.csv](../output/fix-ui-20261026/coverage.csv)，汇总见 [layout-summary.json](../output/fix-ui-20261026/layout-summary.json)。这项记录证明采集覆盖，不代表所有布局均无问题。

全量采集后，继续修正了极端指数比较、原始结果展开状态、GIF 预览尺寸和部分页面密度，并完成上述关键专项。最终构建尚未重新跑满 882 态，因此矩阵明确记录 `finalBuildFullMatrix:false`。`ui-probes.json` 内第一次 IBAN 脚本遇到折叠区定位超时，修复展开状态后四工具的实际复制禁用结果以 `critical-probes.json` 为准；GIF 首次脚本未把手柄滚到可见范围，最终拖拽结果以 `gif-probe.json` 为准，不把前者当通过证据。

剩余未通过/未完成项目：

1. **原生保存与文件重开**：受控浏览器流程生成 6×8 的 GIF；第一次原生保存返回 cancelled，第二次宿主回调报告保存成功。停止界面控制后，将该保存文件复制到隔离证据目录并用 gifuct-js 重新解码，得到 177 字节、14×9、3 帧，全部帧可解码，见 [export-reopen.json](../output/fix-ui-20261026/export-reopen.json)。其尺寸与此前受控 6×8 样本不同，两次观察之间系统窗口并非独占控制，不能确认来自同一选区，因此不能算作指定裁剪结果的保存与重开验收通过，也不据此直接断言产品导出缺陷。computer-use 因无法可靠识别当前浏览器 URL 而终止本轮界面控制；随后停止相关 UI 操作。浏览器重新导入、选区与落盘结果一致性待补验，未把取消保存或仅在内存中生成结果计为磁盘导出通过。
2. **真实 DBX**：确认本机 DBX 可用，但未安装或加载本次修复构建；只读环境检查不能代替当前版本 WebView、主题和桥接验收。没有操作数据库、真实保险库或修改用户设置。
3. **OCR 与保险库**：隔离环境没有完成真实模型推理，真实保险库按边界未操作。后端测试通过不能替代这两项端到端验收。
4. **最终布局与增强流程**：最终 882 态、F13 模式选择与复利取整提示的双语鼠标流程、长任务全部取消/失败组合仍需补验。

后续验收应先使用本次源码哈希对应构建补齐上述四项，再关闭验收清单；本轮可确认代码修复和已列出的自动化、开发宿主专项结果。
