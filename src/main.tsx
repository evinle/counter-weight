import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { BOTTOM_TAB_BAR_HEIGHT } from './lib/layout'
import './index.css'

document.documentElement.style.setProperty('--bottom-tab-bar-height', `${BOTTOM_TAB_BAR_HEIGHT}px`)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
