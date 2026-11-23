import express from 'express'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const PORT = Number(process.env.PORT ?? 3000)
const HOST = process.env.HOST ?? '0.0.0.0'
const IS_PROD = process.env.NODE_ENV === 'production'

// Load server-side keys from .env when present (Node 20.12+).
try {
  process.loadEnvFile?.(path.join(ROOT, '.env'))
} catch {
  /* no .env file */
}

/* ----------------------------------------------------------------------------
 * Provider mesh. Every provider is reachable with an API key supplied by the
 * browser (session only) or by the server environment. Nothing is logged.
 * -------------------------------------------------------------------------- */
const PROVIDERS = [
  {
    id: 'zai',
    name: 'Z.ai',
    dialect: 'openai',
    baseUrl: 'https://api.z.ai/api/paas/v4',
    model: 'glm-4.6',
    env: ['NEXUS_API_KEY', 'ZAI_API_KEY'],
  },
  {
    id: 'openai',
    name: 'OpenAI',
    dialect: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    env: ['OPENAI_API_KEY'],
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    dialect: 'anthropic',
    baseUrl: 'https://api.anthropic.com/v1',
    model: 'claude-sonnet-4-5',
    env: ['ANTHROPIC_API_KEY'],
  },
  {
    id: 'google',
    name: 'Google Gemini',
    dialect: 'google',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    model: 'gemini-2.5-flash',
    env: ['GOOGLE_API_KEY', 'GEMINI_API_KEY'],
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    dialect: 'openai',
    baseUrl: 'https://openrouter.ai/api/v1',
    model: 'openrouter/auto',
    env: ['OPENROUTER_API_KEY'],
  },
  {
    id: 'groq',
    name: 'Groq',
    dialect: 'openai',
    baseUrl: 'https://api.groq.com/openai/v1',
    model: 'llama-3.3-70b-versatile',
    env: ['GROQ_API_KEY'],
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    dialect: 'openai',
    baseUrl: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
    env: ['DEEPSEEK_API_KEY'],
  },
  {
    id: 'mistral',
    name: 'Mistral',
    dialect: 'openai',
    baseUrl: 'https://api.mistral.ai/v1',
    model: 'mistral-large-latest',
    env: ['MISTRAL_API_KEY'],
  },
  {
    id: 'pollinations',
    name: 'Pollinations (free)',
    dialect: 'openai',
    baseUrl: 'https://text.pollinations.ai/openai',
    endpoint: 'https://text.pollinations.ai/openai',
    model: 'openai-fast',
    env: [],
    requiresKey: false,
  },
  {
    id: 'ollama',
    name: 'Ollama',
    dialect: 'openai',
    baseUrl: 'http://localhost:11434/v1',
    model: 'llama3.1',
    env: [],
    requiresKey: false,
  },
  {
    id: 'custom',
    name: 'Custom endpoint',
    dialect: 'openai',
    baseUrl: '',
    model: '',
    env: [],
  },
]

const MODES = new Set(['auto', 'chat', 'code', 'design', 'answer'])
const MAX_MESSAGES = 30
const MAX_CHARS = 12000

const PERSONA = `You are NEXUS, a personal AI console. You are precise, calm and quietly competent, with a faintly British butler manner. Dry wit is welcome, but never at the expense of the answer. Address the user as "sir" only occasionally. Never invent results, never claim to have run code you did not run, and say plainly when you are unsure or your knowledge may be stale.`

