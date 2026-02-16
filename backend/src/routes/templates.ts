import { Router, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../config/database.js';
import { env } from '../config/env.js';
import { authenticate } from '../middleware/auth.js';
import { AppError } from '../middleware/errorHandler.js';
import { AuthenticatedRequest, ApiResponse } from '../types/index.js';
import { whatsappClient } from '../services/whatsapp/client.js';

const router = Router();

// Validation schema
const createTemplateSchema = z.object({
  name: z.string().min(1, 'Template name is required').max(100),
  language: z.enum(['hi', 'en']).default('hi'),
  category: z.enum(['MARKETING', 'UTILITY', 'AUTHENTICATION']).default('MARKETING'),
  headerType: z.enum(['TEXT', 'IMAGE', 'VIDEO', 'DOCUMENT']).optional().nullable(),
  headerContent: z.string().optional().nullable(),
  bodyText: z.string().min(1, 'Body text is required'),
  footerText: z.string().optional().nullable(),
  buttons: z.array(z.object({
    type: z.enum(['QUICK_REPLY', 'URL', 'PHONE_NUMBER']),
    text: z.string(),
    url: z.string().optional(),
    phoneNumber: z.string().optional(),
  })).optional(),
});

// GET /api/templates - List all templates
router.get('/', authenticate, async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  const templates = await prisma.messageTemplate.findMany({
    orderBy: { createdAt: 'desc' },
  });

  res.json({ success: true, data: templates });
});

// GET /api/templates/:id - Get single template
router.get('/:id', authenticate, async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  const template = await prisma.messageTemplate.findUnique({
    where: { id: req.params.id },
    include: {
      _count: {
        select: { campaigns: true, messages: true },
      },
    },
  });

  if (!template) {
    throw new AppError('Template not found', 404);
  }

  res.json({ success: true, data: template });
});

// POST /api/templates - Create new template
router.post('/', authenticate, async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  const data = createTemplateSchema.parse(req.body);

  // Generate template content with placeholders
  let content = '';
  if (data.headerType === 'TEXT' && data.headerContent) {
    content += `[Header: ${data.headerContent}]\n\n`;
  }
  content += data.bodyText;
  if (data.footerText) {
    content += `\n\n[Footer: ${data.footerText}]`;
  }

  const template = await prisma.messageTemplate.create({
    data: {
      name: data.name,
      content,
      language: data.language,
      category: data.category,
      headerType: data.headerType,
      headerContent: data.headerContent,
      bodyText: data.bodyText,
      footerText: data.footerText,
      buttons: data.buttons,
      status: 'DRAFT',
    },
  });

  res.status(201).json({
    success: true,
    data: template,
    message: 'Template created. Submit for WhatsApp approval when ready.',
  });
});

// PUT /api/templates/:id - Update template
router.put('/:id', authenticate, async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  const existing = await prisma.messageTemplate.findUnique({
    where: { id: req.params.id },
  });

  if (!existing) {
    throw new AppError('Template not found', 404);
  }

  if (existing.status === 'APPROVED') {
    throw new AppError('Cannot edit an approved template. Create a new one instead.', 400);
  }

  const data = createTemplateSchema.partial().parse(req.body);

  // Regenerate content if body parts changed
  let content = existing.content;
  if (data.bodyText) {
    content = '';
    if ((data.headerType || existing.headerType) === 'TEXT') {
      content += `[Header: ${data.headerContent || existing.headerContent}]\n\n`;
    }
    content += data.bodyText;
    if (data.footerText || existing.footerText) {
      content += `\n\n[Footer: ${data.footerText || existing.footerText}]`;
    }
  }

  const template = await prisma.messageTemplate.update({
    where: { id: req.params.id },
    data: {
      ...data,
      content,
    },
  });

  res.json({ success: true, data: template });
});

