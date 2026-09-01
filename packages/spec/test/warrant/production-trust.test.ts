/*
 * Copyright 2026 Paul Wander
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import {
  assertProductionTrust,
  isProductionTrust,
  InsecureTrustConfigError,
} from '../../src/warrant/production-trust.js';
import type { IssuerTrust } from '../../src/warrant/issuer-trust.js';

const PRODUCTION_TRUST: IssuerTrust = {
  roots: [
    {
      issuerId: 'is_pwc' as IssuerTrust['roots'][0]['issuerId'],
      publicKey: 'AAAATRUSTED========================',
      kind: 'big-4',
      name: 'PwC AI Assurance',
    },
  ],
  acceptUnknown: false,
};

const DEV_TRUST: IssuerTrust = {
  roots: [],
  acceptUnknown: true,
};

describe('warrant/production-trust — assertProductionTrust', () => {
  it('does not throw when acceptUnknown is false', () => {
    expect(() => assertProductionTrust(PRODUCTION_TRUST)).not.toThrow();
  });

  it('throws InsecureTrustConfigError when acceptUnknown is true', () => {
    expect(() => assertProductionTrust(DEV_TRUST)).toThrow(InsecureTrustConfigError);
  });

  it('error carries the documented code + name', () => {
    try {
      assertProductionTrust(DEV_TRUST);
      expect.fail('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(InsecureTrustConfigError);
      expect((e as InsecureTrustConfigError).code).toBe('CRAWCUS_INSECURE_TRUST_CONFIG');
      expect((e as InsecureTrustConfigError).name).toBe('InsecureTrustConfigError');
    }
  });

  it('error message mentions TOFU + bootstrap guidance', () => {
    try {
      assertProductionTrust(DEV_TRUST);
      expect.fail('should have thrown');
    } catch (e) {
      const msg = (e as Error).message;
      expect(msg).toContain('TOFU');
      expect(msg).toContain('assertProductionTrust');
    }
  });
});

describe('warrant/production-trust — isProductionTrust', () => {
  it('returns true for production-grade config', () => {
    expect(isProductionTrust(PRODUCTION_TRUST)).toBe(true);
  });

  it('returns false for dev-mode TOFU config', () => {
    expect(isProductionTrust(DEV_TRUST)).toBe(false);
  });

  it('returns true when roots is empty but acceptUnknown is false (locked-down)', () => {
    const locked: IssuerTrust = { roots: [], acceptUnknown: false };
    expect(isProductionTrust(locked)).toBe(true);
  });
});
