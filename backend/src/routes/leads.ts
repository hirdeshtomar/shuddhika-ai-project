import { Router, Response } from 'express';
import { z } from 'zod';
import { parse } from 'csv-parse';
import multer from 'multer';
import { prisma } from '../config/database.js';
import { authenticate } from '../middleware/auth.js';
import { AppError } from '../middleware/errorHandler.js';
import {
  AuthenticatedRequest,
  ApiResponse,
  CreateLeadInput,
  UpdateLeadInput,
  LeadFilters,
  ImportResult,
  CsvLeadRow,
} from '../types/index.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

// Validation schemas
const createLeadSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  phone: z.string().min(10, 'Valid phone number required').max(15),
  email: z.string().email().optional().nullable(),
  businessName: z.string().optional().nullable(),
  businessType: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  state: z.string().optional().nullable(),
  pincode: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  tags: z.array(z.string()).optional(),
  notes: z.string().optional().nullable(),
});

const updateLeadSchema = createLeadSchema.partial().extend({
  status: z.enum(['NEW', 'CONTACTED', 'INTERESTED', 'NEGOTIATING', 'CONVERTED', 'REJECTED', 'DO_NOT_CONTACT']).optional(),
  optedOut: z.boolean().optional(),
});

// Normalize phone number (remove spaces, dashes, and ensure country code)
function normalizePhone(phone: string): string {
  let normalized = phone.replace(/[\s\-\(\)]/g, '');
  // Add India country code if not present
  if (normalized.startsWith('0')) {
    normalized = '91' + normalized.substring(1);
  } else if (!normalized.startsWith('91') && !normalized.startsWith('+91')) {
    normalized = '91' + normalized;
  }
  // Remove + if present
  normalized = normalized.replace(/^\+/, '');
  return normalized;
}

// GET /api/leads - List leads with pagination and filters
router.get('/', authenticate, async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
  const skip = (page - 1) * limit;

  // Build filters
  const filters: LeadFilters = {
    status: req.query.status ? (req.query.status as string).split(',') : undefined,
    source: req.query.source ? (req.query.source as string).split(',') : undefined,
    tags: req.query.tags ? (req.query.tags as string).split(',') : undefined,
    city: req.query.city as string | undefined,
    search: req.query.search as string | undefined,
    optedOut: req.query.optedOut === 'true' ? true : req.query.optedOut === 'false' ? false : undefined,
  };

  const where: any = {};

  if (filters.status?.length) {
    where.status = { in: filters.status as any[] };
  }
  if (filters.source?.length) {
    where.source = { in: filters.source as any[] };
  }
  if (filters.tags?.length) {
    where.tags = { hasSome: filters.tags };
  }
  if (filters.city) {
    where.city = { contains: filters.city, mode: 'insensitive' };
  }
  if (filters.search) {
    where.OR = [
      { name: { contains: filters.search, mode: 'insensitive' } },
      { phone: { contains: filters.search } },
      { businessName: { contains: filters.search, mode: 'insensitive' } },
      { email: { contains: filters.search, mode: 'insensitive' } },
    ];
  }
  if (filters.optedOut !== undefined) {
    where.optedOut = filters.optedOut;
  }

  const [leads, total] = await Promise.all([
    prisma.lead.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.lead.count({ where }),
  ]);

  res.json({
    success: true,
    data: leads,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
});

// GET /api/leads/stats - Get lead statistics
router.get('/stats', authenticate, async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  const [total, byStatus, bySource, recentlyAdded] = await Promise.all([
    prisma.lead.count(),
    prisma.lead.groupBy({
      by: ['status'],
      _count: true,
    }),
    prisma.lead.groupBy({
      by: ['source'],
      _count: true,
    }),
    prisma.lead.count({
      where: {
        createdAt: {
          gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // Last 7 days
        },
      },
    }),
  ]);

  res.json({
    success: true,
    data: {
      total,
      byStatus: byStatus.reduce((acc, item) => {
        acc[item.status] = item._count;
        return acc;
      }, {} as Record<string, number>),
      bySource: bySource.reduce((acc, item) => {
        acc[item.source] = item._count;
        return acc;
      }, {} as Record<string, number>),
      recentlyAdded,
    },
  });
});

// GET /api/leads/cities - Get distinct city values
router.get('/cities', authenticate, async (_req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  const cities = await prisma.lead.findMany({
    where: { NOT: [{ city: null }, { city: '' }] },
    select: { city: true },
    distinct: ['city'],
    orderBy: { city: 'asc' },
  });

  res.json({
    success: true,
    data: cities.map((c) => c.city).filter(Boolean),
  });
});

// GET /api/leads/:id - Get single lead
router.get('/:id', authenticate, async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  const lead = await prisma.lead.findUnique({
    where: { id: req.params.id },
    include: {
      messages: {
        orderBy: { createdAt: 'desc' },
        take: 10,
      },
      campaignLeads: {
        include: {
          campaign: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 5,
      },
    },
  });

  if (!lead) {
    throw new AppError('Lead not found', 404);
  }

  res.json({ success: true, data: lead });
});

