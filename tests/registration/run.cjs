const { chromium, expect } = require('../../frontend/node_modules/@playwright/test');
const { spawn, execFileSync } = require('node:child_process');
const { createServer, connect } = require('node:net');
const fs = require('node:fs');
const path = require('node:path');
const { randomBytes, createHash } = require('node:crypto');
const { setTimeout: sleep } = require('node:timers/promises');
const { configuration, safePath, redact } = require('./safety.cjs');

const { mode, count } = configuration(process.argv.slice(2));
const root = path.resolve(__dirname, '../..');
const runId = Date.now().toString(36) + '-' + randomBytes(3).toString('hex');
const project = 'jobtracker-registration-' + runId;
const output = path.join(root, '.local/registration-results', runId);
const jar = path.join(root, 'backend/build/libs/jobtracker-0.0.1-SNAPSHOT.jar');
const docker = process.env.REGISTRATION_DOCKER || 'docker';
const java = process.env.JAVA_HOME ? path.join(process.env.JAVA_HOME, 'bin/java') : 'java';
const origin = 'http://127.0.0.1:18588';
const apiOrigin = 'http://127.0.0.1:18587';
const mailOrigin = 'http://127.0.0.1:15589';
const password = randomBytes(18).toString('hex');
const env = { ...process.env, REGISTRATION_DB_PASSWORD: password };
const compose = ['compose', '-p', project, '-f', path.join(__dirname, 'compose.yaml')];
const results = [];
const secrets = [password];
const children = new Set();
const sockets = new Set();
const readiness = [];
let backend, vite, browser, smtp, composeStarted = false, mailMode = 'normal', smtpConnections = 0;

