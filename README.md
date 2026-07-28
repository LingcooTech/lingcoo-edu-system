# lingcoo-edu-system

独立的社区教室 / 小型培训机构招生、排课、签到、消课与运营系统。

本项目不依赖 `lingcoo-core-stack` 的 API 或数据库，只对齐其工程架构和 UI 标准：

- API：Fastify + TypeScript
- 数据库：PostgreSQL + Drizzle ORM
- 后台：React + Vite + TypeScript
- 家长扫码端：React + Vite + TypeScript
- 部署：Docker Compose + Caddy

## 目录

```text
.
├── api
├── admin-ui
├── public-web
├── docs
├── docker
├── scripts
└── deploy
```

微信小程序已拆分为独立仓库：

- `LingcooTech/lingcoo-edu-mini-program`

EasyDeploy 交付脚本也作为独立仓库维护：

- `LingcooTech/lingcoo-easydeploy-edu-system-delivery`

## MVP 闭环

1. 家长扫码进入公开课程页。
2. 家长提交试听 / 公开课报名。
3. 后台生成线索并记录渠道。
4. 顾问跟进线索并更新状态。
5. 线索转学员。
6. 学员购买课时包。
7. 学员加入班级。
8. 管理员创建课次。
9. 课次签到。
10. 到课扣课时并产生课时流水。

## 本地启动

```bash
cp .env.example .env
npm install
docker compose up -d postgres redis
npm run dev:api
npm run dev:admin
npm run dev:public
```

默认入口：

- API: `http://localhost:8090`
- API Docs: `http://localhost:8090/api-docs`
- Admin UI: `http://localhost:5173`
- Public Web: `http://localhost:5174`

默认演示账号：

- Email: `admin@fd-edu.local`
- Password: `admin123456`
