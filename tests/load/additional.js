import http from 'k6/http';
import { check, sleep } from 'k6';
import execution from 'k6/execution';
import { Counter, Rate, Trend } from 'k6/metrics';
import { additionalSettings } from './additional-config.mjs';

const config = additionalSettings(__ENV);
const api = `${config.base}/api/v1`;
const password = 'Loadtest1234';
const unexpected = new Rate('unexpected_responses');
const duration = new Trend('auth_duration', true);
const outages = new Counter('observed_outages');
const recovered = new Counter('recovered_requests');
let business = false;

export const options = {
  scenarios: { [config.name]: config.scenario },
  setupTimeout: '120s', noCookiesReset: true, maxRedirects: 0,
  systemTags: ['status', 'method', 'name', 'scenario', 'expected_response'],
  summaryTrendStats: ['avg', 'max', 'p(95)', 'p(99)'],
  thresholds: {
    checks: ['rate==1'], unexpected_responses: ['rate==0'],
    ...(config.name === 'faults' ? { observed_outages: ['count>0'], recovered_requests: ['count>5'] }
      : { http_req_failed: ['rate==0'], auth_duration: ['p(95)<2500', 'p(99)<5000'] }),
    ...(config.name === 'arrival' ? { dropped_iterations: ['count==0'] } : {}),
  },
};

function verify(ok, label) {
  check(ok, { [label]: value => value });
  if (!ok) execution.test.abort(`Invariant failed: ${label}`);
}

function request(method, path, body, expected = [200], session, timeout = '10s') {
  const headers = { 'Content-Type': 'application/json' };
  if (session?.csrf && method !== 'GET') headers[session.csrf.headerName] = session.csrf.token;
  const response = http.request(method, api + path, body === undefined ? null : JSON.stringify(body), {
    headers, jar: session?.jar, timeout, redirects: 0,
    tags: { name: path.replace(/\/\d+/g, '/:id') }, responseCallback: http.expectedStatuses(...expected.filter(x => x > 0)),
  });
  unexpected.add(!expected.includes(response.status));
  verify(expected.includes(response.status), `${method} ${path.replace(/\/\d+/g, '/:id')} expected status`);
  if (business && config.name !== 'faults') duration.add(response.timings.duration);
  return response;
}

function fresh() {
  const session = { jar: new http.CookieJar() };
  session.csrf = request('GET', '/members/csrf', undefined, [200], session).json();
  return session;
}

function login(username, pass = password) {
  const session = fresh();
  const before = session.jar.cookiesForURL(api).SESSION?.[0];
  const oldCsrf = session.csrf;
  request('POST', '/members/login', { username, password: pass, rememberMe: true }, [200], session);
  verify(Boolean(before) && session.jar.cookiesForURL(api).SESSION?.[0] !== before, 'Login rotates session ID');
  request('PATCH', '/members/me/avatar', { avatar: 'green' }, [403], session);
  session.csrf = request('GET', '/members/csrf', undefined, [200], session).json();
  verify(session.csrf.token !== oldCsrf.token, 'Login replaces CSRF token');
  return session;
}

export function setup() {
  if (config.name === 'mail') return {};
  const users = [];
  const count = config.scenario.maxVUs || config.scenario.vus;
  for (let i = 0; i < count; i++) {
    const username = `a${Date.now().toString(36)}${i}`;
    const session = fresh();
    request('POST', '/members/join', { username, password, nickname: 'assurance' }, [201], session);
    const authenticated = login(username);
    const member = request('GET', '/members/me', undefined, [200], authenticated).json();
    let application;
    if (config.name === 'faults') {
      application = request('POST', '/applications', { company: 'Fault fixture', position: 'Backend', status: 'APPLIED',
        appliedDate: '2026-10-08', memo: 'Disposable fixture', link: 'https://example.invalid' }, [201], authenticated).json();
    }
    users.push({ username, id: member.id, application, cookies: authenticated.jar.cookiesForURL(api), csrf: authenticated.csrf });
    if (config.name !== 'faults') request('POST', '/members/logout', {}, [204], authenticated);
  }
  return { users };
}

