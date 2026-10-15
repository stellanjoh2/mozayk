import { StrictMode } from 'react'
import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/bitcount-grid-single' // swap with --font-ui in App.css
import App from './App.tsx'
import { initNormalCursor } from './ui/cursors'
import { initNormalHoverEffects } from './ui/hover'
import { initScrollbar } from './ui/scrollbar'
import { initUiSounds } from './ui/sounds'
import { initChromeTheme } from './ui/theme'

/** Starts with this module so the typeface is ready before the veil lifts. */
void (document.fonts?.load('16px "Bitcount Grid Single Variable"') ?? Promise.resolve())

export function mountApp(): void {
  initChromeTheme()
  initScrollbar()
  initUiSounds()
  initNormalHoverEffects()
  initNormalCursor()

  const root = createRoot(document.getElementById('root')!)
  flushSync(() => {
    root.render(
      <StrictMode>
        <App />
      </StrictMode>,
    )
  })
}
