import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/suse-mono'
import './index.css'
import App from './App.tsx'
import { initNormalHoverEffects } from './ui/hover'
import { initScrollbar } from './ui/scrollbar'
import { initUiSounds } from './ui/sounds'

initScrollbar()
initUiSounds()
initNormalHoverEffects()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