function command(exe, args, options = {}) {
  return execFileSync(exe, args, { cwd: root, env, encoding: 'utf8', timeout: 120000, stdio: ['ignore', 'pipe', 'pipe'], ...options });
}
function requireStatus(response, expected) {
  if (response.status() !== expected) {
    const error = new Error('Unexpected HTTP status ' + response.status());
    error.actualStatus = response.status();
    error.expectedStatus = expected;
    throw error;
  }
}
async function portFree(port) {
  const probe = createServer();
  await new Promise((resolve, reject) => { probe.once('error', reject); probe.listen(port, '127.0.0.1', resolve); });
  await new Promise(resolve => probe.close(resolve));
}
function launch(exe, args, label, extraEnv = {}) {
  const child = spawn(exe, args, { cwd: root, env: { ...env, ...extraEnv }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  children.add(child);
  child.on('error', error => { child.startFailure = error.code || 'SPAWN_ERROR'; });
  const log = path.join(output, label + '.log');
  for (const stream of [child.stdout, child.stderr]) {
    let buffer = '';
    stream.setEncoding('utf8');
    stream.on('data', chunk => {
      buffer += chunk;
      let end;
      while ((end = buffer.indexOf('\n')) >= 0) {
        fs.appendFileSync(log, redact(buffer.slice(0, end + 1), secrets));
        buffer = buffer.slice(end + 1);
      }
    });
    stream.on('end', () => { if (buffer) fs.appendFileSync(log, redact(buffer, secrets)); });
  }
  return child;
}
async function stop(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Owned process did not stop')), 15000);
    child.once('exit', () => { clearTimeout(timeout); resolve(); });
    child.kill();
  });
  children.delete(child);
}
async function ready(url, child, predicate = () => true) {
  const started = Date.now();
  const deadline = Date.now() + 90000;
  while (Date.now() < deadline) {
    if (child?.startFailure || child && (child.exitCode !== null || child.signalCode !== null)) throw new Error('Owned server exited');
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(2000) });
      if (response.ok && await predicate(response)) {
        readiness.push({ path: safePath(url), port: new URL(url).port, elapsedMs: Date.now() - started, readyAt: new Date().toISOString() });
        return;
      }
    } catch { /* A bounded readiness probe may precede the listener. */ }
    await sleep(250);
  }
  throw new Error('Readiness timeout');
}
async function startBackend(iteration) {
  await portFree(18587);
  backend = launch(java, ['-Xms128m', '-Xmx512m', '-jar', jar,
    '--spring.config.import=', '--spring.profiles.active=postgres', '--server.address=127.0.0.1', '--server.port=18587',
    '--spring.datasource.url=jdbc:postgresql://127.0.0.1:15587/registration_check',
    '--spring.datasource.username=registration_check', '--spring.datasource.password=' + password,
    '--spring.jpa.hibernate.ddl-auto=validate', '--spring.jpa.show-sql=false', '--spring.session.jdbc.initialize-schema=never',
    '--spring.mail.host=127.0.0.1', '--spring.mail.port=15590', '--app.google.enabled=false',
    '--app.cors.allowed-origins=' + origin,
    '--app.registration-email.required=true', '--app.recovery-email.enabled=true',
    '--app.recovery-email.from=noreply@jobtracker.test', '--app.recovery-email.allow-local-http=true',
    '--app.recovery-email.public-base-url=' + origin, '--logging.level.root=WARN',
    '--app.rate-limit.enabled=true', '--app.rate-limit.registrations-per-ip=1000',
    '--app.rate-limit.requests-per-ip-per-minute=1000', '--app.rate-limit.csrf-requests-per-ip-per-minute=1000',
    '--app.rate-limit.global-requests-per-minute=3000'], 'backend-' + iteration);
  await ready(apiOrigin + '/api/v1/members/csrf', backend);
}
async function startVite(iteration) {
  await portFree(18588);
  vite = launch(process.execPath, [path.join(__dirname, 'vite-server.mjs')], 'vite-' + iteration,
    { REGISTRATION_CACHE_ID: mode === 'cold-vite' ? runId + '-' + iteration : runId });
  await ready(origin + '/join', vite);
}
async function smtpProxy() {
  smtp = createServer(socket => {
    sockets.add(socket); socket.on('close', () => sockets.delete(socket)); socket.on('error', () => {});
    smtpConnections++;
    if (mailMode === 'blocked') return;
    const delay = mailMode === 'delayed' ? 1000 : 0;
    const timer = setTimeout(() => {
      if (socket.destroyed) return;
      const upstream = connect(15588, '127.0.0.1');
      sockets.add(upstream); upstream.on('close', () => sockets.delete(upstream));
      upstream.on('error', () => socket.destroy()); socket.on('close', () => upstream.destroy());
      upstream.pipe(socket); socket.pipe(upstream);
    }, delay);
    socket.on('close', () => clearTimeout(timer));
  });
  await new Promise((resolve, reject) => { smtp.once('error', reject); smtp.listen(15590, '127.0.0.1', resolve); });
}
async function journey(iteration) {
  const result = { iteration, mode, stage: 'join-page', passed: false, events: [], timings: {}, cleanup: false };
  result.readiness = readiness.splice(0);
  results.push(result);
  const start = Date.now();
  const stage = value => { result.stage = value; result.timings[value] = Date.now() - start; };
  const username = 'r87' + randomBytes(6).toString('hex');
  const email = username + '@example.test';
  const userPassword = randomBytes(10).toString('hex') + 'Q9!';
  secrets.push(email, userPassword);
  const context = await browser.newContext({ viewport: { width: 412, height: 915 }, locale: 'ko-KR' });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on('requestfailed', req => result.events.push({ path: safePath(req.url()), kind: 'network-failure' }));
  page.on('response', res => { if (res.status() >= 400) result.events.push({ path: safePath(res.url()), status: res.status() }); });
  page.on('pageerror', () => result.events.push({ kind: 'page-error' }));
  const change = async (method, endpoint, data) => {
    const csrf = await context.request.get(origin + '/api/v1/members/csrf'); requireStatus(csrf, 200);
    const token = await csrf.json();
    return context.request.fetch(origin + '/api/v1' + endpoint, { method, data, headers: { [token.headerName]: token.token } });
  };
  const messages = async () => {
    const response = await context.request.get(mailOrigin + '/api/v1/messages'); requireStatus(response, 200);
    return (await response.json()).messages.filter(m => m.To.some(to => to.Address === email));
  };
  let created = false;
  try {
    await page.goto(origin + '/join');
    if (mode === 'delayed-api') {
      stage('api-unavailable');
      await expect(page.getByRole('button', { name: '다시 확인', exact: true })).toBeVisible();
      await startBackend(iteration);
      await page.getByRole('button', { name: '다시 확인', exact: true }).click();
    }
    await expect(page.getByLabel('이메일', { exact: true })).toBeVisible();
    stage('request-email');
    await page.getByLabel('이메일', { exact: true }).fill(email);
    const [request] = await Promise.all([
      page.waitForResponse(res => res.url().endsWith('/registration/requests')),
      page.getByRole('button', { name: '인증 메일 요청', exact: true }).click(),
    ]);
    requireStatus(request, 202);
    await expect(page.getByRole('status')).toContainText('인증 메일을 요청');
    if (mode === 'restart-mail') {
      stage('restart-before-smtp');
      await expect.poll(() => smtpConnections, { timeout: 10000 }).toBeGreaterThan(0);
      await stop(backend);
      for (const socket of sockets) socket.destroy();
      mailMode = 'normal';
      await startBackend(iteration + '-restarted');
      expect(await messages()).toHaveLength(0);
      await page.getByRole('button', { name: '다시 요청', exact: true }).click();
      await page.getByLabel('이메일', { exact: true }).fill(email);
      const [repeated] = await Promise.all([
        page.waitForResponse(res => res.url().endsWith('/registration/requests')),
        page.getByRole('button', { name: '인증 메일 요청', exact: true }).click(),
      ]);
      requireStatus(repeated, 202);
    }
    stage('mail-received');
    let link;
    await expect.poll(async () => {
      for (const message of await messages()) {
        const response = await context.request.get(mailOrigin + '/api/v1/message/' + message.ID);
        const text = (await response.json()).Text;
        link = text.match(/http:\/\/127\.0\.0\.1:18588\/verify-registration#token=[A-Za-z0-9_-]{43}/)?.[0];
        if (link) return true;
      }
      return false;
    }, { timeout: 30000 }).toBe(true);
    stage('verify-page');
    await page.goto(link);
    await expect(page).toHaveURL(origin + '/verify-registration');
    await page.getByLabel('아이디', { exact: true }).fill(username);
    await page.getByLabel('닉네임', { exact: true }).fill('가입점검');
    await page.getByLabel('비밀번호', { exact: true }).fill(userPassword);
    await page.getByLabel('비밀번호 확인', { exact: true }).fill(userPassword);
    stage('submit-registration');
    const [confirmation] = await Promise.all([
      page.waitForResponse(res => res.url().endsWith('/registration/confirm')),
      page.getByRole('button', { name: '가입 완료', exact: true }).click(),
    ]);
    requireStatus(confirmation, 201); created = true;
    await expect(page.getByRole('status')).toContainText('가입을 완료');
    requireStatus(await context.request.get(origin + '/api/v1/members/me'), 401);
    stage('login');
    requireStatus(await change('POST', '/members/login', { username, password: userPassword }), 200);
    requireStatus(await context.request.get(origin + '/api/v1/members/me'), 200);
    result.passed = true;
  } catch (error) {
    // Playwright messages may contain form values or token URLs. Keep only a safe classification.
    result.errorType = ['Error', 'TimeoutError', 'AssertionError'].includes(error.name) ? error.name : 'CheckFailure';
    if (error.actualStatus) { result.actualStatus = error.actualStatus; result.expectedStatus = error.expectedStatus; }
  } finally {
    try {
      if (created) {
        requireStatus(await change('POST', '/members/login', { username, password: userPassword }), 200);
        requireStatus(await change('DELETE', '/members/me', { currentPassword: userPassword }), 204);
        requireStatus(await context.request.get(origin + '/api/v1/members/me'), 401);
      }
      for (const message of await messages()) {
        const response = await context.request.delete(mailOrigin + '/api/v1/messages', { data: { IDs: [message.ID] } });
        if (!response.ok()) throw new Error('Mail cleanup failed');
      }
      expect(await messages()).toHaveLength(0);
      result.cleanup = true;
    } catch (error) { result.cleanup = false; if (error.actualStatus) result.cleanupStatus = error.actualStatus; }
    await context.close();
    result.readiness.push(...readiness.splice(0));
    result.elapsedMs = Date.now() - start;
    if (result.passed && result.cleanup) stage('completed');
    fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify(results, null, 2));
    console.log(JSON.stringify({ mode, iteration, passed: result.passed, cleanup: result.cleanup, stage: result.stage }));
  }
}

