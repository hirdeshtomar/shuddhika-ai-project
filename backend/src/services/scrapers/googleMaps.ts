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

/**
 * Search for businesses using NEW Google Places Text Search API
 */
export async function searchPlaces(
  query: string,
  location?: string
): Promise<NewPlaceResult[]> {
  if (!env.GOOGLE_MAPS_API_KEY) {
    throw new Error('Google Maps API key not configured');
  }

  const searchQuery = location ? `${query} in ${location}` : query;
  console.log(`Calling NEW Places API: ${searchQuery}`);

  try {
    const response = await axios.post(
      `${PLACES_API_URL}/places:searchText`,
      {
        textQuery: searchQuery,
        languageCode: 'en',
        maxResultCount: 20,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': env.GOOGLE_MAPS_API_KEY,
          'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.types,places.rating,places.userRatingCount,places.businessStatus',
        },
      }
    );

    const places = response.data.places || [];
    console.log(`Found ${places.length} places from search`);
    return places;
  } catch (error: any) {
    console.error('Places API Error:', error.response?.data || error.message);
    if (error.response?.data?.error) {
      throw new Error(`Google API Error: ${error.response.data.error.message}`);
    }
    throw error;
  }
}

/**
 * Get detailed information about a place (includes phone number)
 * Using NEW Places API
 */
export async function getPlaceDetails(placeId: string): Promise<NewPlaceResult | null> {
  if (!env.GOOGLE_MAPS_API_KEY) {
    throw new Error('Google Maps API key not configured');
  }

  try {
    const response = await axios.get(
      `${PLACES_API_URL}/places/${placeId}`,
      {
        headers: {
          'X-Goog-Api-Key': env.GOOGLE_MAPS_API_KEY,
          'X-Goog-FieldMask': 'id,displayName,formattedAddress,nationalPhoneNumber,internationalPhoneNumber,types,rating,userRatingCount,businessStatus',
        },
      }
    );

    return response.data;
  } catch (error: any) {
    console.error('Place Details API error:', error.response?.data || error.message);
    return null;
  }
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
 * Main function: Search and save leads from Google Maps
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
    // Search for places
    console.log(`Searching: ${query} in ${location}`);
    const places = await searchPlaces(query, location);
    result.leadsFound = places.length;
    console.log(`Found ${places.length} places`);

    // Get details for each place (with rate limiting)
    for (const place of places) {
      try {
        // Rate limit: 1 request per 200ms
        await new Promise((resolve) => setTimeout(resolve, 200));

        const details = await getPlaceDetails(place.id);
        if (!details) continue;

        // Get phone number from details
        const phone = normalizePhone(
          details.internationalPhoneNumber || details.nationalPhoneNumber || ''
        );

        const businessName = details.displayName?.text || place.displayName?.text || 'Unknown';

        if (!phone) {
          console.log(`Skipping ${businessName} - no phone number`);
          continue;
        }

        // Check for duplicate
        const existing = await prisma.lead.findUnique({
          where: { phone },
        });

        if (existing) {
          result.duplicates++;
          console.log(`Duplicate: ${businessName} - ${phone}`);
          continue;
        }

        // Create lead
        await prisma.lead.create({
          data: {
            name: businessName,
            phone,
            businessName: businessName,
            businessType: extractBusinessType(details.types),
            address: details.formattedAddress,
            city: extractCity(details.formattedAddress) || location,
            source: 'GOOGLE_MAPS',
            status: 'NEW',
            notes: details.rating
              ? `Rating: ${details.rating}/5 (${details.userRatingCount || 0} reviews)`
              : undefined,
          },
        });

        result.leadsAdded++;
        console.log(`Added: ${businessName} - ${phone}`);
      } catch (error: any) {
        const name = place.displayName?.text || place.id;
        result.errors.push(`${name}: ${error.message}`);
        console.error(`Error processing ${name}:`, error.message);
      }
    }

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
    // Update job with error
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
