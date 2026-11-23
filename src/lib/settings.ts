import type { ProviderInfo, ProviderSettings, Settings } from '../types'

const META_KEY = 'nexus.settings.v2'
const KEY_KEY = 'nexus.keys.v1'

export const DEFAULT_SETTINGS: Settings = { active: 'zai', providers: {} }

type StoredMeta = {
  active?: string
  providers?: Record<string, { model?: string; baseUrl?: string }>
}

/**
 * Model choices persist in localStorage. API keys live only in sessionStorage
 * and are cleared when the tab closes.
 */
export function loadSettings(): Settings {
  const settings: Settings = { active: DEFAULT_SETTINGS.active, providers: {} }

  try {
    const raw = localStorage.getItem(META_KEY)
    if (raw) {
      const meta = JSON.parse(raw) as StoredMeta
      if (typeof meta.active === 'string' && meta.active) settings.active = meta.active
      for (const [id, value] of Object.entries(meta.providers ?? {})) {
        settings.providers[id] = {
          model: typeof value?.model === 'string' ? value.model : undefined,
          baseUrl: typeof value?.baseUrl === 'string' ? value.baseUrl : undefined,
        }
      }
    }
  } catch {
    /* storage unavailable */
  }

  try {
    const rawKeys = sessionStorage.getItem(KEY_KEY)
    if (rawKeys) {
      const keys = JSON.parse(rawKeys) as Record<string, string>
      for (const [id, key] of Object.entries(keys)) {
        if (typeof key !== 'string' || !key) continue
        settings.providers[id] = { ...(settings.providers[id] ?? {}), apiKey: key }
      }
    }
  } catch {
    /* storage unavailable */
  }

  return settings
}

export function saveSettings(settings: Settings): void {
  try {
    const providers: StoredMeta['providers'] = {}
    for (const [id, value] of Object.entries(settings.providers)) {
      providers[id] = { model: value.model, baseUrl: value.baseUrl }
    }
    localStorage.setItem(META_KEY, JSON.stringify({ active: settings.active, providers }))
  } catch {
    /* ignore */
  }

  try {
    const keys: Record<string, string> = {}
    for (const [id, value] of Object.entries(settings.providers)) {
      if (value.apiKey) keys[id] = value.apiKey
    }
    sessionStorage.setItem(KEY_KEY, JSON.stringify(keys))
  } catch {
    /* ignore */
  }
}

export function providerModel(settings: Settings, provider?: ProviderInfo): string {
  const override = settings.providers[provider?.id ?? '']?.model
  return override || provider?.model || ''
}

export function providerLinked(settings: Settings, provider: ProviderInfo): boolean {
  return Boolean(provider.serverKey || settings.providers[provider.id]?.apiKey) || !provider.requiresKey
}

/**
 * True when the provider can answer without anything else running here: a key
 * is present, it is a free hosted tier, or the user pointed a custom endpoint
 * somewhere. Local runtimes such as Ollama are deliberately excluded — a
 * clean install has nothing listening on their port.
 */
export function providerReady(settings: Settings, provider: ProviderInfo): boolean {
  return Boolean(
    provider.serverKey ||
      settings.providers[provider.id]?.apiKey ||
      provider.free ||
      (provider.id === 'custom' && settings.providers.custom?.baseUrl),
  )
}

export function targetFor(settings: Settings, provider: ProviderInfo): {
  provider: string
  model: string
  baseUrl: string
  apiKey: string
} {
  const value: ProviderSettings = settings.providers[provider.id] ?? {}
  return {
    provider: provider.id,
    model: value.model || provider.model,
    baseUrl: value.baseUrl || provider.baseUrl,
    apiKey: value.apiKey ?? '',
  }
}
