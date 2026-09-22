import type { StyleSpecification } from 'maplibre-gl';

/**
 * Basemap: VITE_BASEMAP_STYLE_URL points at a self-hosted style (e.g. PMTiles);
 * otherwise a blank neutral background so the app makes no network calls.
 */
export function basemapStyle(background: string): string | StyleSpecification {
  const url = (import.meta.env.VITE_BASEMAP_STYLE_URL as string | undefined)?.trim();
  if (url) return url;
  return {
    version: 8,
    name: 'STEAM-AI blank',
    sources: {},
    layers: [{ id: 'background', type: 'background', paint: { 'background-color': background } }],
  };
}

export function cssToken(name: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}
