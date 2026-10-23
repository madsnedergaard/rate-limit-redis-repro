# Bug reproduction repo for rate-limit-redis

This repo serves as a reproduction of a bug with [`rate-limit-redis`](https://github.com/express-rate-limit/rate-limit-redis).

## How to run

```bash
# Make sure you have a Redis server running locally
npm install
node repro.mjs
```

## Script output

```
A: redis down at startup, then back online
    [erl] express-rate-limit: async error during store initialization. The client is offline
  starting redis...
  redis is reachable: PONG
    [erl] express-rate-limit: error from store, allowing request without rate-limiting. The client is offline
    [erl] express-rate-limit: error from store, allowing request without rate-limiting. The client is offline
    [erl] express-rate-limit: error from store, allowing request without rate-limiting. The client is offline
    [erl] express-rate-limit: error from store, allowing request without rate-limiting. The client is offline
    [erl] express-rate-limit: error from store, allowing request without rate-limiting. The client is offline
  expected [200,200,429,429,429]
  actual   [200,200,200,200,200]  FAIL

B: redis up at startup, then killed and restarted
  killing redis...
    [erl] express-rate-limit: error from store, allowing request without rate-limiting. The client is offline
    [erl] express-rate-limit: error from store, allowing request without rate-limiting. The client is offline
  restarting redis...
  expected [200,200,429,429,429]
  actual   [200,200,429,429,429]  PASS
```

