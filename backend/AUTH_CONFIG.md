# Backend Auth Configuration

This backend supports three auth modes:

- `local` — local/demo mode with no JWT provider required
- `oidc` — OpenID Connect token validation with Keycloak or any OIDC provider
- `disabled` — no auth checks at all (use only for temporary demos)

## Configuration variables

### Common
- `AUTH_MODE` — `local`, `oidc`, or `disabled`
- `REQUIRE_AUTH` — set to `false` to disable strict JWT validation and allow local/demo mode
- `LOCAL_AUTH_ENABLED` — `true` enables local header-based auth fallback
- `ALLOW_INSECURE_LOCAL` — `true` lets local mode grant default demo roles even without headers
- `LOCAL_ROLES_FILE` — path to `roles.json` with users and roles
- `LOCAL_DEFAULT_ROLES` — comma-separated default roles for insecure local mode, e.g. `admin,manager`

### OIDC / Keycloak
- `KEYCLOAK_ISSUER` / `OIDC_ISSUER` — issuer URL for the identity provider
- `KEYCLOAK_AUDIENCE` / `OIDC_AUDIENCE` — expected audience claim
- `KEYCLOAK_CLIENT_ID` / `OIDC_CLIENT_ID` — client ID used by the backend

## Local/demo mode setup

1. Use JSON storage and local auth mode:

```bash
cd backend
export AUTH_MODE=local
export REQUIRE_AUTH=false
export LOCAL_AUTH_ENABLED=true
export ALLOW_INSECURE_LOCAL=true
export LOCAL_DEFAULT_ROLES=admin,manager,ingest,analyst
```

2. Optionally use sample local roles file:

```bash
export LOCAL_ROLES_FILE=./data/roles.json
```

3. Start the backend:

```bash
npm run dev
```

4. Use the login screen in the frontend or send local headers:

```bash
curl -H "x-local-user: demo" -H "x-local-roles: admin,manager" http://localhost:4000/api/feedback
```

## Production / OIDC mode setup

1. Use appropriate provider details:

```bash
export AUTH_MODE=oidc
export REQUIRE_AUTH=true
export KEYCLOAK_ISSUER=http://localhost:8080/auth/realms/voc
export KEYCLOAK_AUDIENCE=voc-backend
export KEYCLOAK_CLIENT_ID=voc-client
```

2. Start the backend and use valid JWT tokens for protected routes.

## Disabled mode (for internal POC only)

```bash
export AUTH_MODE=disabled
export REQUIRE_AUTH=false
export LOCAL_AUTH_ENABLED=true
export ALLOW_INSECURE_LOCAL=true
```

> Warning: `disabled` mode bypasses auth checks entirely and should never be used in production.

## Notes

- `local` mode is for demos and POCs. It keeps the same API and role-based guards, but grants access from headers or a default local role set.
- `oidc` mode validates tokens via JWKS and enforces role-based authorization from token claims.
- `disabled` mode is only for quick local demos when you want to bypass auth entirely.
