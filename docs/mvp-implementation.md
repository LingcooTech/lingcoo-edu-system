# MVP 实施说明

## 当前已落地

API：

- `system`：健康检查、模块列表。
- `auth`：管理员登录、退出、当前用户。
- `tenant`：机构列表、经营看板。
- `catalog`：课程列表和创建。
- `trial`：公开课管理、公开端首页、公开端报名。
- `crm`：线索列表、状态流转、跟进、转学员。
- `people`：家长和学员列表。
- `teaching`：老师、教室。
- `scheduling`：班级、课次、老师/教室冲突检测。
- `attendance`：签到、到课消课、课时流水。
- `lesson`：课时账户和流水。
- `finance`：订单、手动收款、课时入账。
- `marketing/report`：渠道与转化漏斗。

Admin UI：

- 登录页。
- 资源式后台 Shell。
- 概览、线索、公开课、课程、学员、班级、排课、课时、订单、老师教室、渠道、设置。
- `DataTable`、`StatusPill`、`MetricCard` 等基础 UI 原语。

Public Web：

- 机构首页。
- 推荐课程。
- 本周公开课。
- 试听报名表单。
- 来源参数记录。

## 当前实现策略

为了优先打通 MVP 闭环，API 当前使用内存种子数据和 Drizzle schema 并行推进：

- 路由和 UI 已按真实业务边界设计。
- `api/src/db/schema.ts` 已给出商业化多租户数据库模型。
- 后续可以把内存 store 平滑替换为 repository + Drizzle，不需要重构 API 和 UI 边界。

## 下一步

1. 接入 PostgreSQL repository。
2. 生成 Drizzle migration。
3. 给关键服务添加测试。
4. 补资源创建 / 编辑抽屉。
5. 增加导入导出和审计日志查询。
