import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Search, MapPin, Download, AlertCircle, CheckCircle, Clock } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../services/api';

interface ScraperStatus {
  googleMaps: {
    configured: boolean;
    message: string;
  };
}

interface Suggestions {
  searches: Array<{ query: string; description: string }>;
  cities: string[];
}

interface ScraperJob {
  id: string;
  source: string;
  query: string;
  status: string;
  leadsFound: number;
  leadsAdded: number;
  duplicates: number;
  errorMessage?: string;
  createdAt: string;
}

interface ScrapeResult {
  leadsFound: number;
  leadsAdded: number;
  duplicates: number;
  errors: string[];
}

export default function Scraper() {
  const queryClient = useQueryClient();
  const [query, setQuery] = useState('grocery stores');
  const [location, setLocation] = useState('Delhi');

  // Check scraper status
  const { data: statusData } = useQuery({
    queryKey: ['scraper-status'],
    queryFn: async () => {
      const { data } = await api.get<{ data: ScraperStatus }>('/scraper/status');
      return data.data;
    },
  });

  // Get suggestions
  const { data: suggestions } = useQuery({
    queryKey: ['scraper-suggestions'],
    queryFn: async () => {
      const { data } = await api.get<{ data: Suggestions }>('/scraper/suggestions');
      return data.data;
    },
  });

  // Get job history
  const { data: jobsData } = useQuery({
    queryKey: ['scraper-jobs'],
    queryFn: async () => {
      const { data } = await api.get<{ data: ScraperJob[] }>('/scraper/jobs');
      return data.data;
    },
  });

  // Scrape mutation
  const scrapeMutation = useMutation({
    mutationFn: async () => {
      const { data } = await api.post<{ data: ScrapeResult; message: string }>(
        '/scraper/google-maps',
        { query, location }
      );
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['scraper-jobs'] });
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      toast.success(data.message || 'Scraping completed');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Scraping failed');
    },
  });

  const isConfigured = statusData?.googleMaps?.configured;
  const jobs = jobsData || [];

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Lead Scraper</h1>
        <p className="text-gray-500 mt-1">
          Find potential customers from Google Maps
        </p>
      </div>

      {/* Status Card */}
      {!isConfigured && (
        <div className="card p-4 mb-6 bg-yellow-50 border-yellow-200">
          <div className="flex gap-3">
            <AlertCircle className="text-yellow-600 flex-shrink-0" size={20} />
            <div>
              <p className="font-medium text-yellow-800">API Key Required</p>
              <p className="text-sm text-yellow-700 mt-1">
                Add your Google Maps API key to <code className="bg-yellow-100 px-1 rounded">.env</code>:
                <br />
                <code className="text-xs">GOOGLE_MAPS_API_KEY="your-key-here"</code>
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Search Form */}
      <div className="card p-6 mb-6">
        <h2 className="text-lg font-semibold mb-4">Search for Businesses</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Business Type
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
              <input
                type="text"
                className="input pl-10"
                placeholder="e.g., grocery stores, restaurants"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            {suggestions?.searches && (
              <div className="flex flex-wrap gap-1 mt-2">
                {suggestions.searches.slice(0, 5).map((s) => (
                  <button
                    key={s.query}
                    type="button"
                    onClick={() => setQuery(s.query)}
                    className="text-xs px-2 py-1 bg-gray-100 hover:bg-gray-200 rounded-full"
                    title={s.description}
                  >
                    {s.query}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Location / City
            </label>
            <div className="relative">
              <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
              <input
                type="text"
                className="input pl-10"
                placeholder="e.g., Delhi, Mumbai"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
              />
            </div>
            {suggestions?.cities && (
              <div className="flex flex-wrap gap-1 mt-2">
                {suggestions.cities.slice(0, 8).map((city) => (
                  <button
                    key={city}
                    type="button"
                    onClick={() => setLocation(city)}
                    className="text-xs px-2 py-1 bg-gray-100 hover:bg-gray-200 rounded-full"
                  >
                    {city}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <button
          onClick={() => scrapeMutation.mutate()}
          disabled={!isConfigured || scrapeMutation.isPending || !query || !location}
          className="btn btn-primary flex items-center gap-2"
        >
          {scrapeMutation.isPending ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
              Searching...
            </>
          ) : (
            <>
              <Download size={18} />
              Find Leads
            </>
          )}
        </button>

        {scrapeMutation.isPending && (
          <p className="text-sm text-gray-500 mt-2">
            This may take 1-2 minutes. Fetching business details from Google Maps...
          </p>
        )}
      </div>

      {/* Results Summary */}
      {scrapeMutation.data && (
        <div className="card p-4 mb-6 bg-green-50 border-green-200">
          <div className="flex gap-3">
            <CheckCircle className="text-green-600 flex-shrink-0" size={20} />
            <div>
              <p className="font-medium text-green-800">Scraping Complete</p>
              <div className="flex gap-4 mt-2 text-sm text-green-700">
                <span>Found: {scrapeMutation.data.data.leadsFound}</span>
                <span>Added: {scrapeMutation.data.data.leadsAdded}</span>
                <span>Duplicates: {scrapeMutation.data.data.duplicates}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Job History */}
      <div className="card p-6">
        <h2 className="text-lg font-semibold mb-4">Recent Scraping Jobs</h2>

        {jobs.length === 0 ? (
          <p className="text-gray-500 text-center py-4">No scraping jobs yet</p>
        ) : (
          <div className="space-y-3">
            {jobs.map((job) => (
              <div
                key={job.id}
                className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
              >
                <div>
                  <p className="font-medium text-gray-900">{job.query}</p>
                  <p className="text-sm text-gray-500">
                    {new Date(job.createdAt).toLocaleString()}
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right text-sm">
                    <p className="text-gray-600">
                      {job.leadsAdded} added / {job.leadsFound} found
                    </p>
                    {job.duplicates > 0 && (
                      <p className="text-gray-400">{job.duplicates} duplicates</p>
                    )}
                  </div>
                  <JobStatusBadge status={job.status} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Tips */}
      <div className="card p-6 mt-6 bg-blue-50 border-blue-200">
        <h3 className="font-medium text-blue-800 mb-2">Tips for Better Results</h3>
        <ul className="text-sm text-blue-700 space-y-1">
          <li>• Be specific: "wholesale grocery" works better than just "grocery"</li>
          <li>• Try different cities to build a diverse lead list</li>
          <li>• Best targets for mustard oil: grocery stores, restaurants, sweet shops, dhabas</li>
          <li>• Each search returns up to 60 businesses with verified phone numbers</li>
        </ul>
      </div>
    </div>
  );
}

function JobStatusBadge({ status }: { status: string }) {
  const config: Record<string, { color: string; icon: React.ReactNode }> = {
    COMPLETED: { color: 'bg-green-100 text-green-800', icon: <CheckCircle size={14} /> },
    RUNNING: { color: 'bg-blue-100 text-blue-800', icon: <Clock size={14} /> },
    FAILED: { color: 'bg-red-100 text-red-800', icon: <AlertCircle size={14} /> },
    PENDING: { color: 'bg-gray-100 text-gray-800', icon: <Clock size={14} /> },
  };

  const { color, icon } = config[status] || config.PENDING;

  return (
    <span className={`badge ${color} flex items-center gap-1`}>
      {icon}
      {status}
    </span>
  );
}
