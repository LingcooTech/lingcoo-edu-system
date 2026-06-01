# fd-edu-stack 教育系统架构与实施计划

> ⚠️ **本文档为 2026-05-28 的初始规划，部分内容已被取代（SUPERSEDED）。**
> 当前系统已演进为**单机构自部署**形态：多租户（`tenants` / `campuses` /
> `tenant_memberships` / `tenant_id`）已于 2026-05-30 拆除（迁移 `0005_single_institution`），
> `organization` 改为单行单例；账号已统一为单张 `accounts` 表 + 角色（`admin` /
> `teacher` / `parent`，迁移 `0009_unified_accounts`），不再有独立 `users` / `parents`；
> 课程定价已移至 `course_packages`（迁移 `0008`）。涉及多租户、独立 `api/` 目录、
> 旧数据模型的章节请以 `src/db/schema.ts` 与 `drizzle/` 迁移为准。下文保留以记录设计意图与路线图。

## 1. 产品定位

`fd-edu-stack` 是一套独立的社区教室 / 小型培训机构招生、排课、消课和运营系统。

它不依赖 `fd-core-stack`，也不复用 `fd-core-stack` 的数据库和 API。`fd-core-stack` 只作为工程架构参考：模块化单体、Fastify API、PostgreSQL、Drizzle、Redis、React 管理后台、Docker Compose 部署、资源式后台。

目标不是只做美智优品内部工具，而是从第一天按可商业化产品设计，未来可以卖给多个培训机构使用。

## 2. 核心架构决策

### 2.1 独立 repo

建议新建独立仓库：

```text
fd-edu-stack
├── api                 独立 Fastify API
├── admin-ui            机构管理后台 Web
├── public-web          家长扫码报名 Web
├── drizzle             数据库迁移
├── docker              PostgreSQL 初始化等
├── scripts             迁移、种子、运维脚本
├── deploy              生产部署脚本
├── docs                产品、架构、接口文档
├── docker-compose.yml
└── docker-compose.prod.yml
```

如果希望更接近 `fd-core-stack` 的当前形态，也可以让 `api` 位于根目录，`admin-ui` 和 `public-web` 作为子项目。但长期商业化更建议显式拆出 `api` 目录，边界更清楚。

### 2.2 Web 版本优先

第一阶段只做 Web：

- `admin-ui`：机构后台，给老板、校区管理员、课程顾问、教务使用。
- `public-web`：移动端响应式 H5，给家长扫码查看课程、预约试听、报名活动。
- 老师端暂不独立开发，先在后台用角色和页面权限覆盖老师查看课表、签到等轻量需求。
- 小程序暂不做，等核心业务闭环和课程模型稳定后再做。

### 2.3 架构形态

采用模块化单体，不拆微服务：

```text
Browser
├── Admin UI
└── Public Web
        │
        ▼
API / Fastify
├── system
├── auth
├── tenant
├── crm
├── catalog
├── trial
├── people
├── teaching
├── scheduling
├── attendance
├── lesson
├── finance
├── marketing
├── notification
├── report
├── audit
└── admin
        │
        ├── PostgreSQL
        ├── Redis
        └── Worker
```

这样选的原因：

- 教培系统的核心一致性在同一个事务里：报名、入班、消课、课时余额、订单、退款。
- 早期商业化不需要微服务复杂度。
- 单机 Docker Compose 足够支撑 MVP 到早期付费客户。
- 模块边界清晰后，将来确实需要拆服务时也有迁移路径。

### 2.4 多租户从第一天预留

因为未来要卖给培训机构，必须从第一天设计多租户，而不是等后面补。

核心对象：

- `tenants`：机构，例如美智优品成长教室、某某书法培训中心。
- `campuses`：校区 / 门店 / 教室点位。
- `tenant_memberships`：用户在某个机构下的角色。
- 所有业务表都带 `tenant_id`，校区相关表再带 `campus_id`。

