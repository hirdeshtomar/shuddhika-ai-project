import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Leads from './pages/Leads';
import Campaigns from './pages/Campaigns';
import Templates from './pages/Templates';
import Scraper from './pages/Scraper';
import CampaignDetail from './pages/CampaignDetail';
import Conversations from './pages/Conversations';
import AutoReplies from './pages/AutoReplies';
// ============================================================
// AUTH DISABLED (temporary): login is bypassed. To restore:
// re-add PrivateRoute around <Layout /> and the /login route
// (git history has the original), and set AUTH_DISABLED = false
// in backend/src/middleware/auth.ts.
// ============================================================

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30000,
      retry: 1,
    },
  },
});

function AppRoutes() {
  return (
    <Routes>
      {/* Login removed — send any old /login links home */}
      <Route path="/login" element={<Navigate to="/" replace />} />
      <Route path="/" element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="leads" element={<Leads />} />
        <Route path="campaigns" element={<Campaigns />} />
        <Route path="campaigns/:id" element={<CampaignDetail />} />
        <Route path="conversations" element={<Conversations />} />
        <Route path="templates" element={<Templates />} />
        <Route path="auto-replies" element={<AutoReplies />} />
        <Route path="scraper" element={<Scraper />} />
      </Route>
    </Routes>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AppRoutes />
        <Toaster position="top-right" />
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;
