import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/geist-mono'
import './index.css'
import App from './App.tsx'
import { initScrollbar } from './ui/scrollbar'

initScrollbar()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
