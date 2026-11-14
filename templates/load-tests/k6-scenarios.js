// Bounded k6 scenarios. See README.md in this folder before running against anything but localhost.
import http from 'k6/http';
import { check, sleep, fail } from 'k6';

const TARGET = __ENV.TARGET_URL || 'http://localhost:8888';
const LOCAL = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?(\/|$)/.test(TARGET);
if (!LOCAL && __ENV.ALLOW_REMOTE_TARGET !== 'yes') {
  fail(`Refusing to load-test ${TARGET}. Fill in templates/consultant/load-test-authorization.md, then set ALLOW_REMOTE_TARGET=yes.`);
}
const PATH = __ENV.TEST_PATH || '/';
const MAX_VUS = Math.min(Number(__ENV.MAX_VUS || 50), 500); // hard ceiling

const SCENARIOS = {
  baseline: { executor: 'constant-vus', vus: Math.min(5, MAX_VUS), duration: '2m' },
  ramp: { executor: 'ramping-vus', startVUs: 0, stages: [{ duration: '2m', target: MAX_VUS }, { duration: '3m', target: MAX_VUS }, { duration: '1m', target: 0 }] },
  spike: { executor: 'ramping-vus', startVUs: 1, stages: [{ duration: '30s', target: 2 }, { duration: '10s', target: MAX_VUS }, { duration: '1m', target: MAX_VUS }, { duration: '10s', target: 2 }] },
  soak: { executor: 'constant-vus', vus: Math.max(1, Math.floor(MAX_VUS / 4)), duration: __ENV.SOAK_DURATION || '30m' },
  recovery: { executor: 'ramping-vus', startVUs: 1, stages: [{ duration: '20s', target: MAX_VUS }, { duration: '40s', target: MAX_VUS }, { duration: '10s', target: 1 }, { duration: '2m', target: 1 }] },
};
const name = __ENV.SCENARIO || 'baseline';
if (!SCENARIOS[name]) fail(`Unknown SCENARIO ${name}`);

export const options = {
  scenarios: { [name]: SCENARIOS[name] },
  maxRedirects: 0,
  thresholds: {
    http_req_failed: [{ threshold: 'rate<0.05', abortOnFail: true, delayAbortEval: '30s' }],
    http_req_duration: [{ threshold: 'p(95)<2000', abortOnFail: true, delayAbortEval: '30s' }],
  },
};

export default function () {
  const res = http.get(`${TARGET}${PATH}`, { tags: { scenario: name } });
  check(res, { 'status < 500': (r) => r.status < 500 });
  sleep(1);
}
