import { useQuery } from '@tanstack/react-query';
import { Navigate } from 'react-router-dom';
import { authApi } from '../api/client';
import { LaadScherm } from './LaadScherm';
import type { ReactNode } from 'react';

export function AuthGate({ children }: { children: ReactNode }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['me'],
    queryFn: () => authApi.me(),
    retry: 3,           // 3× retry voor cold start
    retryDelay: 5000,   // 5s tussen pogingen
  });

  if (isLoading) {
    return <LaadScherm subtitel="Je sessie wordt gecontroleerd…" />;
  }
  if (isError || !data) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}
