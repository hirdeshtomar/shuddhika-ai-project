import { Outlet, NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  Megaphone,
  FileText,
  Search,
  MessageSquare,
  LogOut,
  Menu,
  X,
  Bell,
  BellOff,
} from 'lucide-react';
import { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { pushApi } from '../services/api';

const navigation = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'Find Leads', href: '/scraper', icon: Search },
  { name: 'Leads', href: '/leads', icon: Users },
  { name: 'Campaigns', href: '/campaigns', icon: Megaphone },
  { name: 'Conversations', href: '/conversations', icon: MessageSquare },
  { name: 'Templates', href: '/templates', icon: FileText },
];

function useNotifications() {
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Check if already subscribed
    if ('serviceWorker' in navigator && 'PushManager' in window) {
      navigator.serviceWorker.ready.then((reg) => {
        reg.pushManager.getSubscription().then((sub) => {
          setEnabled(!!sub);
        });
      });
    }
  }, []);

  const toggle = async () => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      alert('Push notifications are not supported in this browser.');
      return;
    }

    setLoading(true);
    try {
      const reg = await navigator.serviceWorker.ready;

      if (enabled) {
        // Unsubscribe
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          await pushApi.unsubscribe(sub.endpoint);
          await sub.unsubscribe();
        }
        setEnabled(false);
      } else {
        // Get VAPID key and subscribe
        const { data } = await pushApi.getVapidKey();
        if (!data?.vapidPublicKey) {
          alert('Push notifications are not configured on the server.');
          return;
        }

        const permission = await Notification.requestPermission();
        if (permission !== 'granted') return;

        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(data.vapidPublicKey),
        });
        await pushApi.subscribe(sub);
        setEnabled(true);
      }
    } catch (err) {
      console.error('Notification toggle error:', err);
    } finally {
      setLoading(false);
    }
  };

  return { enabled, loading, toggle };
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { user, logout } = useAuth();
  const notifications = useNotifications();

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-gray-200 transform transition-transform lg:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between h-16 px-6 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-primary-500 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">S</span>
            </div>
            <span className="font-semibold text-gray-900">Shuddhika</span>
          </div>
          <button
            className="lg:hidden text-gray-500"
            onClick={() => setSidebarOpen(false)}
          >
            <X size={20} />
          </button>
        </div>

        <nav className="p-4 space-y-1">
          {navigation.map((item) => (
            <NavLink
              key={item.name}
              to={item.href}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-primary-50 text-primary-700'
                    : 'text-gray-600 hover:bg-gray-100'
                }`
              }
              onClick={() => setSidebarOpen(false)}
            >
              <item.icon size={20} />
              {item.name}
            </NavLink>
          ))}
        </nav>

        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-gray-200">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center">
              <span className="text-gray-600 text-sm font-medium">
                {user?.name?.charAt(0).toUpperCase()}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">
                {user?.name}
              </p>
              <p className="text-xs text-gray-500 truncate">{user?.email}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={notifications.toggle}
              disabled={notifications.loading}
              className={`flex items-center gap-2 flex-1 px-3 py-2 text-sm rounded-lg transition-colors ${
                notifications.enabled
                  ? 'text-primary-700 bg-primary-50 hover:bg-primary-100'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
              title={notifications.enabled ? 'Disable notifications' : 'Enable notifications'}
            >
              {notifications.enabled ? <Bell size={18} /> : <BellOff size={18} />}
              {notifications.enabled ? 'Alerts on' : 'Alerts off'}
            </button>
            <button
              onClick={logout}
              className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="lg:pl-64">
        {/* Mobile header */}
        <div className="sticky top-0 z-30 flex items-center h-16 px-4 bg-white border-b border-gray-200 lg:hidden">
          <button
            className="text-gray-500"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu size={24} />
          </button>
          <div className="ml-4 flex items-center gap-2">
            <div className="w-8 h-8 bg-primary-500 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">S</span>
            </div>
            <span className="font-semibold text-gray-900">Shuddhika</span>
          </div>
        </div>

        {/* Page content */}
        <main className="p-6 overflow-x-hidden">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
