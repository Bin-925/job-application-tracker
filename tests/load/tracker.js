import http from 'k6/http';
import { check, sleep } from 'k6';
import exec from 'k6/execution';
import { Rate, Trend, Counter } from 'k6/metrics';
import { settings, scenario } from './config.mjs';

const config = settings(__ENV);
const api = `${config.base}/api/v1`;
const password = 'Loadtest1234'; // Synthetic accounts in a disposable, loopback-only database.
const today = new Date().toISOString().slice(0, 10);
const failures = new Rate('unexpected_responses');
const businessTime = new Trend('business_duration', true);
const conflicts = new Counter('accepted_conflicts');
const limited = new Counter('accepted_rate_limits');
let phase = 'fixture';

export const options = {
  scenarios: { [config.name]: scenario(config) },
  setupTimeout: '180s', teardownTimeout: '15s', noCookiesReset: true,
  maxRedirects: 0, insecureSkipTLSVerify: false,
  summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(90)', 'p(95)', 'p(99)'],
  systemTags: ['status', 'method', 'name', 'scenario', 'expected_response'],
  thresholds: {
    checks: ['rate==1'], unexpected_responses: ['rate==0'],
    http_req_failed: ['rate<0.01'],
    ...(config.name === 'limits' ? { accepted_rate_limits: ['count>0'] } :
      { business_duration: ['p(95)<1000', 'p(99)<2000'] }),
    ...(config.name === 'conflict' ? { accepted_conflicts: ['count>0'] } : {}),
    ...(['smoke', 'load', 'spike', 'soak', 'volume'].includes(config.name) ? {
      'business_duration{name:/applications,method:GET}': ['p(95)<1000'],
      'business_duration{method:POST}': ['p(95)<1000'],
    } : {}),
  },
};

function verify(ok, label) {
  check(ok, { [label]: value => value });
  if (!ok) exec.test.abort(`Invariant failed: ${label}`);
}

function request(method, path, body, expected = [200], session, name = path) {
  const headers = { 'Content-Type': 'application/json' };
  if (session?.csrf && method !== 'GET') headers[session.csrf.headerName] = session.csrf.token;
  const result = http.request(method, api + path, body === undefined ? null : JSON.stringify(body), {
    headers, jar: session?.jar, timeout: '10s', redirects: 0,
    tags: { name, phase }, responseCallback: http.expectedStatuses(...expected),
  });
  const ok = expected.includes(result.status);
  failures.add(!ok);
  check(result, { [`${name}: expected status`]: () => ok });
  if (phase === 'business') businessTime.add(result.timings.duration, { name, method });
  if (!ok) exec.test.abort(`Unexpected HTTP ${result.status}: ${method} ${name}`);
  return result;
}

function csrf(session) {
  session.csrf = request('GET', '/members/csrf', undefined, [200], session).json();
  verify(Boolean(session.csrf.token && session.csrf.headerName), 'CSRF contract');
}

function login(username, pass = password) {
  const session = { jar: new http.CookieJar() };
  csrf(session);
  request('POST', '/members/login', { username, password: pass }, [200], session);
  csrf(session); // Authentication rotates the session and invalidates the previous CSRF token.
  return session;
}

function register(username) {
  const session = { jar: new http.CookieJar() };
  csrf(session);
  request('POST', '/members/join', { username, password, nickname: 'loadtest' }, [201], session);
  return login(username);
}

function application(suffix = 'seed') {
  return { company: `Load ${suffix}`, position: 'Backend', status: 'APPLIED', appliedDate: today,
    memo: 'Synthetic load fixture', link: 'https://example.invalid/job' };
}

function schedule(title = 'Interview') {
  return { type: 'INTERVIEW', title, date: today, time: '14:00', state: 'SCHEDULED' };
}

function pathFor(id) { return `/applications/${id}`; }
function appRequest(method, id, body, expected, session, suffix = '') {
  return request(method, pathFor(id) + suffix, body, expected, session, `/applications/:id${suffix.replace(/\/\d+/g, '/:id')}`);
}

