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
].filter(Boolean);

// 去重，防止同一个 key 配了两次
const KEYS = Array.from(new Set(RAW_KEYS));

// Configuration
const KEY_COOLDOWN_MS = parseInt(
  process.env.KEY_COOLDOWN_MS || String(10 * 60 * 1000),
  10
); // 默认 10 分钟
const MAX_FAILURES_BEFORE_COOLDOWN = parseInt(
  process.env.MAX_FAILURES_BEFORE_COOLDOWN || "3",
  10
); // 默认连续 3 次失败冷却

// State (In-memory)
let rrIndex = 0;
const keyStates = new Map();

if (KEYS.length === 0) {
  console.error(
    "[Gemini KeyManager] No API keys found. Please set GEMINI_API_KEY or GEMINI_API_KEY1~10"
  );
}

// 初始化每个 key 的状态
KEYS.forEach((key) => {
  keyStates.set(key, {
    totalUses: 0,
    successes: 0,
    failures: 0,
    cooldownUntil: 0,
  });
});

function maskKey(key) {
  if (!key || key.length < 4) return "****";
  return "..." + key.slice(-4);
}

// 轮询选 key，跳过冷却中的 key
export function pickKey() {
  if (KEYS.length === 0) return null;
  const now = Date.now();

  let selectedKey = null;

  // 1. Round-robin 找一个没在冷却的
  for (let i = 0; i < KEYS.length; i++) {
    const idx = (rrIndex + i) % KEYS.length;
    const key = KEYS[idx];
    const stats = keyStates.get(key);
    if (!stats) continue;

    if (stats.cooldownUntil <= now) {
      selectedKey = key;
      rrIndex = (idx + 1) % KEYS.length;
      break;
    }
  }

  // 2. 如果全在冷却，选一个冷却最早结束的兜底
  if (!selectedKey) {
    let bestKey = null;
    let minCooldown = Infinity;
    KEYS.forEach((key) => {
      const stats = keyStates.get(key);
      if (!stats) return;
      if (stats.cooldownUntil < minCooldown) {
        minCooldown = stats.cooldownUntil;
        bestKey = key;
      }
    });
    selectedKey = bestKey;
  }

  if (selectedKey) {
    const stats = keyStates.get(selectedKey);
    stats.totalUses += 1;
  }

  return selectedKey;
}

// 成功：重置失败 & 冷却
export function reportSuccess(key) {
  if (!key || !keyStates.has(key)) return;
  const stats = keyStates.get(key);
  stats.successes += 1;
  stats.failures = 0;
  stats.cooldownUntil = 0;
}

// 失败：失败 +1，达到阈值后进入冷却
export function reportFailure(key, opts = {}) {
  if (!key || !keyStates.has(key)) return;
  const stats = keyStates.get(key);
  const now = Date.now();

  stats.failures += 1;

  // 强制冷却（例如 429）
  if (opts.cooldownMs) {
    stats.cooldownUntil = now + opts.cooldownMs;
    return;
  }

  if (stats.failures >= MAX_FAILURES_BEFORE_COOLDOWN) {
    stats.cooldownUntil = now + KEY_COOLDOWN_MS;
  }
}

// Debug 用：查看每个 key 的状态
export function getDebug() {
  return KEYS.map((key) => {
    const stats = keyStates.get(key);
    const now = Date.now();
    const remainingMs = Math.max(0, (stats.cooldownUntil || 0) - now);
    return {
      key: maskKey(key),
      totalUses: stats.totalUses,
      successes: stats.successes,
      failures: stats.failures,
      isCooling: remainingMs > 0,
      cooldownRemainingMs: remainingMs,
    };
  });
}

export function getKeyCount() {
  return KEYS.length;
}
