import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import './styles.css';
import Login from './routes/Login';
import ProjectList from './routes/ProjectList';
import ProjectEditor from './routes/ProjectEditor';
import Kennisbank from './routes/Kennisbank';
import { AuthGate } from './components/AuthGate';
import { OnboardingModal } from './components/OnboardingModal';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1 },
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<AuthGate><Navigate to="/projecten" replace /></AuthGate>} />
          <Route path="/projecten" element={<AuthGate><ProjectList /><OnboardingModal /></AuthGate>} />
          <Route path="/projecten/:id" element={<AuthGate><ProjectEditor /></AuthGate>} />
          <Route path="/kennisbank" element={<AuthGate><Kennisbank /></AuthGate>} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);
