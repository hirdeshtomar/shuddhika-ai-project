# Shuddhika Lead Generation & Outreach System

A comprehensive lead generation and automated outreach system for Shuddhika Pure Mustard Oil, built with Node.js/TypeScript and React.

## Features

- **Lead Management**: Create, import (CSV), and manage leads with status tracking
- **WhatsApp Integration**: Send automated messages via WhatsApp Business Cloud API
- **Campaign Management**: Create and run outreach campaigns with targeting filters
- **Message Templates**: Pre-approved WhatsApp message templates with Hindi/English support
- **Simple Dashboard**: React-based admin panel for managing leads and campaigns
- **Queue System**: Background job processing with BullMQ for rate-limited message sending

## Tech Stack

- **Backend**: Node.js, TypeScript, Express.js
- **Database**: PostgreSQL with Prisma ORM
- **Queue**: Redis + BullMQ
- **Frontend**: React, Vite, Tailwind CSS, React Query
- **WhatsApp**: Meta Cloud API

## Prerequisites

- Node.js 18+
- PostgreSQL 15+
- Redis 7+
- WhatsApp Business Account (for sending messages)

## Quick Start

### 1. Start Database Services

```bash
docker-compose up -d
```

This starts PostgreSQL and Redis containers.

### 2. Backend Setup

```bash
cd backend

# Install dependencies
npm install

# Copy environment file
cp .env.example .env

# Edit .env with your configuration
# At minimum, update DATABASE_URL and JWT_SECRET

# Generate Prisma client
npm run db:generate

# Run database migrations
npm run db:push

# Start development server
npm run dev
```

The API will be available at `http://localhost:3000`

### 3. Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Start development server
npm run dev
```

The dashboard will be available at `http://localhost:5173`

## Environment Variables

### Backend (.env)

```env
# Server
PORT=3000
NODE_ENV=development

# Database
DATABASE_URL="postgresql://shuddhika:shuddhika123@localhost:5432/shuddhika"

# Redis
REDIS_URL="redis://localhost:6379"

# JWT
JWT_SECRET="your-super-secret-key-at-least-32-chars"
JWT_EXPIRES_IN="7d"

# WhatsApp (get from Meta Business Suite)
WHATSAPP_PHONE_NUMBER_ID="your-phone-number-id"
WHATSAPP_ACCESS_TOKEN="your-access-token"
WHATSAPP_BUSINESS_ACCOUNT_ID="your-business-account-id"
WHATSAPP_WEBHOOK_VERIFY_TOKEN="your-webhook-token"
```

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login
- `GET /api/auth/me` - Get current user

### Leads
- `GET /api/leads` - List leads with pagination/filters
- `POST /api/leads` - Create lead
- `PUT /api/leads/:id` - Update lead
- `DELETE /api/leads/:id` - Delete lead
- `POST /api/leads/bulk-import` - Import CSV
- `GET /api/leads/stats` - Get lead statistics

### Campaigns
- `GET /api/campaigns` - List campaigns
- `POST /api/campaigns` - Create campaign
- `POST /api/campaigns/:id/start` - Start campaign
- `POST /api/campaigns/:id/pause` - Pause campaign
- `GET /api/campaigns/:id/stats` - Get campaign stats

### Templates
- `GET /api/templates` - List templates
- `POST /api/templates` - Create template
- `POST /api/templates/:id/submit` - Submit for WhatsApp approval
- `POST /api/templates/sync` - Sync with WhatsApp

### Webhooks
- `GET /api/webhook/whatsapp` - WhatsApp webhook verification
- `POST /api/webhook/whatsapp` - WhatsApp webhook events

## WhatsApp Setup

1. Go to [Meta Business Suite](https://business.facebook.com/)
2. Create a WhatsApp Business Account
3. Add a phone number
4. Get your credentials from the API Setup page:
   - Phone Number ID
   - Access Token
   - Business Account ID
5. Create message templates and wait for approval (24-48 hours)
6. Set up webhook URL: `https://your-domain.com/api/webhook/whatsapp`

## CSV Import Format

```csv
name,phone,email,business_name,business_type,city,state,pincode,address,tags
Rajesh Kumar,9876543210,rajesh@email.com,Rajesh Grocery,grocery,Delhi,Delhi,110001,123 Main St,"wholesale,retail"
```

## Message Template Placeholders

Use `{{1}}`, `{{2}}`, etc. for dynamic content:

```
नमस्ते {{1}}! 🙏

शुद्धिका प्योर मस्टर्ड ऑयल - 100% शुद्ध सरसों का तेल

संपर्क करें: {{2}}
```

- `{{1}}` - Lead name
- `{{2}}` - Contact number or custom text

## Compliance Notes

### WhatsApp Business Policy
- Only send to opted-in contacts
- Use approved templates for outreach
- Honor opt-out requests immediately
- Follow message frequency limits

### Indian Regulations (TRAI)
- Check DND registry before calling
- Maintain consent records
- Follow calling hours (9 AM - 9 PM)

## Project Structure

```
shuddhika-ai-project/
├── backend/
│   ├── src/
│   │   ├── config/         # Environment & database config
│   │   ├── middleware/     # Auth & error handling
│   │   ├── routes/         # API routes
│   │   ├── services/       # WhatsApp, queue, scrapers
│   │   └── types/          # TypeScript types
│   └── prisma/             # Database schema
├── frontend/
│   ├── src/
│   │   ├── components/     # Reusable UI components
│   │   ├── hooks/          # React hooks
│   │   ├── pages/          # Page components
│   │   ├── services/       # API client
│   │   └── types/          # TypeScript types
│   └── index.html
└── docker-compose.yml      # PostgreSQL & Redis
```

## License

MIT
