// Repro: when RedisStore.init() fails, the store never recovers.
//
//   npm i express express-rate-limit rate-limit-redis redis   (docker required)
//   node repro.mjs
import { execSync } from 'node:child_process';
import express from 'express';
import { rateLimit } from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import { createClient } from 'redis';

const PORT = 6399;
const NAME = 'rlr-repro';
const EXPECTED = [200, 200, 429, 429, 429]; // limit: 2

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const startRedis = () =>
  execSync(`docker run -d --rm --name ${NAME} -p ${PORT}:6379 redis:7-alpine`, { stdio: 'ignore' });
const stopRedis = () =>
  execSync(`docker rm -f ${NAME} 2>/dev/null || true`, { stdio: 'ignore', shell: '/bin/bash' });

function createRedisClient() {
  const client = createClient({
    url: `redis://localhost:${PORT}`,
    socket: { reconnectStrategy: () => 200, connectTimeout: 500 },
    disableOfflineQueue: true, // fail fast while down rather than queueing
  });
  client.on('error', () => {});
  client.connect().catch(() => {});
  return client;
}

// rateLimit() calls store.init() synchronously, which issues the two SCRIPT LOADs.
function createApp(client, prefix) {
  const app = express();
  app.use(
    rateLimit({
      windowMs: 60_000,
      limit: 2,
      passOnStoreError: true,
      store: new RedisStore({ prefix, sendCommand: (...args) => client.sendCommand(args) }),
      logger: { error: (e, m) => console.log(`    [erl] ${m} ${e?.message ?? e}`), warn: () => {} },
    })
  );
  app.get('/', (_request, response) => response.send('ok'));
  return app.listen(0);
}

async function waitReady(client) {
  for (let i = 0; i < 100; i++) {
    try {
      if (await client.sendCommand(['PING'])) return;
    } catch {}
    await sleep(200);
  }
  throw new Error('redis never came up');
}

async function hit(server, n) {
  const { port } = server.address();
  const codes = [];
  for (let i = 0; i < n; i++) codes.push((await fetch(`http://localhost:${port}/`)).status);
  return codes;
}

const report = (codes) =>
  `  expected ${JSON.stringify(EXPECTED)}\n  actual   ${JSON.stringify(codes)}  ` +
  `${JSON.stringify(codes) === JSON.stringify(EXPECTED) ? 'PASS' : 'FAIL'}`;

// A: redis is DOWN when the limiter is built, so init() fails. Then it comes back.
console.log('\nA: redis down at startup, then back online');
stopRedis();
const aClient = createRedisClient();
const aServer = createApp(aClient, 'a:');
await sleep(500);
console.log('  starting redis...');
startRedis();
await waitReady(aClient);
console.log('  redis is reachable:', await aClient.sendCommand(['PING']));
const aCodes = await hit(aServer, 5);
console.log(report(aCodes));

// B (control): redis is UP when the limiter is built, so init() succeeds. Then it is bounced.
console.log('\nB: redis up at startup, then killed and restarted');
const bClient = createRedisClient();
await waitReady(bClient);
const bServer = createApp(bClient, 'b:');
await sleep(500); // let the SCRIPT LOADs land before pulling the plug
console.log('  killing redis...');
stopRedis();
await hit(bServer, 2);
console.log('  restarting redis...');
startRedis();
await waitReady(bClient);
const bCodes = await hit(bServer, 5);
console.log(report(bCodes));

stopRedis();
process.exit(0);