// POST /api/templates/:id/submit - Submit template for WhatsApp approval
router.post('/:id/submit', authenticate, async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  const template = await prisma.messageTemplate.findUnique({
    where: { id: req.params.id },
  });

  if (!template) {
    throw new AppError('Template not found', 404);
  }

  if (template.status !== 'DRAFT' && template.status !== 'REJECTED') {
    throw new AppError('Template is already submitted or approved', 400);
  }

  // Build WhatsApp template components
  const components: any[] = [];

  // Header component
  if (template.headerType) {
    const headerComponent: any = {
      type: 'HEADER',
      format: template.headerType,
    };
    if (template.headerType === 'TEXT') {
      headerComponent.text = template.headerContent;
    }
    components.push(headerComponent);
  }

  // Body component
  components.push({
    type: 'BODY',
    text: template.bodyText,
  });

  // Footer component
  if (template.footerText) {
    components.push({
      type: 'FOOTER',
      text: template.footerText,
    });
  }

  // Button components
  const buttons = template.buttons as any[];
  if (buttons && buttons.length > 0) {
    components.push({
      type: 'BUTTONS',
      buttons: buttons.map((btn) => ({
        type: btn.type,
        text: btn.text,
        ...(btn.url && { url: btn.url }),
        ...(btn.phoneNumber && { phone_number: btn.phoneNumber }),
      })),
    });
  }

  // Generate a WhatsApp-compatible template name (lowercase, underscores)
  const whatsappTemplateName = template.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');

  // Submit to WhatsApp
  const result = await whatsappClient.createTemplate({
    name: whatsappTemplateName,
    language: template.language,
    category: template.category,
    components,
  });

  if (!result.success) {
    await prisma.messageTemplate.update({
      where: { id: template.id },
      data: { status: 'REJECTED' },
    });

    throw new AppError(`WhatsApp rejected template: ${result.error}`, 400);
  }

  // Update template with WhatsApp details
  await prisma.messageTemplate.update({
    where: { id: template.id },
    data: {
      whatsappTemplateId: result.templateId,
      whatsappTemplateName,
      status: 'PENDING_APPROVAL',
    },
  });

  res.json({
    success: true,
    message: 'Template submitted to WhatsApp for approval. This may take 24-48 hours.',
  });
});

// POST /api/templates/sync - Sync templates from WhatsApp
router.post('/sync', authenticate, async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  // Check if WhatsApp is configured
  if (!env.WHATSAPP_ACCESS_TOKEN || !env.WHATSAPP_BUSINESS_ACCOUNT_ID) {
    throw new AppError('WhatsApp API credentials not configured in .env', 400);
  }

  console.log('Fetching templates from WhatsApp...');
  const whatsappTemplates = await whatsappClient.getTemplates();
  console.log(`Found ${whatsappTemplates.length} templates from WhatsApp`);

  let synced = 0;
  let imported = 0;

  for (const waTemplate of whatsappTemplates) {
    // Find matching template in our database
    const existing = await prisma.messageTemplate.findFirst({
      where: {
        OR: [
          { whatsappTemplateId: waTemplate.id },
          { whatsappTemplateName: waTemplate.name },
        ],
      },
    });

    // Map WhatsApp status to our status
    const status = waTemplate.status === 'APPROVED'
      ? 'APPROVED'
      : waTemplate.status === 'REJECTED'
        ? 'REJECTED'
        : 'PENDING_APPROVAL';

    if (existing) {
      // Update existing template — sync language, header, body from WhatsApp
      const updateData: any = {
        whatsappTemplateId: waTemplate.id,
        whatsappTemplateName: waTemplate.name,
        language: waTemplate.language || existing.language,
        status,
      };

      // Also sync components if available
      if (waTemplate.components) {
        for (const component of waTemplate.components) {
          if (component.type === 'BODY' && component.text) {
            updateData.bodyText = component.text;
            updateData.content = component.text;
          } else if (component.type === 'FOOTER') {
            updateData.footerText = component.text || null;
          } else if (component.type === 'HEADER') {
            updateData.headerType = component.format || 'TEXT';
            if (component.text) updateData.headerContent = component.text;
          }
        }
      }

      await prisma.messageTemplate.update({
        where: { id: existing.id },
        data: updateData,
      });
      synced++;
      console.log(`Updated: ${waTemplate.name} (${status}, lang: ${waTemplate.language})`);
    } else {
      // Import new template from WhatsApp
      // Extract body text from components
      let bodyText = '';
      let footerText = '';
      let headerType = null;
      let headerContent = null;

      if (waTemplate.components) {
        for (const component of waTemplate.components) {
          if (component.type === 'BODY') {
            bodyText = component.text || '';
          } else if (component.type === 'FOOTER') {
            footerText = component.text || '';
          } else if (component.type === 'HEADER') {
            headerType = component.format || 'TEXT';
            headerContent = component.text || '';
          }
        }
      }

      // Create new template in our database
      await prisma.messageTemplate.create({
        data: {
          name: waTemplate.name,
          content: bodyText,
          language: waTemplate.language || 'en',
          category: waTemplate.category || 'MARKETING',
          bodyText: bodyText || waTemplate.name,
          footerText: footerText || null,
          headerType,
          headerContent,
          whatsappTemplateId: waTemplate.id,
          whatsappTemplateName: waTemplate.name,
          status,
        },
      });
      imported++;
      console.log(`Imported: ${waTemplate.name} (${status})`);
    }
  }

  res.json({
    success: true,
    message: `Synced ${synced} templates, imported ${imported} new templates from WhatsApp`,
    data: {
      synced,
      imported,
      total: whatsappTemplates.length,
    },
  });
});

