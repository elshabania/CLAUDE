// High-profile post stack only (rendering §5.4): SMAA, subtle Bloom, Vignette, then ACES tone mapping last (the composer switches the renderer to
// NoToneMapping while mounted). Lazy-loaded so Balanced/Mobile never download postprocessing.
// Renders to the default framebuffer at the end, so preserveDrawingBuffer screenshots keep working;
// uses the default R3F camera, which the battle director also drives.
// Bloom threshold is 3.2 (not the doc's 1.0): the HDR buffer is pre-tone-mapping and sunlit ground
// already reaches ~1.5–3, so a low threshold hazes the whole frame. Only lamp halo cores, the sun disc
// and hot emissives clear it.
import { EffectComposer, Bloom, Vignette, SMAA, ToneMapping } from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';
import { HalfFloatType } from 'three';

export default function PostFX() {
  return (
    <EffectComposer multisampling={0} frameBufferType={HalfFloatType} enableNormalPass={false}>
      <SMAA />
      <Bloom mipmapBlur luminanceThreshold={3.2} luminanceSmoothing={0.4} intensity={0.55} radius={0.65} />
      <Vignette offset={0.3} darkness={0.42} eskil={false} />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
    </EffectComposer>
  );
}
