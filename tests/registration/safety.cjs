const { URL } = require('node:url');

const modes = ['warm', 'cold-backend', 'cold-vite', 'delayed-api', 'delayed-mail', 'restart-mail'];
function configuration(args) {
  const [mode, rawCount = '1', ...extra] = args;
  if (!modes.includes(mode) || !/^(?:[1-9]|10)$/.test(rawCount) || extra.length) {
    throw new Error('Usage: node tests/registration/run.cjs <mode> <1..10>');
  }
  return { mode, count: Number(rawCount) };
}
function safePath(value) {
  try { return new URL(value).pathname.replace(/[A-Za-z0-9_-]{32,}/g, '[redacted]'); }
  catch { return '[invalid-url]'; }
}
function redact(text, secrets = []) {
  let value = String(text);
  for (const secret of secrets.filter(Boolean)) value = value.split(secret).join('[redacted]');
  return value.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email]')
    .replace(/[A-Za-z0-9_-]{32,}/g, '[redacted]');
}
module.exports = { configuration, safePath, redact, modes };
