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

  // Indian cities (all tiers)
  const cities = [
    'Delhi', 'Mumbai', 'Bangalore', 'Bengaluru', 'Chennai', 'Kolkata',
    'Hyderabad', 'Pune', 'Ahmedabad', 'Jaipur', 'Lucknow', 'Kanpur',
    'Nagpur', 'Indore', 'Thane', 'Bhopal', 'Visakhapatnam', 'Patna',
    'Vadodara', 'Ghaziabad', 'Ludhiana', 'Agra', 'Nashik', 'Faridabad',
    'Meerut', 'Rajkot', 'Varanasi', 'Srinagar', 'Aurangabad', 'Dhanbad',
    'Amritsar', 'Allahabad', 'Ranchi', 'Howrah', 'Coimbatore', 'Jabalpur',
    'Gwalior', 'Vijayawada', 'Jodhpur', 'Madurai', 'Raipur', 'Kota',
    'Chandigarh', 'Guwahati', 'Solapur', 'Noida', 'Gurugram', 'Gurgaon',
    'Dehradun', 'Mysore', 'Mysuru', 'Mangalore', 'Mangaluru',
    'Thiruvananthapuram', 'Trivandrum', 'Kochi', 'Cochin', 'Bhubaneswar',
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
  // Tier 1 — Metro cities
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
  // Tier 2 cities
  Kanpur: [
    'Civil Lines Kanpur', 'Swaroop Nagar Kanpur', 'Kidwai Nagar Kanpur',
    'Govind Nagar Kanpur', 'Kakadeo Kanpur', 'Kalyanpur Kanpur',
    'Shastri Nagar Kanpur', 'Panki Kanpur',
  ],
  Nagpur: [
    'Sitabuldi Nagpur', 'Dharampeth Nagpur', 'Sadar Nagpur', 'Manewada Nagpur',
    'Wardha Road Nagpur', 'Hingna Nagpur', 'Lakadganj Nagpur', 'Civil Lines Nagpur',
  ],
  Indore: [
    'Vijay Nagar Indore', 'Palasia Indore', 'Rajwada Indore', 'Bhawarkuan Indore',
    'Sapna Sangeeta Indore', 'MR 10 Indore', 'Scheme 78 Indore', 'Rau Indore',
  ],
  Bhopal: [
    'MP Nagar Bhopal', 'New Market Bhopal', 'Arera Colony Bhopal', 'Kolar Road Bhopal',
    'Hoshangabad Road Bhopal', 'Bairagarh Bhopal', 'Shahpura Bhopal', 'Habibganj Bhopal',
  ],
  Patna: [
    'Boring Road Patna', 'Kankarbagh Patna', 'Rajendra Nagar Patna', 'Bailey Road Patna',
    'Danapur Patna', 'Patna City', 'Phulwari Sharif Patna', 'Saguna More Patna',
  ],
  Vadodara: [
    'Alkapuri Vadodara', 'Fatehgunj Vadodara', 'Manjalpur Vadodara', 'Karelibaug Vadodara',
    'Gorwa Vadodara', 'Akota Vadodara', 'Waghodia Road Vadodara', 'Sayajigunj Vadodara',
  ],
  Ludhiana: [
    'Civil Lines Ludhiana', 'Model Town Ludhiana', 'Sarabha Nagar Ludhiana',
    'Dugri Ludhiana', 'Rajguru Nagar Ludhiana', 'BRS Nagar Ludhiana',
    'Pakhowal Road Ludhiana', 'Ferozepur Road Ludhiana',
  ],
  Agra: [
    'Sanjay Place Agra', 'Kamla Nagar Agra', 'Sikandra Agra', 'Dayal Bagh Agra',
    'Shahganj Agra', 'Tajganj Agra', 'Khandari Agra', 'Civil Lines Agra',
  ],
  Varanasi: [
    'Lanka Varanasi', 'Sigra Varanasi', 'Godowlia Varanasi', 'Cantt Varanasi',
    'BHU Varanasi', 'Pandeypur Varanasi', 'Sarnath Varanasi', 'Paharia Varanasi',
  ],
  Noida: [
    'Sector 18 Noida', 'Sector 62 Noida', 'Sector 15 Noida', 'Sector 44 Noida',
    'Greater Noida', 'Noida Extension', 'Sector 137 Noida', 'Sector 76 Noida',
  ],
  Gurugram: [
    'DLF Phase 1 Gurugram', 'Sohna Road Gurugram', 'Golf Course Road Gurugram',
    'MG Road Gurugram', 'Sector 29 Gurugram', 'Sector 14 Gurugram',
    'Palam Vihar Gurugram', 'Manesar Gurugram',
  ],
  Ghaziabad: [
    'Indirapuram Ghaziabad', 'Vaishali Ghaziabad', 'Vasundhara Ghaziabad',
    'Raj Nagar Ghaziabad', 'Kavi Nagar Ghaziabad', 'Crossing Republik Ghaziabad',
    'Loni Ghaziabad', 'Mohan Nagar Ghaziabad',
  ],
  Faridabad: [
    'Sector 15 Faridabad', 'NIT Faridabad', 'Ballabhgarh Faridabad',
    'Sector 21 Faridabad', 'Old Faridabad', 'Sector 37 Faridabad',
    'Surajkund Faridabad', 'Sector 86 Faridabad',
  ],
  Meerut: [
    'Sadar Bazaar Meerut', 'Pallavpuram Meerut', 'Shastri Nagar Meerut',
    'Begum Bridge Meerut', 'Ganga Nagar Meerut', 'Cantt Meerut',
    'Western Kutchery Meerut', 'Hapur Road Meerut',
  ],
  Chandigarh: [
    'Sector 17 Chandigarh', 'Sector 22 Chandigarh', 'Sector 35 Chandigarh',
    'Sector 43 Chandigarh', 'Panchkula', 'Mohali', 'Zirakpur',
    'Manimajra Chandigarh',
  ],
  Guwahati: [
    'Paltan Bazaar Guwahati', 'Ganeshguri Guwahati', 'Zoo Road Guwahati',
    'Maligaon Guwahati', 'Chandmari Guwahati', 'Beltola Guwahati',
    'GS Road Guwahati', 'Dispur Guwahati',
  ],
  Ranchi: [
    'Main Road Ranchi', 'Doranda Ranchi', 'Lalpur Ranchi', 'Harmu Ranchi',
    'Bariatu Ranchi', 'Kanke Road Ranchi', 'Namkum Ranchi', 'Ratu Road Ranchi',
  ],
  Coimbatore: [
    'RS Puram Coimbatore', 'Gandhipuram Coimbatore', 'Saibaba Colony Coimbatore',
    'Peelamedu Coimbatore', 'Singanallur Coimbatore', 'Ukkadam Coimbatore',
    'Town Hall Coimbatore', 'Ganapathy Coimbatore',
  ],
  Vijayawada: [
    'MG Road Vijayawada', 'Benz Circle Vijayawada', 'Labbipet Vijayawada',
    'Patamata Vijayawada', 'Moghalrajpuram Vijayawada', 'Auto Nagar Vijayawada',
    'Governorpet Vijayawada', 'Eluru Road Vijayawada',
  ],
  Madurai: [
    'Anna Nagar Madurai', 'KK Nagar Madurai', 'Goripalayam Madurai',
    'Periyar Bus Stand Madurai', 'Tallakulam Madurai', 'Mattuthavani Madurai',
    'Thirunagar Madurai', 'Vilangudi Madurai',
  ],
  Raipur: [
    'Pandri Raipur', 'Shankar Nagar Raipur', 'Telibandha Raipur',
    'Devendra Nagar Raipur', 'Tatibandh Raipur', 'Amanaka Raipur',
    'Station Road Raipur', 'Byron Bazar Raipur',
  ],
  Jodhpur: [
    'Paota Jodhpur', 'Sardarpura Jodhpur', 'Ratanada Jodhpur',
    'Shastri Nagar Jodhpur', 'Basni Jodhpur', 'Chopasni Road Jodhpur',
    'Station Road Jodhpur', 'Pal Road Jodhpur',
  ],
  Kota: [
    'Talwandi Kota', 'Kunhadi Kota', 'Vigyan Nagar Kota', 'Mahaveer Nagar Kota',
    'DCM Kota', 'Rangbari Road Kota', 'Nayapura Kota', 'Gumanpura Kota',
  ],
  Amritsar: [
    'Lawrence Road Amritsar', 'Hall Bazaar Amritsar', 'Ranjit Avenue Amritsar',
    'GT Road Amritsar', 'Mall Road Amritsar', 'White Avenue Amritsar',
    'Chheharta Amritsar', 'Majitha Road Amritsar',
  ],
  Allahabad: [
    'Civil Lines Allahabad', 'George Town Allahabad', 'Naini Allahabad',
    'Mumfordganj Allahabad', 'Katra Allahabad', 'Jhunsi Allahabad',
    'Phaphamau Allahabad', 'Tagore Town Allahabad',
  ],
  Jabalpur: [
    'Napier Town Jabalpur', 'Wright Town Jabalpur', 'Madan Mahal Jabalpur',
    'Adhartal Jabalpur', 'Vijay Nagar Jabalpur', 'Gorakhpur Jabalpur',
    'Civil Lines Jabalpur', 'Garha Jabalpur',
  ],
  Gwalior: [
    'City Center Gwalior', 'Lashkar Gwalior', 'Morar Gwalior', 'Thatipur Gwalior',
    'Maharajpura Gwalior', 'Kampoo Gwalior', 'Dabra Gwalior', 'Hazira Gwalior',
  ],
  Nashik: [
    'College Road Nashik', 'Gangapur Road Nashik', 'Panchavati Nashik',
    'Satpur Nashik', 'CIDCO Nashik', 'Dwarka Nashik',
    'Nashik Road', 'Deolali Nashik',
  ],
  Rajkot: [
    'Kalawad Road Rajkot', 'University Road Rajkot', 'Yagnik Road Rajkot',
    'Bhaktinagar Rajkot', 'Mavdi Rajkot', '150 Feet Ring Road Rajkot',
    'Amin Marg Rajkot', 'Kalavad Road Rajkot',
  ],
  Dhanbad: [
    'Bank More Dhanbad', 'Hirapur Dhanbad', 'Saraidhela Dhanbad',
    'Jharia Dhanbad', 'Katras Dhanbad', 'Govindpur Dhanbad',
    'Sindri Dhanbad', 'Bhuli Dhanbad',
  ],
  Aurangabad: [
    'Cidco Aurangabad', 'Jalna Road Aurangabad', 'Nirala Bazaar Aurangabad',
    'Osmanpura Aurangabad', 'Shahgunj Aurangabad', 'Cantonment Aurangabad',
    'Beed Bypass Aurangabad', 'Waluj Aurangabad',
  ],
  Srinagar: [
    'Lal Chowk Srinagar', 'Rajbagh Srinagar', 'Hyderpora Srinagar',
    'Bemina Srinagar', 'Nowgam Srinagar', 'Soura Srinagar',
    'Hazratbal Srinagar', 'Dalgate Srinagar',
  ],
  Dehradun: [
    'Rajpur Road Dehradun', 'Clock Tower Dehradun', 'ISBT Dehradun',
    'Ballupur Dehradun', 'Prem Nagar Dehradun', 'Sahastradhara Road Dehradun',
    'Race Course Dehradun', 'Rispana Dehradun',
  ],
  Mysore: [
    'Saraswathipuram Mysore', 'Vijayanagar Mysore', 'Kuvempunagar Mysore',
    'Jayalakshmipuram Mysore', 'Hebbal Mysore', 'Bogadi Mysore',
    'Nazarbad Mysore', 'Gokulam Mysore',
  ],
  Mangalore: [
    'Hampankatta Mangalore', 'Kankanady Mangalore', 'Bejai Mangalore',
    'Kadri Mangalore', 'Falnir Mangalore', 'Surathkal Mangalore',
    'Derebail Mangalore', 'Pumpwell Mangalore',
  ],
  Thiruvananthapuram: [
    'MG Road Thiruvananthapuram', 'Kowdiar Thiruvananthapuram', 'Kazhakootam Thiruvananthapuram',
    'Pattom Thiruvananthapuram', 'Vazhuthacaud Thiruvananthapuram',
    'Kesavadasapuram Thiruvananthapuram', 'Sreekaryam Thiruvananthapuram',
    'Thampanoor Thiruvananthapuram',
  ],
  Kochi: [
    'MG Road Kochi', 'Edappally Kochi', 'Kaloor Kochi', 'Palarivattom Kochi',
    'Kakkanad Kochi', 'Tripunithura Kochi', 'Aluva Kochi', 'Vytilla Kochi',
  ],
  Bhubaneswar: [
    'Saheed Nagar Bhubaneswar', 'Unit 1 Bhubaneswar', 'Patia Bhubaneswar',
    'Chandrasekharpur Bhubaneswar', 'Jaydev Vihar Bhubaneswar',
    'Nayapalli Bhubaneswar', 'Khandagiri Bhubaneswar', 'Rasulgarh Bhubaneswar',
  ],
  Visakhapatnam: [
    'Dwaraka Nagar Visakhapatnam', 'MVP Colony Visakhapatnam', 'Gajuwaka Visakhapatnam',
    'Seethammadhara Visakhapatnam', 'Madhurawada Visakhapatnam',
    'Pendurthi Visakhapatnam', 'NAD Junction Visakhapatnam', 'Beach Road Visakhapatnam',
  ],
};

