import axios from 'axios';
import { env } from '../../config/env.js';
import { prisma } from '../../config/database.js';

// New Places API base URL
const PLACES_API_URL = 'https://places.googleapis.com/v1';

// New API response interfaces
interface NewPlaceResult {
  id: string;
  displayName?: { text: string };
  formattedAddress?: string;
  nationalPhoneNumber?: string;
  internationalPhoneNumber?: string;
  types?: string[];
  rating?: number;
  userRatingCount?: number;
  businessStatus?: string;
}

interface SearchResult {
  leadsFound: number;
  leadsAdded: number;
  duplicates: number;
  errors: string[];
}

// FieldMask that includes phone numbers directly in search results
// This avoids needing a separate Place Details call for each result
const SEARCH_FIELD_MASK = [
  'places.id',
  'places.displayName',
  'places.formattedAddress',
  'places.nationalPhoneNumber',
  'places.internationalPhoneNumber',
  'places.types',
  'places.rating',
  'places.userRatingCount',
  'places.businessStatus',
].join(',');

/**
 * Search for businesses using Google Places Text Search API with pagination.
 * Returns up to 60 results (3 pages of 20).
 */
export async function searchPlaces(
  query: string,
  location?: string
): Promise<NewPlaceResult[]> {
  if (!env.GOOGLE_MAPS_API_KEY) {
    throw new Error('Google Maps API key not configured');
  }

  const searchQuery = location ? `${query} in ${location}` : query;
  console.log(`Searching Places API: ${searchQuery}`);

  const allPlaces: NewPlaceResult[] = [];
  let pageToken: string | undefined;
  let page = 0;
  const MAX_PAGES = 3;

  while (page < MAX_PAGES) {
    try {
      const body: any = {
        textQuery: searchQuery,
        languageCode: 'en',
        maxResultCount: 20,
      };
      if (pageToken) {
        body.pageToken = pageToken;
      }

      const response = await axios.post(
        `${PLACES_API_URL}/places:searchText`,
        body,
        {
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': env.GOOGLE_MAPS_API_KEY,
            'X-Goog-FieldMask': SEARCH_FIELD_MASK,
          },
        }
      );

      const places = response.data.places || [];
      allPlaces.push(...places);
      console.log(`Page ${page + 1}: found ${places.length} places`);

      // Check for next page
      if (response.data.nextPageToken && places.length === 20) {
        pageToken = response.data.nextPageToken;
        page++;
        // Small delay between pagination requests
        await new Promise((resolve) => setTimeout(resolve, 500));
      } else {
        break;
      }
    } catch (error: any) {
      console.error('Places API Error:', error.response?.data || error.message);
      if (error.response?.data?.error) {
        throw new Error(`Google API Error: ${error.response.data.error.message}`);
      }
      throw error;
    }
  }

  console.log(`Total: ${allPlaces.length} places from ${page + 1} page(s)`);
  return allPlaces;
}

/**
 * Normalize phone number to Indian format
 */
function normalizePhone(phone: string): string | null {
  if (!phone) return null;

  // Remove all non-digit characters
  let digits = phone.replace(/\D/g, '');

  // Handle Indian numbers
  if (digits.startsWith('91') && digits.length === 12) {
    return digits; // Already in correct format
  }
  if (digits.startsWith('0') && digits.length === 11) {
    return '91' + digits.substring(1);
  }
  if (digits.length === 10) {
    return '91' + digits;
  }

  // Return null if not a valid Indian number
  if (digits.length < 10) return null;

  return digits;
}

/**
 * Extract business type from Google Places types
 */
function extractBusinessType(types?: string[]): string {
  if (!types || types.length === 0) return 'Other';

  const typeMap: Record<string, string> = {
    grocery_store: 'Grocery',
    supermarket: 'Grocery',
    convenience_store: 'Grocery',
    store: 'Retail',
    shopping_mall: 'Retail',
    department_store: 'Retail',
    restaurant: 'Restaurant',
    food: 'Food & Beverage',
    cafe: 'Cafe',
    bakery: 'Bakery',
    meal_takeaway: 'Restaurant',
    meal_delivery: 'Restaurant',
    lodging: 'Hotel',
    hotel: 'Hotel',
  };

  for (const type of types) {
    if (typeMap[type]) {
      return typeMap[type];
    }
  }

  return types[0]?.replace(/_/g, ' ') || 'Other';
}

