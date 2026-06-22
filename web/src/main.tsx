import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from '@/lib/theme';
import { LibraryDemo } from '@/pages/library-demo';
import { ResumenPage } from '@/pages/resumen';
import { EjecucionNtPage } from '@/pages/ejecucion-nt';
import { FinancieroPage } from '@/pages/financiero';
import { CalidadPage } from '@/pages/calidad';
import { PymPage } from '@/pages/pym';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      refetchOnWindowFocus: false,
    },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Navigate to="/resumen" replace />} />
            <Route path="/resumen" element={<ResumenPage />} />
            <Route path="/ejecucion-nt" element={<EjecucionNtPage />} />
            <Route path="/financiero" element={<FinancieroPage />} />
            <Route path="/calidad" element={<CalidadPage />} />
            <Route path="/pym" element={<PymPage />} />
            <Route path="/library" element={<LibraryDemo />} />
            <Route path="*" element={<Navigate to="/resumen" replace />} />
          </Routes>
        </BrowserRouter>
      </ThemeProvider>
    </QueryClientProvider>
  </StrictMode>,
);
