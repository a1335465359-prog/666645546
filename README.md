# Backend API Proxy

A robust, failover-capable API proxy for AI Model interaction (Gemini/OpenAI), deployed on Vercel Serverless.

## Features

- **Multi-Key Load Balancing**: Round-robin selection of `GEMINI_API_KEY1`...`5`.
- **Automatic Failover**: Retries on 5xx errors or network timeouts.
- **Rate Limit Handling**: Detects 429 errors, puts the specific key on cooldown (default 60s), and instantly retries with a fresh key.
- **Standardized Interface**: Front-end calls `/api/generate`, backend handles upstream complexity.

## Environment Variables (Vercel)

Configure these in your Vercel Project Settings:

| Variable | Description | Default |
| :--- | :--- | :--- |
| `GEMINI_API_KEY1`..`5` | Your API Keys. At least one is required. | - |
| `MODEL_API_URL` | Upstream API Endpoint. For Gemini keys via OpenAI format, use `https://generativelanguage.googleapis.com/v1beta/openai/chat/completions`. | `https://api.openai.com/v1/chat/completions` |
| `ADMIN_TOKEN` | Token for accessing `/api/debug-keys`. | - |
| `REQUEST_TIMEOUT_MS` | Max duration for upstream request. | `10000` |
| `KEY_COOLDOWN_MS` | Time to pause a key after 429 or repeated failure. | `60000` |
| `MAX_RETRIES` | Max retry attempts per request. | `2` |

## API Usage

### POST /api/generate

**Request:**
```json
{
  "prompt": "Hello world",
  "system": "You are a helpful assistant", 
  "model": "gemini-1.5-pro",
  "temperature": 0.7
}
```

**Response (Success):**
```json
{
  "ok": true,
  "data": { ...OpenAI Style Response... }
}
```

**Response (Error):**
```json
{
  "ok": false,
  "error": "all_retries_failed",
  "lastError": "timeout"
}
```

## Testing

Use the included `tests/e2e.sh` script or curl:

```bash
# Test Success
curl -X POST http://localhost:3000/api/generate \
  -H "Content-Type: application/json" \
  -d '{"prompt":"Hi", "model":"gemini-1.5-pro"}'
```

## Known Limitations

- **Statelessness**: Vercel Serverless functions (lambdas) may spin down. The in-memory key state (failures/cooldowns) persists only while the container is warm. For strict persistent state, use Vercel KV (Redis).
