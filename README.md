# refresh_token_got-it

按你给的项目思路改成「服务端会话 + 回调兑换」流程：

1. 点击“获取授权链接”时，服务端生成 `sessionId + code_verifier + code_challenge + state`。
2. 前端拿到授权链接后弹窗给你复制。
3. 你去浏览器授权后，把完整回调 URL 粘贴回来。
4. 前端只提交 `code + sessionId (+ callbackUrl)` 给服务端。
5. 服务端用会话里保存的 `code_verifier` 去交换 token，返回 `refresh_token` 和账户信息。

## 本地运行

```bash
npm install
npm start
```

默认地址：`http://localhost:3000`

## API

- `POST /api/generate-auth-url`
  - 返回：`{ success, data: { authUrl, sessionId, instructions } }`
- `POST /api/exchange-code`
  - 入参：`{ code, sessionId, callbackUrl }`
  - 返回：`{ success, data: { tokens, accountInfo } }`

## 固定参数

- `client_id`: `app_EMoamEEZ73f0CkXaXp7hrann`
- `redirect_uri`: `http://localhost:1455/auth/callback`
- `scope`: `openid profile email offline_access`

## 提取失败排查

- 每次点“获取授权链接”都会生成新的 `code_verifier/state`，必须使用这一条链接完成授权并粘贴对应回调。
- 回调地址必须含 `code=...` 参数；可直接粘贴整段文字，页面会自动提取第一个 URL。
- 后端兑换优先使用 `application/x-www-form-urlencoded`（与多数 OAuth 服务兼容），失败时自动再尝试 JSON。

## 说明

- 会话默认 10 分钟过期。
- token 兑换使用 `application/x-www-form-urlencoded`。
- 会解析 `id_token` 提取 `accountId/organization/email` 等信息。
