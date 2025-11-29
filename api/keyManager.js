// Key Management Module
// Handles storage, rotation (round-robin), cooldowns, and failure tracking for API keys.
// Supports GEMINI_API_KEY (single) and GEMINI_API_KEY1~10 (multiple).

// 1. Load Keys from Environment
const RAW_KEYS = [
  process.env.GEMINI_API_KEY,
  process.env.GEMINI_API_KEY1,
  process.env.GEMINI_API_KEY2,
  process.env.GEMINI_API_KEY3,
  process.env.GEMINI_API_KEY4,
  process.env.GEMINI_API_KEY5,
  process.env.GEMINI_API_KEY6,
  process.env.GEMINI_API_KEY7,
  process.env.GEMINI_API_KEY8,
  process.env.GEMINI_API_KEY9,
  process.env.GEMINI_API_KEY10,
];

// Deduplicate and filter empty keys
const KEYS = Array.from(new Set(RAW_KEYS.filter(k => k && k.trim().length > 0)));

if (KEYS.length === 0) {
  console.error('[Gemini KeyManager] No API keys found. Please set GEMINI_API_KEY or GEMINI_API_KEY1~10 in Vercel Environment Variables.');
} else {
  console.log(`[Gemini KeyManager] Loaded ${KEYS.length} API keys.`);
}

// 2. Configuration
const MAX_FAILURES_BEFORE_COOLDOWN = 3;     // Fail 3 times...
const COOLDOWN_DURATION_MS = 10 * 60 * 1000; // ...cool down for 10 minutes

// 3. State (In-memory)
// Vercel Serverless functions reuse the same instance for "warm" requests, preserving this state.
let rrIndex = 0;
const keyStates = new Map();

// Initialize state
KEYS.forEach(key => {
  keyStates.set(key, {
    failures: 0,
    cooldownUntil: 0,
    totalUses: 0,
    successes: 0
  });
});

/**
 * Helper: Mask key for logging (show last 4 chars)
 */
function maskKey(key) {
  if (!key || key.length < 5) return '****';
  return '...' + key.slice(-4);
}

/**
 * pickKey: Returns a usable API key using Round-Robin.
 * Skips keys that are currently in cooldown.
 */
export function pickKey() {
  if (KEYS.length === 0) return null;

  const now = Date.now();
  let selectedKey = null;

  // Try Round-Robin to find a healthy key
  // We loop at most KEYS.length times to check everyone once
  for (let i = 0; i < KEYS.length; i++) {
    const ptr = (rrIndex + i) % KEYS.length;
    const key = KEYS[ptr];
    const stats = keyStates.get(key);

    // Check if cooled down
    if (stats.cooldownUntil > now) {
      continue; // Skip this key
    }

    // Found a usable key
    selectedKey = key;
    rrIndex = (ptr + 1) % KEYS.length; // Move pointer for next time
    break;
  }

  // If all keys are cooling, we MUST return something or the service dies.
  // Strategy: Pick the one that expires soonest.
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
    console.warn('[Gemini KeyManager] All keys are cooling. Forced picking soonest available:', maskKey(selectedKey));
  }

  // Update usage stat (just for tracking attempts)
  if (selectedKey) {
    const stats = keyStates.get(selectedKey);
    stats.totalUses++;
  }

  return selectedKey;
}

/**
 * reportSuccess: Call this when upstream returns 200 OK.
 * Resets failure count and cooldown.
 */
export function reportSuccess(key) {
  if (!key || !keyStates.has(key)) return;
  const stats = keyStates.get(key);
  stats.failures = 0;
  stats.cooldownUntil = 0;
  stats.successes++;
}

/**
 * reportFailure: Call this when upstream returns 4xx/5xx or network error.
 * Increases failure count. If threshold reached, sets cooldown.
 */
export function reportFailure(key) {
  if (!key || !keyStates.has(key)) return;
  const stats = keyStates.get(key);
  const now = Date.now();

  stats.failures++;

  // Trigger cooldown if threshold reached
  if (stats.failures >= MAX_FAILURES_BEFORE_COOLDOWN) {
    stats.cooldownUntil = now + COOLDOWN_DURATION_MS;
    console.warn(`[Gemini KeyManager] Key ${maskKey(key)} entered cooldown for 10 mins (Failures: ${stats.failures})`);
  }
}

/**
 * getDebug: Returns status of all keys for the debug endpoint.
 */
export function getDebug() {
  return KEYS.map(key => {
    const stats = keyStates.get(key);
    const timeLeft = Math.max(0, stats.cooldownUntil - Date.now());
    return {
      key: maskKey(key),
      totalUses: stats.totalUses,
      successes: stats.successes,
      failures: stats.failures,
      isCooling: timeLeft > 0,
      cooldownRemaining: timeLeft > 0 ? `${Math.ceil(timeLeft / 1000)}s` : '0s'
    };
  });
}