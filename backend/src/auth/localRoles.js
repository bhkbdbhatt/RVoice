import fs from 'fs';
import path from 'path';
import { config } from '../config/env.js';

function loadLocalRoles() {
  try {
    const contents = fs.readFileSync(path.resolve(config.auth.localRolesFile), 'utf8');
    const parsed = JSON.parse(contents);
    return Array.isArray(parsed.users) ? parsed.users : [];
  } catch (err) {
    console.warn(`Unable to load local roles file: ${config.auth.localRolesFile}`);
    return [];
  }
}

export function findLocalUser(criteria = {}) {
  const users = loadLocalRoles();
  return users.find((user) => {
    if (criteria.username && user.username && user.username.toLowerCase() === String(criteria.username).toLowerCase()) {
      return true;
    }
    if (criteria.email && user.email && user.email.toLowerCase() === String(criteria.email).toLowerCase()) {
      return true;
    }
    if (criteria.subject && user.subject && user.subject === criteria.subject) {
      return true;
    }
    return false;
  });
}
