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
  get BACKEND_URL(): string {
    return requireOptionalDevUrl('BACKEND_URL', process.env.BACKEND_URL);
  },
  get ADMIN_TOKEN(): string {
    return requireString('ADMIN_TOKEN', process.env.ADMIN_TOKEN, 32);
  },
  get SESSION_SECRET(): string {
    return requireString('SESSION_SECRET', process.env.SESSION_SECRET, 32);
  },
};
