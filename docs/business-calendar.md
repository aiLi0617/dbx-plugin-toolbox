# 中国大陆工作日历

工作日计算提供普通周末和中国大陆放假调休两种模式。默认保留普通周末模式，用户可主动选择中国大陆日历。

中国大陆模式内置 2024、2025、2026 年数据，采用周六、周日休息和已公布的放假调休安排；自定义休息日优先于公布的补班安排。不支持的年份会阻止计算，包括推算日期跨入未覆盖年份的情况，不会静默回退到普通周末。此日历用于全国年度放假调休安排，不代表各单位、地区或特定人群的所有休假制度。

数据来自 [NateScarlet/holiday-cn](https://github.com/NateScarlet/holiday-cn)，以其 JSON 中的国务院办公厅通知链接为依据。原始来源、固定上游提交和同步日期保存在 `src/lib/data/cn-holidays.json`。MIT 许可证保存在随插件打包的 `assets/licenses/holiday-cn.txt`。

## 更新内置数据

在新年度安排公布后，发布前手动执行以下命令；参数必须列出需要保留的全部年份：

```powershell
node scripts/update-cn-holidays.mjs 2024 2025 2026
node --test tests/business-calendar.test.js tests/expansion.test.js
npm run build
```

脚本从一个固定上游提交获取指定年份的数据，校验年份、真实日期、重复记录、放假/补班布尔字段和政府公告链接，再写入内置文件及许可证。更新后应核对公告，并同步调整年份覆盖测试。不要预填尚未公布的年份。

运行时不请求网络，不需要新增插件权限。数据更新随插件新版本分发。
