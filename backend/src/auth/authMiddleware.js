import { expressjwt as jwt } from 'express-jwt';
import jwksRsa from 'jwks-rsa';
import { config } from '../config/env.js';
import { findLocalUser } from './localRoles.js';

function normalizeRoles(token) {
  if (Array.isArray(token.roles)) {
    return Array.from(new Set(token.roles));
  }

  const realmRoles = (token.realm_access && token.realm_access.roles) || [];
  const resourceRoles = (token.resource_access && token.resource_access[config.auth.clientId] && token.resource_access[config.auth.clientId].roles) || [];
  return Array.from(new Set([...realmRoles, ...resourceRoles]));
}

function getTokenRoles(req) {
  const token = req.auth || {};
  return normalizeRoles(token);
}

function isAuthDisabled() {
  return config.auth.mode === 'disabled';
}

function shouldUseLocalAuth() {
  return config.auth.localAuthEnabled || config.auth.mode === 'local' || config.auth.mode === 'disabled';
}

export const jwtAuth = jwt({
  secret: jwksRsa.expressJwtSecret({
    cache: true,
    rateLimit: true,
    jwksRequestsPerMinute: 10,
    jwksUri: `${config.auth.issuer}/protocol/openid-connect/certs`,
  }),
  audience: config.auth.audience,
  issuer: config.auth.issuer,
  algorithms: ['RS256'],
  credentialsRequired: config.auth.requireAuth,
  requestProperty: 'auth',
});

export function localAuth(req, res, next) {
  if (req.auth || !shouldUseLocalAuth()) {
    return next();
  }

  const username = req.headers['x-local-username'] || req.headers['x-local-user'];
  const email = req.headers['x-local-email'];
  const subject = req.headers['x-local-subject'];
  const rolesHeader = req.headers['x-local-roles'];
  const headerRoles = rolesHeader
    ? String(rolesHeader).split(',').map((role) => role.trim()).filter(Boolean)
    : [];

  const localUser = findLocalUser({ username, email, subject });
  let roles = Array.from(new Set([...(localUser?.roles || []), ...headerRoles]));

  if (!roles.length && config.auth.allowInsecureLocal) {
    roles = config.auth.defaultLocalRoles;
  }

  if (!roles.length && isAuthDisabled()) {
    roles = config.auth.defaultLocalRoles;
  }

  if (!roles.length) {
    return next();
  }

  req.auth = {
    preferred_username: username || localUser?.username || (isAuthDisabled() ? 'demo-user' : 'local-user'),
    email: email || localUser?.email || null,
    sub: subject || localUser?.subject || (isAuthDisabled() ? 'demo-subject' : 'local-subject'),
    roles,
  };

  next();
}

export function requireRole(role) {
  return (req, res, next) => {
    if (isAuthDisabled()) {
      return next();
    }

    const roles = getTokenRoles(req);
    if (!roles.includes(role)) {
      return res.status(403).json({ error: 'Forbidden: missing required role' });
    }
    next();
  };
}

export function requireAnyRole(...allowedRoles) {
  return (req, res, next) => {
    if (isAuthDisabled()) {
      return next();
    }

    const roles = getTokenRoles(req);
    const hasRole = allowedRoles.some((role) => roles.includes(role));
    if (!hasRole) {
      return res.status(403).json({ error: 'Forbidden: requires one of the allowed roles' });
    }
    next();
  };
}

export function getUserInfo(req) {
  return {
    username: req.auth?.preferred_username || req.auth?.name || null,
    email: req.auth?.email || null,
    subject: req.auth?.sub || null,
    roles: getTokenRoles(req),
  };
}
