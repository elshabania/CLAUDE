import { useEffect, useState } from 'react';
import { runtime } from '../state/runtime';
import { useSettings } from '../state/settingsStore';

/** In-game performance overlay (FPS, p95 frame time, draw calls, triangles, GPU memory objects). */
export function PerfOverlay({ force = false }: { force?: boolean }) {
  const show = useSettings((s) => s.showPerf) || force || new URLSearchParams(location.search).has('perf');
  const [, tick] = useState(0);
  useEffect(() => {
    if (!show) return;
    const id = setInterval(() => tick((t) => t + 1), 500);
    return () => clearInterval(id);
  }, [show]);
  if (!show) return null;
  const p = runtime.perf;
  return (
    <div style={{ position: 'fixed', top: 6, right: 6, background: 'rgba(15,19,32,.75)', color: '#E8C27A', font: '12px var(--font-num)', padding: '4px 8px', borderRadius: 4, pointerEvents: 'none', zIndex: 50, whiteSpace: 'pre' }}>
      {`FPS ${p.fps.toFixed(0)}  median ${p.frameMs.toFixed(1)}ms  p95 ${p.p95.toFixed(1)}ms\ncalls ${p.drawCalls}  tris ${(p.triangles / 1000).toFixed(0)}k  geo ${p.geometries}  tex ${p.textures}\npos ${runtime.playerPos.x.toFixed(1)}, ${runtime.playerPos.y.toFixed(1)}, ${runtime.playerPos.z.toFixed(1)}`}
    </div>
  );
}
