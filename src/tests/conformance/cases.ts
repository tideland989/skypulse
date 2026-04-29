import { strict as assert } from 'node:assert';

type AssertFn = (res: { status: number; body: unknown; headers: Headers }) => void;

export interface Case {
  name: string;
  pythonRef: string;
  request: { path: string };
  assert: AssertFn;
}

function assertObject(v: unknown, msg: string): asserts v is Record<string, unknown> {
  assert.ok(typeof v === 'object' && v !== null && !Array.isArray(v), msg);
}
function assertArray(v: unknown, msg: string): asserts v is unknown[] {
  assert.ok(Array.isArray(v), msg);
}
function assertNumber(v: unknown, msg: string): asserts v is number {
  assert.ok(typeof v === 'number', msg);
}
function assertString(v: unknown, msg: string): asserts v is string {
  assert.ok(typeof v === 'string', msg);
}

export const cases: Case[] = [
  {
    // Also asserts Content-Type — covers the 400 error path's JSON shape.
    name: 'missing lat → 400 + Python error body + JSON content-type',
    pythonRef: 'app.py:97-98',
    request: { path: '/api/v1/activity-score' },
    assert: ({ status, body, headers }) => {
      assert.equal(status, 400);
      assert.deepEqual(body, { error: 'lat and lon are required' });
      assert.match(headers.get('content-type') ?? '', /^application\/json/i);
    },
  },
  {
    name: 'missing lon → 400 + Python error body',
    pythonRef: 'app.py:97-98',
    request: { path: '/api/v1/activity-score?lat=40.71' },
    assert: ({ status, body }) => {
      assert.equal(status, 400);
      assert.deepEqual(body, { error: 'lat and lon are required' });
    },
  },
  {
    // Python's `if not lat` fires on both missing and empty string. Distinct
    // case from "missing" — a validator that only checks `=== undefined` would
    // diverge here.
    name: 'empty lat= → 400 + Python error body',
    pythonRef: 'app.py:97-98 (`if not lat`)',
    request: { path: '/api/v1/activity-score?lat=&lon=-74.01' },
    assert: ({ status, body }) => {
      assert.equal(status, 400);
      assert.deepEqual(body, { error: 'lat and lon are required' });
    },
  },
  {
    name: 'non-numeric lat → 400 + Python error body',
    pythonRef: 'app.py:100-104',
    request: { path: '/api/v1/activity-score?lat=abc&lon=-74.01' },
    assert: ({ status, body }) => {
      assert.equal(status, 400);
      assert.deepEqual(body, { error: 'lat and lon must be numbers' });
    },
  },
  {
    // Symmetric to the lat case — proves both float() conversions are caught.
    name: 'non-numeric lon → 400 + Python error body',
    pythonRef: 'app.py:100-104',
    request: { path: '/api/v1/activity-score?lat=40.71&lon=xyz' },
    assert: ({ status, body }) => {
      assert.equal(status, 400);
      assert.deepEqual(body, { error: 'lat and lon must be numbers' });
    },
  },
  {
    // Also asserts Content-Type — covers the 200 success path's JSON shape.
    name: 'happy path with user_id → 200 + response shape + JSON content-type',
    pythonRef: 'app.py:91-143',
    request: { path: '/api/v1/activity-score?lat=40.71&lon=-74.01&user_id=u1' },
    assert: ({ status, body, headers }) => {
      assert.equal(status, 200);
      assert.match(headers.get('content-type') ?? '', /^application\/json/i);
      assertObject(body, 'body is an object');

      assertNumber(body.score, 'score is a number');
      assert.ok(body.score >= 0 && body.score <= 100, `score out of [0,100]: ${body.score}`);

      assertString(body.recommendation, 'recommendation is a string');
      const expectedRec =
        body.score < 50
          ? 'Consider indoor activities today'
          : body.score < 70
            ? 'Moderate conditions - light outdoor activities recommended'
            : 'Good conditions for outdoor activities';
      assert.equal(body.recommendation, expectedRec, 'recommendation matches score bucket');

      assertObject(body.weather, 'weather is an object');
      for (const k of ['temperature', 'wind_speed', 'conditions']) {
        assert.ok(k in body.weather, `weather.${k} present`);
      }

      assertObject(body.air_quality, 'air_quality is an object');
      for (const k of ['pm2_5', 'pm10']) {
        assert.ok(k in body.air_quality, `air_quality.${k} present`);
      }
    },
  },
  {
    name: 'happy path without user_id → 200 + response shape',
    pythonRef: 'app.py:91-143',
    request: { path: '/api/v1/activity-score?lat=40.71&lon=-74.01' },
    assert: ({ status, body }) => {
      assert.equal(status, 200);
      assertObject(body, 'body is an object');
      assertNumber(body.score, 'score is a number');
      assertString(body.recommendation, 'recommendation is a string');
    },
  },
  {
    name: 'lat=0&lon=0 → 200 (truthiness check is on the string, not the number)',
    pythonRef: 'app.py:97 (`if not lat` — lat is still a string here)',
    request: { path: '/api/v1/activity-score?lat=0&lon=0' },
    assert: ({ status, body }) => {
      assert.equal(status, 200);
      assertObject(body, 'body is an object');
      assertNumber(body.score, 'score is a number');
    },
  },
  {
    name: '/locations → 200 + {locations: string[]}',
    pythonRef: 'app.py:145-153',
    request: { path: '/api/v1/locations' },
    assert: ({ status, body }) => {
      assert.equal(status, 200);
      assertObject(body, 'body is an object');
      assertArray(body.locations, 'locations is an array');
      for (const loc of body.locations) {
        assertString(loc, `location not a string: ${JSON.stringify(loc)}`);
      }
    },
  },
];
