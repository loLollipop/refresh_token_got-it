# refresh_token_got-it

一个简单的网站工具，流程参考 `chatgpt-team-helper`：

1. 点击按钮直接弹出授权链接（无需填写任何信息）。
2. 复制该链接给别人（或自己）去浏览器打开授权。
3. 授权完成后复制浏览器地址栏中的完整回调 URL（含 `code` 参数）。
4. 粘贴回本站，自动兑换并提取 `refresh_token` 和 `client_id`。

## 本地运行

```bash
npm install
npm start
```

默认地址：`http://localhost:3000`

## 使用步骤

1. 点击“获取授权链接”。
2. 弹窗中复制授权链接并发送给需要授权的人。
3. 对方授权完成后，复制完整回调 URL。
4. 回到本站粘贴回调 URL，点击“提取 refresh token”。
5. 页面显示 `refresh token`、`access token` 和固定 `client_id`。

## 固定参数

- `client_id`: `app_EMoamEEZ73f0CkXaXp7hrann`
- `redirect_uri`: `http://localhost:1455/auth/callback`
- 其余参数包含：`scope=openid profile email offline_access`、`code_challenge_method=S256`、`id_token_add_organizations=true`、`codex_cli_simplified_flow=true`

## 说明

- 使用 PKCE（`code_verifier` + `code_challenge`）保证授权流程完整。
- 为避免浏览器跨域限制，token 兑换通过后端 `/api/exchange` 转发到 `https://auth.openai.com/oauth/token`。
- 请仅在你自己的可信环境部署和使用。
