import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { authApi } from '../services/api';
import type { User } from '../types';

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const navigate = useNavigate();

  const checkAuth = useCallback(async () => {
    const token = localStorage.getItem('token');
    if (!token) {
      setIsLoading(false);
      return;
    }

    try {
      const response = await authApi.me();
      if (response.data) {
        setUser(response.data);
      }
    } catch {
      localStorage.removeItem('token');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  const login = async (email: string, password: string) => {
    const response = await authApi.login(email, password);
    if (response.data?.user) {
      setUser(response.data.user);
      navigate('/');
    }
    return response;
  };

  const register = async (email: string, password: string, name: string) => {
    const response = await authApi.register(email, password, name);
    if (response.data?.user) {
      setUser(response.data.user);
      navigate('/');
    }
    return response;
  };

  const logout = () => {
    authApi.logout();
    setUser(null);
    navigate('/login');
  };

  return {
    user,
    isAuthenticated: !!user,
    isLoading,
    login,
    register,
    logout,
  };
}
