import { useGame } from '../store/game';
import { audio } from '../audio/engine';

export default function SoundToggle() {
  const sound = useGame((s) => s.sound);
  const toggle = useGame((s) => s.toggleSound);
  const stage = useGame((s) => s.stage);
  if (stage === 'intro') return null;
  return (
    <button
      className={`sound-toggle ${sound ? 'is-on' : ''}`}
      onClick={() => {
        audio.init();
        toggle();
      }}
      aria-pressed={sound}
      aria-label={sound ? 'Mute sound' : 'Enable sound'}
    >
      <span className="bars" aria-hidden="true">
        <i />
        <i />
        <i />
        <i />
      </span>
      <span className="mono">SOUND {sound ? 'ON' : 'OFF'}</span>
    </button>
  );
}
