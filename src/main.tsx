import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { trpcReact, trpcReactClient } from './lib/trpc'
import { App } from './App'
import { BOTTOM_TAB_BAR_HEIGHT } from './lib/layout'
import './index.css'

document.documentElement.style.setProperty('--bottom-tab-bar-height', `${BOTTOM_TAB_BAR_HEIGHT}px`)

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 0 },
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <trpcReact.Provider client={trpcReactClient} queryClient={queryClient}>
        <App />
      </trpcReact.Provider>
    </QueryClientProvider>
  </StrictMode>
)
