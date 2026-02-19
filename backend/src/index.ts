import 'express-async-errors';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { env } from './config/env.js';
import { connectDatabase, disconnectDatabase } from './config/database.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';

// Route imports
import authRoutes from './routes/auth.js';
import leadRoutes from './routes/leads.js';
import campaignRoutes from './routes/campaigns.js';
import templateRoutes from './routes/templates.js';
import webhookRoutes from './routes/webhook.js';
import scraperRoutes from './routes/scraper.js';
import conversationRoutes from './routes/conversations.js';
import pushRoutes from './routes/push.js';

const app = express();

// Queue worker function (loaded dynamically if Redis is available)
let startCampaignWorker: (() => any) | null = null;

// Security middleware
app.use(helmet());

// CORS configuration
const FRONTEND_URL = process.env.FRONTEND_URL || '';
app.use(cors({
  origin: env.NODE_ENV === 'production'
    ? FRONTEND_URL
      ? FRONTEND_URL.split(',').map(u => u.trim())
      : true  // allow all if FRONTEND_URL not set yet
    : ['http://localhost:5173', 'http://localhost:3000'],
  credentials: true,
}));

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: env.NODE_ENV,
  });
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/leads', leadRoutes);
app.use('/api/campaigns', campaignRoutes);
app.use('/api/templates', templateRoutes);
app.use('/api/webhook', webhookRoutes);
app.use('/api/scraper', scraperRoutes);
app.use('/api/conversations', conversationRoutes);
app.use('/api/push', pushRoutes);

// Dashboard stats endpoint
app.get('/api/dashboard', async (req, res) => {
  const { prisma } = await import('./config/database.js');

  const [
    totalLeads,
    newLeads,
    activeCampaigns,
    messagesSent,
  ] = await Promise.all([
    prisma.lead.count(),
    prisma.lead.count({
      where: { status: 'NEW' },
    }),
    prisma.campaign.count({
      where: { status: { in: ['RUNNING', 'SCHEDULED'] } },
    }),
    prisma.messageLog.count({
      where: { status: { in: ['SENT', 'DELIVERED', 'READ'] } },
    }),
  ]);

  res.json({
    success: true,
    data: {
      totalLeads,
      newLeads,
      activeCampaigns,
      messagesSent,
    },
  });
});

// WhatsApp account info endpoint (for Meta App Review — shows asset selection)
app.get('/api/whatsapp/account-info', async (_req, res) => {
  const phoneNumberId = env.WHATSAPP_PHONE_NUMBER_ID || null;
  const wabaId = env.WHATSAPP_BUSINESS_ACCOUNT_ID || null;
  const configured = !!(phoneNumberId && env.WHATSAPP_ACCESS_TOKEN);

  // Fetch phone number display from Meta API if configured
  let phoneDisplay: string | null = null;
  let verifiedName: string | null = null;
  if (configured && phoneNumberId) {
    try {
      const axios = (await import('axios')).default;
      const resp = await axios.get(
        `${env.WHATSAPP_API_URL}/${phoneNumberId}`,
        {
          headers: { Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}` },
          params: { fields: 'display_phone_number,verified_name,quality_rating' },
        }
      );
      phoneDisplay = resp.data.display_phone_number || null;
      verifiedName = resp.data.verified_name || null;
    } catch {
      // If API call fails, still return what we have
    }
  }

  res.json({
    success: true,
    data: {
      configured,
      phoneNumberId,
      wabaId,
      phoneDisplay,
      verifiedName,
    },
  });
});

// 404 handler
app.use(notFoundHandler);

// Error handler
app.use(errorHandler);

// Start server
async function start(): Promise<void> {
  try {
    // Connect to database
    await connectDatabase();

    // Start campaign worker (if Redis is available)
    if (env.REDIS_URL) {
      try {
        const queueModule = await import('./services/queue/campaignWorker.js');
        startCampaignWorker = queueModule.startCampaignWorker;
        startCampaignWorker();
        console.log('✅ Campaign worker started');
      } catch (error) {
        console.log('⚠️ Campaign worker not started (Redis connection failed)');
      }
    } else {
      console.log('ℹ️  Redis not configured - queue system disabled');
    }

    // Start HTTP server
    app.listen(env.PORT, () => {
      console.log(`
╔════════════════════════════════════════════════════════╗
║                                                        ║
║   🛢️  Shuddhika Lead Generation API                     ║
║                                                        ║
║   Server running on port ${env.PORT}                        ║
║   Environment: ${env.NODE_ENV.padEnd(20)}              ║
║                                                        ║
║   Endpoints:                                           ║
║   • Health: GET /health                                ║
║   • Auth: /api/auth                                    ║
║   • Leads: /api/leads                                  ║
║   • Campaigns: /api/campaigns                          ║
║   • Templates: /api/templates                          ║
║   • Webhooks: /api/webhook                             ║
║   • Scraper: /api/scraper                              ║
║                                                        ║
╚════════════════════════════════════════════════════════╝
      `);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
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
