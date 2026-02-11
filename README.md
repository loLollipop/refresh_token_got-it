# refresh_token_got-it

一个简单的网站工具，流程参考 `chatgpt-team-helper`：

1. 点击按钮生成 OpenAI OAuth 授权链接。
2. 复制该链接到浏览器手动授权。
3. 授权完成后复制浏览器地址栏中的完整回调 URL（含 `code` 参数）。
4. 粘贴回本站，自动兑换并提取 `refresh_token`。

## 本地运行

```bash
npm install
npm start
```

默认地址：`http://localhost:3000`

## 使用步骤

1. 打开页面，确认 `client_id` 与 `redirect_uri`（默认 `http://localhost:1455/auth/callback`）。
2. 点击“获取 refresh token 授权链接”。
3. 点击“复制授权链接”，到浏览器打开并完成授权。
4. 在浏览器授权完成页复制完整回调 URL。
5. 回到本站粘贴回调 URL，点击“提取并兑换 Token”。
6. 页面显示 `refresh token` 和 `access token`。

## 说明

- 使用 PKCE（`code_verifier` + `code_challenge`）保证授权流程完整。
- 为避免浏览器跨域限制，token 兑换通过后端 `/api/exchange` 转发到 `https://auth.openai.com/oauth/token`。
- 请仅在你自己的可信环境部署和使用。
