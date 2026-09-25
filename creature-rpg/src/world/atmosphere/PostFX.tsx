// Post stack (rendering §5.4), lazy-loaded so Mobile never downloads postprocessing.
//  full  (High):     N8AO ambient occlusion (full-res, medium) → SMAA → Bloom → ACES → grade (sat/contrast) → Vignette
//  light (Balanced): N8AO (half-res, performance)             → SMAA → Bloom → ACES
// The composer switches the renderer to NoToneMapping while mounted; ACES runs here instead, then a light
// grade in display range. Renders to the default framebuffer, so preserveDrawingBuffer screenshots keep
// working; uses the default R3F camera, which the battle director also drives.
// Bloom threshold 1.8 (HDR, pre-tone-mapping): sunlit snow peaks ~1.3, so only the sun disc, lamp/window
// glow halos, crystals and lava seams bloom.
import { EffectComposer, Bloom, Vignette, SMAA, ToneMapping, N8AO, HueSaturation, BrightnessContrast } from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';
import { HalfFloatType } from 'three';

export default function PostFX({ mode = 'full' }: { mode?: 'full' | 'light' }) {
  const full = mode === 'full';
  return (
    <EffectComposer multisampling={0} frameBufferType={HalfFloatType} enableNormalPass={false}>
      <N8AO aoRadius={full ? 1.6 : 1.4} distanceFalloff={0.6} intensity={full ? 2.4 : 2} quality={full ? 'medium' : 'performance'} halfRes={!full} depthAwareUpsampling color="black" />
      <SMAA />
      <Bloom mipmapBlur luminanceThreshold={1.8} luminanceSmoothing={0.35} intensity={full ? 0.5 : 0.4} radius={0.7} />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      {full ? <HueSaturation saturation={0.06} /> : <></>}
      {full ? <BrightnessContrast contrast={0.06} /> : <></>}
      {full ? <Vignette offset={0.3} darkness={0.38} eskil={false} /> : <></>}
    </EffectComposer>
  );
}