/**
 * Extract city from address
 */
function extractCity(address?: string): string | null {
  if (!address) return null;

  // Common Indian cities
  const cities = [
    'Delhi', 'Mumbai', 'Bangalore', 'Bengaluru', 'Chennai', 'Kolkata',
    'Hyderabad', 'Pune', 'Ahmedabad', 'Jaipur', 'Lucknow', 'Kanpur',
    'Nagpur', 'Indore', 'Thane', 'Bhopal', 'Visakhapatnam', 'Patna',
    'Vadodara', 'Ghaziabad', 'Ludhiana', 'Agra', 'Nashik', 'Faridabad',
    'Meerut', 'Rajkot', 'Varanasi', 'Srinagar', 'Aurangabad', 'Dhanbad',
    'Amritsar', 'Allahabad', 'Ranchi', 'Howrah', 'Coimbatore', 'Jabalpur',
    'Gwalior', 'Vijayawada', 'Jodhpur', 'Madurai', 'Raipur', 'Kota',
    'Chandigarh', 'Guwahati', 'Solapur', 'Noida', 'Gurugram', 'Gurgaon',
  ];

  for (const city of cities) {
    if (address.toLowerCase().includes(city.toLowerCase())) {
      return city;
    }
  }

  // Try to extract from address parts
  const parts = address.split(',');
  if (parts.length >= 2) {
    return parts[parts.length - 3]?.trim() || null;
  }

  return null;
}

/**
 * Process search results and save new leads to the database.
 * Returns counts of found, added, and duplicate leads.
 */
async function processPlaces(
  places: NewPlaceResult[],
  fallbackCity: string,
  result: SearchResult
): Promise<void> {
  for (const place of places) {
    try {
      const phone = normalizePhone(
        place.internationalPhoneNumber || place.nationalPhoneNumber || ''
      );

      const businessName = place.displayName?.text || 'Unknown';

      if (!phone) {
        continue;
      }

      // Check for duplicate
      const existing = await prisma.lead.findUnique({
        where: { phone },
      });

      if (existing) {
        result.duplicates++;
        continue;
      }

      // Create lead
      await prisma.lead.create({
        data: {
          name: businessName,
          phone,
          businessName: businessName,
          businessType: extractBusinessType(place.types),
          address: place.formattedAddress,
          city: extractCity(place.formattedAddress) || fallbackCity,
          source: 'GOOGLE_MAPS',
          status: 'NEW',
          notes: place.rating
            ? `Rating: ${place.rating}/5 (${place.userRatingCount || 0} reviews)`
            : undefined,
        },
      });

      result.leadsAdded++;
    } catch (error: any) {
      const name = place.displayName?.text || place.id;
      result.errors.push(`${name}: ${error.message}`);
    }
  }
}

/**
 * Main function: Search and save leads from Google Maps (single search with pagination)
 */
export async function scrapeGoogleMaps(
  query: string,
  location: string
): Promise<SearchResult> {
  const result: SearchResult = {
    leadsFound: 0,
    leadsAdded: 0,
    duplicates: 0,
    errors: [],
  };

  // Create scraper job record
  const job = await prisma.scraperJob.create({
    data: {
      source: 'GOOGLE_MAPS',
      query: `${query} in ${location}`,
      status: 'RUNNING',
      startedAt: new Date(),
    },
  });

  try {
    const places = await searchPlaces(query, location);
    result.leadsFound = places.length;
    console.log(`Found ${places.length} places (with pagination)`);

    await processPlaces(places, location, result);

    // Update job status
    await prisma.scraperJob.update({
      where: { id: job.id },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
        leadsFound: result.leadsFound,
        leadsAdded: result.leadsAdded,
        duplicates: result.duplicates,
      },
    });
  } catch (error: any) {
    console.error('Scraper error:', error.message);
    await prisma.scraperJob.update({
      where: { id: job.id },
      data: {
        status: 'FAILED',
        completedAt: new Date(),
        errorMessage: error.message,
      },
    });
    throw error;
  }

  return result;
}

