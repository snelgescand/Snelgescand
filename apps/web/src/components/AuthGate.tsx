import { useQuery } from '@tanstack/react-query';
import { Navigate } from 'react-router-dom';
import { authApi } from '../api/client';
import type { ReactNode } from 'react';

export function AuthGate({ children }: { children: ReactNode }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['me'],
    queryFn: () => authApi.me(),
    retry: false,
  });

  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center text-gray-500">Laden…</div>;
  }
  if (isError || !data) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}
