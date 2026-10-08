export const profiles = {
  auth: { executor: 'constant-vus', vus: 4, duration: '45s', exec: 'auth' },
  arrival: { executor: 'constant-arrival-rate', rate: 2, timeUnit: '1s', duration: '60s', preAllocatedVUs: 8, maxVUs: 30, exec: 'auth' },
  endurance: { executor: 'constant-vus', vus: 4, duration: '300s', exec: 'auth' },
  mail: { executor: 'shared-iterations', vus: 4, iterations: 20, maxDuration: '120s', exec: 'mail' },
  faults: { executor: 'constant-vus', vus: 1, duration: '80s', exec: 'faults' },
};

export function additionalSettings(env) {
  if (!Object.hasOwn(profiles, env.PROFILE)) throw new Error('Unknown additional profile');
  if (env.K6_LOCAL_ISOLATED !== 'ephemeral-postgres') throw new Error('Use the isolated runner');
  if (!/^http:\/\/127\.0\.0\.1:181(?:3[4-9]|4[0-4])$/.test(env.BASE_URL || '')) throw new Error('Dedicated loopback ports only');
  return { name: env.PROFILE, base: env.BASE_URL, scenario: { ...profiles[env.PROFILE], gracefulStop: '15s' } };
}
