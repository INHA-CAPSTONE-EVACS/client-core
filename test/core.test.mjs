import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AlertHandler, ClientRuntime, EvacsWsClient, LocationReporter } from '../dist/index.js';

const location = n => ({ latitude: 37 + n, longitude: 127, speedMps: 3, headingDegrees: 90, measuredAt: new Date(1000 + n).toISOString() });
const flush = () => new Promise(resolve => setImmediate(resolve));

test('reporter coalesces locations while a send is pending and keeps sequence monotonic', async () => {
  const sent = [];
  let release;
  const reporter = new LocationReporter('car-1', dto => { sent.push(dto); return new Promise(resolve => { release = resolve; }); });
  reporter.handleLocation(location(0));
  const first = reporter.tick();
  reporter.handleLocation(location(1));
  await reporter.tick();
  assert.equal(sent.length, 1);
  release();
  await first;
  const second = reporter.tick();
  assert.equal(sent.length, 2);
  assert.equal(sent[1].latitude, 38);
  assert.deepEqual(sent.map(x => x.sequence), [1, 2]);
  release();
  await second;
  await reporter.tick();
  assert.equal(sent.length, 2);
});

test('alert versions, duplicate receipt ACKs, route versions and expiry', async () => {
  let now = 1000;
  const acks = [];
  const handler = new AlertHandler(async alert => { acks.push(alert.alertVersion); }, () => {}, () => now);
  const shown = [];
  const routes = [];
  handler.onAlert((alert, id) => shown.push([id, alert?.alertVersion ?? null]));
  handler.onRoute(route => routes.push(route.routeVersion));
  const alert = { type: 'YIELD_ALERT_ISSUED', alertId: 'a', alertVersion: 2, expiresAt: new Date(2000).toISOString() };
  handler.handleAlert(alert);
  await flush();
  handler.handleAlert(alert);
  handler.handleAlert({ ...alert, alertVersion: 1 });
  handler.handleRouteUpdated({ type: 'EMERGENCY_ROUTE_UPDATED', routeVersion: 4 });
  handler.handleRouteUpdated({ type: 'EMERGENCY_ROUTE_UPDATED', routeVersion: 3 });
  await flush();
  now = 2000;
  handler.expireStale();
  assert.deepEqual(shown, [['a', 2], ['a', null]]);
  assert.deepEqual(routes, [4]);
  assert.deepEqual(acks, [2, 2, 1]);
});

test('runtime connects, reports, acknowledges, routes alerts and stops subscriptions', async () => {
  const messages = new Set();
  const closes = new Set();
  const sends = [];
  let sourceStopped = 0;
  let locationCallback;
  const transport = {
    async connect() {},
    async send(type, payload) { sends.push([type, payload]); return { accepted: true }; },
    onMessage(callback) { messages.add(callback); return () => messages.delete(callback); },
    onClose(callback) { closes.add(callback); return () => closes.delete(callback); },
    async close() {},
  };
  const source = {
    async start() { locationCallback(location(0)); },
    subscribe(callback) { locationCallback = callback; return () => { locationCallback = undefined; }; },
    stop() { sourceStopped++; },
  };
  const runtime = new ClientRuntime({ profile: { vehicleId: 'car-1', vehicleType: 'car' }, locationSource: source, transport, intervalMs: 10 });
  const alerts = [];
  runtime.onAlert((alert, id) => alerts.push([id, alert?.alertVersion ?? null]));
  await runtime.start();
  assert.equal(runtime.getStatus(), 'connected');
  await new Promise(resolve => setTimeout(resolve, 25));
  for (const callback of messages) callback({ type: 'YIELD_ALERT_ISSUED', alertId: 'a', alertVersion: 1, expiresAt: new Date(Date.now() + 10000).toISOString() });
  await flush();
  assert.equal(sends.some(([type]) => type === 'VEHICLE_LOCATION_UPDATED'), true);
  assert.equal(sends.some(([type]) => type === 'YIELD_ALERT_ACKNOWLEDGED'), true);
  assert.deepEqual(alerts, [['a', 1]]);
  await runtime.stop();
  assert.equal(sourceStopped, 1);
  assert.equal(locationCallback, undefined);
  assert.equal(runtime.getStatus(), 'stopped');
  await runtime.dispose();
  assert.equal(messages.size, 0);
  assert.equal(closes.size, 0);
});

test('client reconnects after close and preserves profile', async () => {
  const closes = new Set();
  const profiles = [];
  const transport = {
    async connect(profile) { profiles.push(profile); },
    async send() { return { accepted: true }; },
    onMessage() { return () => {}; },
    onClose(callback) { closes.add(callback); return () => closes.delete(callback); },
    async close() {},
  };
  const client = new EvacsWsClient(transport);
  const profile = { vehicleId: 'v', vehicleType: 'car' };
  await client.connect(profile);
  for (const close of closes) close();
  assert.equal(client.getStatus(), 'reconnecting');
  await client.reconnect();
  assert.equal(client.getStatus(), 'connected');
  assert.deepEqual(profiles, [profile, profile]);
  await client.dispose();
});
