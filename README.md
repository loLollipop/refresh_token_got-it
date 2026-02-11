# OpenAI Refresh Token

这是一个安全、简洁的 OAuth2 Refresh Token 提取工具。
本项目采用 **服务端会话 (Server-side Session) + PKCE** 流程，确保敏感信息不暴露给前端，且最终结果已脱敏。

**本项目已针对 Zeabur 容器平台进行优化，可一键部署。**

## ⚠️ 免责声明 (Disclaimer)

> **请务必仔细阅读：**
> 1.  **仅供学习研究**：本项目仅用于学习 OAuth2 协议与 PKCE 流程，**严禁用于任何非法用途**。
> 2.  **风险自负**：使用者需自行承担使用本工具产生的所有后果（包括但不限于账号风险、数据泄露等）。
> 3.  **安全警告**：获取的 `refresh_token` 拥有您账户的完全访问权限。**切勿将 Token 发送给陌生人或发布在公开场合**。
> 4.  **无担保**：作者不对本工具的稳定性或安全性提供任何形式的担保。

---

## ☁️ Zeabur 部署指南

### 1. 准备代码
确保你已将本项目代码推送到 **GitHub** 仓库。

### 2. 创建服务
1.  登录 [Zeabur Dashboard](https://dash.zeabur.com)。
2.  创建一个新项目 (Project)。
3.  点击 **"新建服务" (New Service)** -> 选择 **"Git"**。
4.  搜索并选择你刚才上传的仓库。
5.  点击部署，Zeabur 会自动识别 Node.js 环境并开始构建。

### 3. 配置域名 (关键)
1.  等待部署成功（变成绿色）。
2.  点击该服务，进入 **"网络" (Networking)** 标签页。
3.  在 "公网访问" (Public) 部分，点击 **"生成域名"** 或 **"自定义域名"**。
4.  你会获得一个类似 `https://refresh-token-xxx.zeabur.app` 的地址。
5.  **现在，你可以通过这个地址访问你的工具了！**

> **关于端口**：Zeabur 会自动注入 `PORT` 环境变量（通常是 8080），本项目代码已自动适配，无需手动配置端口。

---

## 📖 使用教程 (必读)

由于 OpenAI 的 Client ID **强制限制**了回调地址必须为 `http://localhost:1455/auth/callback`，因此**即使你部署在 Zeabur 公网，操作流程也与本地稍有不同**：

1.  **生成链接**：
    * 访问你在 Zeabur 生成的域名（如 `https://your-app.zeabur.app`）。
    * 点击 **“生成链接”**，然后点击 **“复制”**。

2.  **浏览器授权**：
    * 在浏览器新标签页打开刚才复制的链接。
    * 登录 OpenAI 账号并确认授权。

3.  **⚠️ 关键步骤：获取回调 URL**：
    * 授权成功后，浏览器会**强制跳转**到 `http://localhost:1455/...`。
    * **此时页面可能会显示“无法访问此网站”或“连接被拒绝”。**
    * **这是完全正常的！** 因为你的电脑上并没有在 1455 端口运行服务。
    * 请直接**复制浏览器地址栏中完整的 URL**（包含 `?code=...` 的所有内容）。

4.  **提取 Token**：
    * 回到你的 **Zeabur 网页**。
    * 将刚才复制的 `localhost` 完整链接粘贴到输入框中。
    * 点击 **“获取 Token”**，即可在下方看到提取出的 Refresh Token。

---

## 💻 本地开发

如果你想在本地运行调试：

# 1. 安装依赖
```bash
npm install
```
# 2. 启动服务
```bash
npm start
```
访问地址：http://localhost:3000

## 🔌 API 文档
1. 生成授权链接

```
Endpoint: POST /api/generate-auth-url
Response: { "success": true, "data": { "authUrl": "...", "sessionId": "..." } }
```

2. 兑换 Token

```
Endpoint: POST /api/exchange-code
Body: { "code": "...", "sessionId": "..." }
Response:
{
  "success": true,
  "data": {
    "refresh_token": "...",
    "access_token": "...",
    "expires_in": 2592000,
    "user_email": "user@..."
  }
}
```
