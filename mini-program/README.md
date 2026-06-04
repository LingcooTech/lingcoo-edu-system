# FD Edu Mini Program

原生微信小程序一期工程。这个目录可以由微信开发者工具直接打开，也可以独立上传小程序代码。

## 当前已实现

- 首页：读取 `/public/home`，展示机构首屏、亮点、结构化内容块、推荐课程、公开课和家长评价。
- 课程列表：读取 `/public/courses`。
- 课程详情：读取 `/public/courses/:slug`，展示结构化课程内容和课时包，支持创建课时包订单。
- 购买流程：调用 `/public/orders` 创建订单；开发环境使用 `/payment-intent` + `/mock-pay` 模拟支付并完成课时入账。
- 老师页：读取 `/public/teachers`，展示头像、头衔、擅长方向和结构化 bio。
- 活动落地页：读取 `/public/campaigns/:code`，支持二维码 query/scene 进入并提交报名到 `/public/crm/campaigns/:code/participations`。
- 我的页：支持 `wx.login`、微信 openid 登录、微信手机号授权绑定、测试环境手机号手填、家长 token 存储。
- 家长中心：展示我的孩子、课时余额、订单、签到记录和站内通知，并支持通知已读。

## 本地开发

1. 在后端项目根目录启动 API：

   ```bash
   docker compose up -d postgres redis
   npm run db:migrate
   npm run dev
   ```

2. 打开 `mini-program/services/config.ts`，本地默认 API 是：

   ```ts
   export const API_BASE_URL = 'http://localhost:8090';
   ```

3. 用微信开发者工具打开 `mini-program/` 目录。

4. 本地调试如果未配置合法域名，需要在开发者工具中勾选“不校验合法域名、web-view（业务域名）、TLS 版本以及 HTTPS 证书”。

## 上传前必须修改

- `project.config.json` 里的 `appid`：改成真实小程序 AppID。
- `services/config.ts` 里的 `API_BASE_URL`：改成 HTTPS API 域名。
- 微信公众平台后台配置 request 合法域名。

## 微信后台域名怎么填

小程序后台的“开发管理 → 开发设置 → 服务器域名”至少要配置：

- `request 合法域名`：填写后端 API 的 HTTPS 域名，例如 `https://api.example.com`。
- `socket 合法域名`：当前不用 WebSocket，可不填。
- `uploadFile/downloadFile 合法域名`：当前小程序一期不直接上传/下载文件，可先不填；后续接七牛直传或媒体库时再配置 CDN/上传域名。

“业务域名”只在使用 `<web-view>` 打开网页时需要。当前小程序是原生页面，没有使用 web-view，所以暂时不用配置业务域名。

本地开发时 `http://localhost:8090` 不能作为线上合法域名。真机/体验版要访问后端，必须准备一个 HTTPS 域名并部署 API；开发者工具里可以临时勾选“不校验合法域名”用于本地调试。

后端运行环境需要配置：

```bash
WECHAT_MINI_PROGRAM_APP_ID=你的 AppID
WECHAT_MINI_PROGRAM_APP_SECRET=你的 AppSecret
```

不要把 AppSecret 写进仓库。

## 下一步后端/小程序闭环

以下能力需要微信 AppID/AppSecret/商户配置和线上 HTTPS 域名后再做完整闭环：

- 将开发环境 mock 支付替换为小程序 JSAPI 支付，返回 `wx.requestPayment` 参数。
- 订阅消息接口：报名成功、课前提醒、课消通知。

## 代码结构

```text
mini-program/
├── app.json
├── app.ts
├── app.wxss
├── project.config.json
├── components/block-renderer/
├── pages/
│   ├── home/
│   ├── courses/
│   ├── course-detail/
│   ├── teachers/
│   ├── campaign/
│   └── account/
├── services/
│   ├── api.ts
│   └── config.ts
└── utils/
    ├── blocks.ts
    └── format.ts
```
