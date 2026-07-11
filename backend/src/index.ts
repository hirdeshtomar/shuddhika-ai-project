// Local/standalone server entry point.
// On Vercel, the app is served via /api/index.ts instead (serverless),
// and daily outreach is driven by Vercel Cron hitting /api/cron/daily-outreach.
import app from './app.js';
import { env } from './config/env.js';
import { connectDatabase, disconnectDatabase } from './config/database.js';

async function start(): Promise<void> {
  try {
    await connectDatabase();

    app.listen(env.PORT, () => {
      console.log(`
╔════════════════════════════════════════════════════════╗
║   🛢️  Shuddhika Lead Generation API                     ║
║   Server running on port ${env.PORT}                        ║
║   Environment: ${env.NODE_ENV.padEnd(20)}              ║
║   Outreach: via AiSensy (daily cron)                   ║
╚════════════════════════════════════════════════════════╝
      `);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

process.on('SIGTERM', async () => {
  console.log('SIGTERM received. Shutting down gracefully...');
  await disconnectDatabase();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received. Shutting down gracefully...');
  await disconnectDatabase();
  process.exit(0);
});

start();
