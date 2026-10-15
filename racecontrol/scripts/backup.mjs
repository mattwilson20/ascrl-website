import { readFileSync, writeFileSync, mkdirSync, renameSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { randomBytes, scryptSync, createCipheriv, createDecipheriv, createHash } from 'node:crypto';

// Secrets arrive only in this process's environment, never command arguments/logs.
const mode = process.argv[2];
const output = resolve(process.env.RC_BACKUP_OUTPUT || '.');
const bin = process.env.RC_POSTGRES_BIN;
const password = process.env.RC_BACKUP_PASSPHRASE;
const magic = Buffer.from('ASCRLBK1');
const schemas = ['public', 'rc_private', 'auth', 'supabase_migrations', 'storage'];
function seal(bytes, pass) {
  const salt = randomBytes(16), iv = randomBytes(12);
  const key = scryptSync(pass, salt, 32, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(bytes), cipher.final()]);
  key.fill(0);
  return Buffer.concat([magic, salt, iv, cipher.getAuthTag(), encrypted]);
}
function unseal(bytes, pass) {
  if (!bytes.subarray(0, 8).equals(magic)) throw Error('Unknown backup format');
  const key = scryptSync(pass, bytes.subarray(8, 24), 32, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  const decipher = createDecipheriv('aes-256-gcm', key, bytes.subarray(24, 36));
  decipher.setAuthTag(bytes.subarray(36, 52));
  try { return Buffer.concat([decipher.update(bytes.subarray(52)), decipher.final()]); }
  finally { key.fill(0); }
}
function pg(tool, args) {
  const result = spawnSync(join(bin, `${tool}.exe`), args, {
    windowsHide: true, maxBuffer: 1024 * 1024 * 1024,
    env: { ...process.env, RC_BACKUP_PASSPHRASE: '' },
  });
  if (result.error || result.status !== 0) {
    // Never relay database records or credentials into a scheduler log.
    const diagnostic = (result.stderr?.toString() || result.error?.message || '').replaceAll(process.env.PGPASSWORD || '\0', '[REDACTED]').replaceAll(password || '\0', '[REDACTED]');
    const category = /password authentication failed/i.test(diagnostic) ? 'Database password was rejected'
      : /certificate verify failed/i.test(diagnostic) ? 'TLS certificate validation failed'
      : /timeout|timed out/i.test(diagnostic) ? 'Database connection timed out'
      : /Tenant or user not found/i.test(diagnostic) ? 'Pooler could not find this project/user'
      : /permission denied/i.test(diagnostic) ? 'Database permission denied'
      : /getaddrinfo|could not translate host/i.test(diagnostic) ? 'Database hostname could not be resolved'
      : /Max client connections/i.test(diagnostic) ? 'Database connection limit reached'
      : diagnostic.slice(0, 600);
    throw Error(`${tool} failed (exit ${result.status ?? 'unavailable'}): ${category}`);
  }
  return result.stdout;
}
if (mode === 'self-test') {
  const plain = Buffer.from('ASCRL encryption verification');
  const encrypted = seal(plain, 'temporary-test-passphrase');
  if (!unseal(encrypted, 'temporary-test-passphrase').equals(plain)) throw Error('Round trip failed');
  encrypted[encrypted.length - 1] ^= 1;
  let rejected = false;
  try { unseal(encrypted, 'temporary-test-passphrase'); } catch { rejected = true; }
  if (!rejected) throw Error('Modified ciphertext was accepted');
  console.log('Encryption round-trip and tamper rejection passed.');
} else if (mode === 'backup') {
  if (!password || password.length < 16 || !bin) throw Error('Private backup setup is incomplete');
  if (process.env.PGHOST !== 'aws-0-us-east-1.pooler.supabase.com' || process.env.PGUSER !== 'postgres.ixchlspfwllsmwjxqipr') throw Error('Unexpected source database');
  const check = JSON.parse(pg('psql', ['-X', '-w', '-At', '-v', 'ON_ERROR_STOP=1', '-c',
    "select json_build_object('version',version(),'storage_objects',(select count(*) from storage.objects),'vault_secrets',(select count(*) from vault.secrets),'roles',(select json_agg(rolname) from pg_roles where rolname !~ '^pg_'));"]).toString().trim());
  if (Number(check.storage_objects) || Number(check.vault_secrets)) throw Error('Storage files or Vault secrets now require an expanded recovery plan. Database-only backup blocked.');
  const dump = pg('pg_dump', ['-w', '--format=custom', '--compress=6', '--lock-wait-timeout=30000', ...schemas.flatMap(s => ['--schema', s])]);
  if (dump.subarray(0, 5).toString() !== 'PGDMP') throw Error('Invalid PostgreSQL dump');
  const manifest = { format: 1, project: 'ixchlspfwllsmwjxqipr', createdAt: new Date().toISOString(), schemas,
    dumpSha256: createHash('sha256').update(dump).digest('hex'), ...check,
    scope: 'Logical database backup including auth identities, application schemas, storage metadata, RLS, functions and migration history. Provider secrets, platform settings and storage files are separate.' };
  const bundle = Buffer.from(JSON.stringify({ manifest, dump: dump.toString('base64') }));
  const encrypted = seal(bundle, password);
  // Authenticate and verify the complete archive before marking it successful.
  const verified = JSON.parse(unseal(encrypted, password));
  if (createHash('sha256').update(Buffer.from(verified.dump, 'base64')).digest('hex') !== manifest.dumpSha256) throw Error('Backup verification failed');
  mkdirSync(output, { recursive: true });
  const file = join(output, `racecontrol-${manifest.createdAt.replace(/[:.]/g, '-')}.ascrl-backup`);
  writeFileSync(`${file}.partial`, encrypted, { flag: 'wx' });
  renameSync(`${file}.partial`, file);
  writeFileSync(join(output, 'latest-status.json'), JSON.stringify({ success: true, completedAt: manifest.createdAt, file, encryptedBytes: encrypted.length, dumpSha256: manifest.dumpSha256 }, null, 2));
  bundle.fill(0); dump.fill(0);
  console.log(`Encrypted backup verified: ${file}`);
} else if (mode === 'decrypt') {
  if (!password) throw Error('Recovery passphrase is required');
  const bundle = JSON.parse(unseal(readFileSync(process.argv[3]), password));
  const dump = Buffer.from(bundle.dump, 'base64');
  if (createHash('sha256').update(dump).digest('hex') !== bundle.manifest.dumpSha256) throw Error('Backup checksum mismatch');
  // Caller chooses an isolated local directory, never a public/repository destination.
  mkdirSync(output, { recursive: true });
  writeFileSync(join(output, 'database.dump'), dump, { flag: 'wx' });
  writeFileSync(join(output, 'manifest.json'), JSON.stringify(bundle.manifest, null, 2), { flag: 'wx' });
  console.log('Backup authenticated and decrypted for isolated recovery.');
} else throw Error('Use backup, decrypt or self-test');
