# 工具箱：发版与更新说明操作手册

本文说明 `io.github.aili0617.toolbox` 如何发版、如何写入 **更新记录（releaseNotes）**，以及用户如何在 DBX 客户端查看。适用于本仓库当前流程（GitHub Release + `plugin-release.yml` + `t8y2/dbx-store`）。

---

## 1. 核心概念（先读这段）

| 概念 | 含义 |
| --- | --- |
| 更新记录 | 商店字段 `releaseNotes`，会出现在目录 `versions[].releaseNotes` |
| 谁会读它 | DBX **插件中心**（以及消费 `catalog/index.json` 的客户端） |
| 谁**不会**读它 | GitHub Release 正文、本仓库 README、任意 `CHANGELOG.md` |

因此：

- 在 GitHub 写再漂亮的 Release Notes，**都不会自动进 DBX**。
- 必须把同一段（或更精炼的）说明写入商店候选的 `releaseNotes`。
- `localizations` 只能本地化 `name` / `description`，**不能**按语言拆 `releaseNotes`。需要中英对照时，写成**一段字符串**（中文 + 英文均可，商店现有插件普遍这么做）。

数据流：

```
本仓库发版
  ├─ manifest.json 的 version
  ├─ GitHub Release 资产：*.dbxp / *.artifact.json / release-candidates.json
  └─ （可选）.dbx-store.json 的 releaseNotes
           │
           ▼
dbx-store 候选 candidates/<id>.json（含 releaseNotes）
           │  维护者签名
           ▼
plugins/<id>.json → versions[].releaseNotes
catalog/index.json
           │
           ▼
DBX 插件中心详情 / 升级提示
```

---

## 2. 前置条件

### 2.1 本机工具

- Node.js **22+**
- Rust stable（Windows 建议把 toolchain `bin` 放在 rustup shim 之前，避免 `os error 216`）
- `@dbx-app/plugin-cli`（建议与 CI 一致：`0.1.6`）

```bash
npm install --global @dbx-app/plugin-cli@0.1.6
dbx-plugin --help
```

### 2.2 仓库与身份（本插件固定值）

| 字段 | 值 |
| --- | --- |
| 插件 ID | `io.github.aili0617.toolbox` |
| 发布者 | `aili0617` |
| 源码仓库 | `https://github.com/aiLi0617/dbx-plugin-toolbox` |
| 许可证 | `Apache-2.0` |
| 商店仓库 | `https://github.com/t8y2/dbx-store` |

首次上架前：确认 `dbx-store` 的 `publishers/aili0617.json` **已在 `main` 上登记**。新 publisher 不能只靠候选 PR 新增（签名流程会把 base 上的 `publishers/` 盖回 PR，导致登记丢失）。

### 2.3 辅助脚本路径

下文把 DBX 插件 skill 脚本目录记为 `<skill>/scripts`，例如本机常见路径：

`C:\Users\<你>\.claude\skills\dbx-plugin\scripts`

常用命令：

```bash
node <skill>/scripts/check-project.mjs .
node <skill>/scripts/make-candidate.mjs . --release-notes "..."
node <skill>/scripts/inspect-dbxp.mjs dist/*.dbxp
```

---

## 3. 更新记录怎么写

### 3.1 推荐写法

面向用户，写「本版相对上一版」的变化，避免堆砌内部实现细节。

```text
0.1.1：新增占位图与图片批处理；修复密钥库解锁后的空密码提示；优化搜索直达子功能。
0.1.1: Placeholder images and batch image processing; clearer vault unlock validation; search can jump into sub-features.
```

也可只写中文（或只写英文）。长度建议控制在几十字到几百字；过长会影响详情页阅读。

### 3.2 三种写入入口（任选其一，可组合）

#### A. 命令行（推荐，每次发版最明确）

```bash
node <skill>/scripts/make-candidate.mjs . \
  --repo aiLi0617/dbx-plugin-toolbox \
  --tag v0.1.1 \
  --release-notes "0.1.1：……"
```

`--release-notes` 会覆盖从 `.dbx-store.json` 读到的同名字段。

#### B. 仓库根目录 `.dbx-store.json`（可选，适合默认文案 / 商店展示字段）

首次上架或需要固定商店元数据时创建：

