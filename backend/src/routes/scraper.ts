import { Router, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../config/database.js';
import { env } from '../config/env.js';
import { authenticate } from '../middleware/auth.js';
import { AppError } from '../middleware/errorHandler.js';
import { AuthenticatedRequest, ApiResponse } from '../types/index.js';
import {
  scrapeGoogleMaps,
  getSuggestedSearches,
  getIndianCities,
} from '../services/scrapers/googleMaps.js';

const router = Router();

// Validation schema
const scrapeSchema = z.object({
  query: z.string().min(2, 'Search query is required'),
  location: z.string().min(2, 'Location is required'),
});

// GET /api/scraper/status - Check if scraper is configured
router.get('/status', authenticate, async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  const isConfigured = !!env.GOOGLE_MAPS_API_KEY;

  res.json({
    success: true,
    data: {
      googleMaps: {
        configured: isConfigured,
        message: isConfigured
          ? 'Google Maps API is configured and ready'
          : 'Google Maps API key not configured. Add GOOGLE_MAPS_API_KEY to .env',
      },
    },
  });
});

// GET /api/scraper/test - Test NEW Google Places API directly
router.get('/test', authenticate, async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  if (!env.GOOGLE_MAPS_API_KEY) {
    throw new AppError('Google Maps API key not configured', 400);
  }

  const axios = (await import('axios')).default;
  const testQuery = 'grocery stores in Delhi';

  try {
    // Using NEW Places API (v1)
    const response = await axios.post(
      'https://places.googleapis.com/v1/places:searchText',
      {
        textQuery: testQuery,
        languageCode: 'en',
        maxResultCount: 5,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': env.GOOGLE_MAPS_API_KEY,
          'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.types',
        },
      }
    );

    const places = response.data.places || [];

    res.json({
      success: true,
      data: {
        api_version: 'NEW Places API (v1)',
        results_count: places.length,
        first_result: places[0] || null,
      },
    });
  } catch (error: any) {
    res.json({
      success: false,
      error: error.message,
      data: error.response?.data || null,
    });
  }
});

// GET /api/scraper/suggestions - Get suggested searches
router.get('/suggestions', authenticate, async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  res.json({
    success: true,
    data: {
      searches: getSuggestedSearches(),
      cities: getIndianCities(),
    },
  });
});

// POST /api/scraper/google-maps - Start a Google Maps scrape
router.post('/google-maps', authenticate, async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  if (!env.GOOGLE_MAPS_API_KEY) {
    throw new AppError('Google Maps API key not configured', 400);
  }

  const { query, location } = scrapeSchema.parse(req.body);

  // Run scraper
  const result = await scrapeGoogleMaps(query, location);

  res.json({
    success: true,
    data: result,
    message: `Found ${result.leadsFound} businesses. Added ${result.leadsAdded} new leads. ${result.duplicates} duplicates skipped.`,
  });
});

// GET /api/scraper/jobs - Get scraper job history
router.get('/jobs', authenticate, async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string) || 10));
  const skip = (page - 1) * limit;

  const [jobs, total] = await Promise.all([
    prisma.scraperJob.findMany({
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.scraperJob.count(),
  ]);

  res.json({
    success: true,
    data: jobs,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
});

// GET /api/scraper/jobs/:id - Get single job details
router.get('/jobs/:id', authenticate, async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  const job = await prisma.scraperJob.findUnique({
    where: { id: req.params.id },
  });

  if (!job) {
    throw new AppError('Job not found', 404);
  }

  res.json({ success: true, data: job });
});

export default router;
