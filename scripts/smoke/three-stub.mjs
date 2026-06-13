function makeVec() {
  const store = {};
  const self = new Proxy(function(){}, {
    get(t, p) {
      if (p === Symbol.toPrimitive) return () => 0;
      if (p in store) return store[p];
      if (['x','y','z','w','r','g','b','h','s','l'].includes(p)) return 0;
      return (...a) => self;
    },
    set(t, p, v) { store[p] = v; return true; },
  });
  return self;
}
function makeU() {
  const store = { userData: {} };
  return new Proxy(function(){}, {
    get(t, p) {
      if (p === Symbol.toPrimitive) return () => 0;
      if (p === 'isMesh' || p === 'isObject3D' || p === 'isGroup' || p === 'isBufferGeometry') return true;
      if (p in store) return store[p];
      if (p === 'position' || p === 'rotation' || p === 'scale' || p === 'quaternion' || p === 'emissive' || p === 'color') {
        store[p] = makeVec(); return store[p];
      }
      if (p === 'children') return [];
      if (p === 'length' || p === 'count' || p === 'distanceTo' || p === 'distanceToSquared') return () => 0;
      if (p === 'material' || p === 'geometry') { store[p] = makeU(); return store[p]; }
      return makeU();
    },
    set(t, p, v) { store[p] = v; return true; },
    apply() { return makeU(); },
    construct() { return makeU(); },
  });
}
const C = () => makeU();
export const Group = C(), Mesh = C(), Object3D = C(), Sprite = C(),
  BoxGeometry = C(), BufferGeometry = C(), CapsuleGeometry = C(), CircleGeometry = C(),
  ConeGeometry = C(), CylinderGeometry = C(), ExtrudeGeometry = C(), IcosahedronGeometry = C(),
  PlaneGeometry = C(), ShapeGeometry = C(), SphereGeometry = C(), TorusGeometry = C(),
  RingGeometry = C(), LatheGeometry = C(), TubeGeometry = C(),
  CanvasTexture = C(), Texture = C(), Shape = C(), Path = C(),
  Color = C(), Vector2 = C(), Vector3 = C(), Quaternion = C(), Euler = C(), Matrix4 = C(),
  Float32BufferAttribute = C(), BufferAttribute = C(),
  MeshBasicMaterial = C(), MeshStandardMaterial = C(), MeshPhysicalMaterial = C(),
  SpriteMaterial = C(), PointLight = C(), SpotLight = C(), DirectionalLight = C(),
  CatmullRomCurve3 = C(), Spherical = C();
export const DoubleSide = 2, FrontSide = 0, BackSide = 1, AdditiveBlending = 2,
  NormalBlending = 1, MultiplyBlending = 4, RepeatWrapping = 1000, ClampToEdgeWrapping = 1001,
  MirroredRepeatWrapping = 1002, SRGBColorSpace = 'srgb', LinearSRGBColorSpace = 'srgb-linear';
export const MathUtils = new Proxy({}, { get: () => (..._a) => 0 });
export default new Proxy({}, { get: () => makeU() });
