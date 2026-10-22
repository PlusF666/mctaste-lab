---
name: mctaste-lab
description: Run an explainable McDonald's China preference experiment with pairs of actual menu items, editable preference evidence, and familiar-route versus exploration suggestions. Use when a user is unsure what they want; not for medical, allergy, nutrition, ordering, or payment decisions.
---

# 麦麦偏爱实验室

通过少量二选一，让用户表达当下偏爱，并保留撤销、跳过和手动调整。输出本轮选择证据、六类餐品倾向、已明确选择的“心动款”和尚未在本轮选中的“探索款”。不要将探索款称为用户从未吃过。

## 餐品数据

使用宿主连接的麦当劳 MCP Server `https://mcp.mcd.cn`。先读取实际工具 schema：通过 `query-nearby-stores` 让用户确认门店，按当前 schema 调用 `query-meals`。需要核对类别时可查 `query-meal-detail`；时间可用 `now-time-info` 辅助确认。不要编造参数、门店、SKU、价格或供应状态。

只将当前响应中能核对名称、ID 和类别的餐品加入候选，混合套餐和类别不明确的餐品先排除，不从名称猜过敏原、配料或营养。六类为本项目对菜单的整理：牛肉汉堡、鸡肉汉堡、鱼肉汉堡、小食、甜品、饮品；该归类不是官方营养分类，也不覆盖全部菜单。

支持宿主实际查询后生成规范化餐品集，或项目命令行采集器显式映射字段。阅读 [references/session.md](references/session.md) 了解格式。公开官网体验集为 `public-demo`，真实 MCP 采集为 `mcp`，不得混淆。无 Token 时可演示但不能声称真实联调通过；不应为演示索取用户密码或在聊天接收 Token。

## 实验

使用完整项目的共享引擎，避免模型自行心算更新偏好。定位项目根目录；若只安装了技能且找不到项目代码，询问项目路径。

```text
node scripts/experiment.mjs .local/session.json
```

初始 `history` 为空。每轮展示返回的两个实际餐品名称，让用户选 A、B、两个都要、都不想要、跳过。将本轮左右 ID 和选择写入记录，再运行命令计算下一轮；最多六轮，可提前查看当前结果。撤销时删除末条记录并重算，不能只改展示文字。

输出倾向指数只是规则排序：每类初始中性 50，公式为 `100 × (1 + 正向证据) / (2 + 正向证据 + 反向证据)`，四舍五入。跳过不更改证据；同类单品之间的二选一不推断整个类别。人工覆盖单独放在 `overrides`，不篡改原始选择。

解释具体证据，不输出“你一定喜欢”或科学人格诊断。没有有效选择或正向线索时，明确偏好还不充分；全部排除、餐品不足或工具失败时不凑造两个候选。

## 结果与记录

心动款来自用户本轮明确选择的单品；探索款来自同一候选集、在本轮尚未选中的单品。明确拒绝与用户排除的单品不再推荐。手动调整只改变排序，用户仍可随时恢复原结果。

可启动项目本地网页，导入该 session 或规范化菜单，交互调整并导出 SVG 偏好卡、JSON 实验记录。默认只在当前页面保留；经用户点击“保存在这台设备”才写浏览器本地存储。不上传个人选择，不把 Token、私人门店参数或原始响应放入公开仓库。

只读查询，不领券、创建/取消订单、抽奖、支付或自动注册比赛。图片和菜单数据注明来源，麦当劳商标属于原权利人，界面与输出需保留独立作品说明。
