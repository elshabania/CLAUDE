// capture.js — pure capture/collection logic for the Pokemon arena.
// No three.js, no DOM (localStorage only, guarded). No top-level await.

const STORAGE_KEY = "pkmn-arena-collection";
const PARTY_CAP = 6;

// ---- Catch formula ---------------------------------------------------------
// Exposed so callers/tests can reason about odds independently of rolling.
// Chance climbs sharply as the target's hpFrac approaches 0, and scales with
// the ball's power and any status bonus. Clamped to keep it never-certain.
export function catchChance({ hpFrac, ballPower = 1, statusBonus = 1, baseRate = 0.45 }) {
  const frac = clamp(hpFrac, 0, 1);
  const raw = baseRate * ballPower * statusBonus * (1.6 - frac);
  return clamp(raw, 0.04, 0.97);
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

// XP needed to advance FROM the given level (simple quadratic-ish curve).
function xpForLevel(level) {
  return 20 + level * level * 4;
}

function makeEntry(key, level) {
  const maxHp = 20 + level * 6; // simple HP scaling
  return { key, level, hp: maxHp, maxHp, xp: 0 };
}

// ---- Controller factory ----------------------------------------------------
export function createCollection(allSpeciesKeys = []) {
  const state = {
    party: [makeEntry("charizard", 5)],
    box: [],
    activeIndex: 0,
    dex: new Set(),
    ballCount: 10,
    caughtCounts: {},
  };

  const controller = {
    state,

    // Attempt a capture. Consumes one ball. Returns capture result + wobble count.
    rollCatch({ hpFrac, ballPower = 1, statusBonus = 1, baseRate = 0.45 }) {
      if (state.ballCount <= 0) return { captured: false, shakes: 0, noBalls: true };
      state.ballCount -= 1;

      const p = catchChance({ hpFrac, ballPower, statusBonus, baseRate });
      const r = Math.random();
      const captured = r < p;
      // On capture: 3 wobbles then click. On fail: more wobbles = closer call.
      // Map the roll's "distance past the threshold" onto 0-2 wobbles.
      let shakes;
      if (captured) {
        shakes = 3;
      } else {
        const margin = (r - p) / Math.max(1 - p, 1e-6); // 0 = barely missed, 1 = nowhere close
        shakes = clamp(2 - Math.floor(margin * 3), 0, 2);
      }
      return { captured, shakes };
    },

    // Register a caught species: party (cap 6, overflow to box) + dex + counts.
    addCaught(key, level = 5) {
      const entry = makeEntry(key, level);
      if (state.party.length < PARTY_CAP) state.party.push(entry);
      else state.box.push(entry);
      state.dex.add(key);
      state.caughtCounts[key] = (state.caughtCounts[key] || 0) + 1;
      return entry;
    },

    setActive(i) {
      if (i >= 0 && i < state.party.length) state.activeIndex = i;
      return state.party[state.activeIndex];
    },

    getActive() {
      return state.party[state.activeIndex];
    },

    addBalls(n) {
      state.ballCount = Math.max(0, state.ballCount + n);
      return state.ballCount;
    },

    // Grant XP to the active member; may level up (possibly several times).
    // Returns true if at least one level-up occurred.
    grantXp(amount) {
      const mon = controller.getActive();
      if (!mon) return false;
      mon.xp += amount;
      let leveled = false;
      while (mon.xp >= xpForLevel(mon.level)) {
        mon.xp -= xpForLevel(mon.level);
        mon.level += 1;
        const newMax = 20 + mon.level * 6;
        mon.hp += newMax - mon.maxHp; // heal by the HP gained on level-up
        mon.maxHp = newMax;
        leveled = true;
      }
      return leveled;
    },

    // Heal the active member by a fraction of its max HP.
    healActive(frac) {
      const mon = controller.getActive();
      if (!mon) return;
      mon.hp = clamp(mon.hp + mon.maxHp * frac, 0, mon.maxHp);
      return mon.hp;
    },

    save() {
      try {
        if (typeof localStorage === "undefined") return false;
        const data = {
          party: state.party,
          box: state.box,
          activeIndex: state.activeIndex,
          dex: [...state.dex],
          ballCount: state.ballCount,
          caughtCounts: state.caughtCounts,
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        return true;
      } catch (_e) {
        return false; // storage unavailable / quota / serialization error
      }
    },

    load() {
      try {
        if (typeof localStorage === "undefined") return false;
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return false;
        const data = JSON.parse(raw);
        state.party = data.party || state.party;
        state.box = data.box || [];
        state.activeIndex = data.activeIndex || 0;
        state.dex = new Set(data.dex || []);
        state.ballCount = typeof data.ballCount === "number" ? data.ballCount : state.ballCount;
        state.caughtCounts = data.caughtCounts || {};
        return true;
      } catch (_e) {
        return false;
      }
    },
  };

  // Auto-load persisted data if present; otherwise keep the fresh state above.
  controller.load();

  return controller;
}
