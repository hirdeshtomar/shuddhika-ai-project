// Local/standalone server entry point.
// On Vercel, the app is served via /api/index.ts instead (serverless),
// and campaign sending is driven by Vercel Cron hitting /api/cron/campaign-tick.
import app from './app.js';
import { env } from './config/env.js';
import { connectDatabase, disconnectDatabase } from './config/database.js';
import { runCampaignTick } from './services/campaignTick.js';

async function start(): Promise<void> {
  try {
    await connectDatabase();

    // When running as a standalone server, emulate the cron: tick every minute
    const tickInterval = setInterval(() => {
      runCampaignTick().catch((err) => console.error('[Tick] error:', err.message));
    }, 60_000);
    tickInterval.unref();

    app.listen(env.PORT, () => {
      console.log(`
╔════════════════════════════════════════════════════════╗
║   🛢️  Shuddhika Lead Generation API                     ║
║   Server running on port ${env.PORT}                        ║
║   Environment: ${env.NODE_ENV.padEnd(20)}              ║
║   Campaign tick: every 60s (in-process)                ║
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
