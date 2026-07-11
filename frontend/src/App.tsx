import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Leads from './pages/Leads';
import Scraper from './pages/Scraper';
import Automation from './pages/Automation';
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
        <Route path="scraper" element={<Scraper />} />
        <Route path="automation" element={<Automation />} />
        {/* Retired (moved to AiSensy): campaigns, conversations, templates, auto-replies */}
        <Route path="*" element={<Navigate to="/" replace />} />
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
