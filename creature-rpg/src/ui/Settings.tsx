import { useSettings, type QualityProfile } from '../state/settingsStore';
import { Panel } from './components';
import { useEffect } from 'react';

export function SettingsPanel({ onClose }: { onClose?: () => void }) {
  const s = useSettings();
  useEffect(() => {
    document.documentElement.style.setProperty('--ui-scale', String(s.textSize / 100));
  }, [s.textSize]);
  const slider = (label: string, key: 'master' | 'music' | 'sfx' | 'cameraSensitivity', min = 0, max = 1, step = 0.05) => (
    <label className="row" style={{ justifyContent: 'space-between', margin: '6px 0' }}>
      <span>{label}</span>
      <input type="range" min={min} max={max} step={step} value={s[key]} onChange={(e) => s.set({ [key]: +e.target.value } as any)} style={{ width: 180 }} aria-valuetext={String(s[key])} />
      <span style={{ width: 42, textAlign: 'right', fontFamily: 'var(--font-num)' }}>{key === 'cameraSensitivity' ? s[key].toFixed(2) : Math.round(s[key] * 100)}</span>
    </label>
  );
  const toggle = (label: string, key: 'muted' | 'reducedMotion' | 'invertY' | 'showPerf' | 'subtitles') => (
    <label className="row" style={{ justifyContent: 'space-between', margin: '6px 0' }}>
      <span>{label}</span>
      <input type="checkbox" checked={s[key]} onChange={(e) => s.set({ [key]: e.target.checked } as any)} style={{ width: 22, height: 22 }} />
    </label>
  );
  return (
    <Panel title="Settings">
      <div className="scroll" style={{ maxHeight: '64vh' }}>
        <h2>Graphics</h2>
        <div className="row" role="radiogroup" aria-label="quality">
          {(['high', 'balanced', 'mobile'] as QualityProfile[]).map((q) => (
            <button key={q} role="radio" aria-checked={s.quality === q} className={'tab' + (s.quality === q ? ' on' : '')} onClick={() => s.set({ quality: q, qualityAuto: false })}>{q[0].toUpperCase() + q.slice(1)}</button>
          ))}
          <button className={'tab' + (s.qualityAuto ? ' on' : '')} aria-pressed={s.qualityAuto} onClick={() => s.set({ qualityAuto: !s.qualityAuto })}>Auto</button>
        </div>
        {toggle('Show performance overlay', 'showPerf')}
        <h2>Audio</h2>
        {slider('Master volume', 'master')}
        {slider('Music', 'music')}
        {slider('Effects & cries', 'sfx')}
        {toggle('Mute all', 'muted')}
        {toggle('Captions for cries & sounds', 'subtitles')}
        <h2>Controls & comfort</h2>
        {slider('Camera sensitivity', 'cameraSensitivity', 0.25, 2, 0.05)}
        {toggle('Invert camera Y', 'invertY')}
        {toggle('Reduced motion', 'reducedMotion')}
        <div className="row" style={{ margin: '6px 0' }}>
          <span style={{ flex: 1 }}>Text size</span>
          {([100, 125, 150] as const).map((t) => <button key={t} className={'tab' + (s.textSize === t ? ' on' : '')} aria-pressed={s.textSize === t} onClick={() => s.set({ textSize: t })}>{t}%</button>)}
        </div>
        <div className="row" style={{ margin: '6px 0' }}>
          <span style={{ flex: 1 }}>Text speed</span>
          {(['slow', 'normal', 'instant'] as const).map((t) => <button key={t} className={'tab' + (s.textSpeed === t ? ' on' : '')} aria-pressed={s.textSpeed === t} onClick={() => s.set({ textSpeed: t })}>{t}</button>)}
        </div>
      </div>
      {onClose && <button className="back-btn" onClick={onClose}>◀ Back</button>}
    </Panel>
  );
}