// POST /api/leads - Create single lead
router.post('/', authenticate, async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  const data = createLeadSchema.parse(req.body) as CreateLeadInput;
  const normalizedPhone = normalizePhone(data.phone);

  const lead = await prisma.lead.create({
    data: {
      ...data,
      phone: normalizedPhone,
      source: 'MANUAL',
    },
  });

  res.status(201).json({ success: true, data: lead });
});

// PUT /api/leads/:id - Update lead
router.put('/:id', authenticate, async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  const data = updateLeadSchema.parse(req.body) as UpdateLeadInput;

  // If phone is being updated, normalize it
  if (data.phone) {
    data.phone = normalizePhone(data.phone);
  }

  // If opting out, set the opt-out timestamp
  const updateData: any = { ...data };
  if (data.optedOut === true) {
    updateData.optedOutAt = new Date();
  }

  const lead = await prisma.lead.update({
    where: { id: req.params.id },
    data: updateData,
  });

  res.json({ success: true, data: lead });
});

// DELETE /api/leads/:id - Delete lead
router.delete('/:id', authenticate, async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  await prisma.lead.delete({
    where: { id: req.params.id },
  });

  res.json({ success: true, message: 'Lead deleted successfully' });
});

// POST /api/leads/bulk-import - Import leads from CSV
router.post(
  '/bulk-import',
  authenticate,
  upload.single('file'),
  async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
    if (!req.file) {
      throw new AppError('CSV file is required', 400);
    }

    const result: ImportResult = {
      total: 0,
      imported: 0,
      duplicates: 0,
      errors: [],
    };

    const records: CsvLeadRow[] = [];

    // Parse CSV
    await new Promise<void>((resolve, reject) => {
      const parser = parse(req.file!.buffer, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
      });

      parser.on('data', (row: CsvLeadRow) => {
        records.push(row);
      });

      parser.on('error', reject);
      parser.on('end', resolve);
    });

    result.total = records.length;

    // Process records
    for (let i = 0; i < records.length; i++) {
      const row = records[i]!;

      try {
        // Validate required fields
        if (!row.name || !row.phone) {
          result.errors.push({
            row: i + 2, // +2 for header row and 0-index
            error: 'Name and phone are required',
          });
          continue;
        }

        const normalizedPhone = normalizePhone(row.phone);
        const tags = row.tags ? row.tags.split(',').map((t) => t.trim()) : [];

        // Check for duplicate
        const existing = await prisma.lead.findUnique({
          where: { phone: normalizedPhone },
        });

        if (existing) {
          result.duplicates++;
          continue;
        }

        // Create lead
        await prisma.lead.create({
          data: {
            name: row.name,
            phone: normalizedPhone,
            email: row.email || null,
            businessName: row.business_name || null,
            businessType: row.business_type || null,
            city: row.city || null,
            state: row.state || null,
            pincode: row.pincode || null,
            address: row.address || null,
            tags,
            source: 'CSV_IMPORT',
          },
        });

        result.imported++;
      } catch (error) {
        result.errors.push({
          row: i + 2,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    res.json({
      success: true,
      data: result,
      message: `Imported ${result.imported} leads. ${result.duplicates} duplicates skipped. ${result.errors.length} errors.`,
    });
  }
);

// POST /api/leads/cleanup - Remove all DO_NOT_CONTACT leads (not on WhatsApp, etc.)
router.post('/cleanup', authenticate, async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  const count = await prisma.lead.count({
    where: { status: 'DO_NOT_CONTACT' },
  });

  if (count === 0) {
    res.json({ success: true, message: 'No leads to clean up', data: { deleted: 0 } });
    return;
  }

  // Delete related records first (campaign leads, message logs)
  const doNotContactLeads = await prisma.lead.findMany({
    where: { status: 'DO_NOT_CONTACT' },
    select: { id: true },
  });
  const leadIds = doNotContactLeads.map((l) => l.id);

  await prisma.campaignLead.deleteMany({
    where: { leadId: { in: leadIds } },
  });
  await prisma.messageLog.deleteMany({
    where: { leadId: { in: leadIds } },
  });
  const result = await prisma.lead.deleteMany({
    where: { status: 'DO_NOT_CONTACT' },
  });

  res.json({
    success: true,
    message: `Removed ${result.count} Do Not Contact leads`,
    data: { deleted: result.count },
  });
});

// POST /api/leads/bulk-delete - Delete multiple leads
router.post('/bulk-delete', authenticate, async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  const { ids } = req.body;

  if (!Array.isArray(ids) || ids.length === 0) {
    throw new AppError('Lead IDs array is required', 400);
  }

  const result = await prisma.lead.deleteMany({
    where: { id: { in: ids } },
  });

  res.json({
    success: true,
    message: `Deleted ${result.count} leads`,
  });
});

// POST /api/leads/bulk-update - Update multiple leads
router.post('/bulk-update', authenticate, async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  const { ids, data } = req.body;

  if (!Array.isArray(ids) || ids.length === 0) {
    throw new AppError('Lead IDs array is required', 400);
  }

  const updateData = updateLeadSchema.partial().parse(data);

  const result = await prisma.lead.updateMany({
    where: { id: { in: ids } },
    data: updateData,
  });

  res.json({
    success: true,
    message: `Updated ${result.count} leads`,
  });
});

export default router;