```json
{
  "name": "Toolbox",
  "description": "Conversion, encoding, formatting, generators, text tools, and a local key vault.",
  "icon": "assets/plugin.svg",
  "tags": ["tools", "crypto", "developer"],
  "permissions": [],
  "source": "https://github.com/aiLi0617/dbx-plugin-toolbox",
  "homepage": "https://github.com/aiLi0617/dbx-plugin-toolbox",
  "license": "Apache-2.0",
  "releaseNotes": "0.1.0：首个商店版本。本地开发工具与加密密钥库。",
  "localizations": {
    "zh-CN": {
      "name": "工具箱",
      "description": "转换、编解码、格式化、生成、文本工具与本地密钥库。"
    }
  }
}
```

约束：

- **只允许**上述 10 个字段；多写任何键 → `Unsupported store metadata field`
- `icon` 相对路径会在同步时改写成该 tag 下的 `raw.githubusercontent.com` HTTPS 地址；必须是 `.svg` 或 `.png`
- 每个 Release **tag** 上的文件内容会被重新读取；发新版务必改掉 `releaseNotes`，否则会把旧说明带进新候选
- `id` / `publisher` / `version` / `targets` **不能**写在这里

#### C. 手工编辑 `candidates/io.github.aili0617.toolbox.json`

向 `dbx-store` 提 PR 时，在候选 JSON 顶层加：

```json
"releaseNotes": "0.1.1：……"
```

出现时必须为**非空字符串**。

### 3.3 明确不要做的事

| 错误做法 | 结果 |
| --- | --- |
| 只写 GitHub Release 正文 | DBX 看不到 |
| 只改 README「更新日志」 | DBX 看不到 |
| 把 `releaseNotes` 放进 `manifest.json` | Manifest 拒收未知字段 |
| 在 `localizations` 里加 `releaseNotes` | 校验失败（本地化只允许 name/description） |
| 复用已上架版本号改说明 | 版本已列出不可再提交；改字节必须升版本 |

---

## 4. 标准发版流程（含更新记录）

以下以发 `0.1.1`、tag `v0.1.1` 为例。

### 步骤 1：改版本号

同步修改（必须一致）：

1. `manifest.json` → `"version": "0.1.1"`
2. `backend/Cargo.toml` → `version = "0.1.1"`（Sidecar 元数据用 `CARGO_PKG_VERSION`）

不要用带 `+build` 的 SemVer（文件名会出现 `+`，破坏商店自动化）。

### 步骤 2：准备本版更新文案

先起草 `releaseNotes` 文本，并决定是否更新 `.dbx-store.json`。

建议同时写好 GitHub Release 正文（给人看），再把**精简版**复制进 `releaseNotes`（给 DBX 看）。

### 步骤 3：本地预检与构建

```bash
cd D:\Work\Project\github\DBX\dbx-plugin-toolbox

npm ci
npm run check

node <skill>/scripts/check-project.mjs .

dbx-plugin package .
```

产物应出现在 `dist/`，例如：

- `io.github.aili0617.toolbox-0.1.1-<target>.dbxp`
- 同名 `.artifact.json`

本插件含 Rust Sidecar，通常是**按平台**的 target（如 `windows-x86_64`），需在对应平台或 CI 矩阵构建，不要指望本机交叉出所有平台。

检查包：

```bash
node <skill>/scripts/inspect-dbxp.mjs dist/io.github.aili0617.toolbox-0.1.1-*.dbxp
```

确认：未签名、`id`/`version`/`publisher` 与 manifest 一致、无多余 `.dbx-dev` 等。

### 步骤 4：生成候选与 Release 资产清单

```bash
node <skill>/scripts/make-candidate.mjs . \
  --repo aiLi0617/dbx-plugin-toolbox \
  --tag v0.1.1 \
  --release-notes "0.1.1：在此填写本版用户可见变更。"
```

产出：

| 文件 | 用途 |
| --- | --- |
| `dist/candidates/io.github.aili0617.toolbox.json` | 提交到 `dbx-store` 的候选 |
| `dist/release-candidates.json` | 作为 GitHub Release **资产**上传（文件名必须恰好是这个） |

打开候选文件，核对：

