import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import {
  getHermesConfigRecord,
  getMessagingPlatforms,
  saveHermesConfig,
  testMessagingPlatform,
  updateMessagingPlatform,
  type MessagingPlatformInfo
} from '@/hermes'
import { useI18n } from '@/i18n'
import { CheckCircle2, Globe, Lock, MessageCircle, Mic, Monitor, Zap } from '@/lib/icons'
import { cn } from '@/lib/utils'
import { notify, notifyError } from '@/store/notifications'
import { runGatewayRestart } from '@/store/system-actions'
import type { HermesConfigRecord, MessagingEnvVarInfo } from '@/types/hermes'

import { MESSAGING_ROUTE } from '../routes'

import { getNested, setNested } from './helpers'
import { ListRow, LoadingState, Pill, SettingsContent } from './primitives'

type CapabilityId = 'core' | 'desktop' | 'voice' | 'qqbot'

const CAPABILITIES: { id: CapabilityId; icon: typeof Zap }[] = [
  { id: 'core', icon: Zap },
  { id: 'desktop', icon: Monitor },
  { id: 'voice', icon: Mic },
  { id: 'qqbot', icon: MessageCircle }
]

interface LiteForm {
  appId: string
  clientSecret: string
  groupAllowlist: string
  ownerAllowlist: string
  qqAllowAll: boolean
  qqEnabled: boolean
  sttEnabled: boolean
  ttsEnabled: boolean
}