/**
 * Neighborhoods / areas for major Indian cities
 */
const CITY_AREAS: Record<string, string[]> = {
  Delhi: [
    'North Delhi', 'South Delhi', 'East Delhi', 'West Delhi', 'Central Delhi',
    'Dwarka Delhi', 'Rohini Delhi', 'Karol Bagh Delhi', 'Lajpat Nagar Delhi',
    'Chandni Chowk Delhi', 'Rajouri Garden Delhi', 'Pitampura Delhi',
    'Janakpuri Delhi', 'Saket Delhi', 'Nehru Place Delhi',
  ],
  Mumbai: [
    'Andheri Mumbai', 'Bandra Mumbai', 'Borivali Mumbai', 'Dadar Mumbai',
    'Goregaon Mumbai', 'Malad Mumbai', 'Thane Mumbai', 'Vashi Navi Mumbai',
    'Powai Mumbai', 'Juhu Mumbai', 'Kurla Mumbai', 'Chembur Mumbai',
  ],
  Bangalore: [
    'Koramangala Bangalore', 'Whitefield Bangalore', 'Indiranagar Bangalore',
    'Jayanagar Bangalore', 'JP Nagar Bangalore', 'Marathahalli Bangalore',
    'HSR Layout Bangalore', 'Electronic City Bangalore', 'Rajajinagar Bangalore',
    'Malleshwaram Bangalore', 'BTM Layout Bangalore', 'Hebbal Bangalore',
  ],
  Chennai: [
    'T Nagar Chennai', 'Anna Nagar Chennai', 'Adyar Chennai', 'Velachery Chennai',
    'Tambaram Chennai', 'Porur Chennai', 'Mylapore Chennai', 'Vadapalani Chennai',
    'Chromepet Chennai', 'Guindy Chennai',
  ],
  Kolkata: [
    'Salt Lake Kolkata', 'Park Street Kolkata', 'Howrah Kolkata', 'Gariahat Kolkata',
    'New Town Kolkata', 'Behala Kolkata', 'Dumdum Kolkata', 'Ballygunge Kolkata',
    'Jadavpur Kolkata', 'Barasat Kolkata',
  ],
  Hyderabad: [
    'Ameerpet Hyderabad', 'Kukatpally Hyderabad', 'Madhapur Hyderabad',
    'Secunderabad Hyderabad', 'Dilsukhnagar Hyderabad', 'LB Nagar Hyderabad',
    'Begumpet Hyderabad', 'Mehdipatnam Hyderabad', 'ECIL Hyderabad',
    'Miyapur Hyderabad',
  ],
  Pune: [
    'Kothrud Pune', 'Hinjewadi Pune', 'Wakad Pune', 'Hadapsar Pune',
    'Shivaji Nagar Pune', 'Pimpri-Chinchwad Pune', 'Viman Nagar Pune',
    'Baner Pune', 'Kharadi Pune', 'Aundh Pune',
  ],
  Ahmedabad: [
    'Navrangpura Ahmedabad', 'Satellite Ahmedabad', 'Maninagar Ahmedabad',
    'CG Road Ahmedabad', 'Bopal Ahmedabad', 'Prahlad Nagar Ahmedabad',
    'Vastrapur Ahmedabad', 'Naranpura Ahmedabad',
  ],
  Jaipur: [
    'Malviya Nagar Jaipur', 'Vaishali Nagar Jaipur', 'Mansarovar Jaipur',
    'Raja Park Jaipur', 'Tonk Road Jaipur', 'C Scheme Jaipur',
    'Sodala Jaipur', 'Jagatpura Jaipur',
  ],
  Lucknow: [
    'Hazratganj Lucknow', 'Gomti Nagar Lucknow', 'Aliganj Lucknow',
    'Indira Nagar Lucknow', 'Aminabad Lucknow', 'Alambagh Lucknow',
    'Mahanagar Lucknow', 'Chowk Lucknow',
  ],
};

