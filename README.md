# 模块化图文卡片设计系统 / Douyin Daily Card Skill

这是一个中文优先的 Agent Skill（智能体技能）公开仓库，用来把已经写好的中文内容，生成固定尺寸的图文卡片、封面和底图。

当前目标不是只做一套模板，而是沉淀一套可复用的“搭积木式”设计流程：

- 用公开安全素材做演示，不绑定任何真实 IP（知识产权）。
- 用模块注册表记录背景、标题、角色、信息条、内容区、特效等积木块。
- 用模板配方注册表记录“哪些模块组合成一套封面/底图”。
- 用脚本导出 `1080 x 1440` PNG，并生成验证报告。
- 让任意 agent 可以按规则调用，而不是每次从零设计。

## 当前状态

- 已有基础日报渲染 Skill：`skills/douyin-daily-card/`
- 已新增标准化文档：`文档/`
- 已新增数据注册表：`数据/`
- 已新增公开素材候选表：`数据/公开素材候选表.csv`
- 已新增素材候选预览页：`工具/素材候选预览页.html`
- 已新增交互式封面/底图编辑器 beta（测试版）：`工具/交互式封面底图编辑器.html`
- 公开演示素材先只建规则和目录，不批量下载素材。

## 目录说明

```text
.
├── README.md
├── 文档/
│   ├── 00-项目总说明.md
│   ├── 01-素材采集标准.md
│   ├── 02-素材授权台账规则.md
│   ├── 03-模块化设计规范.md
│   ├── 04-模板配方规则.md
│   ├── 05-Agent使用流程.md
│   ├── 06-验收标准.md
│   ├── 07-版本升级规则.md
│   ├── 08-公开素材来源核验记录.md
│   ├── 09-执行记录-2026-04-30.md
│   └── 10-功能清单与公开化路线图.md
├── 数据/
│   ├── 公开素材候选表.csv
│   ├── 已入库素材清单.json
│   ├── 模块注册表.json
│   └── 模板配方注册表.json
├── 工具/
│   ├── 素材候选预览页.html
│   └── 交互式封面底图编辑器.html
├── scripts/
│   └── validate-public-tools.mjs
└── skills/
    └── douyin-daily-card/
        ├── SKILL.md
        ├── examples/
        ├── references/
        └── scripts/
```

## 使用方式

基础日报渲染：

```bash
node skills/douyin-daily-card/scripts/render-report.mjs skills/douyin-daily-card/examples/2026-04-25-input.md --output /tmp/daily-card-skill-test
node skills/douyin-daily-card/scripts/validate-report.mjs /tmp/daily-card-skill-test
sips -g pixelWidth -g pixelHeight /tmp/daily-card-skill-test/[0-9][0-9]-*.png
```

标准化设计流程：

1. 先读 `文档/00-项目总说明.md`
2. 找素材时读 `文档/01-素材采集标准.md`
3. 入库前填 `数据/公开素材候选表.csv`
4. 做模块时更新 `数据/模块注册表.json`
5. 做模板时更新 `数据/模板配方注册表.json`
6. 每次输出后按 `文档/06-验收标准.md` 验证

交互式封面/底图编辑：

```text
打开 工具/交互式封面底图编辑器.html
选择封面或底图
选择早晨/午间/夜间/周一到周日预设
调整账号、ID、标题、日期、标签文案
用滑杆调整 X / Y / 字号
导出 JSON 参数
```

素材候选人工筛选：

```text
打开 工具/素材候选预览页.html
筛选分类和风险
点击“加入评审”
复制待评审清单 JSON
再决定哪些素材可以下载入库
```

公开工具验收：

```bash
node scripts/validate-public-tools.mjs
```

## 公开安全原则

- 不放真实账号隐私信息。
- 不放第三方知名 IP 角色图。
- 不把不明授权素材放进仓库。
- `CC0` 素材优先；需要署名的素材必须记录署名方式。
- `beta`（测试版）模板不能作为自动默认模板。

## 后续方向

- 建立公开演示素材包。
- 扩充素材候选预览页，从“来源级候选”升级到“具体素材级候选”。
- 继续增强积木式 HTML 编辑器，补模块删减、拖拽和 PNG 导出。
- 把稳定模板接入 CLI（命令行工具）。
- 在 CLI 稳定后再封装 MCP（Model Context Protocol，模型上下文协议）服务。