const MODE_PROMPTS = {
  auto: `${PERSONA}

Detect what the user needs in this turn and deliver it in the matching form:
- build/code request → complete, runnable code in fenced blocks with language tags;
- visual or interface request → at most two sentences of rationale, then exactly one self-contained \`\`\`html preview block;
- factual question → the answer first, then only the detail that earns its place;
- otherwise → natural conversation, a few sentences unless more is asked.
No filler, no restating the question.`,

  chat: `${PERSONA}

Conversational mode. Reply in a few sentences unless the user asks for depth. Be present and direct; ask a clarifying question only when you genuinely cannot proceed. No headings, no bullet lists unless the content demands them.`,

  code: `${PERSONA}

ENGINEERING mode. Solve the problem in complete, runnable code.
- One fenced block per file, language tag, short path comment on the first line.
- No placeholders, no "unchanged", no "..." elisions. Real imports, real error handling.
- State assumptions in one line before the code, then at most four short bullets after it covering how to run it and what to watch.
- If the request is ambiguous in a way that changes the implementation, choose the most reasonable reading, say so, and proceed.`,

  design: `${PERSONA}

DESIGN mode. When the user asks for an interface, component, page, poster or visual identity:
1. Give at most two sentences on the concept and the choices that matter.
2. Emit exactly one fenced \`\`\`html block containing a complete, self-contained document (doctype, inline <style>, inline <script> if needed). It must render standalone with no external fonts, images, CDNs or network calls — use CSS, inline SVG or emoji.
3. Make it responsive to 360px, with real copy rather than lorem ipsum unless asked.

Default aesthetic: dark holographic HUD, cyan and teal accents, thin rules, generous negative space, confident typography. Deviate when the user specifies a direction. Nothing after the html block.`,

  answer: `${PERSONA}

ANALYST mode. Lead with the answer in the first sentence. Then the supporting reasoning in tight prose or short bullets. Separate fact from inference, flag uncertainty, and never pad. Use headings only when the answer has more than three parts.`,
}

const LANGUAGE_RULE = `

Language: reply in the language the user is using. If they write or speak Filipino/Tagalog, answer in natural conversational Filipino/Tagalog (Taglish is fine) — never switch a Tagalog turn into English unless they ask you to. Otherwise match their language.`

const SPEECH_STYLE = `

The user is listening to this reply spoken aloud in a live voice conversation. Write natural speech only: no Markdown, no headings, no bullet lists, no code blocks unless they explicitly ask for code; short sentences, contractions, no stage directions, at most 120 words unless they ask for detail. Sound like a thoughtful person talking, not a document read out. Their words arrive via speech recognition, so infer intent rather than nitpicking transcription errors.`

const VERIFY_PROMPT = `You are a second-opinion reviewer inside a personal AI console. Another assistant answered the user's question below. Check that answer for factual errors, missing constraints, risky assumptions and incompleteness.

Reply exactly in this shape:
VERDICT: <sound | mostly sound | needs correction>
- up to four short bullets with corrections, additions or caveats
CONFIDENCE: <one short line>

Be specific and brief. Do not restate the whole answer, do not pad, and do not invent sources.`

/* ----------------------------------------------------------------------------
 * Helpers
 * -------------------------------------------------------------------------- */
const cleanBase = (value) => String(value ?? '').trim().replace(/\/+$/, '')
const isHttpUrl = (value) => /^https?:\/\//i.test(value)

function apiKeyFor(meta) {
  for (const name of meta.env ?? []) {
    const value = process.env[name]
    if (value) return value
  }
  return ''
}

function resolveProvider(id, body = {}) {
  const meta = PROVIDERS.find((provider) => provider.id === id)
  if (!meta) return null

  const apiKey = String(body.apiKey ?? '').trim() || apiKeyFor(meta)
  const baseUrl = cleanBase(
    String(body.baseUrl ?? '').trim() ||
      (meta.id === 'zai' ? process.env.NEXUS_BASE_URL : '') ||
      meta.baseUrl,
  )
  const model = String(body.model ?? '').trim() || (meta.id === 'zai' ? process.env.NEXUS_MODEL : '') || meta.model
  const requiresKey = meta.requiresKey !== false && meta.id !== 'custom'
  // Providers with a fixed full endpoint (not a /v1 base) keep it unless the
  // user supplies a different base URL.
  const customBase = String(body.baseUrl ?? '').trim()
  const endpoint = !customBase || customBase === meta.baseUrl ? (meta.endpoint ?? '') : ''

  return { ...meta, apiKey, baseUrl, model, requiresKey, endpoint }
}

function providerError(meta) {
  if (!isHttpUrl(meta.baseUrl)) return 'That provider needs a valid base URL (http:// or https://).'
  if (!meta.model) return 'That provider needs a model name.'
  if (meta.requiresKey && !meta.apiKey) return `${meta.name} needs an API key. Open MODELS to link it.`
  return ''
}

