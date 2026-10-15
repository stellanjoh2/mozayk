import './brand.css'
import './index.css'
import { liftEntryVeil, playEntryIntro } from './intro/entryIntro'

// Intro paints from this small entry; the app bundle downloads alongside it and
// mounts only once the loop has ended on black, so mounting can't stutter it.
const intro = playEntryIntro()
const boot = import('./boot.tsx')

void Promise.all([boot, intro]).then(([{ mountApp }]) => {
  mountApp()
  return liftEntryVeil()
})