/**
 * Generate fallback area search queries for cities without predefined neighborhoods.
 * Uses compass directions and common area patterns that work with Google Places.
 */
function generateFallbackAreas(city: string): string[] {
  return [
    `North ${city}`, `South ${city}`, `East ${city}`, `West ${city}`,
    `Central ${city}`, `${city} Main Market`, `${city} Old City`,
    `${city} Railway Station area`, `${city} Bus Stand area`,
    `${city} Industrial Area`,
  ];
}

/**
 * Deep search: Search across multiple neighborhoods in a city.
 * Gets significantly more leads by covering different areas.
 * Works for ALL cities — uses predefined neighborhoods for known cities,
 * and auto-generated compass-direction areas for others.
 */
export async function scrapeGoogleMapsDeep(
  query: string,
  city: string
): Promise<SearchResult> {
  const areas = CITY_AREAS[city] || generateFallbackAreas(city);

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
 * Get list of Indian cities for targeting (all tiers)
 */
export function getIndianCities(): string[] {
  return [
    // Tier 1
    'Delhi', 'Mumbai', 'Bangalore', 'Chennai', 'Kolkata',
    'Hyderabad', 'Pune', 'Ahmedabad', 'Jaipur', 'Lucknow',
    // Tier 2
    'Kanpur', 'Nagpur', 'Indore', 'Bhopal', 'Patna',
    'Vadodara', 'Ludhiana', 'Agra', 'Varanasi', 'Chandigarh',
    'Noida', 'Gurugram', 'Faridabad', 'Ghaziabad', 'Meerut',
    // Tier 2-3
    'Ranchi', 'Guwahati', 'Coimbatore', 'Vijayawada', 'Madurai',
    'Raipur', 'Jodhpur', 'Kota', 'Amritsar', 'Allahabad',
    'Jabalpur', 'Gwalior', 'Nashik', 'Rajkot', 'Dhanbad',
    'Aurangabad', 'Srinagar', 'Dehradun', 'Mysore', 'Mangalore',
    'Thiruvananthapuram', 'Kochi', 'Bhubaneswar', 'Visakhapatnam',
  ];
}