const EMPTY_FORM: LiteForm = {
  appId: '',
  clientSecret: '',
  groupAllowlist: '',
  ownerAllowlist: '',
  qqAllowAll: false,
  qqEnabled: false,
  sttEnabled: false,
  ttsEnabled: false
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

function envField(platform: MessagingPlatformInfo | null, key: string): MessagingEnvVarInfo | undefined {
  return platform?.env_vars.find(field => field.key === key)
}

function envText(_platform: MessagingPlatformInfo | null, _key: string): string {
  return ''
}

function envBool(platform: MessagingPlatformInfo | null, key: string): boolean {
  const field = envField(platform, key)
  const value = field?.redacted_value?.trim().toLowerCase()

  return field?.is_set === true && value !== '0' && value !== 'false' && value !== 'off' && value !== 'no'
}

function CapabilityCard({
  icon: Icon,
  ready,
  subtitle,
  title,
  statusReady,
  statusNeedsSetup
}: {
  icon: typeof Zap
  ready: boolean
  statusNeedsSetup: string
  statusReady: string
  subtitle: string
  title: string
}) {
  return (
    <div className="rounded-lg border border-(--ui-stroke-tertiary) bg-(--ui-bg-quinary) p-3">
      <div className="flex items-start gap-2">
        <div className="grid size-8 shrink-0 place-items-center rounded-md bg-(--ui-bg-tertiary)">
          <Icon className="size-4 text-muted-foreground" />
        </div>
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <h3 className="truncate text-[length:var(--conversation-text-font-size)] font-medium">{title}</h3>
            <Pill tone={ready ? 'primary' : 'muted'}>{ready ? statusReady : statusNeedsSetup}</Pill>
          </div>
          <p className="mt-1 text-[length:var(--conversation-caption-font-size)] leading-(--conversation-caption-line-height) text-(--ui-text-tertiary)">
            {subtitle}
          </p>
        </div>
      </div>
    </div>
  )
}

function SecretHint({ field, label }: { field?: MessagingEnvVarInfo; label: string }) {
  if (!field?.is_set) {
    return null
  }

  return <span className="text-[length:var(--conversation-caption-font-size)] text-(--ui-text-tertiary)">{label}</span>
}

export function LiteSettings() {
  const { t } = useI18n()
  const lite = t.settings.lite
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [config, setConfig] = useState<HermesConfigRecord>({})
  const [qqbot, setQqbot] = useState<MessagingPlatformInfo | null>(null)
  const [form, setForm] = useState<LiteForm>(EMPTY_FORM)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)

      try {
        const [cfg, messaging] = await Promise.all([getHermesConfigRecord(), getMessagingPlatforms()])
        const platform = messaging.platforms.find(row => row.id === 'qqbot') ?? null

        if (cancelled) {
          return
        }

        setConfig(cfg)
        setQqbot(platform)
        setForm({
          appId: envText(platform, 'QQ_APP_ID'),
          clientSecret: '',
          groupAllowlist: envText(platform, 'QQ_GROUP_ALLOWED_USERS'),
          ownerAllowlist: envText(platform, 'QQ_ALLOWED_USERS'),
          qqAllowAll: envBool(platform, 'QQ_ALLOW_ALL_USERS'),
          qqEnabled: Boolean(platform?.enabled),
          sttEnabled: Boolean(getNested(cfg, 'stt.enabled')),
          ttsEnabled: Boolean(getNested(cfg, 'voice.auto_tts'))
        })
      } catch (error) {
        notifyError(error, lite.saveFailed)
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void load()

    return () => void (cancelled = true)
  }, [lite.saveFailed])

  const capabilityReady = useMemo<Record<CapabilityId, boolean>>(
    () => ({
      core: true,
      desktop: true,
      qqbot: form.qqEnabled && Boolean(envField(qqbot, 'QQ_APP_ID')?.is_set || form.appId.trim()),
      voice: form.sttEnabled || form.ttsEnabled
    }),
    [form.appId, form.qqEnabled, form.sttEnabled, form.ttsEnabled, qqbot]
  )

  async function saveLiteSetup() {
    setSaving(true)

    try {
      let nextConfig = setNested(config, 'stt.enabled', form.sttEnabled)
      nextConfig = setNested(nextConfig, 'voice.auto_tts', form.ttsEnabled)
      await saveHermesConfig(nextConfig)
      setConfig(nextConfig)

      if (qqbot) {
        const env: Record<string, string> = {
          QQ_ALLOW_ALL_USERS: form.qqAllowAll ? '1' : '0'
        }

        if (form.appId.trim()) {
          env.QQ_APP_ID = form.appId.trim()
        }

        if (form.clientSecret.trim()) {
          env.QQ_CLIENT_SECRET = form.clientSecret.trim()
        }

        if (form.ownerAllowlist.trim()) {
          env.QQ_ALLOWED_USERS = form.ownerAllowlist.trim()
        }

        if (form.groupAllowlist.trim()) {
          env.QQ_GROUP_ALLOWED_USERS = form.groupAllowlist.trim()
        }

        await updateMessagingPlatform('qqbot', {
          enabled: form.qqEnabled,
          env
        })

        const messaging = await getMessagingPlatforms()
        setQqbot(messaging.platforms.find(row => row.id === 'qqbot') ?? null)
      }

      notify({
        action: { label: lite.restartGateway, onClick: () => void runGatewayRestart() },
        kind: 'success',
        message: lite.savedMessage,
        title: lite.savedTitle
      })
    } catch (error) {
      notifyError(error, lite.saveFailed)
    } finally {
      setSaving(false)
    }
  }

  async function testQqbot() {
    setTesting(true)

    try {
      await testMessagingPlatform('qqbot')
      notify({ kind: 'success', message: lite.qqbotTestOk, title: lite.qqbotTestOk })
    } catch (error) {
      notifyError(error, lite.qqbotTestFailed)
    } finally {
      setTesting(false)
    }
  }

  const updateForm = <K extends keyof LiteForm>(key: K, value: LiteForm[K]) => {
    setForm(current => ({ ...current, [key]: value }))
  }

  if (loading) {
    return <LoadingState label={lite.loading} />
  }

  const voiceCfg = asRecord(config.voice)
  const sttCfg = asRecord(config.stt)

  return (
    <SettingsContent>
      <div className="mx-auto flex max-w-5xl flex-col gap-5 pb-8">
        <header className="pt-2">
          <h2 className="text-lg font-semibold tracking-normal">{lite.title}</h2>
          <p className="mt-1 max-w-3xl text-[length:var(--conversation-text-font-size)] leading-(--conversation-text-line-height) text-(--ui-text-tertiary)">
            {lite.intro}
          </p>
        </header>

        <section className="grid gap-2.5 md:grid-cols-2">
          {CAPABILITIES.map(item => {
            const copy = lite.cards[item.id]

            return (
              <CapabilityCard
                icon={item.icon}
                key={item.id}
                ready={capabilityReady[item.id]}
                statusNeedsSetup={lite.statusNeedsSetup}
                statusReady={lite.statusReady}
                subtitle={`${copy.description} ${copy.status}`}
                title={copy.title}
              />
            )
          })}
        </section>

        <section className="rounded-lg border border-(--ui-stroke-tertiary) bg-(--ui-bg-quinary) p-4">
          <div className="mb-2 flex items-center gap-2">
            <Mic className="size-4 text-muted-foreground" />
            <h3 className="text-[length:var(--conversation-text-font-size)] font-medium">{lite.voice.title}</h3>
          </div>
          <p className="mb-2 text-[length:var(--conversation-caption-font-size)] leading-(--conversation-caption-line-height) text-(--ui-text-tertiary)">
            {lite.voice.description}
          </p>
          <ListRow
            action={<Switch checked={form.sttEnabled} onCheckedChange={checked => updateForm('sttEnabled', checked)} />}
            description={lite.voice.sttDesc}
            hint={String(sttCfg.provider ?? '')}
            title={lite.voice.stt}
          />
          <ListRow
            action={<Switch checked={form.ttsEnabled} onCheckedChange={checked => updateForm('ttsEnabled', checked)} />}
            description={lite.voice.ttsDesc}
            hint={String(voiceCfg.auto_tts ?? false)}
            title={lite.voice.tts}
          />
        </section>

        <section className="rounded-lg border border-(--ui-stroke-tertiary) bg-(--ui-bg-quinary) p-4">
          <div className="mb-2 flex items-center gap-2">
            <MessageCircle className="size-4 text-muted-foreground" />
            <h3 className="text-[length:var(--conversation-text-font-size)] font-medium">{lite.qqbot.title}</h3>
          </div>
          <p className="mb-2 text-[length:var(--conversation-caption-font-size)] leading-(--conversation-caption-line-height) text-(--ui-text-tertiary)">
            {lite.qqbot.description}
          </p>
          <ListRow
            action={<Switch checked={form.qqEnabled} onCheckedChange={checked => updateForm('qqEnabled', checked)} />}
            description={lite.qqbot.enableDesc}
            title={lite.qqbot.enable}
          />
          <div className="grid gap-3 md:grid-cols-2">
            <ListRow
              action={
                <Input
                  onChange={event => updateForm('appId', event.target.value)}
                  placeholder={lite.qqbot.appIdPlaceholder}
                  value={form.appId}
                />
              }
              below={<SecretHint field={envField(qqbot, 'QQ_APP_ID')} label={lite.qqbot.savedCredential} />}
              title={lite.qqbot.appId}
              wide
            />
            <ListRow
              action={
                <Input
                  onChange={event => updateForm('clientSecret', event.target.value)}
                  placeholder={lite.qqbot.clientSecretPlaceholder}
                  type="password"
                  value={form.clientSecret}
                />
              }
              below={<SecretHint field={envField(qqbot, 'QQ_CLIENT_SECRET')} label={lite.qqbot.savedCredential} />}
              title={lite.qqbot.clientSecret}
              wide
            />
            <ListRow
              action={
                <Input
                  onChange={event => updateForm('ownerAllowlist', event.target.value)}
                  placeholder={lite.qqbot.ownerAllowlistPlaceholder}
                  value={form.ownerAllowlist}
                />
              }
              title={lite.qqbot.ownerAllowlist}
              wide
            />
            <ListRow
              action={
                <Input
                  onChange={event => updateForm('groupAllowlist', event.target.value)}
                  placeholder={lite.qqbot.groupAllowlistPlaceholder}
                  value={form.groupAllowlist}
                />
              }
              title={lite.qqbot.groupAllowlist}
              wide
            />
          </div>
          <ListRow
            action={
              <Switch
                checked={form.qqAllowAll}
                onCheckedChange={checked => updateForm('qqAllowAll', checked)}
              />
            }
            description={lite.qqbot.allowAllDesc}
            title={lite.qqbot.allowAll}
          />
        </section>

        <section className="rounded-lg border border-(--ui-stroke-tertiary) bg-(--ui-bg-quinary) p-4">
          <div className="mb-2 flex items-center gap-2">
            <Lock className="size-4 text-muted-foreground" />
            <h3 className="text-[length:var(--conversation-text-font-size)] font-medium">{lite.safety.title}</h3>
          </div>
          <ul className="grid gap-2 text-[length:var(--conversation-caption-font-size)] leading-(--conversation-caption-line-height) text-(--ui-text-tertiary)">
            {lite.safety.items.map(item => (
              <li className="flex gap-2" key={item}>
                <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-primary" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </section>

        <footer className="flex flex-wrap items-center justify-between gap-2">
          <Button
            onClick={() => navigate(`${MESSAGING_ROUTE}?platform=qqbot`)}
            type="button"
            variant="secondary"
          >
            <Globe />
            {lite.qqbot.openMessaging}
          </Button>
          <div className="flex flex-wrap gap-2">
            <Button disabled={testing} onClick={() => void testQqbot()} type="button" variant="outline">
              {testing ? lite.testingQqbot : lite.testQqbot}
            </Button>
            <Button
              className={cn(saving && 'opacity-80')}
              disabled={saving}
              onClick={() => void saveLiteSetup()}
              type="button"
            >
              {saving ? lite.saving : lite.save}
            </Button>
          </div>
        </footer>
      </div>
    </SettingsContent>
  )
}
