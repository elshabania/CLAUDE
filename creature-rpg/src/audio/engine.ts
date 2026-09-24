// Temporary stub — replaced by the audio agent's Tone.js engine.
export async function startAudio(): Promise<void> {}
export function setZoneMusic(_id: string | null) {}
export function setBattleMusic(_kind: string, _cantorType?: string) {}
export function setBattleIntensity(_high: boolean) {}
export function endBattleMusic(_stinger: 'victory' | 'capture' | 'none') {}
export function playStinger(_id: string) {}