function chatEndpoint(baseUrl) {
  return /\/chat\/completions$/.test(baseUrl) ? baseUrl : `${baseUrl}/chat/completions`
}

function buildRequest(provider, system, messages, { stream, temperature, maxTokens }) {
  if (provider.dialect === 'anthropic') {
    return {
      url: `${provider.baseUrl}/messages`,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': provider.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: {
        model: provider.model,
        system,
        max_tokens: maxTokens ?? 8192,
        temperature,
        stream,
        messages: messages.map((message) => ({
          role: message.role,
          content: message.content,
        })),
      },
    }
  }

  if (provider.dialect === 'google') {
    const action = stream ? 'streamGenerateContent' : 'generateContent'
    const query = stream ? `?alt=sse&key=${encodeURIComponent(provider.apiKey)}` : `?key=${encodeURIComponent(provider.apiKey)}`
    return {
      url: `${provider.baseUrl}/models/${encodeURIComponent(provider.model)}:${action}${query}`,
      headers: { 'Content-Type': 'application/json' },
      body: {
        systemInstruction: { parts: [{ text: system }] },
        contents: messages.map((message) => ({
          role: message.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: message.content }],
        })),
        generationConfig: { temperature, maxOutputTokens: maxTokens ?? 8192 },
      },
    }
  }

  return {
    url: provider.endpoint || chatEndpoint(provider.baseUrl),
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
      ...(provider.apiKey ? { Authorization: `Bearer ${provider.apiKey}` } : {}),
    },
    body: {
      model: provider.model,
      stream,
      temperature,
      ...(maxTokens ? { max_tokens: maxTokens } : {}),
      messages: [{ role: 'system', content: system }, ...messages],
    },
  }
}

function streamDelta(dialect, json) {
  if (dialect === 'anthropic') {
    if (json?.type === 'content_block_delta') return json.delta?.text ?? null
    return null
  }
  if (dialect === 'google') {
    const parts = json?.candidates?.[0]?.content?.parts
    if (!Array.isArray(parts)) return null
    const text = parts.map((part) => part.text ?? '').join('')
    return text || null
  }
  return json?.choices?.[0]?.delta?.content ?? null
}

function messageText(dialect, json) {
  if (dialect === 'anthropic') {
    return (json?.content ?? [])
      .filter((block) => block?.type === 'text')
      .map((block) => block.text)
      .join('')
  }
  if (dialect === 'google') {
    return (json?.candidates?.[0]?.content?.parts ?? []).map((part) => part.text ?? '').join('')
  }
  return json?.choices?.[0]?.message?.content ?? ''
}

function upstreamDetail(dialect, text) {
  try {
    const parsed = JSON.parse(text)
    if (dialect === 'google') {
      return parsed?.error?.message ?? parsed?.[0]?.error?.message ?? ''
    }
    return parsed?.error?.message ?? parsed?.message ?? ''
  } catch {
    return text
  }
}

function friendlyStatus(status, detail, name, retryAfter = 0) {
  if (status === 401 || status === 403) return `${name} rejected that API key.`
  if (status === 404) return `${name} could not find that model or endpoint. Check the model name.`
  if (status === 402 || status === 429) {
    const retry =
      retryAfter || Number(/retry after (\d+)\s*s/i.exec(detail)?.[1] ?? 0)
    const wait = retry > 0 ? ` Next reply in ${retry}s.` : ''
    return `${name} is rate limiting requests from this IP.${wait} Link a key to remove the wait.`
  }
  if (status === 400) return `${name} rejected the request${detail ? `: ${detail}` : '.'}`
  return `${name} returned ${status}${detail ? `: ${detail}` : '.'}`
}

const readMessages = (incoming) =>
  (Array.isArray(incoming) ? incoming : [])
    .filter(
      (message) =>
        message &&
        (message.role === 'user' || message.role === 'assistant') &&
        typeof message.content === 'string' &&
        message.content.trim().length > 0,
    )
    .slice(-MAX_MESSAGES)
    .map((message) => ({
      role: message.role,
      content: String(message.content).slice(0, MAX_CHARS),
    }))