export function setup() {
  if (config.name === 'limits') return {};
  const count = config.name === 'contract' ? 3 : config.name === 'conflict' ? 1 : config.vus;
  const prefix = `k${Date.now().toString(36)}`;
  const users = [];
  for (let i = 0; i < count; i++) {
    const username = `${prefix}${i}`;
    const session = register(username);
    const ids = [];
    for (let j = 0; j < config.records; j++) {
      const app = request('POST', '/applications', application(`${i}-${j}`), [201], session).json();
      ids.push(app.id);
      // Mixed calendar data, including applications without events.
      if (j % 5 === 0) appRequest('POST', app.id, schedule(), [201], session, '/schedules');
    }
    users.push({ username, ids, csrf: session.csrf, cookies: session.jar.cookiesForURL(api) });
  }
  return { users };
}

function restore(user) {
  const jar = new http.CookieJar();
  for (const [name, values] of Object.entries(user.cookies)) {
    for (const value of values) jar.set(config.base, name, value, { path: '/' });
  }
  return { jar, csrf: user.csrf };
}

export function journey(data) {
  phase = 'business';
  const user = data.users[(exec.vu.idInTest - 1) % data.users.length];
  const session = restore(user);
  request('GET', '/members/me', undefined, [200], session);
  const list = request('GET', '/applications', undefined, [200], session).json();
  verify(Array.isArray(list) && list.length === config.records, 'fixture list size and cleanup');
  request('GET', '/applications/stats', undefined, [200], session);
  const original = appRequest('GET', user.ids[0], undefined, [200], session).json();
  verify(original.id === user.ids[0], 'owned detail');
  // Search/filter/month calendar are client-side operations over this same list API.
  if (exec.vu.iterationInScenario % 4 === 0) {
    let app = request('POST', '/applications', application('new'), [201], session).json();
    const id = app.id;
    app = appRequest('PUT', id, { ...application('edited'), version: app.version }, [200], session).json();
    verify(app.company === 'Load edited', 'application edit persisted');
    app = appRequest('PATCH', id, { status: 'INTERVIEW', version: app.version }, [200], session, '/status').json();
    verify(app.status === 'INTERVIEW', 'status changed');
    app = appRequest('POST', id, schedule(), [201], session, '/schedules').json();
    app = appRequest('POST', id, { ...schedule('Deadline'), type: 'DEADLINE' }, [201], session, '/schedules').json();
    verify(app.schedules.length === 2, 'multiple schedules');
    const event = app.schedules[0];
    app = appRequest('PUT', id, { ...schedule(), state: 'COMPLETED', version: event.version }, [200], session,
      `/schedules/${event.id}`).json();
    verify(app.schedules.find(s => s.id === event.id)?.state === 'COMPLETED', 'schedule state persisted');
    appRequest('DELETE', id, undefined, [204], session, `/schedules/${event.id}`);
    app = appRequest('GET', id, undefined, [200], session).json();
    verify(app.schedules.length === 1, 'schedule delete persisted');
    appRequest('DELETE', id, undefined, [204], session);
    appRequest('GET', id, undefined, [404], session);
  }
  sleep(0.3 + Math.random() * 0.4);
}

export function conflict(data) {
  phase = 'business';
  const user = data.users[0], session = restore(user), id = user.ids[0];
  const snapshot = appRequest('GET', id, undefined, [200], session).json();
  sleep(0.05);
  // A no-op update need not dirty the JPA entity or increment its version.
  const result = appRequest('PUT', id, {
    ...application(`vu${exec.vu.idInTest}-${exec.vu.iterationInScenario}`), version: snapshot.version },
    [200, 409], session);
  if (result.status === 409) conflicts.add(1);
  else verify(result.json().version > snapshot.version, 'successful write advances version');
  sleep(0.1);
}