(async () => {
  if (!fs.existsSync(jar)) throw new Error('Build backend bootJar first');
  for (const port of [15587, 15588, 15589, 15590, 18587, 18588]) await portFree(port);
  fs.mkdirSync(output, { recursive: true });
  fs.writeFileSync(path.join(output, 'environment.json'), JSON.stringify({ runId, mode, count,
    revision: command('git', ['rev-parse', 'HEAD']).trim(), dirty: !!command('git', ['status', '--porcelain']).trim(),
    jarSha256: createHash('sha256').update(fs.readFileSync(jar)).digest('hex'), node: process.version,
    notes: 'Disposable PostgreSQL and Mailpit; one source IP budgets expanded, CSRF/password hashing enabled. No external mail/OIDC.' }, null, 2));
  try {
    composeStarted = true;
    command(docker, [...compose, 'up', '-d', '--wait']);
    await ready(mailOrigin + '/api/v1/messages');
    await smtpProxy();
    browser = await chromium.launch({ headless: true,
      ...(process.env.PLAYWRIGHT_CHROME_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROME_PATH } : {}) });
    for (let i = 1; i <= count; i++) {
      smtpConnections = 0;
      mailMode = mode === 'delayed-mail' ? 'delayed' : mode === 'restart-mail' ? 'blocked' : 'normal';
      if (['cold-backend', 'delayed-api', 'restart-mail'].includes(mode) || i === 1) {
        await stop(backend);
        if (mode !== 'delayed-api') await startBackend(i);
      }
      if (mode === 'cold-vite' || i === 1) { await stop(vite); await startVite(i); }
      if (mode !== 'delayed-api') await ready(origin + '/api/v1/members/registration/options', vite, async r => (await r.json()).required === true);
      await journey(i);
      if (!results.at(-1).passed || !results.at(-1).cleanup) break;
    }
  } finally {
    const cleanup = { browser: false, processes: true, smtp: false, containers: false };
    try { await browser?.close(); cleanup.browser = true; } catch { /* Continue independent cleanup. */ }
    for (const child of children) {
      try { await stop(child); } catch { cleanup.processes = false; }
    }
    for (const socket of sockets) socket.destroy();
    try { if (smtp) await new Promise(resolve => smtp.close(resolve)); cleanup.smtp = true; } catch { /* Continue container cleanup. */ }
    try {
      if (composeStarted) command(docker, [...compose, 'down', '--timeout', '10']);
      cleanup.containers = true;
    } catch { /* Record rather than hide an incomplete teardown. */ }
    fs.writeFileSync(path.join(output, 'cleanup.json'), JSON.stringify(cleanup, null, 2));
    if (Object.values(cleanup).some(value => !value)) process.exitCode = 1;
  }
  console.log('Results: ' + output);
  if (results.length !== count || results.some(r => !r.passed || !r.cleanup)) process.exitCode = 1;
})().catch(error => {
  console.error('Registration check stopped: ' + redact(error.message?.split('\n')[0] || error.name, secrets));
  process.exitCode = 1;
});
