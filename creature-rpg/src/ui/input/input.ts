// Unified input: keyboard, mouse (pointer lock or drag), touch (virtual joystick + camera drag + buttons).
// Consumers read a frame snapshot; UI components can subscribe to action presses.
type Listener = (action: InputAction) => void;
export type InputAction = 'interact' | 'menu' | 'back' | 'up' | 'down' | 'left' | 'right' | 'confirm' | 'run' | 'map' | 'journal';

class InputManager {
  keys = new Set<string>();
  camDX = 0;
  camDY = 0;
  zoom = 0;
  joy: [number, number] = [0, 0];
  touchRun = false;
  enabled = true;          // gameplay movement enabled
  private listeners = new Set<Listener>();
  private attached = false;
  dragging = false;
  pointerLocked = false;

  attach(target: HTMLElement) {
    if (this.attached) return;
    this.attached = true;
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.clear);
    document.addEventListener('visibilitychange', this.onVisibility);
    target.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mouseup', this.onMouseUp);
    window.addEventListener('mousemove', this.onMouseMove);
    target.addEventListener('wheel', this.onWheel, { passive: true });
    target.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', () => {
      this.pointerLocked = document.pointerLockElement === target;
    });
  }

  on(l: Listener) {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }
  emit(a: InputAction) {
    for (const l of [...this.listeners]) l(a);
  }

  clear = () => {
    this.keys.clear();
    this.joy = [0, 0];
    this.camDX = this.camDY = 0;
    this.dragging = false;
    this.touchRun = false;
  };
  private onVisibility = () => {
    if (document.hidden) this.clear();
  };

  private onKeyDown = (e: KeyboardEvent) => {
    const t = e.target as HTMLElement;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
    const k = e.key.toLowerCase();
    if (!e.repeat) {
      if (k === 'e' || k === ' ' || k === 'enter') this.emit(k === 'e' ? 'interact' : 'confirm');
      if (k === 'e') this.emit('confirm');
      if (k === 'escape' || k === 'backspace') this.emit('back');
      if (k === 'tab' || k === 'm' || k === 'i') {
        if (k === 'tab') e.preventDefault();
        this.emit(k === 'm' ? 'map' : k === 'i' ? 'menu' : 'menu');
      }
      if (k === 'j') this.emit('journal');
      if (k === 'arrowup' || k === 'w') this.emit('up');
      if (k === 'arrowdown' || k === 's') this.emit('down');
      if (k === 'arrowleft' || k === 'a') this.emit('left');
      if (k === 'arrowright' || k === 'd') this.emit('right');
    }
    if (k.startsWith('arrow') || k === ' ') e.preventDefault();
    this.keys.add(k);
  };
  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.key.toLowerCase());
  };
  private onMouseDown = (e: MouseEvent) => {
    if (e.button === 0 || e.button === 2) this.dragging = true;
  };
  private onMouseUp = () => {
    this.dragging = false;
  };
  private onMouseMove = (e: MouseEvent) => {
    if (this.pointerLocked || this.dragging) {
      this.camDX += e.movementX;
      this.camDY += e.movementY;
    }
  };
  private onWheel = (e: WheelEvent) => {
    this.zoom += Math.sign(e.deltaY);
  };

  /** Movement vector (x = right, y = forward), magnitude <= 1. */
  move(): [number, number] {
    if (!this.enabled) return [0, 0];
    let x = 0;
    let y = 0;
    const k = this.keys;
    if (k.has('w') || k.has('arrowup')) y += 1;
    if (k.has('s') || k.has('arrowdown')) y -= 1;
    if (k.has('d') || k.has('arrowright')) x += 1;
    if (k.has('a') || k.has('arrowleft')) x -= 1;
    x += this.joy[0];
    y += this.joy[1];
    const l = Math.hypot(x, y);
    if (l > 1) {
      x /= l;
      y /= l;
    }
    return [x, y];
  }
  running(): boolean {
    return this.enabled && (this.keys.has('shift') || this.touchRun || Math.hypot(this.joy[0], this.joy[1]) > 0.92);
  }
  consumeCamera(): [number, number, number] {
    const r: [number, number, number] = [this.camDX, this.camDY, this.zoom];
    this.camDX = this.camDY = this.zoom = 0;
    return r;
  }
}

export const input = new InputManager();
