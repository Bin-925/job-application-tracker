import http from 'k6/http';
import { check, sleep } from 'k6';

if (__ENV.BASE_URL !== 'http://127.0.0.1:18593' || __ENV.K6_RELEASE_ISOLATED !== 'ephemeral-postgres') {
  throw new Error('Use the owned release harness on its fixed loopback port.');
}
export const options = {
  vus: 5, duration: '20s', maxRedirects: 0,
  thresholds: { checks: ['rate==1'], http_req_failed: ['rate==0'], http_req_duration: ['p(95)<1000', 'p(99)<2000'] },
};
export default function () {
  for (const route of ['/login', '/calendar', '/applications/1/edit']) {
    const response = http.get(__ENV.BASE_URL + route);
    check(response, {
      'SPA served from app': r => r.status === 200 && r.body.includes('id="root"'),
      'HTML never publicly cached': r => r.headers['Cache-Control'] === 'private, no-store',
    });
  }
  for (const probe of ['/livez', '/readyz']) {
    const response = http.get(__ENV.BASE_URL + probe);
    check(response, { 'minimal healthy probe': r => r.status === 200 && r.json('status') === 'UP' && !r.json('components') });
  }
  const denied = http.get(__ENV.BASE_URL + '/api/v1/applications', { responseCallback: http.expectedStatuses(401) });
  check(denied, { 'private API remains protected': r => r.status === 401 && !r.body.includes('id="root"') });
  sleep(0.1);
}
export function handleSummary(data) { return { [__ENV.RESULT_FILE]: JSON.stringify(data, null, 2) }; }