export function auth(data) {
  business = true;
  const user = data.users[execution.vu.idInTest - 1];
  const first = login(user.username);
  const second = login(user.username);
  const avatar = request('PATCH', '/members/me/avatar', { avatar: 'green', memberId: -1 }, [200], first).json();
  verify(avatar.id === user.id && avatar.avatar === 'green', 'Avatar stays scoped to authenticated member');
  const methods = request('GET', '/members/me/login-methods', undefined, [200], second).json();
  verify(!JSON.stringify(methods).includes(password), 'Login methods omit credentials');
  request('POST', '/members/logout-all', {}, [204], first);
  request('GET', '/members/me', undefined, [401], first);
  request('GET', '/members/me', undefined, [401], second);
  const third = login(user.username);
  verify(request('GET', '/members/me', undefined, [200], third).json().id === user.id, 'Fresh login preserves identity');
  request('POST', '/members/logout', {}, [204], third);
}

function mailToken(email, route) {
  for (let attempt = 0; attempt < 60; attempt++) {
    const list = http.get('http://127.0.0.1:15436/api/v1/messages?limit=200', { tags: { name: 'mailbox-list' } });
    verify(list.status === 200, 'Isolated mail sink available');
    for (const message of list.json().messages || []) {
      if (!message.To?.some(to => to.Address === email)) continue;
      const detail = http.get(`http://127.0.0.1:15436/api/v1/message/${message.ID}`, { tags: { name: 'mailbox-message' } });
      verify(detail.status === 200, 'Mail message available');
      const marker = `${config.base}/${route}#token=`;
      const token = (detail.json().Text || '').split(marker)[1]?.match(/^[A-Za-z0-9_-]{43}/)?.[0];
      if (token) return token;
    }
    sleep(0.25);
  }
  execution.test.abort('Expected synthetic email not delivered within 15 seconds');
}

export function mail() {
  business = true;
  const username = `m${Date.now().toString(36)}${execution.scenario.iterationInTest}`;
  const email = `${username}@load.test`;
  const publicSession = fresh();
  request('POST', '/members/registration/requests', { email }, [202], publicSession);
  const token = mailToken(email, 'verify-registration');
  request('POST', '/members/registration/confirm', { token, member: { username, password, nickname: 'mail-load' } }, [201], publicSession);
  request('GET', '/members/me', undefined, [401], publicSession);
  const first = login(username);
  const second = login(username);
  request('POST', '/members/password-reset/requests', { username, email }, [202], publicSession);
  const reset = mailToken(email, 'reset-password');
  const newPassword = 'Newload1234';
  request('POST', '/members/password-reset/confirm', { token: reset, newPassword }, [204], publicSession);
  request('GET', '/members/me', undefined, [401], first);
  request('GET', '/members/me', undefined, [401], second);
  request('POST', '/members/password-reset/confirm', { token: reset, newPassword }, [400], publicSession);
  request('POST', '/members/login', { username, password }, [401], fresh());
  const updated = login(username, newPassword);
  request('DELETE', '/members/me', { currentPassword: newPassword }, [204], updated);
  request('POST', '/members/login', { username, password: newPassword }, [401], fresh());
}

let faultSession;
export function faults(data) {
  const user = data.users[0];
  if (!faultSession) {
    faultSession = { jar: new http.CookieJar(), csrf: user.csrf };
    for (const [name, values] of Object.entries(user.cookies)) for (const value of values) faultSession.jar.set(config.base, name, value, { path: '/' });
  }
  const elapsed = (Date.now() - execution.scenario.startTime) / 1000;
  const permitted = elapsed > 60 ? [200] : [200, 0, 500, 503];
  for (const path of ['/members/me', `/applications/${user.application.id}`]) {
    const response = request('GET', path, undefined, permitted, faultSession, '2s');
    if (response.status === 200) {
      verify(response.json().id === (path === '/members/me' ? user.id : user.application.id), 'Recovered identity and application intact');
      if (elapsed > 60) recovered.add(1);
    } else {
      outages.add(1);
      verify(!/org\.springframework|jdbc:postgresql|SELECT .*FROM|stackTrace/i.test(response.body || ''), 'Fault response omits internal details');
    }
  }
  const anonymous = { jar: new http.CookieJar() };
  request('GET', '/members/me', undefined, elapsed > 60 ? [401] : [401, 0, 500, 503], anonymous, '2s');
  sleep(0.2);
}

export function handleSummary(data) {
  return { [__ENV.RESULT_FILE || 'additional-summary.json']: JSON.stringify({ profile: config.name, metrics: data.metrics, state: data.state }, null, 2) };
}
