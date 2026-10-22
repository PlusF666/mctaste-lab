# 麦当劳 MCP 接入

## 状态

已实现只读 MCP 客户端、实时 schema 发现、菜单采集、显式字段映射、候选规范化和 Skill 调用流程。**2026-10-22 已在本机完成真实连接，以及时间、门店和菜单查询验证。** 记录见 [LIVE_VALIDATION.md](docs/LIVE_VALIDATION.md)。 公开网页使用官网真实餐品的 `public-demo` 体验集；这不等同于持 Token 的 MCP 集成验证。真实菜单通过本机采集与网页导入使用，公开首页不会直接持有凭据查询 MCP。

## Server 与 Tool

Server：`https://mcp.mcd.cn`；Streamable HTTP；认证 Header 仅使用环境变量 `Authorization: Bearer ${MCD_MCP_TOKEN}`。

| 工具 | 用途 | 当前验证 |
| --- | --- | --- |
| `query-nearby-stores` | 查询并由用户确认门店 | 真实调用成功（2026-10-22） |
| `query-meals` | 本项目核心，提供实际餐品候选 | 真实查询与采集成功（2026-10-22） |
| `query-meal-detail` | 核对含糊的类别与具体餐品 | 代码白名单支持；尚未实际调用 |
| `now-time-info` | 辅助确认时间 | 真实调用成功（2026-10-22） |

工具名依据[官方 MCP 指南](https://github.com/M-China/mcd-mcp-server)。工具参数与返回字段以实际连接后的 `tools/list` 为准，本项目没有冒充已知官方业务字段。客户端支持初始化、JSON/SSE 响应、会话 Header 与工具列表游标；不宣称支持所有 MCP 扩展或业务菜单分页。

## 流程与业务价值

```mermaid
flowchart LR
  A[真实工具 Schema] --> B[用户确认门店]
  B --> C[query-meals]
  C --> D[显式字段映射与类别核对]
  D --> E[实际餐品二选一]
  E --> F[可回滚的选择证据]
  F --> G[可编辑偏好与两路推荐]
```

解决“用户不知道怎么描述想吃什么”的问题：通过实际餐品选择表达意图，保留可解释证据，再把相近偏好与探索候选分开。菜单来源决定候选，用户选择决定偏好，确定性引擎负责计算。没有把普通分类打分包装成科学人格或医学测评。

## 本机接入

Windows 可双击根目录的 `配置麦当劳MCP.cmd`，在本机隐藏输入框粘贴官方 Token。脚本通过 Windows DPAPI 将凭据加密保存到已被 Git 忽略的 `.local/mcp-token.xml`，只供当前 Windows 用户在当前电脑解密，然后验证连接；即使验证失败也保留加密凭据，便于排查时重试。工具 schema 仅在连接成功后保存在 `.local/tools.json`。这两个文件不要上传。

之后可使用 在 PowerShell 中运行 `& ./scripts/connect_mcp.ps1 -CollectorArguments @('discover','--out','.local/tools.json')`，或将后面的参数换成以下 `raw` / `collect` 命令的参数。脚本只在子进程调用期间设置 Token，结束后恢复原会话环境变量。删除 `.local/mcp-token.xml` 可移除本地保存的凭据；在官方平台撤销 Token 才会使服务端凭据失效。

需要 Python 3.10+，无第三方运行依赖。由本人在[官方平台](https://open.mcd.cn/mcp)登录并申请 Token，不要把凭据发进聊天或仓库。PowerShell 可在当前会话安全输入：

```powershell
$mctasteSecret = Read-Host 'MCD MCP Token' -AsSecureString
$env:MCD_MCP_TOKEN = [System.Net.NetworkCredential]::new('', $mctasteSecret).Password
python scripts/sync_catalog.py discover --out .local/tools.json
```

查看实时 `inputSchema`，按其要求创建 `.local/menu-args.json`，不使用猜测出来的参数。先读取原始菜单供本地检查：

```powershell
python scripts/sync_catalog.py raw --tool query-meals --arguments .local/menu-args.json --out .local/menu-private.json
```

原始响应可能含门店地点，只留本机，不公开。

根据实际响应创建 `.local/mapping.json`，路径为 RFC 6901 JSON Pointer。以下路径为**虚构结构示意，不能当作真实官方字段**：

```json
{"items":"/example/items","id":"/example_id","name":"/example_name"}
```

创建 `.local/annotations.json`，只为实际返回、能核对类型的 ID 填写 `feature`。例如格式 `{"真实ID":{"feature":"beef"},"另一个真实ID":{"feature":"snack"}}`。混合套餐或无法分类的产品先不纳入实验；图片缺失时省略，不随意借用另一个商品图。

创建 `.local/context.json`，填写实际 `store_id`、`store_name`、`dining_mode` 三个字符串，必须与调用参数一致。

```powershell
python scripts/sync_catalog.py collect --arguments .local/menu-args.json --mapping .local/mapping.json --annotations .local/annotations.json --context .local/context.json --out .local/catalog.json
Remove-Item Env:MCD_MCP_TOKEN
```

采集器再次真实调用 `query-meals`，只选择该次响应实际出现的已注释 ID，不将注释文件里未出现的 ID 伪造成可售商品。重复规格 ID、不足两个候选、错误字段映射或无效类别会停止。未注释条目明确不参与，不宣称完整菜单。HTTP 401/403/429、工具错误、网络超时均停止，不自动反复请求。

网页底部“导入菜单 / 实验记录”导入 `.local/catalog.json` 后，显示 MCP 来源自述、门店范围和采集时间，并替换当前实验。JSON 导入本身不能认证真实来源。只有采集器或宿主的实际调用记录能够作为联调依据。

## 协议与数据边界

Token 和会话 ID 不写入规范化菜单；浏览器不接收 Token、不直连 MCP。最小菜单只有 ID、名称、人工分类、可选图片/文案与范围元数据；`.local/`、`.env` 被忽略。原始位置与查询参数不进公开仓库。

不读取账号订单、地址簿、优惠券或积分。不领券、下单、支付、抽奖；不调用 `calculate-price`，不声称完成支付核价。官网公开菜单和图片不代表某店此刻可售。偏好标签不能用于过敏、营养或健康判断。

本地网络协议测试使用 mock，成功不等于官方实测。已在 `docs/LIVE_VALIDATION.md` 记录本次真实联调时间、实际成功工具、候选条数、映射依据和未支持项；后续联调应继续据实更新。公开材料仅保留脱敏摘要。
