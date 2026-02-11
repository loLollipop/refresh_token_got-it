# refresh_token_got-it

一个简单的网站工具：

1. 点击按钮自动跳转到 OpenAI 授权页。
2. 用户完成授权后自动回跳到本站 `/auth/callback`。
3. 页面自动提取回调 URL 中的 `code` 并兑换 token，提取 `refresh_token`。

## 本地运行

```bash
npm install
npm start
```

默认地址：`http://localhost:3000`

## 使用步骤

1. 打开页面，填写 `client_id`（默认值已按你给的示例预填）。
2. `redirect_uri` 默认自动填充为当前网站地址：`https://你的域名/auth/callback`。
3. 点击“获取授权链接并跳转”。
4. 在 OpenAI 完成登录授权后，会自动回跳到本站回调地址。
5. 页面会自动提取 `code` 并兑换，显示 `refresh token` 和 `access token`。

## 说明

- 使用了 PKCE（`code_verifier` + `code_challenge`）保证授权流程完整。
- 为避免浏览器跨域限制，token 兑换通过本项目后端 `/api/exchange` 转发到 `https://auth.openai.com/oauth/token`。
- 服务端已将 `/auth/callback` 路由回同一个前端页面，配合前端自动完成回调处理。
- 请仅在你自己的可信环境部署和使用。
