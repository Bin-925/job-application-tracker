const { chromium } = require('../../frontend/node_modules/@playwright/test');
const assert = require('node:assert/strict');
const { spawn, execFileSync } = require('node:child_process');
const { createServer } = require('node:net');
const { randomBytes } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { setTimeout: sleep } = require('node:timers/promises');
const { redact } = require('../registration/safety.cjs');
const root = path.resolve(__dirname, '../..');
const project = 'jobtracker-release-' + randomBytes(6).toString('hex');
const output = path.join(root, '.local/release-results', project);
const password = randomBytes(24).toString('hex');
const env = { ...process.env, RELEASE_DB_PASSWORD: password };
const docker = process.env.REGISTRATION_DOCKER || 'docker';
const compose = ['compose', '-p', project, '-f', path.join(__dirname, 'compose.yaml')];
const origin = 'http://127.0.0.1:18593';
const results = { passed: false, checks: [], containersRemoved: false };
let server, browser, started = false, paused = false;
function command(args) { return execFileSync(docker, args, { env, cwd: root, timeout: 120000, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); }
async function free(port) {
  const probe = createServer();
  await new Promise((resolve, reject) => { probe.once('error', reject); probe.listen(port, '127.0.0.1', resolve); });
  await new Promise(resolve => probe.close(resolve));
}
async function get(route) { return fetch(origin + route, { redirect: 'manual', signal: AbortSignal.timeout(10000) }); }
async function ready() {
  for (let i = 0; i < 90; i++) {
    if (server.exitCode !== null) throw new Error('Owned server exited');
    try { if ((await get('/readyz')).status === 200) return; } catch { /* Startup/recovery can be pending. */ }
    await sleep(500);
  }
  throw new Error('Readiness timeout');
}
(async () => {
  await free(15593); await free(18593);
  fs.mkdirSync(output, { recursive: true });
  try {
    started = true; command([...compose, 'up', '-d', '--wait']);
    const java = process.env.JAVA_HOME ? path.join(process.env.JAVA_HOME, 'bin/java') : 'java';
    server = spawn(java, ['-Xmx512m', '-jar', path.join(root, 'backend/build/libs/jobtracker-0.0.1-SNAPSHOT.jar'),
      '--spring.config.import=', '--spring.profiles.active=postgres,release', '--server.address=127.0.0.1', '--server.port=18593',
      '--spring.datasource.url=jdbc:postgresql://127.0.0.1:15593/release_check?socketTimeout=2',
      '--spring.datasource.username=release_check', '--spring.datasource.password=' + password,
      '--spring.datasource.hikari.connection-timeout=1000', '--spring.datasource.hikari.validation-timeout=500',
      '--app.cors.allowed-origins=' + origin, '--app.session.secure=false', '--app.google.enabled=false',
      '--app.recovery-email.enabled=false', '--logging.level.root=WARN'],
      { cwd: root, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    server.on('error', () => { results.spawnError = true; });
    for (const stream of [server.stdout, server.stderr]) {
      stream.setEncoding('utf8'); let buffer = '';
      stream.on('data', chunk => {
        buffer += chunk; let end;
        while ((end = buffer.indexOf('\n')) >= 0) {
          fs.appendFileSync(path.join(output, 'server.log'), redact(buffer.slice(0, end + 1), [password]));
          buffer = buffer.slice(end + 1);
        }
      });
    }
    await ready();
    const shell = await get('/calendar'); assert.equal(shell.status, 200);
    assert.equal(shell.headers.get('cache-control'), 'private, no-store');
    const html = await shell.text(); assert.match(html, /id="root"/);
    const asset = html.match(/src="(\/assets\/[^" ]+\.js)"/)[1];
    const js = await get(asset); assert.equal(js.status, 200);
    assert.match(js.headers.get('cache-control'), /immutable/);
    for (const route of ['/assets/not-found.js', '/.well-known/assetlinks.json']) {
      const missing = await get(route); assert.equal(missing.status, 404); assert.doesNotMatch(await missing.text(), /id="root"/);
    }
    assert.equal((await get('/api/v1/applications')).status, 401);
    assert.equal((await get('/actuator/env')).status, 401);
    assert.equal((await get('/api/v1/oauth/callback/google')).status >= 300, true);
    assert.match((await get('/sw.js')).headers.get('cache-control'), /no-store/);
    results.checks.push('Packaged SPA routes, assets, cache, API and OAuth isolation');
    browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROME_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROME_PATH } : {}) });
    for (const width of [360, 1440]) {
      const context = await browser.newContext({ viewport: { width, height: 900 } });
      const page = await context.newPage(); const errors = [];
      page.on('pageerror', error => errors.push(error.name));
      await page.goto(origin + '/calendar');
      await page.getByRole('button', { name: '로그인', exact: true }).waitFor();
      assert.match(page.url(), /\/login$/); assert.deepEqual(errors, []);
      await page.screenshot({ path: path.join(output, 'login-' + width + '.png') });
      await context.close();
    }
    results.checks.push('Actual packaged browser at 360px/1440px without Vite');
    execFileSync('k6', ['run', '--quiet', '-e', 'BASE_URL=' + origin, '-e', 'K6_RELEASE_ISOLATED=ephemeral-postgres',
      '-e', 'RESULT_FILE=' + path.join(output, 'k6.json'), path.join(__dirname, 'load.js')],
      { cwd: root, timeout: 60000, stdio: ['ignore', 'pipe', 'pipe'] });
    results.checks.push('Release-specific k6 routing, cache, probes and unauthenticated API contracts');
    command([...compose, 'pause', 'postgres']); paused = true;
    const live = await get('/livez'); assert.equal(live.status, 200); assert.deepEqual(await live.json(), { status: 'UP' });
    const down = await get('/readyz'); assert.equal(down.status, 503); assert.deepEqual(await down.json(), { status: 'DOWN' });
    command([...compose, 'unpause', 'postgres']); paused = false;
    await ready();
    results.checks.push('DB pause leaves liveness UP, readiness DOWN without details, then recovers');
    results.passed = true;
  } catch (error) { results.error = error.name; results.message = redact(error.message, [password]); process.exitCode = 1; }
  finally {
    const failures = [];
    try { await browser?.close(); } catch { failures.push('browser'); }
    if (server && server.exitCode === null && server.signalCode === null) {
      try {
        await new Promise((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error('Stop timeout')), 15000);
          server.once('exit', () => { clearTimeout(timer); resolve(); }); server.kill();
        });
      } catch { failures.push('server'); }
    }
    if (paused) { try { command([...compose, 'unpause', 'postgres']); } catch { failures.push('unpause'); } }
    if (started) { try { command([...compose, 'down', '--timeout', '10']); results.containersRemoved = true; } catch { failures.push('compose'); } }
    if (failures.length) { results.cleanupErrors = failures; results.passed = false; process.exitCode = 1; }
    fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify(results, null, 2));
  }
  console.log(JSON.stringify(results)); console.log('Results: ' + output);
})().catch(() => { console.error('Release harness did not start; check owned ports.'); process.exitCode = 1; });
