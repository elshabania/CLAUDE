import { useEffect } from 'react';
import { useGame } from '../state/game';
import { TitleScreen, NewGameScreen } from '../ui/TitleScreens';
import { Game } from './Game';
import { ZONE_ERRORS } from '../data/zones';

export default function App() {
  const mode = useGame((s) => s.mode);
  const hasSave = useGame((s) => !!s.save);
  useEffect(() => {
    if (ZONE_ERRORS.length) console.error('zone data errors', ZONE_ERRORS);
    // expose state for the QA smoke tests (dev / QA builds only)
    if (import.meta.env.DEV || import.meta.env.VITE_QA === '1') { (window as unknown as { __game: typeof useGame }).__game = useGame; import("../battle/battleStore").then((m) => ((window as unknown as { __battle: unknown }).__battle = m.useBattle)); }
  }, []);
  if (mode === 'title') return <TitleScreen />;
  if (mode === 'newgame') return <NewGameScreen />;
  if (!hasSave) return <TitleScreen />;
  return <Game />;
}
