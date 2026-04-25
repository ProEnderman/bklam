import { Buffer } from 'buffer';

const DEV_ENVS = new Set(['', 'dev', 'development', 'local', 'test']);

function currentEnv(): string {
  return (
    process.env.APP_ENV ||
    process.env.NODE_ENV ||
    process.env.ENVIRONMENT ||
    ''
  )
    .trim()
    .toLowerCase();
}

function isNonDevEnvironment(): boolean {
  return !DEV_ENVS.has(currentEnv());
}

function allowInsecureDevSecrets(): boolean {
  const raw = (process.env.ALLOW_INSECURE_DEV_SECRETS || 'false').trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes';
}

function hasPlaceholder(value: string): boolean {
  const v = value.toLowerCase();
  return (
    v.includes('change-me') ||
    v.includes('default-secret') ||
    v.includes('test-secret') ||
    v.includes('your-secret') ||
    v.includes('dev-jwt-secret')
  );
}

function requireString(name: string): string {
  const value = (process.env[name] || '').trim();
  if (!value) {
    throw new Error(`${name} must be set`);
  }
  return value;
}

function decodeBase64Strict(name: string, value: string): Buffer {
  const normalized = value.replace(/\s+/g, '');
  if (!/^[A-Za-z0-9+/=]+$/.test(normalized) || normalized.length % 4 !== 0) {
    throw new Error(`${name} must be valid base64`);
  }
  const decoded = Buffer.from(normalized, 'base64');
  if (decoded.length === 0) {
    throw new Error(`${name} must be valid base64`);
  }
  return decoded;
}

export function validateSecretsOrThrow(): void {
  const strict = isNonDevEnvironment() || !allowInsecureDevSecrets();

  const jwtSecret = requireString('JWT_SECRET');
  if (jwtSecret.length < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters');
  }
  if (strict && hasPlaceholder(jwtSecret)) {
    throw new Error('JWT_SECRET contains insecure placeholder value');
  }

  const masterKeyB64 = requireString('MASTER_KEY');
  const masterKey = decodeBase64Strict('MASTER_KEY', masterKeyB64);
  if (masterKey.length < 32) {
    throw new Error('MASTER_KEY must decode to at least 32 bytes');
  }
  if (strict && hasPlaceholder(masterKeyB64)) {
    throw new Error('MASTER_KEY contains insecure placeholder value');
  }
}