export function contract(data) {
  phase = 'business';
  const [a, b, c] = data.users;
  let session = restore(a);
  const other = restore(b);
  const id = a.ids[0];
  request('GET', '/applications', undefined, [401], { jar: new http.CookieJar() });
  request('POST', '/applications', application(), [403], { jar: session.jar });
  request('POST', '/applications', { ...application(), company: '' }, [400], session);
  request('POST', '/applications', { ...application(), memo: 'x'.repeat(33000) }, [413], session);
  appRequest('GET', id, undefined, [403], other);
  appRequest('PUT', id, { ...application(), version: 0 }, [403], other);
  appRequest('PATCH', id, { status: 'INTERVIEW', version: 0 }, [403], other, '/status');
  appRequest('POST', id, schedule(), [403], other, '/schedules');
  appRequest('DELETE', id, undefined, [403], other);
  let app = appRequest('GET', id, undefined, [200], session).json();
  const snapshot = app.version;
  appRequest('PUT', id, { ...application('winner'), version: snapshot }, [200], session);
  appRequest('PUT', id, { ...application('stale'), version: snapshot }, [409], session);
  app = appRequest('GET', id, undefined, [200], session).json();
  verify(app.company === 'Load winner', 'stale application cannot overwrite');
  const statusVersion = app.version;
  app = appRequest('PATCH', id, { status: 'ACCEPTED', version: statusVersion }, [200], session, '/status').json();
  appRequest('PATCH', id, { status: 'INTERVIEW', version: statusVersion }, [409], session, '/status');
  app = appRequest('GET', id, undefined, [200], session).json();
  verify(app.status === 'ACCEPTED', 'stale status cannot overwrite');
  const event = app.schedules[0];
  appRequest('PUT', id, { ...schedule('winner'), version: event.version }, [200], session, `/schedules/${event.id}`);
  appRequest('PUT', id, { ...schedule('stale'), version: event.version }, [409], session, `/schedules/${event.id}`);
  appRequest('DELETE', id, undefined, [403], other, `/schedules/${event.id}`);
  const again = login(a.username);
  request('PATCH', '/members/me/nickname', { nickname: 'changed' }, [200], session);
  request('POST', '/members/logout-all', {}, [204], session);
  request('GET', '/members/me', undefined, [401], again);
  session = login(a.username);
  const beforePassword = login(a.username);
  request('PATCH', '/members/me/password', { currentPassword: password, newPassword: 'Changed1234' }, [204], session);
  request('GET', '/members/me', undefined, [401], beforePassword);
  session = login(a.username, 'Changed1234');
  request('POST', '/members/logout', {}, [204], session);
  request('GET', '/members/me', undefined, [401], session);
  const deleted = restore(c);
  request('DELETE', '/members/me', { currentPassword: password }, [204], deleted);
  request('GET', '/members/me', undefined, [401], deleted);
}

export function limits() {
  phase = 'business';
  const session = { jar: new http.CookieJar() };
  csrf(session);
  for (let i = 0; i < 6; i++) {
    const result = request('POST', '/members/join', { username: `limituser${i}`, password, nickname: 'limit' },
      i < 5 ? [201] : [429], session);
    if (result.status === 429) limited.add(1);
  }
  for (let i = 0; i < 11; i++) {
    const result = request('POST', '/members/login', { username: 'limituser0', password: 'Incorrect123' },
      i < 10 ? [401] : [429], session);
    if (result.status === 429) {
      limited.add(1);
      verify(Number(result.headers['Retry-After']) > 0, 'account limit Retry-After');
    }
  }
  let last;
  for (let i = 0; i < 40; i++) {
    last = request('POST', '/members/login', { username: `unknown${i}`, password }, [401, 429], session);
    if (last.status === 429) limited.add(1);
  }
  verify(last.status === 429, 'IP limit blocks rotating usernames');
  const retry = Number(last.headers['Retry-After']);
  verify(retry > 0 && retry <= 5, 'IP Retry-After is bounded');
  sleep(retry + 0.2);
  request('POST', '/members/login', { username: 'unknownrecover', password }, [401], session);
  for (let i = 0; i < 135; i++) {
    last = request('GET', '/members/csrf', undefined, [200, 429], session);
    if (last.status === 429) limited.add(1);
  }
  verify(last.status === 429, 'CSRF endpoint burst limited');
}

export function handleSummary(data) {
  // Aggregate metrics only: never export fixture cookies, CSRF tokens, or response bodies.
  return { [__ENV.RESULT_FILE || `summary-${config.name}.json`]: JSON.stringify({
    profile: config.name, environment: 'isolated-local-PostgreSQL', vus: config.vus, recordsPerAccount: config.records,
    metrics: data.metrics, state: data.state,
  }, null, 2) };
}