/* ----------------------------------------------------------------------------
 * App
 * -------------------------------------------------------------------------- */
const app = express()
app.disable('x-powered-by')
app.use(express.json({ limit: '1mb' }))
app.use('/api', (_req, res, next) => {
  res.set('Cache-Control', 'no-store')
  next()
})

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, uptime: Math.round(process.uptime()) })
})

const publicProvider = (provider) => ({
  id: provider.id,
  name: provider.name,
  dialect: provider.dialect,
  baseUrl: provider.baseUrl,
  model: provider.model,
  serverKey: Boolean(apiKeyFor(provider)),
  requiresKey: provider.requiresKey !== false && provider.id !== 'custom',
  free: Boolean(provider.endpoint && !(provider.requiresKey !== false)),
})

app.post('/api/probe', async (req, res) => {
  if (rateLimited(req.ip ?? 'unknown')) {
    res.status(429).json({ error: 'Too many requests. Give it a moment.' })
    return
  }

  const body = req.body ?? {}
  const provider = resolveProvider(String(body.provider ?? ''), body)
  if (!provider) {
    res.status(400).json({ error: 'Unknown provider.' })
    return
  }

  const problem = providerError(provider)
  if (problem) {
    res.status(400).json({ error: problem })
    return
  }

  const request = buildRequest(
    provider,
    'You are a connectivity probe. Reply with exactly: OK',
    [{ role: 'user', content: 'ping' }],
    { stream: false, temperature: 0, maxTokens: 16 },
  )

  const controller = new AbortController()
  res.on('close', () => {
    if (!res.writableEnded) controller.abort()
  })
  const signal =
    AbortSignal.any?.([controller.signal, AbortSignal.timeout(30_000)]) ?? controller.signal

  try {
    const upstream = await fetch(request.url, {
      method: 'POST',
      signal,
      headers: request.headers,
      body: JSON.stringify(request.body),
    })

    if (!upstream.ok) {
      let detail = ''
      try {
        detail = upstreamDetail(provider.dialect, await upstream.text()).slice(0, 200)
      } catch {
        /* ignore */
      }
      res.status(502).json({ error: friendlyStatus(upstream.status, detail, provider.name) })
      return
    }

    const json = await upstream.json()
    const text = messageText(provider.dialect, json).trim()
    res.json({
      ok: true,
      provider: provider.name,
      providerId: provider.id,
      model: provider.model,
      reply: text.slice(0, 80),
    })
  } catch (error) {
    const timedOut = error?.name === 'TimeoutError' || error?.name === 'AbortError'
    res.status(502).json({
      error: timedOut
        ? `${provider.name} did not answer in time.`
        : `Could not reach ${provider.name}. Check the base URL and your connection.`,
    })
  }
})

app.get('/api/providers', (_req, res) => {
  const providers = PROVIDERS.map(publicProvider)
  res.json({
    providers,
    modes: [...MODES],
    serverLinked: providers.filter((provider) => provider.serverKey).length,
  })
})

app.get('/api/config', (_req, res) => {
  const providers = PROVIDERS.map(publicProvider)
  res.json({
    providers,
    modes: [...MODES],
    serverKey: providers.some((provider) => provider.serverKey),
    baseUrl: providers[0].baseUrl,
    model: providers[0].model,
  })
})

const hits = new Map()
function rateLimited(key) {
  const now = Date.now()
  const recent = (hits.get(key) ?? []).filter((time) => now - time < 60_000)
  recent.push(now)
  hits.set(key, recent)
  if (hits.size > 500) hits.clear()
  return recent.length > 40
}

