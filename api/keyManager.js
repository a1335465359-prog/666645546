// Key Management Module
// Handles storage, rotation (round-robin), cooldowns, and failure tracking for API keys.
// Note: In Vercel Serverless (non-Edge), global variables persist across "warm" invocations,
// allowing for effective short-term caching of key states.

const KEY_PREFIX = 'GEMINI_API_KEY';
const KEYS = [
  process.env.GEMINI_API_KEY1,
  process.env.GEMINI_API_KEY2,
  process.env.GEMINI_API_KEY3,
  process.env.GEMINI_API_KEY4,
  process.env.GEMINI_API_KEY5,
].filter(Boolean);

// Configuration
const KEY_COOLDOWN_MS = parseInt(process.env.KEY_COOLDOWN_MS || '60000', 10);
const MAX_FAILURES_BEFORE_COOLDOWN = 2;

// State (In-memory)
let rrIndex = 0;
const keyStates = new Map();

// Initialize state
KEYS.forEach(key => {
  keyStates.set(key, {
    failures: 0,
    cooldownUntil: 0,
    lastUsedAt: 0,
    totalUses: 0
  });
});

/**
 * Mask key for logging (show last 4 chars)
 */
function maskKey(key) {
  if (!key || key.length < 4) return '****';
  return '...' + key.slice(-4);
}

/**
 * Select a key using Round-Robin strategy, skipping cooled-down keys.
 * If all keys are cooling, pick the one with fewest failures or earliest cooldown expiry.
 */
export function pickKey() {
  if (KEYS.length === 0) return null;

  const now = Date.now();
  let selectedKey = null;

  // 1. Try Round-Robin to find a healthy key
  for (let i = 0; i < KEYS.length; i++) {
    const ptr = (rrIndex + i) % KEYS.length;
    const key = KEYS[ptr];
    const stats = keyStates.get(key);

    if (stats.cooldownUntil <= now) {
      selectedKey = key;
      rrIndex = (ptr + 1) % KEYS.length; // Advance pointer
      break;
    }
  }

  // 2. If all keys are in cooldown, find the best "bad" option
  // (e.g., the one expiring soonest) to avoid complete service stoppage
  if (!selectedKey) {
    let bestKey = KEYS[0];
    let minCooldown = Infinity;

    KEYS.forEach(key => {
      const stats = keyStates.get(key);
      if (stats.cooldownUntil < minCooldown) {
        minCooldown = stats.cooldownUntil;
        bestKey = key;
      }
    });
    selectedKey = bestKey;
    // Do not advance rrIndex strictly here to keep rotation logic clean when they recover
  }

  // Update usage stat
  if (selectedKey) {
    const stats = keyStates.get(selectedKey);
    stats.lastUsedAt = now;
    stats.totalUses++;
  }

  return selectedKey;
}

/**
 * Report a successful API call. Resets failure count.
 */
export function reportSuccess(key) {
  if (!key || !keyStates.has(key)) return;
  const stats = keyStates.get(key);
  stats.failures = 0;
  stats.cooldownUntil = 0;
}

/**
 * Report a failed API call.
 * @param {string} key
 * @param {object} opts - { cooldownMs: number }
 */
export function reportFailure(key, opts = {}) {
  if (!key || !keyStates.has(key)) return;
  const stats = keyStates.get(key);
  const now = Date.now();

  stats.failures++;

  // Force cooldown if specified (e.g., 429)
  if (opts.cooldownMs) {
    stats.cooldownUntil = now + opts.cooldownMs;
    return;
  }

  // Auto cooldown threshold
  if (stats.failures >= MAX_FAILURES_BEFORE_COOLDOWN) {
    stats.cooldownUntil = now + KEY_COOLDOWN_MS;
  }
}

/**
 * Debug info for admin
 */
export function getDebug() {
  return KEYS.map(key => {
    const stats = keyStates.get(key);
    return {
      key: maskKey(key),
      failures: stats.failures,
      cooldownUntil: stats.cooldownUntil,
      isCooling: stats.cooldownUntil > Date.now(),
      lastUsedAt: stats.lastUsedAt ? new Date(stats.lastUsedAt).toISOString() : null,
      totalUses: stats.totalUses
    };
  });
}

export function getKeyCount() {
  return KEYS.length;
}
