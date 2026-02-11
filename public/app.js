const SESSION_ID_KEY = 'openai_oauth_session_id';

const authUrlOutput = document.getElementById('authUrl');
const callbackUrlInput = document.getElementById('callbackUrl');
const refreshTokenOutput = document.getElementById('refreshToken');
const accessTokenOutput = document.getElementById('accessToken');
const resultClientIdInput = document.getElementById('resultClientId');
const statusOutput = document.getElementById('status');

function setStatus(message, isError = false) {
  statusOutput.textContent = message;
  statusOutput.className = isError ? 'error' : 'ok';
}

function extractFirstUrl(text) {
  const raw = String(text || '').trim();
  const match = raw.match(/https?:\/\/[^\s]+/);
  return match ? match[0] : raw;
}

function parseCallbackUrl(rawText) {
  const candidate = extractFirstUrl(rawText);
  const url = new URL(candidate);
  const code = url.searchParams.get('code');

  if (!code) {
    throw new Error('回调 URL 中缺少 code 参数。请确认粘贴的是完整授权回调地址。');
  }

  return {
    code,
    callbackUrl: url.toString()
  };
}

async function generateAuthorizationLink() {
  try {
    setStatus('正在生成授权链接...');

    const resp = await fetch('/api/generate-auth-url', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({})
    });

    const data = await resp.json();
    if (!resp.ok || !data.success) {
      throw new Error(data.message || '生成授权链接失败');
    }

    const { authUrl, sessionId } = data.data;
    localStorage.setItem(SESSION_ID_KEY, sessionId);
    authUrlOutput.value = authUrl;

    window.prompt('复制下面授权链接发给对方去授权：', authUrl);
    setStatus('授权链接已弹出。请复制授权后回调 URL 粘贴到下方提取 refresh token。');
  } catch (error) {
    setStatus(error.message || '生成授权链接失败', true);
  }
}

async function exchangeToken() {
  try {
    const sessionId = localStorage.getItem(SESSION_ID_KEY);
    if (!sessionId) {
      throw new Error('未找到会话，请先点击“获取授权链接”。');
    }

    const { code, callbackUrl } = parseCallbackUrl(callbackUrlInput.value);
    setStatus('正在向服务器兑换 token...');

    const resp = await fetch('/api/exchange-code', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ code, sessionId, callbackUrl })
    });

    const data = await resp.json();
    if (!resp.ok || !data.success) {
      throw new Error(data.message + (data.error ? `: ${JSON.stringify(data.error)}` : ''));
    }

    const tokens = data.data.tokens || {};
    const accountInfo = data.data.accountInfo || {};

    resultClientIdInput.value = accountInfo.clientId || '';
    refreshTokenOutput.value = tokens.refreshToken || '';
    accessTokenOutput.value = tokens.accessToken || '';

    if (!tokens.refreshToken) {
      setStatus('兑换成功，但未返回 refresh token。请确认授权已同意 offline_access。', true);
      return;
    }

    setStatus('兑换成功，已提取 refresh token 和 client id。');
    localStorage.removeItem(SESSION_ID_KEY);
  } catch (error) {
    setStatus(error.message || '兑换失败', true);
  }
}

function clearAll() {
  authUrlOutput.value = '';
  callbackUrlInput.value = '';
  resultClientIdInput.value = '';
  refreshTokenOutput.value = '';
  accessTokenOutput.value = '';
  statusOutput.textContent = '';
}

document.getElementById('authorizeBtn').addEventListener('click', generateAuthorizationLink);
document.getElementById('extractBtn').addEventListener('click', exchangeToken);
document.getElementById('clearBtn').addEventListener('click', clearAll);