MVP 可以只创建一个默认机构和一个默认校区，但数据库和 API 必须按多租户设计。

## 3. 技术栈

### 3.1 后端

- Runtime：Node.js 22+
- API：Fastify + TypeScript
- ORM：Drizzle ORM
- DB：PostgreSQL
- Cache / Queue：Redis
- Auth：JWT + HttpOnly Cookie
- Validation：Zod
- API Docs：OpenAPI / Swagger
- Worker：独立 `worker` 进程处理提醒、续费预警、异步通知、导出任务

### 3.2 前端

- Admin UI：React + Vite + TypeScript
- Public Web：React + Vite + TypeScript
- UI 结构：参考 `fd-core-stack` 的资源式后台
- 页面策略：后台 table-first，表单和详情作为抽屉 / 独立详情页
- 移动端：`public-web` 必须优先适配手机扫码场景

### 3.3 部署

生产服务：

```text
api
worker
postgres
redis
caddy
```

部署方式：

- Docker Compose 单机部署
- Caddy 统一反向代理和 HTTPS
- GitHub Actions 构建镜像
- 服务器只拉镜像并运行迁移
- 后续支持私有化部署和 SaaS 托管两种模式

## 4. 模块设计

### 4.1 system

职责：

- 健康检查
- 就绪检查
- 版本信息
- 模块列表

### 4.2 auth

职责：

- 登录、退出、刷新会话
- 管理员初始化
- 密码重置
- 用户资料

不负责机构业务权限，业务权限由 `tenant` 模块处理。

### 4.3 tenant

职责：

- 机构管理
- 校区管理
- 成员管理
- 角色和权限
- 当前用户可访问机构列表

建议角色：

- `owner`：机构所有者
- `admin`：机构管理员
- `advisor`：课程顾问 / 招生
- `academic`：教务
- `teacher`：老师
- `finance`：财务

### 4.4 crm

职责：

- 线索管理
- 线索状态流转
- 跟进记录
- 线索转学员
- 来源渠道绑定
- 下次跟进提醒

核心状态：

- `new` 待联系
- `contacted` 已联系
- `trial_booked` 已预约试听
- `trial_attended` 已到店试听
- `paid` 已缴费
- `follow_up` 后续跟进
- `invalid` 无效

### 4.5 catalog

职责：

- 课程分类
- 课程管理
- 课程定价
- 课时包配置
- 是否上架到家长端
- 课程详情内容

课程是售卖和教学的基础产品，不直接等同于班级。

### 4.6 trial

职责：

- 公开课 / 试听课创建
- 人数上限
- 报名名单
- 到课签到
- 转化结果

它是招生转化模块，不是正式班课模块。

### 4.7 people

职责：

- 家长档案
- 学员档案
- 家长与学员关系
- 年级、学校、年龄、备注
- 学员成长记录

一个家长可以绑定多个孩子，一个孩子也可以绑定多个联系人。

### 4.8 teaching

职责：

- 老师管理
- 教室管理
- 老师可上课时间
- 老师擅长课程
- 老师合作方式

老师结算先记录规则，复杂自动结算后置。

### 4.9 scheduling

职责：

- 班级管理
- 班级学员
- 具体课次
- 日 / 周 / 月课表
- 教室和老师冲突检测
- 请假和补课入口

核心约束：

- 同一教室同一时间不能重复排课。
- 同一老师同一时间不能重复排课。
- 课次发生后才能签到和扣课时。

### 4.10 attendance

职责：

- 课次签到
- 到课、请假、缺勤、补课、试听
- 是否扣课时
- 课堂反馈
- 作品照片后续扩展

### 4.11 lesson

职责：

- 学员课时账户
- 购买课时入账
- 到课消课
- 退款扣减
- 转课调整
- 课时流水
- 余额不足提醒

不要只在学员表上存一个剩余课时数字。必须有课时流水，否则后面无法追溯。

### 4.12 finance

职责：

