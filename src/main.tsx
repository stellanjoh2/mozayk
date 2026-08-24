import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/bitcount-grid-single' // swap with --font-ui in App.css
import './index.css'
import App from './App.tsx'
import { recordPageView } from './stats/beacon'
import { initNormalCursor } from './ui/cursors'
import { initNormalHoverEffects } from './ui/hover'
import { initScrollbar } from './ui/scrollbar'
import { initUiSounds } from './ui/sounds'
import { initChromeTheme } from './ui/theme'

initChromeTheme()
initScrollbar()
initUiSounds()
initNormalHoverEffects()
initNormalCursor()
recordPageView()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