- `version` 为 `0.1.1`
- `releaseNotes` 为刚写的文案
- `targets[].url` 为 `https://github.com/aiLi0617/dbx-plugin-toolbox/releases/download/v0.1.1/....dbxp`
- **没有** `signingKeyId`、`verified`
- `sha256` / `size` 与磁盘上 `.dbxp` 字节一致（生成后不要再改包）

`release-candidates.json` 里 `artifacts[].url` 必须是**纯文件名**（如 `io.github.aili0617.toolbox-0.1.1-windows-x86_64.dbxp`），不能是完整 URL。

### 步骤 5：推送代码并创建 GitHub Release

1. 提交版本与（可选）`.dbx-store.json` 变更并 push。
2. 打 tag：`v0.1.1`（与 `--tag`、Release 下载路径一致）。
3. 在 GitHub 创建 **Published** Release（不要长期停在 draft/prerelease，否则商店同步可能找不到候选）。

本仓库 `.github/workflows/plugin-release.yml` 会在 `release: published` 时：

```text
npm ci && npm test && npm run build && dbx-plugin package .
```

并上传 `dist/*.dbxp`、`dist/*.artifact.json`。

你还需要确保 Release 资产中包含 **`release-candidates.json`**（若可复用工作流未自动附带，请手工上传步骤 4 生成的那份）。商店自动化依赖这个固定文件名。

上传后不要再改同名 `.dbxp` 内容（URL 应不可变；哈希已钉死）。

### 步骤 6：提交 / 同步到 dbx-store

二选一：

**手动 PR（可控）**

1. Fork `t8y2/dbx-store`，基于 `main` 开分支。
2. 放入 `candidates/io.github.aili0617.toolbox.json`（用步骤 4 的文件）。
3. 按 PR 模板填写能力、权限、网络、Sidecar 行为。
4. **不要**手工改 `plugins/`、`catalog/`，不要提交 `.dbxp`。
5. 等待 CI；未签名前出现 `open candidate(s) awaiting DBX Store signing` 为正常。
6. 维护者审核后执行签名（`/sign` 或受保护 Workflow）。
7. 签名成功后 PR 会回写 `plugins/...json`、重建 `catalog/index.json` 并删除 `candidates/...`；CI 变绿后由维护者合并。

**自动同步（若已登记）**

若本仓库已在 `dbx-store/automation/plugin-sources.json` 且 `autoUpdate: true`，发布带 `release-candidates.json` 的 Release 后，机器人可代开/更新候选 PR。仍需维护者签名与合并；`releaseNotes` 仍来自候选 / `.dbx-store.json`，不是 GitHub 正文。

### 步骤 7：验证目录里的更新记录

合并后检查：

```text
https://raw.githubusercontent.com/t8y2/dbx-store/main/catalog/index.json
```

或：

```text
https://raw.githubusercontent.com/t8y2/dbx-store/main/plugins/io.github.aili0617.toolbox.json
```

在对应 `versions` 项中应看到：

```json
{
  "version": "0.1.1",
  "releasedAt": "...",
  "releaseNotes": "0.1.1：在此填写本版用户可见变更。",
  "artifacts": [ ... ]
}
```

---

## 5. 在 DBX 客户端查看更新记录

### 5.1 插件中心（主路径）

1. 打开 DBX 桌面端（建议版本满足本插件 `engines.dbx`，当前为 `>=0.5.68`）。
2. 顶部工具栏进入 **插件中心**。
3. 在商店列表或已安装列表找到 **工具箱**（英文界面为 Toolbox）。
4. 打开插件 **详情**。
5. 查看：
   - 当前 / 最新版本号
   - **更新说明 / 版本说明**（即该版本的 `releaseNotes`）
   - 多版本时，可在版本历史中切换查看各版说明

有可更新版本时，升级入口旁通常也会展示**最新一版**的 `releaseNotes`。

### 5.2 目录侧核对（开发者）

若客户端尚未刷到新目录，可先打开上一节的 `catalog/index.json` / `plugins/<id>.json` 确认商店侧已写入。客户端会拉取官方目录（raw GitHub 或 R2 镜像）；若仍看到旧文案，可稍后重开插件中心或检查网络。

### 5.3 本地未签名开发包

通过「第三方与开发者选项 → 允许安装未签名开发包」装本地 `.dbxp` 时：

