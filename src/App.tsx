import { useEffect } from 'react';
import { useGame } from './store/game';
import { audio } from './audio/engine';
import Cursor from './components/Cursor';
import Header from './components/Header';
import IntroLoader from './components/IntroLoader';
import Captions from './components/Captions';
import ObserverLog from './components/ObserverLog';
import Hud from './components/Hud';
import BossHud from './components/BossHud';
import SoundToggle from './components/SoundToggle';
import ScrollPage from './components/ScrollPage';
import FalseCrash from './components/FalseCrash';
import FalsePeace from './components/FalsePeace';
import FinalChoice from './components/FinalChoice';
import Ending from './components/Ending';
import Credits from './components/Credits';
import DescentHud from './components/DescentHud';

export default function App() {
  const stage = useGame((s) => s.stage);
  const overlay = useGame((s) => s.overlay);
  const sound = useGame((s) => s.sound);
  const blackout = useGame((s) => s.blackout);

  useEffect(() => {
    audio.setEnabled(sound);
  }, [sound]);

  useEffect(() => {
    document.body.dataset.stage = stage;
  }, [stage]);

  const locked = useGame((s) => s.scrollLocked);
  useEffect(() => {
    document.body.dataset.locked = locked ? '1' : '0';
  }, [locked]);

  return (
    <>
      {stage === 'page' && <ScrollPage />}
      <Header />
      <ObserverLog />
      <Captions />
      <Hud />
      <BossHud />
      {stage === 'descent' && <DescentHud />}
      {overlay === 'crash' && <FalseCrash />}
      {overlay === 'peace' && <FalsePeace />}
      {overlay === 'choice' && <FinalChoice />}
      {overlay === 'ending' && <Ending />}
      {overlay === 'credits' && <Credits />}
      <div className="blackout" style={{ opacity: blackout, pointerEvents: blackout > 0.5 ? 'auto' : 'none' }} />
      {stage === 'intro' && <IntroLoader />}
      <SoundToggle />
      <div className="grain" aria-hidden="true" />
      <Cursor />
    </>
  );
}
