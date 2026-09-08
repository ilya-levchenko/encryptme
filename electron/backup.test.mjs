import { describe, expect, it } from 'vitest';
import { createEncryptedBackup, openEncryptedBackup, writeEncryptedBackupFile } from './backup.mjs';
import { blankVault, encryptVault, usernameDigest } from './vault.mjs';

async function fixture() {
  return {
    profile: { version: 1, usernameHash: usernameDigest('Алекс'), slots: ['a', 'b'] },
    vaults: {
      a: await encryptVault(blankVault('real'), 'основной пароль 123'),
      b: await encryptVault(blankVault('decoy'), 'запасной пароль 456')
    }
  };
}

describe('encrypted backup', () => {
  it('round-trips both encrypted vaults without leaking profile metadata', async () => {
    const source = await fixture();
    const backup = await createEncryptedBackup(source, 'основной пароль 123');
    const serialized = JSON.stringify(backup);

    expect(serialized).not.toContain(source.profile.usernameHash);
    expect(serialized).not.toContain(source.vaults.a.ciphertext);

    const restored = await openEncryptedBackup(backup, 'основной пароль 123', 'алекс');
    expect(restored.profile).toEqual(source.profile);
    expect(restored.vaults).toEqual(source.vaults);
  });

  it('rejects a wrong backup password', async () => {
    const backup = await createEncryptedBackup(await fixture(), 'основной пароль 123');
    await expect(openEncryptedBackup(backup, 'другой пароль', 'Алекс')).rejects.toThrow('INVALID_BACKUP_PASSWORD');
  });

  it('rejects a different profile name', async () => {
    const backup = await createEncryptedBackup(await fixture(), 'основной пароль 123');
    await expect(openEncryptedBackup(backup, 'основной пароль 123', 'Борис')).rejects.toThrow('BACKUP_PROFILE_MISMATCH');
  });

  it('rejects malformed documents before decrypting', async () => {
    await expect(openEncryptedBackup({ format: 'other', version: 1 }, 'пароль', 'Алекс')).rejects.toThrow('INVALID_BACKUP');
  });

  it('retries with a direct write when Windows blocks an atomic replacement', async () => {
    const writes = [];
    await writeEncryptedBackupFile('copy.encryptme-backup', { format: 'test' }, {
      atomicWriter: async () => { const error = new Error('blocked'); error.code = 'EPERM'; throw error; },
      directWriter: async (...args) => { writes.push(args); }
    });
    expect(writes).toHaveLength(1);
    expect(writes[0][0]).toBe('copy.encryptme-backup');
    expect(writes[0][1]).toContain('"format":"test"');
  });

  it('does not risk replacing a file after an unrelated write failure', async () => {
    const directWriter = async () => { throw new Error('must not run'); };
    await expect(writeEncryptedBackupFile('copy.encryptme-backup', {}, {
      atomicWriter: async () => { const error = new Error('disk full'); error.code = 'ENOSPC'; throw error; },
      directWriter
    })).rejects.toMatchObject({ code: 'ENOSPC' });
  });
});
