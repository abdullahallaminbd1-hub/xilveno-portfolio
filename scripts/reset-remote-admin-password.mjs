import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { execFileSync } from 'node:child_process';
import { randomBytes, pbkdf2 } from 'node:crypto';
import { promisify } from 'node:util';

const pbkdf2Async = promisify(pbkdf2);
const iterations = 100000;
const rl = readline.createInterface({ input, output });

const askHidden = async (prompt) => {
  if (process.platform === 'win32') {
    const command = `$p = Read-Host -AsSecureString '${prompt.replaceAll("'", "''")}'; $b = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($p); try { [Runtime.InteropServices.Marshal]::PtrToStringBSTR($b) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($b) }`;
    return execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], { encoding: 'utf8', stdio: ['inherit', 'pipe', 'inherit'] }).trim();
  }
  return rl.question(prompt);
};

const toBase64Url = (value) => value.toString('base64').replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/g, '');
const password = await askHidden('New remote admin password: ');
const confirmation = await askHidden('Confirm new remote admin password: ');
rl.close();

if (!password || password !== confirmation || password.length < 12) {
  console.error('Passwords must match and be at least 12 characters long.');
  process.exit(1);
}

const salt = randomBytes(16);
const derived = await pbkdf2Async(password, salt, iterations, 32, 'sha256');
const hash = toBase64Url(derived);
const encodedSalt = toBase64Url(salt);

const sql = `UPDATE admins SET password_hash = '${hash}', password_salt = '${encodedSalt}', updated_at = CURRENT_TIMESTAMP WHERE id = (SELECT id FROM admins ORDER BY id LIMIT 1);`;
execFileSync('npx', ['wrangler', 'd1', 'execute', 'xilveno-portfolio-db', '--remote', `--command=${sql}`], { stdio: 'inherit' });
console.log('Remote admin password reset completed for the existing admin account.');