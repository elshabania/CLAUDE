import { useEffect, useRef } from 'react';
import maplibregl, { type Map as MLMap } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { MapboxOverlay } from '@deck.gl/mapbox';
import type { Layer, PickingInfo } from '@deck.gl/core';
import { basemapStyle, cssToken } from './basemap';

export interface MapViewProps {
  layers: Layer[];
  initialView: { lon: number; lat: number; zoom: number };
  onHover?: (info: PickingInfo) => void;
  onClick?: (info: PickingInfo) => void;
  onReady?: (map: MLMap) => void;
}

/** MapLibre canvas with a deck.gl MapboxOverlay. Layers are swapped via setProps, never re-mounted. */
export function MapView({ layers, initialView, onHover, onClick, onReady }: MapViewProps) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const overlayRef = useRef<MapboxOverlay | null>(null);
  const hoverRef = useRef(onHover);
  const clickRef = useRef(onClick);
  hoverRef.current = onHover;
  clickRef.current = onClick;

  useEffect(() => {
    if (!container.current) return;
    const bg = cssToken('--map-bg', '#e9e9e4');
    const map = new maplibregl.Map({
      container: container.current,
      style: basemapStyle(bg),
      center: [initialView.lon, initialView.lat],
      zoom: initialView.zoom,
      attributionControl: false,
      maxPitch: 0,
      dragRotate: false,
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left');
    const overlay = new MapboxOverlay({
      interleaved: false,
      layers: [],
      onHover: (info) => hoverRef.current?.(info),
      onClick: (info) => clickRef.current?.(info),
      getCursor: ({ isHovering }) => (isHovering ? 'pointer' : 'grab'),
    });
    map.addControl(overlay);
    mapRef.current = map;
    overlayRef.current = overlay;
    map.once('load', () => onReady?.(map));

    // Follow the OS colour scheme for the blank background.
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onScheme = () => {
      if (!import.meta.env.VITE_BASEMAP_STYLE_URL && map.getLayer('background')) {
        map.setPaintProperty('background', 'background-color', cssToken('--map-bg', '#e9e9e4'));
      }
    };
    mq.addEventListener('change', onScheme);

    return () => {
      mq.removeEventListener('change', onScheme);
      overlay.finalize();
      map.remove();
      mapRef.current = null;
      overlayRef.current = null;
    };
    // initial view and onReady are read once, on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    overlayRef.current?.setProps({ layers });
  }, [layers]);

  return <div ref={container} className="map-canvas" role="application" aria-label="Network map" />;
}