/**
 * Deep search: Search across multiple neighborhoods in a city.
 * Gets significantly more leads by covering different areas.
 */
export async function scrapeGoogleMapsDeep(
  query: string,
  city: string
): Promise<SearchResult> {
  const areas = CITY_AREAS[city];

  // If no neighborhood data, fall back to single search
  if (!areas || areas.length === 0) {
    return scrapeGoogleMaps(query, city);
  }

  const result: SearchResult = {
    leadsFound: 0,
    leadsAdded: 0,
    duplicates: 0,
    errors: [],
  };

  // Create scraper job record
  const job = await prisma.scraperJob.create({
    data: {
      source: 'GOOGLE_MAPS',
      query: `[Deep] ${query} in ${city} (${areas.length} areas)`,
      status: 'RUNNING',
      startedAt: new Date(),
    },
  });

  try {
    for (let i = 0; i < areas.length; i++) {
      const area = areas[i];
      console.log(`[Deep Search ${i + 1}/${areas.length}] Searching: ${query} in ${area}`);

      try {
        const places = await searchPlaces(query, area);
        result.leadsFound += places.length;

        await processPlaces(places, city, result);

        // Update job with progress
        await prisma.scraperJob.update({
          where: { id: job.id },
          data: {
            leadsFound: result.leadsFound,
            leadsAdded: result.leadsAdded,
            duplicates: result.duplicates,
          },
        });
      } catch (error: any) {
        console.error(`[Deep Search] Error for area ${area}:`, error.message);
        result.errors.push(`${area}: ${error.message}`);
      }

      // Delay between area searches to respect rate limits
      if (i < areas.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    // Mark job as completed
    await prisma.scraperJob.update({
      where: { id: job.id },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
        leadsFound: result.leadsFound,
        leadsAdded: result.leadsAdded,
        duplicates: result.duplicates,
      },
    });
  } catch (error: any) {
    console.error('Deep scraper error:', error.message);
    await prisma.scraperJob.update({
      where: { id: job.id },
      data: {
        status: 'FAILED',
        completedAt: new Date(),
        errorMessage: error.message,
      },
    });
    throw error;
  }

  console.log(`[Deep Search] Done — Found: ${result.leadsFound}, Added: ${result.leadsAdded}, Duplicates: ${result.duplicates}`);
  return result;
}

/**
 * Get available areas for a city (for frontend display)
 */
export function getCityAreas(city: string): string[] {
  return CITY_AREAS[city] || [];
}

/**
 * Get cities that have deep search area data
 */
export function getDeepSearchCities(): string[] {
  return Object.keys(CITY_AREAS);
}

/**
 * Get list of suggested business types for mustard oil sales
 */
export function getSuggestedSearches(): Array<{ query: string; description: string }> {
  return [
    { query: 'grocery stores', description: 'Local grocery and kirana stores' },
    { query: 'supermarket', description: 'Supermarkets and hypermarkets' },
    { query: 'wholesale grocery', description: 'Wholesale grocery distributors' },
    { query: 'oil merchants', description: 'Edible oil dealers and distributors' },
    { query: 'provision stores', description: 'Provision and general stores' },
    { query: 'restaurants', description: 'Restaurants and hotels (bulk buyers)' },
    { query: 'sweet shops', description: 'Sweet shops and halwai' },
    { query: 'pickle manufacturers', description: 'Pickle and food processors' },
    { query: 'catering services', description: 'Catering and food services' },
    { query: 'dhaba', description: 'Highway dhabas and eateries' },
  ];
}

/**
 * Get list of major Indian cities for targeting
 */
export function getIndianCities(): string[] {
  return [
    'Delhi', 'Mumbai', 'Bangalore', 'Chennai', 'Kolkata',
    'Hyderabad', 'Pune', 'Ahmedabad', 'Jaipur', 'Lucknow',
    'Kanpur', 'Nagpur', 'Indore', 'Bhopal', 'Patna',
    'Vadodara', 'Ludhiana', 'Agra', 'Varanasi', 'Chandigarh',
    'Noida', 'Gurugram', 'Faridabad', 'Ghaziabad', 'Meerut',
  ];
}