- 订单
- 支付记录
- 退款记录
- 手动收款
- 收入统计
- 老师分成规则
- 结算记录

MVP 只做手动登记收款，不接微信支付和支付宝。商业化阶段再接支付。

### 4.13 marketing

职责：

- 渠道管理
- 活动 / campaign 管理
- 二维码参数
- 来源统计
- 转化漏斗

典型参数：

```text
?source=door_poster
?source=flyer
?source=wechat_group
?campaign=summer_bridge
?course=calligraphy
```

### 4.14 notification

职责：

- 站内通知
- 待跟进提醒
- 剩余课时提醒
- 今日课程提醒
- 试听后未转化提醒

MVP 可以先做后台提醒列表，短信、公众号、企业微信后置。

### 4.15 report

职责：

- 看板指标
- 招生漏斗
- 渠道转化
- 课程收入
- 老师课时
- 消课统计

### 4.16 audit

职责：

- 操作日志
- 敏感操作审计
- 数据导出记录
- 登录日志

商业化系统必须有审计能力，尤其涉及学员、家长、收入和课时数据。

## 5. 核心数据模型

### 5.1 平台与权限

```text
users
tenants
campuses
tenant_memberships
tenant_settings
audit_logs
job_runs
```

### 5.2 招生与渠道

```text
channels
campaigns
leads
follow_up_records
trial_sessions
trial_registrations
```

### 5.3 课程与教学

```text
course_categories
courses
course_packages
teachers
classrooms
classes
class_enrollments
class_sessions
```

### 5.4 家长与学员

```text
guardians
students
student_guardians
student_notes
```

### 5.5 签到与课时

```text
attendance_records
lesson_accounts
lesson_transactions
leave_requests
makeup_records
```

### 5.6 财务与结算

```text
orders
payments
refunds
settlement_rules
teacher_settlements
```

### 5.7 公共内容

```text
public_pages
media_assets
notifications
events
```

## 6. 关键业务流程

### 6.1 扫码招生闭环

```text
线下海报 / 传单 / 朋友圈 / 微信群
  ↓
public-web 课程落地页
  ↓
选择试听课 / 公开课
  ↓
填写家长和孩子信息
  ↓
生成 lead + trial_registration
  ↓
顾问跟进确认
  ↓
到店试听签到
  ↓
试听后跟进
  ↓
手动登记收款
  ↓
转为正式学员
  ↓
进入班级
```

### 6.2 正式上课与消课

```text
购买课时包
  ↓
创建 lesson_account / lesson_transaction
  ↓
加入班级
  ↓
生成课次
  ↓
课次签到
  ↓
按规则扣课时
  ↓
更新课时余额
  ↓
余额低于阈值生成续费提醒
```

### 6.3 排课冲突检测

创建或修改课次时检查：

- 同一 `campus_id + classroom_id` 下时间段是否重叠。
- 同一 `tenant_id + teacher_id` 下时间段是否重叠。
- 班级是否已结课或停课。
- 课次是否已经签到，已签到课次不能随意修改核心时间。

## 7. API 路由建议

### 7.1 公开端

```text
GET  /public/:tenantSlug/home
GET  /public/:tenantSlug/courses
GET  /public/:tenantSlug/courses/:courseSlug
GET  /public/:tenantSlug/trial-sessions
POST /public/:tenantSlug/trial-registrations
```

公开端不需要家长登录，提交报名即生成线索。

### 7.2 后台端

```text
POST /v1/auth/login
POST /v1/auth/logout
GET  /v1/me

GET  /v1/tenants
GET  /v1/tenants/:tenantId/dashboard

GET  /v1/tenants/:tenantId/courses
POST /v1/tenants/:tenantId/courses

GET  /v1/tenants/:tenantId/leads
PATCH /v1/tenants/:tenantId/leads/:leadId/status
POST /v1/tenants/:tenantId/leads/:leadId/follow-ups
POST /v1/tenants/:tenantId/leads/:leadId/convert

GET  /v1/tenants/:tenantId/students
GET  /v1/tenants/:tenantId/classes
GET  /v1/tenants/:tenantId/class-sessions
POST /v1/tenants/:tenantId/class-sessions
POST /v1/tenants/:tenantId/class-sessions/:sessionId/attendance

GET  /v1/tenants/:tenantId/lesson-accounts
GET  /v1/tenants/:tenantId/orders
POST /v1/tenants/:tenantId/orders
```