app.post('/api/chat', async (req, res) => {
  if (rateLimited(req.ip ?? 'unknown')) {
    res.status(429).json({ error: 'Too many requests. Give it a moment.' })
    return
  }

  const body = req.body ?? {}
  const mode = MODES.has(body.mode) ? body.mode : 'auto'
  const provider = resolveProvider(String(body.provider ?? 'zai'), body)

  if (!provider) {
    res.status(400).json({ error: 'Unknown provider.' })
    return
  }

  const problem = providerError(provider)
  if (problem) {
    res.status(400).json({ error: problem })
    return
  }

  const messages = readMessages(body.messages)
  if (messages.length === 0) {
    res.status(400).json({ error: 'Nothing to send.' })
    return
  }

  const spoken = body.speech === true && mode !== 'design' && mode !== 'code'
  const VOICE_DEADLINE_MS = 15_000
  const system = `${MODE_PROMPTS[mode]}${LANGUAGE_RULE}${spoken ? SPEECH_STYLE : ''}

Today's date is ${new Date().toISOString().slice(0, 10)}. Respond in Markdown.`
  const temperature = mode === 'code' ? 0.2 : mode === 'design' ? 0.7 : 0.6
  const request = buildRequest(provider, system, messages, { stream: true, temperature })

  const controller = new AbortController()
  // `req` closes as soon as its body is read, so watch the response instead and
  // only abort when the client goes away before we finished writing.
  res.on('close', () => {
    if (!res.writableEnded) controller.abort()
  })
  const signal =
    AbortSignal.any?.([controller.signal, AbortSignal.timeout(180_000)]) ?? controller.signal

  // A spoken turn must start producing words within 15 seconds, or it is not a
  // conversation any more. Long-form code/design turns keep the 3-minute cap.
  let firstToken = false
  let voiceDeadline = false
  const deadline = spoken
    ? setTimeout(() => {
        if (firstToken || res.writableEnded) return
        voiceDeadline = true
        controller.abort()
      }, VOICE_DEADLINE_MS)
    : null

  let upstream
  try {
    upstream = await fetch(request.url, {
      method: 'POST',
      signal,
      headers: request.headers,
      body: JSON.stringify(request.body),
    })
  } catch (error) {
    if (deadline) clearTimeout(deadline)
    const timedOut = error?.name === 'TimeoutError' || error?.name === 'AbortError'
    res.status(voiceDeadline ? 504 : 502).json({
      error: voiceDeadline
        ? `Voice reply did not start within 15s. Try again, or link a faster model.`
        : timedOut
          ? `${provider.name} took too long to respond.`
          : `Could not reach ${provider.name} (${provider.baseUrl}).`,
    })
    return
  }

  if (!upstream.ok || !upstream.body) {
    if (deadline) clearTimeout(deadline)
    let detail = ''
    try {
      detail = upstreamDetail(provider.dialect, await upstream.text()).slice(0, 300)
    } catch {
      /* ignore */
    }
    res.status(502).json({
      error: friendlyStatus(
        upstream.status,
        detail,
        provider.name,
        Number(upstream.headers.get('retry-after') ?? '') || 0,
      ),
      provider: provider.id,
    })
    return
  }

  res.status(200)
  res.set({
    'Content-Type': 'application/x-ndjson; charset=utf-8',
    'Cache-Control': 'no-store, no-transform',
    'X-Accel-Buffering': 'no',
    'X-Nexus-Provider': provider.id,
    'X-Nexus-Model': encodeURIComponent(provider.model),
  })

  const send = (event) => {
    if (!res.writableEnded) res.write(`${JSON.stringify(event)}\n`)
  }

  send({ t: 'meta', provider: provider.name, providerId: provider.id, model: provider.model })

  const reader = upstream.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (!firstToken) {
        firstToken = true
        if (deadline) clearTimeout(deadline)
      }
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const rawLine of lines) {
        const line = rawLine.trim()
        if (!line.startsWith('data:')) continue
        const data = line.slice(5).trim()
        if (!data || data === '[DONE]') continue
        try {
          const delta = streamDelta(provider.dialect, JSON.parse(data))
          if (typeof delta === 'string' && delta.length > 0) send({ t: 'd', d: delta })
        } catch {
          /* keep-alive frame */
        }
      }
    }
    send({ t: 'done' })
  } catch (error) {
    if (voiceDeadline) {
      send({
        t: 'e',
        message: 'Voice reply did not start within 15s. Try again, or link a faster model.',
      })
    } else if (error?.name !== 'AbortError') {
      send({ t: 'e', message: `${provider.name} interrupted the stream.` })
    }
  } finally {
    if (deadline) clearTimeout(deadline)
    res.end()
  }
})

