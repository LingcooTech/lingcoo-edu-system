import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App';
import { ToastProvider } from './components/shared/Toast';
import { TooltipProvider } from './components/ui/tooltip';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ToastProvider>
      <TooltipProvider delayDuration={200}>
        <App />
      </TooltipProvider>
    </ToastProvider>
  </StrictMode>,
);