所有后台接口必须校验当前用户是否属于该 `tenantId`，且具备对应权限。

## 8. Admin UI 信息架构

参考 `fd-core-stack` 的资源式后台，而不是做成大设置页。

建议导航：

```text
概览
招生
  线索
  跟进
  公开课 / 试听课
课程
  课程
  课时包
教学
  学员
  班级
  排课日历
  签到消课
资源
  老师
  教室
财务
  订单
  支付记录
  老师结算
营销
  渠道
  活动
报表
  招生漏斗
  课时消耗
  收入统计
设置
  机构
  校区
  成员
  权限
```

页面原则：

- 列表优先，表单其次。
- 状态统一用 badge / pill 表达。
- 详情页展示时间线：线索跟进、订单、签到、课时流水。
- 每个资源页只加载本页需要的数据。
- 命令搜索后置，但数据结构要预留。

## 9. Public Web 信息架构

公开端必须适合手机扫码。

页面：

- 机构首页
- 课程列表
- 课程详情
- 公开课 / 试听课列表
- 报名表单
- 报名成功页
- 地址导航页

首版不要让家长注册账号。降低转化摩擦比会员体系更重要。

## 10. MVP 范围

### 10.1 MVP 必须做

公开端：

- 机构首页
- 课程列表
- 课程详情
- 试听课 / 公开课列表
- 报名表单
- 来源参数记录
- 报名成功页

后台端：

- 管理员登录
- 机构和校区初始化
- 首页看板
- 课程 CRUD
- 公开课 / 试听课 CRUD
- 线索列表和状态流转
- 跟进记录
- 线索转学员
- 家长和学员档案
- 老师管理
- 教室管理
- 班级管理
- 创建课次
- 课表列表 / 周视图
- 签到
- 到课扣课时
- 课时余额查看
- 手动登记订单和收款
- 渠道来源统计

工程能力：

- Docker Compose 本地开发
- 数据库迁移
- 种子数据
- 基础测试
- API 文档
- 基础审计日志
- 生产 compose 部署文件

### 10.2 MVP 暂不做

- 微信支付 / 支付宝
- 优惠券
- 多校区复杂调度
- 家长账号体系
- 老师独立端
- 小程序
- 自动合同
- 自动老师结算
- 复杂数据大屏
- AI 教学反馈
- 公众号模板消息

## 11. 商业化必备能力

MVP 之后要补齐以下能力，才适合作为可售卖产品：

- 多机构隔离：所有业务表和接口严格按 `tenant_id` 隔离。
- 机构初始化：一键创建机构、校区、默认角色、默认课程模板。
- 角色权限：老板、管理员、顾问、教务、老师、财务权限分离。
- 数据安全：家长手机号、儿童信息、订单金额等敏感字段避免出现在日志。
- 审计日志：删除、退款、课时调整、权限变更必须留痕。
- 导入导出：线索、学员、课时、订单支持 CSV 导入导出。
- 备份恢复：商业客户必须有数据备份策略。
- 品牌配置：机构 logo、主题色、公开页标题、联系方式、地址。
- 计费授权：如果做 SaaS，需要系统自身的套餐、到期、续费、停用机制。
- 私有化部署：如果卖给本地机构，也要能用 Docker Compose 独立部署。

## 12. 实施计划

### Phase 0：工程骨架

目标：搭好独立 repo，不写业务堆砌代码。

交付：

