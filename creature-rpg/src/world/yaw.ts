/** Data yaw is a compass bearing in degrees (0 = north/−z, 90 = east/+x). Models face +z at rotationY 0. */
export function compassToRotY(yawDeg = 0): number {
  return Math.PI - (yawDeg * Math.PI) / 180;
}
