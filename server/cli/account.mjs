// Operator recovery tool, run on the server by someone with database access. Nothing here is reachable from the web.
//
//   node server/cli/account.mjs list
//   node server/cli/account.mjs set-password <username>      prints a new random password once
//   node server/cli/account.mjs reset-authenticator <username>   the person sets up a new authenticator at next sign-in
//   node server/cli/account.mjs sign-out <username>          ends the person's sign-ins on every device
//
// Needs DATABASE_URL and AUTH_SECRET, the same values the API uses.
import { randomBytes } from 'node:crypto';
import { createAuthentication } from '../auth/service.mjs';

const [command, username] = process.argv.slice(2);
const authentication = createAuthentication({
  connectionString: process.env.DATABASE_URL,
  origin: process.env.APP_ORIGIN ?? 'http://localhost',
  secret: process.env.AUTH_SECRET,
});
const { pool, accounts } = authentication;

async function memberId() {
  const result = await pool.query('select user_id from public.membership where username = $1', [username]);
  if (!result.rowCount) throw new Error(`No member with username "${username}"`);
  return result.rows[0].user_id;
}

try {
  if (command === 'list') {
    const result = await pool.query(
      `select m.username, m.display_name, m.roles, m.status,
              c.user_id is not null as has_password, c.totp_confirmed_at is not null as has_authenticator
         from public.membership m left join wise_auth.credential c on c.user_id = m.user_id order by m.username`,
    );
    console.table(result.rows);
  } else if (command === 'set-password' && username) {
    const password = randomBytes(18).toString('base64url');
    await accounts.setPassword(await memberId(), password);
    process.stdout.write(`New password for ${username} (shown once, hand it over privately):\n${password}\n`);
  } else if (command === 'reset-authenticator' && username) {
    await accounts.clearTotp(await memberId());
    process.stdout.write(`${username} will set up a new authenticator at their next sign-in.\n`);
  } else if (command === 'sign-out' && username) {
    await pool.query('delete from wise_auth.device_login where user_id = $1', [await memberId()]);
    process.stdout.write(`${username} is signed out on every device.\n`);
  } else {
    process.stdout.write(
      'Usage: node server/cli/account.mjs <list | set-password | reset-authenticator | sign-out> [username]\n',
    );
    process.exitCode = 1;
  }
} finally {
  await authentication.close();
}
