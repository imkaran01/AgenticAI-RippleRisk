const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { server } = require('../server');

let base;
test('start API server for smoke tests', async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

test('GET /health reports model loaded', async () => {
  const r = await fetch(`${base}/health`);
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.equal(j.success, true);
  assert.equal(j.model_loaded, true);
  assert.equal(j.sectors, 30);
});

test('GET /sectors lists existing model sector identifiers', async () => {
  const r = await fetch(`${base}/sectors`);
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.equal(j.count, 30);
  assert.ok(j.sectors.some(s => s.id === 'electronics'));
});

test('POST /analyze returns impacts and discloses semiconductor proxy', async () => {
  const r = await fetch(`${base}/analyze`, {
    method: 'POST', headers: {'content-type':'application/json'},
    body: JSON.stringify({shock_type:'cost-increase', shock_magnitude_percent:20, direction:'increase', affected_sector:'semiconductor components', target_industry:'wireless earbuds', duration:'persistent', horizon_months:6, scenario:'base'})
  });
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.equal(j.success, true);
  assert.equal(j.request.origin_sector_used, 'electronics');
  assert.equal(j.request.model_sector_mapping_applied, true);
  assert.ok(j.summary.sectors_reached >= 1);
  assert.ok(Array.isArray(j.impacts));
  assert.ok(j.impacts.length >= 1);
  assert.ok(j.scenario_comparison.base);
  assert.ok(j.limitations.length >= 4);
});

test('POST /compare-scenarios returns scenario summaries', async () => {
  const r = await fetch(`${base}/compare-scenarios`, {
    method: 'POST', headers: {'content-type':'application/json'},
    body: JSON.stringify({shock_type:'cost-increase', shock_magnitude_percent:20, affected_sector:'electronics'})
  });
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.equal(j.success, true);
  assert.ok(j.scenario_comparison.optimistic);
  assert.ok(j.scenario_comparison.base);
  assert.ok(j.scenario_comparison.adverse);
  assert.equal(j.impacts, undefined);
});

test('POST /analyze rejects invalid magnitudes', async () => {
  const r = await fetch(`${base}/analyze`, {
    method:'POST', headers:{'content-type':'application/json'},
    body: JSON.stringify({shock_type:'cost-increase', shock_magnitude_percent:200, affected_sector:'electronics'})
  });
  assert.equal(r.status, 400);
  const j = await r.json();
  assert.equal(j.success, false);
});

test('POST /analyze rejects unsupported sectors clearly', async () => {
  const r = await fetch(`${base}/analyze`, {
    method:'POST', headers:{'content-type':'application/json'},
    body: JSON.stringify({shock_type:'cost-increase', shock_magnitude_percent:20, affected_sector:'a sector not in the model'})
  });
  assert.equal(r.status, 400);
  const j = await r.json();
  assert.match(j.error, /unknown origin_sector/);
});

test('close API server', async () => {
  await new Promise((resolve, reject) => server.close(err => err ? reject(err) : resolve()));
});
