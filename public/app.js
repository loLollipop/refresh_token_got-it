const STORAGE_KEY = 'openai_oauth_flow';
const FIXED_CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann';
const FIXED_REDIRECT_URI = 'http://localhost:1455/auth/callback';

const authUrlOutput = document.getElementById('authUrl');
const callbackUrlInput = document.getElementById('callbackUrl');
const refreshTokenOutput = document.getElementById('refreshToken');
const accessTokenOutput = document.getElementById('accessToken');
const resultClientIdInput = document.getElementById('resultClientId');
const statusOutput = document.getElementById('status');

function toBase64Url(bytes) {
  const binary = String.fromCharCode(...bytes);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function randomString(length = 64) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return toBase64Url(bytes);
}

async function createPkceChallenge(codeVerifier) {
  const encoder = new TextEncoder();
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(codeVerifier));
  return toBase64Url(new Uint8Array(digest));
}

function setStatus(message, isError = false) {
  statusOutput.textContent = message;
  statusOutput.className = isError ? 'error' : 'ok';
}

function buildAuthorizeUrl({ codeChallenge, state }) {
  const url = new URL('https://auth.openai.com/oauth/authorize');
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', FIXED_CLIENT_ID);
  url.searchParams.set('redirect_uri', FIXED_REDIRECT_URI);
  url.searchParams.set('scope', 'openid profile email offline_access');
  url.searchParams.set('code_challenge', codeChallenge);
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('state', state);
  url.searchParams.set('id_token_add_organizations', 'true');
  url.searchParams.set('codex_cli_simplified_flow', 'true');
  return url.toString();
}

async function generateAuthorizationLink() {
  const codeVerifier = randomString(72);
  const codeChallenge = await createPkceChallenge(codeVerifier);
  const state = randomString(32);

  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      codeVerifier,
      state,
      clientId: FIXED_CLIENT_ID,
      redirectUri: FIXED_REDIRECT_URI,
      createdAt: Date.now()
    })
  );

  const url = buildAuthorizeUrl({ codeChallenge, state });
  authUrlOutput.value = url;

  window.prompt('复制下面授权链接发给对方去授权：', url);
  setStatus('授权链接已弹出，请复制并打开授权。授权后把完整回调 URL 粘贴回来提取。');
}

function parseCallbackUrl(rawUrl) {
  const url = new URL(rawUrl.trim());
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');

  if (!code) {
    throw new Error('回调 URL 中缺少 code 参数。');
  }

  return { code, state };
}

async function exchangeToken() {
  try {
    const flowRaw = localStorage.getItem(STORAGE_KEY);
    if (!flowRaw) {
      throw new Error('未找到授权上下文，请先点击“获取授权链接”。');
    }

    const flow = JSON.parse(flowRaw);
    const { code, state } = parseCallbackUrl(callbackUrlInput.value);

    if (flow.state && state && flow.state !== state) {
      throw new Error('state 不匹配，可能不是同一次授权流程。');
    }

    setStatus('正在向服务器兑换 token...');

    const resp = await fetch('/api/exchange', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        code,
        codeVerifier: flow.codeVerifier,
        redirectUri: flow.redirectUri,
        clientId: flow.clientId
      })
    });

    const data = await resp.json();
    if (!resp.ok) {
      throw new Error(data.error + (data.details ? `: ${JSON.stringify(data.details)}` : ''));
    }

    resultClientIdInput.value = flow.clientId;
    refreshTokenOutput.value = data.refreshToken || '';
    accessTokenOutput.value = data.accessToken || '';

    if (!data.refreshToken) {
      setStatus('兑换成功，但接口未返回 refresh token。请检查 scope 是否包含 offline_access。', true);
      return;
    }

    setStatus('兑换成功，已提取 refresh token 和 client id。');
  } catch (error) {
    setStatus(error.message || '兑换失败', true);
  }
}

function clearAll() {
  authUrlOutput.value = '';
  callbackUrlInput.value = '';
  resultClientIdInput.value = FIXED_CLIENT_ID;
  refreshTokenOutput.value = '';
  accessTokenOutput.value = '';
  statusOutput.textContent = '';
}

resultClientIdInput.value = FIXED_CLIENT_ID;

document.getElementById('authorizeBtn').addEventListener('click', generateAuthorizationLink);
document.getElementById('extractBtn').addEventListener('click', exchangeToken);
document.getElementById('clearBtn').addEventListener('click', clearAll);
