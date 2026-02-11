const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

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
      } catch (error) {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

async function exchangeCodeForToken({ code, codeVerifier, redirectUri, clientId }) {
  const formPayload = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    code_verifier: codeVerifier,
    client_id: clientId
  });

  const formResponse = await fetch('https://auth.openai.com/oauth/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: formPayload.toString()
  });

  let formResult;
  try {
    formResult = await formResponse.json();
  } catch {
    formResult = { error: 'Invalid JSON response from auth server' };
  }

  if (formResponse.ok) {
    return { ok: true, result: formResult };
  }

  const jsonResponse = await fetch('https://auth.openai.com/oauth/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      code_verifier: codeVerifier,
      client_id: clientId
    })
  });

  let jsonResult;
  try {
    jsonResult = await jsonResponse.json();
  } catch {
    jsonResult = { error: 'Invalid JSON response from auth server' };
  }

  if (jsonResponse.ok) {
    return { ok: true, result: jsonResult };
  }

  return {
    ok: false,
    status: jsonResponse.status || formResponse.status,
    result: {
      formAttempt: formResult,
      jsonAttempt: jsonResult
    }
  };
}

async function handleTokenExchange(req, res) {
  try {
    const parsed = await readJsonBody(req);
    const { code, codeVerifier, redirectUri, clientId } = parsed;

    if (!code || !codeVerifier || !redirectUri || !clientId) {
      return sendJson(res, 400, {
        error: 'Missing required fields: code, codeVerifier, redirectUri, clientId'
      });
    }

    const exchanged = await exchangeCodeForToken({ code, codeVerifier, redirectUri, clientId });

    if (!exchanged.ok) {
      return sendJson(res, exchanged.status || 400, {
        error: 'Token exchange failed',
        details: exchanged.result
      });
    }

    const result = exchanged.result;
    return sendJson(res, 200, {
      refreshToken: result.refresh_token,
      accessToken: result.access_token,
      expiresIn: result.expires_in,
      tokenType: result.token_type,
      scope: result.scope,
      idToken: result.id_token
    });
  } catch (error) {
    return sendJson(res, 500, {
      error: 'Unexpected server error',
      details: error.message
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
  if (req.method === 'POST' && req.url === '/api/exchange') {
    return handleTokenExchange(req, res);
  }

  if (req.method === 'GET') {
    return serveStatic(req, res);
  }

  sendJson(res, 405, { error: 'Method not allowed' });
});

server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
