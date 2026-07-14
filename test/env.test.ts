import assert from 'node:assert/strict';
import test from 'node:test';

import { isRequestHostAllowed, normalizeRequestHost } from '../src/lib/domain-binding.js';
import { validateProductionEnv, type AppEnv } from '../src/lib/env.js';

test('normalizes request hosts before applying a deployment binding', () => {
  assert.equal(normalizeRequestHost('Edu.Example.com:443'), 'edu.example.com');
  assert.equal(
    isRequestHostAllowed({
      bindingSource: 'primaryDomain',
      boundHost: 'edu.example.com',
      requestHost: 'EDU.EXAMPLE.COM:443',
    }),
    true,
  );
  assert.equal(
    isRequestHostAllowed({
      bindingSource: 'primaryDomain',
      boundHost: 'edu.example.com',
      requestHost: 'other.example.com',
    }),
    false,
  );
});

test('rejects unsafe production secrets and incomplete domain bindings', () => {
  const base = {
    NODE_ENV: 'production',
    JWT_SECRET: 'a-production-secret-that-is-long-enough',
    FD_DOMAIN_BINDING_SOURCE: 'none',
  } as AppEnv;

  assert.equal(validateProductionEnv(base), base);
  assert.throws(
    () => validateProductionEnv({ ...base, JWT_SECRET: 'change-me-in-production' }),
    /JWT_SECRET/,
  );
  assert.throws(
    () =>
      validateProductionEnv({
        ...base,
        FD_DOMAIN_BINDING_SOURCE: 'primaryDomain',
        FD_BOUND_HOST: undefined,
      }),
    /FD_BOUND_HOST/,
  );
});
