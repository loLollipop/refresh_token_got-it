const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { URL } = require('url');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

const OPENAI_CONFIG = {
  BASE_URL: process.env.OPENAI_BASE_URL || 'https://auth.openai.com',
  CLIENT_ID: process.env.OPENAI_CLIENT_ID || 'app_EMoamEEZ73f0CkXaXp7hrann',
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
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8'
  });
  res.end(JSON.stringify(payload));
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(body || '{}'));
      } catch {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

function cleanupExpiredSessions() {
  const now = Date.now();
  for (const [sessionId, session] of OAUTH_SESSIONS.entries()) {
    if (session.expiresAt <= now) {
      OAUTH_SESSIONS.delete(sessionId);
    }
  }
}

function generateOpenAIPKCE() {
  const codeVerifier = crypto.randomBytes(64).toString('hex');
  const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
  return { codeVerifier, codeChallenge };
}

function decodeJwtPayload(token) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) {
    throw new Error('Invalid ID token format');
  }

  const payloadSegment = parts[1].replace(/-/g, '+').replace(/_/g, '/');
  const paddedPayload = payloadSegment.padEnd(Math.ceil(payloadSegment.length / 4) * 4, '=');
  const decoded = Buffer.from(paddedPayload, 'base64').toString('utf-8');
  return JSON.parse(decoded);
}

async function handleGenerateAuthUrl(req, res) {
  try {
    cleanupExpiredSessions();

    if (!OPENAI_CONFIG.REDIRECT_URI) {
      return sendJson(res, 500, {
        success: false,
        message: 'OPENAI_REDIRECT_URI 未配置，无法生成授权链接'
      });
    }

    const pkce = generateOpenAIPKCE();
    const state = crypto.randomBytes(32).toString('hex');
    const sessionId = crypto.randomUUID();

    OAUTH_SESSIONS.set(sessionId, {
      codeVerifier: pkce.codeVerifier,
      codeChallenge: pkce.codeChallenge,
      state,
      createdAt: Date.now(),
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

    const authUrl = `${OPENAI_CONFIG.BASE_URL}/oauth/authorize?${params.toString()}`;

    return sendJson(res, 200, {
      success: true,
      data: {
        authUrl,
        sessionId,
        instructions: [
          '1. 复制上面的链接到浏览器中打开',
          '2. 登录您的 OpenAI 账户',
          '3. 同意应用权限',
          '4. 复制浏览器地址栏中的完整 URL（包含 code 参数）',
          '5. 在本网站粘贴完整回调 URL'
        ]
      }
    });
  } catch (error) {
    return sendJson(res, 500, {
      success: false,
      message: '生成授权链接失败',
      error: error.message
    });
  }
}

async function handleExchangeCode(req, res) {
  try {
    cleanupExpiredSessions();

    const { code, sessionId, callbackUrl } = await readJsonBody(req);

    if (!code || !sessionId) {
      return sendJson(res, 400, {
        success: false,
        message: '缺少必要参数: code, sessionId'
      });
    }

    const sessionData = OAUTH_SESSIONS.get(String(sessionId));
    if (!sessionData) {
      return sendJson(res, 400, {
        success: false,
        message: '会话已过期或无效，请重新生成授权链接'
      });
    }

    if (callbackUrl) {
      const parsed = new URL(String(callbackUrl));
      const stateFromCallback = parsed.searchParams.get('state');
      if (stateFromCallback && stateFromCallback !== sessionData.state) {
        return sendJson(res, 400, {
          success: false,
          message: 'state 不匹配，请使用同一次生成的授权链接与回调地址'
        });
      }
    }

    const tokenPayload = new URLSearchParams({
      grant_type: 'authorization_code',
      code: String(code).trim(),
      redirect_uri: OPENAI_CONFIG.REDIRECT_URI,
      client_id: OPENAI_CONFIG.CLIENT_ID,
      code_verifier: sessionData.codeVerifier
    }).toString();

    const tokenResponse = await fetch(`${OPENAI_CONFIG.BASE_URL}/oauth/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: tokenPayload
    });

    let tokenJson;
    try {
      tokenJson = await tokenResponse.json();
    } catch {
      tokenJson = { error: 'Invalid token response' };
    }

    if (!tokenResponse.ok) {
      return sendJson(res, tokenResponse.status || 500, {
        success: false,
        message: '交换授权码失败',
        error: tokenJson
      });
    }

    const {
      id_token: idToken,
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_in: expiresIn
    } = tokenJson || {};

    if (!idToken || !accessToken) {
      return sendJson(res, 500, {
        success: false,
        message: '未返回有效的授权令牌',
        error: tokenJson
      });
    }

    const payload = decodeJwtPayload(idToken);
    const authClaims = payload['https://api.openai.com/auth'] || {};
    const organizations = authClaims.organizations || [];
    const defaultOrg = organizations.find((org) => org.is_default) || organizations[0] || {};

    OAUTH_SESSIONS.delete(String(sessionId));

    return sendJson(res, 200, {
      success: true,
      data: {
        tokens: {
          idToken,
          accessToken,
          refreshToken,
          expiresIn: expiresIn || 0
        },
        accountInfo: {
          clientId: OPENAI_CONFIG.CLIENT_ID,
          accountId: authClaims.chatgpt_account_id || '',
          chatgptUserId: authClaims.chatgpt_user_id || authClaims.user_id || '',
          organizationId: defaultOrg.id || '',
          organizationRole: defaultOrg.role || '',
          organizationTitle: defaultOrg.title || '',
          planType: authClaims.chatgpt_plan_type || '',
          email: payload.email || '',
          name: payload.name || '',
          emailVerified: payload.email_verified || false,
          organizations
        }
      }
    });
  } catch (error) {
    return sendJson(res, 500, {
      success: false,
      message: '交换授权码失败',
      error: error.message
    });
  }
}

function serveStatic(req, res) {
  const reqUrl = new URL(req.url, `http://${req.headers.host}`);
  let pathname = reqUrl.pathname;

  if (pathname === '/') {
    pathname = '/index.html';
  }

  const safePath = path.normalize(path.join(PUBLIC_DIR, pathname));
  if (!safePath.startsWith(PUBLIC_DIR)) {
    sendJson(res, 403, { error: 'Forbidden' });
    return;
  }

  fs.readFile(safePath, (err, data) => {
    if (err) {
      sendJson(res, 404, { error: 'Not found' });
      return;
    }

    const ext = path.extname(safePath);
    res.writeHead(200, {
      'Content-Type': MIME_TYPES[ext] || 'application/octet-stream'
    });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/api/generate-auth-url') {
    return handleGenerateAuthUrl(req, res);
  }

  if (req.method === 'POST' && req.url === '/api/exchange-code') {
    return handleExchangeCode(req, res);
  }

  if (req.method === 'GET') {
    return serveStatic(req, res);
  }

  sendJson(res, 405, { error: 'Method not allowed' });
});

server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
