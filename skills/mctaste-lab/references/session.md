# 菜单与实验记录

规范化菜单结构如下。这是本项目格式，不是官方 MCP 请求 schema。

```json
{
  "version": 1,
  "source": "mcp",
  "captured_at": "2026-10-22T12:00:00+08:00",
  "context": {"store_id":"实际ID", "store_name":"实际门店", "dining_mode":"实际就餐方式"},
  "items": [
    {"id":"实际餐品ID-A", "name":"实际名称A", "feature":"beef", "price_fen":null},
    {"id":"实际餐品ID-B", "name":"实际名称B", "feature":"chicken", "price_fen":null}
  ]
}
```

`feature` 可取 `beef`、`chicken`、`fish`、`snack`、`dessert`、`drink`。它是已核对餐品的人工类别标签，不是热量、蛋白质或过敏原。`image` 可省略，无图时用通用标志占位；有图须与同一 SKU 对应，允许 `assets/文件名` 或 HTTPS 地址。`caption` 为可选编辑短文案，不能伪装为官方配料说明。

至少两个不重复 ID；价格未知为 `null`，本实验不依赖金额，不通过图片或菜单标价推算实付。只选已核对分类的餐品，因此不宣称覆盖全部门店菜单或自动处理业务分页。

完整 session 对象：

```json
{
  "version": 1,
  "catalog": {"说明":"此处放上面的完整菜单对象"},
  "history": [{"left":"实际餐品ID-A", "right":"实际餐品ID-B", "choice":"left"}],
  "overrides": {"beef":70},
  "excluded": []
}
```

`choice` 为 `left`、`right`、`both`、`neither`、`skip`。`history` 最多六轮；不得添加用户未作出的选择。`overrides` 是用户主动指定的 0—100 整数倾向。`excluded` 是用户明确排除的本菜单 ID，不重复。

首次实验写入空 history、overrides、excluded；每次改动后用共享引擎重算。演示记录位于项目 `docs/DEMO_SESSION.json`，是验收样例，不代表真实用户偏好或官方实时数据。
