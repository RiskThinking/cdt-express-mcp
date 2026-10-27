# OAuth state management

MCP transport requests are stateless. OAuth uses shared Redis state to enforce
single-use authorization requests/codes, refresh-token rotation, and revocation.

## Configuration

Use Redis 6.2 or later. Configure `MCP_REDIS_URL`, or provide
`MCP_REDIS_HOSTNAME` and `MCP_REDIS_PASSWORD` separately. Set
`MCP_REDIS_CLUSTER=true` for Redis Cluster. Prefer TLS (`rediss://`) and restrict
network access to authorized clients. All application instances must share the
same Redis database and `MCP_OAUTH_SECRET`.

A remote deployment requires Redis. Loopback development can omit it and use
in-memory storage. Storage failures deny access; there is no automatic fallback
to process-local state in a remote deployment.

## Record lifetime

- Pending request and code records expire after five minutes and are consumed
  atomically. Missing records cannot be redeemed.
- Authorization grants expire 30 days after the initial token exchange.
  Refreshing does not extend this deadline.
- Access tokens last at most one hour, bounded by the grant deadline. Every
  authenticated MCP request checks that its grant still exists.
- Revocation and refresh-token reuse invalidate the entire authorization.

Records contain random identifiers, token digests, and pending markers. Redis
does not receive raw API keys, OAuth tokens, names, or email addresses.

## Recovery

A complete loss of state invalidates existing authorizations and requires users
to reconnect. Restoring stale state is different: an old copy can restore a
previously consumed code or revoked grant. Review persistence, replication,
and recovery behavior for the selected Redis service. Disk persistence alone
does not guarantee that failover cannot lose acknowledged updates.

If state may have rolled back, invalidate existing authorizations before
resuming service, such as by rotating `MCP_OAUTH_SECRET`. Do not restore stale
OAuth records or leave an older authorization implementation reachable during
a cutover. Secret rotation also invalidates sealed client registrations.

## Local validation

Use disposable Redis instances for integration tests:

```bash
MCP_TEST_REDIS_URL=redis://127.0.0.1:6379 npm test

# Disposable Redis Cluster:
MCP_TEST_REDIS_CLUSTER=true MCP_TEST_REDIS_URL=redis://127.0.0.1:7000 npm test
```

Without a test URL, Redis integration tests are skipped. Never run the suite
against a shared or production database. `scripts/check-redis.mjs` provides
read-only configuration inspection when explicitly supplied with an authorized
endpoint and credentials.
