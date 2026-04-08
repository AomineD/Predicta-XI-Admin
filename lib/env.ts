function requireString(name: string, value: string | undefined, minLength = 1): string {
  if (!value || value.trim().length < minLength) {
    throw new Error(`${name} is required`);
  }

  return value;
}

function requireUrl(name: string, value: string | undefined): string {
  const resolved = requireString(name, value);

  try {
    new URL(resolved);
    return resolved;
  } catch {
    throw new Error(`${name} must be a valid URL`);
  }
}

function requireOptionalDevUrl(name: string, value: string | undefined): string {
  if (!value && process.env.NODE_ENV !== 'production') {
    return 'http://localhost:3000';
  }

  return requireUrl(name, value);
}

export const adminEnv = {
  BACKEND_URL: requireOptionalDevUrl('BACKEND_URL', process.env.BACKEND_URL),
  ADMIN_TOKEN: requireString('ADMIN_TOKEN', process.env.ADMIN_TOKEN, 32),
  SESSION_SECRET: requireString('SESSION_SECRET', process.env.SESSION_SECRET, 32),
};
