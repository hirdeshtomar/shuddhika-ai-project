import 'express-async-errors';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { env } from './config/env.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';

// Route imports
import authRoutes from './routes/auth.js';
import leadRoutes from './routes/leads.js';
import scraperRoutes from './routes/scraper.js';
import pushRoutes from './routes/push.js';
import cronRoutes from './routes/cron.js';
import aisensyRoutes from './routes/aisensy.js';
import automationRoutes from './routes/automation.js';
// Retired (WhatsApp now handled by AiSensy): campaigns, templates, webhook,
// conversations, autoReplies. Files kept in repo but no longer mounted.

const app = express();

// Security middleware
app.use(helmet());

// CORS configuration
const FRONTEND_URL = process.env.FRONTEND_URL || '';
app.use(cors({
  origin: env.NODE_ENV === 'production'
    ? FRONTEND_URL
      ? FRONTEND_URL.split(',').map(u => u.trim())
      : true  // same-origin on Vercel; allow all if FRONTEND_URL not set
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
app.use('/api/scraper', scraperRoutes);
app.use('/api/push', pushRoutes);
app.use('/api/cron', cronRoutes);
app.use('/api/aisensy', aisensyRoutes);
app.use('/api/automation', automationRoutes);

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

export default app;
