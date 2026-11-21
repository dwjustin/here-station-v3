import assert from 'node:assert/strict';
import test from 'node:test';
import { Buffer } from 'node:buffer';

import { requestRoute, decodeLeg } from '../api/routes.ts';

const trip = {
  origin_station_id: 'hongje', origin_station_name: '홍제',
  destination_station_id: 'jamwon', destination_station_name: '잠원',
  line_name: '3호선', up_down: '하행', direction: '무악재', destination_next_station: '고속터미널',
  door_no: '4-2', origin_walk_m: 20, destination_walk_m: 10,
};
const encode = (values) => Buffer.from(values.buffer).toString('base64');
const leg = (station_id) => ({
  station_id, map_revision: 'revision', grid: { x0: 0, z0: 0, w: 2, cell: 0.25 },
  start: { level: 'B1', x: 0.125, z: 0.125, h: 0, heading_deg: 90 },
  goal: { level: 'B1', x: 0.375, z: 0.125, h: 0, arrival_radius: 1.5 },
  cells: encode(new Int32Array([0, 1])), h: encode(new Int16Array([0, 0])),
  direction: encode(new Uint16Array([900, 65535])),
  platform: { id: 'platform1', name: '승강장', access_name: '계단 1', nodes: encode(new Int32Array([1])) },
});
const valid = () => ({ trip: { ...trip }, legs: [leg('hongje'), leg('jamwon')] });

test('posts selected station IDs and accepts calculated route data', async (t) => {
  const previous = globalThis.fetch;
  t.after(() => { globalThis.fetch = previous; });
  globalThis.fetch = async (url, options) => {
    assert.equal(url, 'https://example.test/routes');
    assert.equal(options.method, 'POST');
    assert.deepEqual(JSON.parse(options.body), { origin_station_id: 'hongje', destination_station_id: 'jamwon' });
    return { ok: true, json: async () => valid() };
  };
  assert.deepEqual((await requestRoute('https://example.test/', 'hongje', 'jamwon')).trip, trip);
});

test('rejects legacy, malformed and mismatched route responses', async (t) => {
  const previous = globalThis.fetch;
  t.after(() => { globalThis.fetch = previous; });
  for (const body of [null, { nodes: [], edges: [] }, { trip, legs: [] },
    { ...valid(), trip: { ...trip, door_no: '' } },
    { ...valid(), trip: { ...trip, origin_walk_m: -1 } },
    { ...valid(), trip: { ...trip, origin_station_id: 'other' } },
    { trip, legs: [leg('jamwon'), leg('hongje')] },
    { trip, legs: [{ ...leg('hongje'), goal: null }, leg('jamwon')] }]) {
    globalThis.fetch = async () => ({ ok: true, json: async () => body });
    await assert.rejects(requestRoute('https://example.test', 'hongje', 'jamwon'));
  }
});

test('surfaces server errors and missing API configuration', async (t) => {
  const previous = globalThis.fetch;
  t.after(() => { globalThis.fetch = previous; });
  globalThis.fetch = async () => ({ ok: false, status: 422, json: async () => ({ detail: '지원하지 않는 여정입니다.' }) });
  await assert.rejects(requestRoute('https://example.test', 'hongje', 'jamwon'), /지원하지 않는 여정/);
  await assert.rejects(requestRoute('', 'hongje', 'jamwon'), /서버 주소/);
});

test('decodes grid arrays and rejects invalid platform nodes and array lengths', () => {
  const raw = leg('hongje');
  assert.deepEqual([...decodeLeg(raw).platform.nodes], [1]);
  for (const nodes of ['', encode(new Int32Array([-1])), encode(new Int32Array([2]))]) {
    assert.throws(() => decodeLeg({ ...raw, platform: { ...raw.platform, nodes } }), /승강장/);
  }
  assert.throws(() => decodeLeg({ ...raw, h: '' }), /배열/);
  assert.throws(() => decodeLeg({ ...raw, cells: encode(new Int32Array([-1, 1])) }), /배열/);
  assert.throws(() => decodeLeg({ ...raw, grid: { ...raw.grid, cell: 0 } }), /좌표/);
});