app.post('/api/verify', async (req, res) => {
  if (rateLimited(req.ip ?? 'unknown')) {
    res.status(429).json({ error: 'Too many requests. Give it a moment.' })
    return
  }

  const body = req.body ?? {}
  const provider = resolveProvider(String(body.provider ?? ''), body)
  if (!provider) {
    res.status(400).json({ error: 'Choose a model to cross-check with.' })
    return
  }

  const problem = providerError(provider)
  if (problem) {
    res.status(400).json({ error: problem })
    return
  }

  const question = String(body.question ?? '').slice(0, MAX_CHARS)
  const answer = String(body.answer ?? '').slice(0, MAX_CHARS)
  if (!question.trim() || !answer.trim()) {
    res.status(400).json({ error: 'Nothing to verify.' })
    return
  }

  const messages = [
    { role: 'user', content: `QUESTION:\n${question}\n\nANSWER TO REVIEW:\n${answer}` },
  ]
  const request = buildRequest(provider, VERIFY_PROMPT, messages, {
    stream: false,
    temperature: 0.2,
  })

  const controller = new AbortController()
  res.on('close', () => {
    if (!res.writableEnded) controller.abort()
  })
  const signal =
    AbortSignal.any?.([controller.signal, AbortSignal.timeout(120_000)]) ?? controller.signal

  try {
    const upstream = await fetch(request.url, {
      method: 'POST',
      signal,
      headers: request.headers,
      body: JSON.stringify(request.body),
    })

    if (!upstream.ok) {
      let detail = ''
      try {
        detail = upstreamDetail(provider.dialect, await upstream.text()).slice(0, 300)
      } catch {
        /* ignore */
      }
      res.status(502).json({ error: friendlyStatus(upstream.status, detail, provider.name) })
      return
    }

    const json = await upstream.json()
    const text = messageText(provider.dialect, json).trim()
    if (!text) {
      res.status(502).json({ error: `${provider.name} returned an empty review.` })
      return
    }

    res.json({ text, provider: provider.name, providerId: provider.id, model: provider.model })
  } catch (error) {
    const timedOut = error?.name === 'TimeoutError' || error?.name === 'AbortError'
    res.status(502).json({
      error: timedOut
        ? `${provider.name} took too long to respond.`
        : `Could not reach ${provider.name}.`,
    })
  }
})

app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'Not found' })
})

// eslint-disable-next-line no-unused-vars
app.use((error, _req, res, _next) => {
  const message = error?.type === 'entity.too.large' ? 'Message too large.' : 'Bad request.'
  res.status(400).json({ error: message })
})

/* ----------------------------------------------------------------------------
 * Frontend
 * -------------------------------------------------------------------------- */
if (!IS_PROD) {
  const { createServer } = await import('vite')
  const vite = await createServer({
    root: ROOT,
    appType: 'custom',
    server: {
      middlewareMode: true,
      host: HOST,
      allowedHosts: (process.env.NEXUS_ALLOWED_HOSTS ?? '')
        .split(',')
        .map((host) => host.trim())
        .filter(Boolean),
    },
  })
  app.use(vite.middlewares)
  app.use(async (req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api')) return next()
    try {
      const template = await fs.readFile(path.join(ROOT, 'index.html'), 'utf-8')
      const html = await vite.transformIndexHtml(req.originalUrl, template)
      res.status(200).set('Content-Type', 'text/html').end(html)
    } catch (error) {
      vite.ssrFixStacktrace(error)
      next(error)
    }
  })
} else {
  const dist = path.join(ROOT, 'dist')
  app.use(express.static(dist, { index: false, maxAge: '1h' }))
  app.use((req, res, next) => {
    if (req.method !== 'GET') return next()
    res.sendFile(path.join(dist, 'index.html'))
  })
}

const server = app.listen(PORT, HOST, () => {
  console.log(`NEXUS online → http://${HOST}:${PORT} ${IS_PROD ? '(production)' : '(dev)'}`)
  const linked = PROVIDERS.filter((provider) => apiKeyFor(provider)).length
  console.log(`provider mesh → ${PROVIDERS.length} available · ${linked} linked by environment`)
})

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    server.close(() => process.exit(0))
    setTimeout(() => process.exit(0), 2000).unref()
  })
}