// DELETE /api/templates/:id - Delete template
router.delete('/:id', authenticate, async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  const template = await prisma.messageTemplate.findUnique({
    where: { id: req.params.id },
    include: {
      _count: { select: { campaigns: true } },
    },
  });

  if (!template) {
    throw new AppError('Template not found', 404);
  }

  if (template._count.campaigns > 0) {
    throw new AppError('Cannot delete template that is used in campaigns', 400);
  }

  await prisma.messageTemplate.delete({
    where: { id: template.id },
  });

  res.json({ success: true, message: 'Template deleted' });
});

// GET /api/templates/examples - Get sample template examples
router.get('/examples/list', authenticate, async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  const examples = [
    {
      name: 'Product Introduction (Hindi)',
      language: 'hi',
      category: 'MARKETING',
      bodyText: `नमस्ते {{1}}! 🙏

शुद्धिका प्योर मस्टर्ड ऑयल - 100% शुद्ध सरसों का तेल

✅ कोल्ड प्रेस्ड
✅ कोई मिलावट नहीं
✅ थोक में उपलब्ध

अधिक जानकारी के लिए संपर्क करें: {{2}}`,
      footerText: 'शुद्धिका - शुद्धता की गारंटी',
    },
    {
      name: 'Product Introduction (English)',
      language: 'en',
      category: 'MARKETING',
      bodyText: `Hello {{1}}! 👋

Shuddhika Pure Mustard Oil - 100% Pure Sarson Ka Tel

✅ Cold Pressed
✅ No Adulteration
✅ Available in Bulk

Contact us for more info: {{2}}`,
      footerText: 'Shuddhika - Guaranteed Purity',
    },
    {
      name: 'Wholesale Inquiry (Hindi)',
      language: 'hi',
      category: 'MARKETING',
      bodyText: `प्रिय {{1}},

क्या आप अपने स्टोर के लिए शुद्ध सरसों का तेल खरीदना चाहते हैं?

शुद्धिका ऑयल - थोक मूल्य पर उपलब्ध:
• 15 लीटर टिन
• 5 लीटर पाउच
• 1 लीटर बोतल

विशेष छूट के लिए अभी संपर्क करें!`,
    },
  ];

  res.json({ success: true, data: examples });
});

export default router;
