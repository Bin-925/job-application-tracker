export const profiles = {
  smoke: { vus: 1, records: 5, executor: 'shared-iterations', iterations: 2, maxDuration: '30s' },
  load: { vus: 10, records: 30, executor: 'ramping-vus', startVUs: 2,
    stages: [{ duration: '20s', target: 10 }, { duration: '40s', target: 10 }, { duration: '10s', target: 0 }] },
  spike: { vus: 30, records: 30, executor: 'ramping-vus', startVUs: 2,
    stages: [{ duration: '10s', target: 2 }, { duration: '5s', target: 30 },
      { duration: '20s', target: 30 }, { duration: '5s', target: 0 }] },
  soak: { vus: 10, records: 30, executor: 'constant-vus', duration: '120s' },
  volume: { vus: 5, records: 500, executor: 'constant-vus', duration: '30s' },
  conflict: { vus: 10, records: 1, executor: 'constant-vus', duration: '20s' },
  contract: { vus: 1, records: 2, executor: 'shared-iterations', iterations: 1, maxDuration: '60s' },
  limits: { vus: 1, records: 0, executor: 'shared-iterations', iterations: 1, maxDuration: '60s' },
};

export function settings(env) {
  const name = env.PROFILE || 'smoke';
  if (!Object.hasOwn(profiles, name)) throw new Error('Unknown load profile');
  if (env.K6_LOCAL_ISOLATED !== 'ephemeral-postgres') throw new Error('Use Run-LoadTests.ps1 with its isolated server');
  const base = env.BASE_URL || 'http://127.0.0.1:18134';
  if (!/^http:\/\/127\.0\.0\.1:181(?:3[4-9]|4[0-4])$/.test(base)) {
    throw new Error('Only the dedicated loopback test ports 18134-18144 are allowed');
  }
  return { name, base, ...profiles[name] };
}

export function scenario(config) {
  const { executor, vus, iterations, maxDuration, stages, startVUs, duration } = config;
  const common = { executor, exec: config.name === 'limits' ? 'limits' :
    config.name === 'contract' ? 'contract' : config.name === 'conflict' ? 'conflict' : 'journey', gracefulStop: '15s' };
  if (executor === 'ramping-vus') return { ...common, startVUs, stages, gracefulRampDown: '15s' };
  if (executor === 'shared-iterations') return { ...common, vus, iterations, maxDuration };
  return { ...common, vus, duration };
}