- 包来自本机，**不经过**商店目录。
- 因此 **看不到** 商店里的 `releaseNotes` 历史。
- 要验证更新说明展示，必须走已合并进 `dbx-store` 的正式版本（或至少目录里已有该版本条目）。

---

## 6. 首次上架 vs 版本更新

### 首次上架

候选中通常需要（商店规则）：

- `name`、`source`（https）、`license`
- `publisher` 已在 `main` 登记
- `targets` 非空，指向你自己仓库的**未签名** HTTPS 包
- 建议带上完整 `description` / `icon` / `homepage` / `localizations` / **`releaseNotes`**

### 已上架后的版本更新

- 只提交**新版本**候选；省略的展示字段会保留商店现值，写入的字段会覆盖。
- **务必带上本版 `releaseNotes`**，否则该版本在目录里可能是空说明（或沿用你 `.dbx-store.json` 里未改的旧句，造成「新版本写着旧说明」）。
- 版本号必须是尚未列出、且未撤销的 SemVer。
- 已签名产物在 R2 上不可覆盖；改内容必须升版本。

---

## 7. 日常检查清单（发版前勾选）

- [ ] `manifest.json` 与 `backend/Cargo.toml` 版本一致
- [ ] `npm run check` 通过
- [ ] `dbx-plugin package` 产出未签名 `.dbxp` + `.artifact.json`
- [ ] `inspect-dbxp` 身份与版本正确
- [ ] `releaseNotes` 已定稿（中英或单语均可）
- [ ] `make-candidate` 生成的候选含正确 `releaseNotes`，且无 `signingKeyId`
- [ ] GitHub Release 已 published，资产含各 target 包与 `release-candidates.json`
- [ ] 候选 URL 指向本仓库 Release，而非 `dbx-store` / `dl.dbxio.com` 已签名地址
- [ ] `dbx-store` PR 已开；签名合并后目录中可见新 `versions[].releaseNotes`
- [ ] 在 DBX 插件中心详情页核对展示文案

---

## 8. 常见问题

| 现象 | 原因与处理 |
| --- | --- |
| DBX 看不到更新说明 | 只写了 GitHub/README；补 `releaseNotes` 并重新走候选（需新版本） |
| 新版本说明仍是上一版文字 | `.dbx-store.json` 未改，同步脚本又读了旧值；发版前更新该字段或用 `--release-notes` 覆盖 |
| `version already listed` | 该版本已上架；升版本号重新打包 |
| `candidate URLs must not reference DBX Store releases` | 候选必须指向你仓库的未签名包 |
| `Candidate SHA-256 mismatch` | 生成候选后又重新 `package` 了；重新 make-candidate |
| `publisher is not registered` | 先合并 publisher 登记 PR，再签候选 |
| Release 自动化找不到候选 | Release 不是 published，或缺少名为 `release-candidates.json` 的资产 |
| Windows `os error 216` | 调整 PATH，让真实 `cargo.exe` 优先于 rustup shim |

---

## 9. 与本仓库其他文档的关系

| 文档 | 内容 |
| --- | --- |
| 根目录 `README.md` | 功能说明、本地开发、安全摘要 |
| 本文 `docs/release-notes-ops.md` | **发版与更新记录**操作细则 |
| 官方插件开发文档 | https://dbxio.com/cn/docs/plugin-development |
| 商店贡献说明 | https://github.com/t8y2/dbx-store/blob/main/CONTRIBUTING.md |

---

## 10. 最小命令速查

```bash
# 1) 改 version → 构建测试
npm ci && npm run check && dbx-plugin package .

# 2) 生成带更新说明的候选
node <skill>/scripts/make-candidate.mjs . \
  --repo aiLi0617/dbx-plugin-toolbox \
  --tag vX.Y.Z \
  --release-notes "X.Y.Z：本版用户可见变更。"

# 3) 推送 tag、发布 GitHub Release（附带 .dbxp / artifact / release-candidates.json）

# 4) 将 dist/candidates/io.github.aili0617.toolbox.json
#    提交到 t8y2/dbx-store → candidates/ 同名文件，等待签名合并

# 5) DBX → 插件中心 → 工具箱详情 → 查看更新说明
```
