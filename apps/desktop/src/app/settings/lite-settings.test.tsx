import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const getHermesConfigRecord = vi.fn()
const getMessagingPlatforms = vi.fn()
const saveHermesConfig = vi.fn()
const updateMessagingPlatform = vi.fn()
const testMessagingPlatform = vi.fn()
const notify = vi.fn()
const notifyError = vi.fn()
const runGatewayRestart = vi.fn()

const lite = {
  title: 'Lite setup',
  intro: 'Lite intro',
  statusReady: 'Ready',
  statusNeedsSetup: 'Needs setup',
  loading: 'Loading Lite setup...',
  save: 'Save Lite setup',
  saving: 'Saving...',
  savedTitle: 'Lite setup saved',
  savedMessage: 'Saved.',
  saveFailed: 'Save failed',
  restartGateway: 'Restart gateway',
  testQqbot: 'Test QQbot',
  testingQqbot: 'Testing...',
  qqbotTestOk: 'QQbot ok',
  qqbotTestFailed: 'QQbot failed',
  cards: {
    core: { title: 'Core', description: 'Core desc', status: 'Core status' },
    desktop: { title: 'Desktop', description: 'Desktop desc', status: 'Desktop status' },
    voice: { title: 'Voice', description: 'Voice desc', status: 'Voice status' },
    qqbot: { title: 'QQbot', description: 'QQbot desc', status: 'QQbot status' }
  },
  voice: {
    title: 'Voice conversation',
    description: 'Voice description',
    stt: 'Speech-to-text',
    sttDesc: 'STT description',
    tts: 'Read replies aloud',
    ttsDesc: 'TTS description'
  },
  qqbot: {
    title: 'QQbot remote control',
    description: 'QQ description',
    enable: 'Enable QQbot',
    enableDesc: 'Enable description',
    appId: 'QQ App ID',
    appIdPlaceholder: 'Paste QQ_APP_ID',
    clientSecret: 'QQ Client Secret',
    clientSecretPlaceholder: 'Leave blank to keep the saved secret',
    ownerAllowlist: 'Owner allowlist',
    ownerAllowlistPlaceholder: 'QQ openid values, comma-separated',
    groupAllowlist: 'Group allowlist',
    groupAllowlistPlaceholder: 'Group/guild IDs, comma-separated',
    allowAll: 'Allow all QQ users',
    allowAllDesc: 'Testing only',
    savedCredential: 'saved',
    openMessaging: 'Open full messaging settings'
  },
  safety: {
    title: 'Safety defaults',
    items: ['Owner allowlist', 'Approvals stay on', 'Secrets use APIs']
  }
}

vi.mock('@/hermes', () => ({
  getHermesConfigRecord: () => getHermesConfigRecord(),
  getMessagingPlatforms: () => getMessagingPlatforms(),
  saveHermesConfig: (config: unknown) => saveHermesConfig(config),
  testMessagingPlatform: (platformId: string) => testMessagingPlatform(platformId),
  updateMessagingPlatform: (platformId: string, body: unknown) => updateMessagingPlatform(platformId, body)
}))

vi.mock('@/i18n', () => ({
  useI18n: () => ({ t: { settings: { lite } } })
}))

vi.mock('@/store/notifications', () => ({
  notify: (...args: unknown[]) => notify(...args),
  notifyError: (...args: unknown[]) => notifyError(...args)
}))

vi.mock('@/store/system-actions', () => ({
  runGatewayRestart: () => runGatewayRestart()
}))

beforeEach(() => {
  getHermesConfigRecord.mockResolvedValue({ stt: { enabled: false }, voice: { auto_tts: false } })
  getMessagingPlatforms.mockResolvedValue({
    platforms: [
      {
        id: 'qqbot',
        name: 'QQBot',
        enabled: false,
        configured: false,
        description: '',
        docs_url: '',
        env_vars: [
          {
            key: 'QQ_APP_ID',
            is_set: false,
            is_password: false,
            redacted_value: null,
            advanced: false,
            description: '',
            prompt: '',
            required: true,
            url: null
          },
          {
            key: 'QQ_CLIENT_SECRET',
            is_set: false,
            is_password: true,
            redacted_value: null,
            advanced: false,
            description: '',
            prompt: '',
            required: true,
            url: null
          }
        ],
        gateway_running: false
      }
    ]
  })
  saveHermesConfig.mockResolvedValue({ ok: true })
  updateMessagingPlatform.mockResolvedValue({ ok: true, platform: 'qqbot' })
  testMessagingPlatform.mockResolvedValue({ ok: true, message: 'ok' })
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

async function renderLiteSettings() {
  const { LiteSettings } = await import('./lite-settings')

  return render(
    <MemoryRouter>
      <LiteSettings />
    </MemoryRouter>
  )
}

describe('LiteSettings', () => {
  it('saves voice config and QQbot quick setup through existing APIs', async () => {
    await renderLiteSettings()

    await screen.findByText('Lite setup')

    const switches = screen.getAllByRole('switch')
    fireEvent.click(switches[0])
    fireEvent.click(switches[1])
    fireEvent.click(switches[2])

    fireEvent.change(screen.getByPlaceholderText('Paste QQ_APP_ID'), { target: { value: 'app-123' } })
    fireEvent.change(screen.getByPlaceholderText('Leave blank to keep the saved secret'), {
      target: { value: 'secret-123' }
    })
    fireEvent.change(screen.getByPlaceholderText('QQ openid values, comma-separated'), {
      target: { value: 'owner-a,owner-b' }
    })

    fireEvent.click(screen.getByRole('button', { name: 'Save Lite setup' }))

    await waitFor(() =>
      expect(saveHermesConfig).toHaveBeenCalledWith({
        stt: { enabled: true },
        voice: { auto_tts: true }
      })
    )

    expect(updateMessagingPlatform).toHaveBeenCalledWith('qqbot', {
      enabled: true,
      env: expect.objectContaining({
        QQ_ALLOW_ALL_USERS: '0',
        QQ_ALLOWED_USERS: 'owner-a,owner-b',
        QQ_APP_ID: 'app-123',
        QQ_CLIENT_SECRET: 'secret-123'
      })
    })
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ title: 'Lite setup saved' }))
  })
})
