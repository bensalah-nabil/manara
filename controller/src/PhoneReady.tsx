import { useEffect, useState } from 'preact/hooks'
import { isSessionError } from './api.ts'
import type { SetupReadiness } from './api.ts'
import type { Props } from './Editors.tsx'
import { accountsText, brandFromManufacturer, guideFor } from './enrollment.ts'
import { deviceName, errorText, lastSeenText } from './format.ts'
import { t } from './i18n.ts'
import type { MessageKey } from './i18n.ts'
import { readinessLines, readinessQuiet } from './readiness.ts'

/** The phone sends its checklist every 30 s while its waiting screen is open; the page follows it. */
const POLL_MS = 3000

const LABEL: Record<string, MessageKey> = {
    android: 'ready.android',
    wifi: 'ready.wifi',
    battery: 'ready.battery',
    developerOptions: 'ready.developer',
    wirelessDebugging: 'ready.wireless',
}

/**
 * Before guided setup starts: the steps for the phone that actually connected (its maker, from its
 * own report), and its checklist ticking as the parent turns things on. Nothing to tick here: the
 * phone checks itself (SetupReadiness on the phone).
 */
export function PhoneReady({ api, device, onSessionExpired, onReadiness }: Props & { onReadiness?: (r: SetupReadiness | null) => void }) {
    const [readiness, setReadiness] = useState<SetupReadiness | null | undefined>(undefined)
    const [error, setError] = useState('')
    const [now, setNow] = useState(() => Date.now())

    useEffect(() => {
        let current = true
        let timer: ReturnType<typeof setTimeout> | undefined
        const load = () => {
            api.getReadiness(device.deviceId)
                .then((value) => {
                    if (!current) return
                    setReadiness(value)
                    onReadiness?.(value)
                    setNow(Date.now())
                    setError('')
                })
                .catch((caught: unknown) => {
                    if (!current) return
                    if (isSessionError(caught)) onSessionExpired()
                    else setError(errorText(caught))
                })
                .finally(() => { if (current) timer = setTimeout(load, POLL_MS) })
        }
        load()
        return () => {
            current = false
            if (timer) clearTimeout(timer)
        }
    }, [api, device.deviceId, onSessionExpired, onReadiness])

    // A phone set up before this existed never sends one: nothing to show.
    if (!readiness) return error ? <p role="alert" class="error">{error}</p> : null

    const guide = guideFor(brandFromManufacturer(device.manufacturer)) ?? guideFor('other')!
    const lines = readinessLines(readiness)
    const quiet = readinessQuiet(readiness, now)

    return (
        <section class="card stack phone-ready">
            <div class="timeline-head">
                <h3>{t('ready.title', { name: deviceName(device) })}</h3>
                {quiet ? (
                    <span class="hint">{t('ready.quiet', { when: lastSeenText(readiness.updatedAt) })}</span>
                ) : (
                    <span class="live"><span class="live-dot" aria-hidden="true" />{t('ready.live')}</span>
                )}
            </div>
            <p class="muted small">{t('ready.intro')}</p>

            <ul class="ready-list" aria-label={t('ready.listLabel')}>
                {lines.map((line) => (
                    <li key={line.key} class={line.state}>
                        <span class="ready-mark" aria-hidden="true">{line.state === 'ok' ? '✓' : line.state === 'missing' ? (line.required ? '!' : '–') : '?'}</span>
                        <span>
                            {t(LABEL[line.key])}
                            {line.key === 'battery' && readiness.batteryPercent !== null && readiness.batteryPercent !== undefined && (
                                <span class="muted small"> · {readiness.batteryPercent}%</span>
                            )}
                            {line.state === 'unknown' && <span class="muted small"> · {t('ready.unknown')}</span>}
                            {!line.required && line.state !== 'unknown' && <span class="muted small"> · {t('ready.recommended')}</span>}
                        </span>
                        <span class="sr-only">{t(line.state === 'ok' ? 'ready.stateOk' : line.state === 'missing' ? 'ready.stateMissing' : 'ready.stateUnknown')}</span>
                    </li>
                ))}
            </ul>

            {readiness.ready ? (
                <p role="status" class="banner ok">{t('ready.allSet')}</p>
            ) : !readiness.android ? (
                <p role="status" class="banner">{t('ready.tooOld')}</p>
            ) : null}

            <div class="consent stack">
                <h4>{t('ready.accountsTitle')}</h4>
                <p>{accountsText(guide)}</p>
            </div>

            <details open={readiness.developerOptions === false || readiness.wirelessDebugging === false}>
                <summary>{t('add.debugTitle', { brand: guide.brand === 'other' ? (device.manufacturer || guide.name) : guide.name })}</summary>
                <div class="stack">
                    {!guide.tested && <p class="hint untested">{t('add.untested')}</p>}
                    <ol class="guide">
                        {guide.developerOptions.map((line) => <li key={line}>{line}</li>)}
                    </ol>
                    {guide.notes.map((note) => <p key={note} class="hint">{note}</p>)}
                    {guide.pictures && (
                        <div class="guide-pictures">
                            {guide.pictures.map((picture) => (
                                <figure key={picture.src}>
                                    <img src={picture.src} alt={picture.alt} loading="lazy" width={540} />
                                    <figcaption>{picture.caption}</figcaption>
                                </figure>
                            ))}
                        </div>
                    )}
                </div>
            </details>
            <p class="hint">{t('enroll.prepare.chats')}</p>
        </section>
    )
}
