const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { URL } = require('url');

// [保持原样] 端口恢复为 3000
const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

// [保持原样] 这里的端口是 1455，用于骗过 OpenAI 的白名单
const DEFAULT_OPENAI_CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann';

const OPENAI_CONFIG = {
  BASE_URL: process.env.OPENAI_BASE_URL || 'https://auth.openai.com',
  // client_id 统一固定为默认值，避免出现不可用的随机值或配置漂移
  CLIENT_ID: DEFAULT_OPENAI_CLIENT_ID,
  REDIRECT_URI: process.env.OPENAI_REDIRECT_URI || 'http://localhost:1455/auth/callback',
  SCOPE: process.env.OPENAI_SCOPE || 'openid profile email offline_access'
};

const OAUTH_SESSIONS = new Map();
const SESSION_TTL_MS = 10 * 60 * 1000;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8'
};

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try { resolve(JSON.parse(body || '{}')); } 
      catch { reject(new Error('Invalid JSON body')); }
    });
    req.on('error', reject);
  });
}

function cleanupExpiredSessions() {
  const now = Date.now();
  for (const [sid, session] of OAUTH_SESSIONS) {
    if (session.expiresAt <= now) OAUTH_SESSIONS.delete(sid);
  }
}

function generateOpenAIPKCE() {
  const codeVerifier = crypto.randomBytes(64).toString('hex');
  const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
  return { codeVerifier, codeChallenge };
}

function decodeJwtPayload(token) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) throw new Error('Invalid ID token');
  const payload = Buffer.from(parts[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf-8');
  return JSON.parse(payload);
}

async function parseJsonResponse(response) {
  const rawText = await response.text();
  if (!rawText) return {};

  try {
    return JSON.parse(rawText);
  } catch {
    const snippet = rawText.slice(0, 200).replace(/\s+/g, ' ').trim();
    throw new Error(`上游返回了非 JSON 响应（HTTP ${response.status}）：${snippet}`);
  }
}

// 路由处理
async function handleGenerateAuthUrl(req, res) {
  try {
    cleanupExpiredSessions();
    const pkce = generateOpenAIPKCE();
    const state = crypto.randomBytes(32).toString('hex');
    const sessionId = crypto.randomUUID();

    OAUTH_SESSIONS.set(sessionId, {
      codeVerifier: pkce.codeVerifier,
      state,
      expiresAt: Date.now() + SESSION_TTL_MS
    });

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: OPENAI_CONFIG.CLIENT_ID,
      redirect_uri: OPENAI_CONFIG.REDIRECT_URI,
      scope: OPENAI_CONFIG.SCOPE,
      code_challenge: pkce.codeChallenge,
      code_challenge_method: 'S256',
      state,
      id_token_add_organizations: 'true',
      codex_cli_simplified_flow: 'true'
    });

    return sendJson(res, 200, {
      success: true,
      data: {
        authUrl: `${OPENAI_CONFIG.BASE_URL}/oauth/authorize?${params.toString()}`,
        sessionId
      }
    });
  } catch (err) {
    return sendJson(res, 500, { success: false, message: err.message });
  }
}

async function handleExchangeCode(req, res) {
  try {
    const { code, sessionId } = await readJsonBody(req);
    const session = OAUTH_SESSIONS.get(String(sessionId));

    if (!session) return sendJson(res, 400, { success: false, message: '会话无效或已过期' });

    const tokenRes = await fetch(`${OPENAI_CONFIG.BASE_URL}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: OPENAI_CONFIG.REDIRECT_URI,
        client_id: OPENAI_CONFIG.CLIENT_ID,
        code_verifier: session.codeVerifier
      })
    });

    const tokenData = await parseJsonResponse(tokenRes);
    if (!tokenRes.ok) return sendJson(res, 400, { success: false, message: 'OpenAI error', error: tokenData });

    const payload = decodeJwtPayload(tokenData.id_token);
    OAUTH_SESSIONS.delete(String(sessionId));

    return sendJson(res, 200, {
      success: true,
      data: {
        // 返回 Token 信息与 OAuth client_id
        refresh_token: tokenData.refresh_token,
        access_token: tokenData.access_token,
        expires_in: tokenData.expires_in,
        client_id: OPENAI_CONFIG.CLIENT_ID,
        user_email: payload.email 
      }
    });
  } catch (err) {
    return sendJson(res, 500, { success: false, message: err.message });
  }
}

// 静态文件服务
const server = http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/api/generate-auth-url') return handleGenerateAuthUrl(req, res);
  if (req.method === 'POST' && req.url === '/api/exchange-code') return handleExchangeCode(req, res);
  
  let filePath = path.join(PUBLIC_DIR, req.url === '/' ? 'index.html' : req.url);
  if (!path.normalize(filePath).startsWith(PUBLIC_DIR)) return sendJson(res, 403, { error: 'Forbidden' });

  fs.readFile(filePath, (err, content) => {
    if (err) return sendJson(res, 404, { error: 'Not Found' });
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
    res.end(content);
  });
});

server.listen(PORT, () => {
  console.log(`\n> 服务已启动: http://localhost:${PORT}\n`);
});
