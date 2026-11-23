# NEXUS

A JARVIS-style personal AI console: streaming conversation, voice in and out,
distinct **Auto / Code / Design / Answer** modes, and a mesh of interchangeable
AI models — wrapped in a holographic HUD.

Design mode returns a single self-contained HTML document, rendered live in a
sandboxed preview that can be toggled between desktop and phone widths.

## Run

```bash
npm install
npm run dev        # http://localhost:3000
```

Production:

```bash
npm run build
npm start
```

## The model mesh

Nexus routes each request to the model you select, so you can keep one provider
for code, another for design, and compare answers.

| Provider | Dialect | Default model |
| --- | --- | --- |
| Z.ai | OpenAI-compatible | `glm-4.6` |
| OpenAI | OpenAI-compatible | `gpt-4o-mini` |
| Anthropic | Messages API | `claude-sonnet-4-5` |
| Google Gemini | Gemini API | `gemini-2.5-flash` |
| OpenRouter | OpenAI-compatible | `openrouter/auto` |
| Groq | OpenAI-compatible | `llama-3.3-70b-versatile` |
| DeepSeek | OpenAI-compatible | `deepseek-chat` |
| Mistral | OpenAI-compatible | `mistral-large-latest` |
| Pollinations | OpenAI-compatible, no key | `openai-fast` |
| Ollama | OpenAI-compatible, local | `llama3.1` |
| Custom | OpenAI-compatible | anything |

### Works with zero setup

Pollinations is a free, anonymous tier. Nexus selects it automatically on first
run when no key is configured, so the console answers out of the box. It is
limited to roughly **one reply every 45 seconds per IP** and is public — don't
send private material through it. That cooldown is enforced by Pollinations and
cannot be shortened here; a voice conversation needs a reply every few seconds,
so link any provider key in MODELS or `.env` (Gemini, Groq and Z.ai all have free
tiers). Spoken turns are capped at **15 seconds to first words**; longer code or
design turns keep the larger limit.

### Test any link

Open **MODELS**, pick a provider, fill the fields and press **TEST LINK**. Nexus
sends one tiny probe through the same code path as a real turn and reports
`Connected · model` or the exact provider error. Nothing is saved until ENGAGE.

Link providers in the **MODELS** panel (header, sidebar, or ⌘K / Ctrl+K). A
provider is *linked* when the server has a key for it or you pasted one.

- Server keys: copy `.env.example` to `.env` and fill in whichever you have. The
  server loads `.env` on boot (`process.loadEnvFile`).
- Per-tab keys: paste into MODELS. Keys go to sessionStorage and to this app's
  `/api/chat` proxy only; they are never bundled, written to disk, or logged.
- Model choices persist; keys disappear when the tab closes.
- A custom endpoint needs a base URL such as `https://host/v1` and a model name.

## Second opinion

Every answer has a **SECOND OPINION** action. Pick any *other* linked model and
it reviews the answer for factual errors, missing constraints and risky
assumptions. Only the question and the answer are shared, and only when you run
the check.

## Modes

| Mode | Behaviour |
| --- | --- |
| Auto | Infers code / design / answer / chat per turn |
| Code | Complete, runnable files in fenced blocks |
| Design | Short rationale + one self-contained HTML document, live preview |
| Answer | Direct answer first, tight supporting detail |
| Chat | Natural conversation |

## Voice link

Click **CALL** in the composer (or **VOICE LINK** in the sidebar) for a hands-free
conversation:

1. Nexus listens until you stop speaking, then sends what you said.
2. Answers are spoken sentence by sentence as they stream in, so the reply starts
   before generation finishes.
3. When speech ends the mic reopens automatically — talk again to continue.
4. Tap **INTERRUPT** while Nexus is speaking to take the floor, or **END** to hang up.

Voice replies use a spoken style prompt (short sentences, no Markdown) so they
sound like conversation. Pick any installed voice in the overlay; the choice is
remembered. Push-to-talk with the mic button still works outside a call, and
**VOICE OUTPUT** speaks every reply in text chat too.

### Filipino / Tagalog

Set **LANGUAGE → Filipino / Tagalog** in the voice overlay. Recognition switches
to `fil-PH`, and synthesis prefers an installed Filipino voice; the setting is
remembered for the standalone mic button too. Nexus is instructed to answer in
the language you used, so a Tagalog turn gets a natural Tagalog (or Taglish)
reply rather than English. If no Filipino voice is installed the overlay says so
— add one in your OS or browser settings. The Web Speech API cannot auto-detect
language, so switch the selector when you change languages. Chrome and Edge
provide `fil-PH` recognition; other browsers may reject it and will say so.

Uses the browser's Web Speech API: `SpeechRecognition` for input and
`speechSynthesis` for output (British voice preferred). Chrome and Edge support
both; Firefox has no speech recognition, so the mic and call button hide there.

## Files

Use **＋ FILE** in the composer, or drop files onto it. Each file can be up to
**200 MB** (up to six files, 500 MB total per message), so 150 MB attachments
work. Files stay in the browser: Nexus reads a bounded text extract and sends
that to the model, not the whole file.

- Text, code, CSV, JSON, logs, XML and similar formats: the first 512 KB are
  read, capped at 40,000 characters per file and 60,000 per message. Bigger
  files are marked **partial**; only that extract reaches the model.
- PDFs, images, archives and other binary formats: name, type and size are sent
  as metadata only — their contents are not parsed.

The model is told the file name, type, size and whether the text was truncated.

## Controls

- **⌘K / Ctrl+K** — open the model mesh
- **Esc** — close panels, preview and cross-check
- **Enter** — send, **Shift+Enter** — new line
- **PURGE THREAD** — clear history and local storage

## Notes

- Keys are read server-side per request and never logged.
- Requests are capped at 30 messages, 12k characters each, 40/min per client.
- Conversation history is stored in `localStorage`; model choices too.
- Design previews run in a sandboxed iframe with scripts but no same-origin access.