- `fd-edu-stack` repo
- `api` Fastify 项目
- `admin-ui` Vite 项目
- `public-web` Vite 项目
- PostgreSQL + Redis + Caddy Compose
- Drizzle 迁移链路
- `system`、`auth`、`tenant` 基础模块
- 代码规范、lint、typecheck、基础 CI

建议周期：3-5 天。

### Phase 1：MVP 招生闭环

目标：家长扫码报名，后台产生线索并可跟进转化。

交付：

- 公开端首页、课程列表、课程详情
- 试听课 / 公开课报名
- 渠道参数记录
- 后台课程管理
- 后台试听课管理
- 线索列表、状态流转、跟进记录
- 基础看板：新增线索、待跟进、试听预约、试听到课

建议周期：1-2 周。

### Phase 2：教学闭环

目标：线索转正式学员后，可以排班、排课、签到、消课。

交付：

- 家长和学员档案
- 老师和教室管理
- 班级管理
- 课次创建
- 课表周视图 / 列表视图
- 签到记录
- 课时账户和课时流水
- 到课自动扣课时
- 余额低课时提醒

建议周期：2-3 周。

### Phase 3：财务闭环

目标：能记录真实经营收入和课时资产。

交付：

- 手动订单
- 支付记录
- 退款记录
- 购买课时入账
- 订单关联学员和课程
- 收入统计
- 课时余额统计
- 老师结算规则字段预留

建议周期：1-2 周。

### Phase 4：商业化基础

目标：从内部工具升级为可卖给机构的产品。

交付：

- 多机构管理后台
- 机构开通 / 停用
- 多角色权限
- 品牌配置
- 数据导入导出
- 审计日志完善
- 操作日志查询
- 生产部署文档
- 初始化模板数据
- 备份和恢复脚本

建议周期：2-3 周。

### Phase 5：增长与自动化

目标：提高机构运营效率和复购能力。

交付：

- 自动提醒任务
- 续费提醒
- 试听后未转化提醒
- 渠道转化漏斗
- 招生海报 / 二维码生成
- 老师课表页面
- 老师签到页面
- 课堂反馈和作品上传

建议周期：持续迭代。

### Phase 6：支付与外部生态

目标：根据客户需求接入更深层能力。

交付：

- 微信支付 / 支付宝
- 小程序
- 微信公众号通知
- 短信通知
- 电子合同
- 复杂老师结算
- 多校区调度优化
- 家长会员中心

建议周期：在有真实付费客户后按优先级开发。

## 13. MVP 验收标准

MVP 完成不以页面数量判断，而以下列闭环判断：

1. 海报二维码能进入公开课程页。
2. 家长能提交试听报名。
3. 后台能看到线索和来源。
4. 顾问能记录跟进并修改状态。
5. 线索能转为正式学员。
6. 学员能购买课时包。
7. 学员能加入班级。
8. 管理员能创建课次。
9. 课次能签到。
10. 到课后能扣减课时并产生课时流水。
11. 后台能看到剩余课时和基础转化统计。

只要这 11 条稳定跑通，就具备第一阶段上线验证价值。

## 14. 不建议的做法

- 不要把它做成 `fd-core-stack` 的一个 app。
- 不要共用 `fd-core-stack` 的用户、订单、授权表。
- 不要第一版就做小程序。
- 不要第一版就接支付。
- 不要只做表单 CRUD，忽略线索转化、课时流水和排课冲突。
- 不要后补多租户；后补成本很高。
- 不要只在学员表存剩余课时，必须有课时流水。

## 15. 推荐下一步

下一步可以直接进入工程落地：

1. 新建 `fd-edu-stack` repo。
2. 从 `fd-core-stack` 复制工程思想，不复制业务代码。
3. 先实现 `system/auth/tenant` 三个基础模块。
4. 再实现 `catalog/trial/crm`，跑通扫码报名到线索。
5. 最后实现 `people/scheduling/attendance/lesson/finance`，跑通教学和消课。
