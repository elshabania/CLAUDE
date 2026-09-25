// Guarded removal helpers: after a physics-world rebuild (StrictMode remount, zone swap) old handles are stale.
/* eslint-disable @typescript-eslint/no-explicit-any */
export function safeRemoveBody(world: any, body: any) {
  try {
    if (body && world.getRigidBody?.(body.handle) === body) world.removeRigidBody(body);
    else if (body && world.bodies?.get?.(body.handle)) world.removeRigidBody(body);
  } catch {
    /* stale handle: world already freed */
  }
}
export function safeRemoveCollider(world: any, col: any) {
  try {
    if (col && world.getCollider?.(col.handle)) world.removeCollider(col, false);
  } catch {
    /* stale */
  }
}
export function safeRemoveController(world: any, ctrl: any) {
  try {
    world.removeCharacterController(ctrl);
  } catch {
    /* stale */
  }
}
