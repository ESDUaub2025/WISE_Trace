import { createApp } from './app.mjs';
const app = await createApp({
  connectionString: process.env.DATABASE_URL,
  origin: process.env.APP_ORIGIN,
  secret: process.env.AUTH_SECRET,
  smtpUrl: process.env.SMTP_URL,
  mailFrom: process.env.MAIL_FROM,
  mediaRoot: process.env.MEDIA_ROOT ?? '/var/lib/wise/media',
  logger: true,
});
await app.listen({ host: '0.0.0.0', port: Number(process.env.PORT ?? 3000) });
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, async () => {
    await app.close();
    process.exit(0);
  });
