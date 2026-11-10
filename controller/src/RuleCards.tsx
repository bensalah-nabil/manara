import type { ComponentChildren } from 'preact'
import { useCallback, useEffect, useState } from 'preact/hooks'
import { isSessionError } from './api.ts'
import { addApp, addSite, customApps, customSites, KNOWN_APPS, parseTarget, removeApp, removeSite } from './customRules.ts'
import type { Target } from './customRules.ts'
import type { Props } from './Editors.tsx'
import { errorText } from './format.ts'
import type { Policy } from './policy.ts'
import { AGES, ageLabel, applyAge, childLines, hourLabel, matchingAge, minutesLabel, readCards, setBedtimeHour, setCard, setMinutes, warningFor } from './ruleCards.ts'
import type { Age, CardId, CardsState } from './ruleCards.ts'
import { PrayerChart } from './PrayerChart.tsx'
import { t } from './i18n.ts'

const ART: Record<CardId, ComponentChildren> = {
    adult: <><circle cx="24" cy="24" r="15" /><path d="M9 24h30M24 9c-9 9-9 21 0 30M24 9c9 9 9 21 0 30" /><path d="m13 13 22 22" stroke-width="3.4" /></>,
    ads: <><path d="M10 20v8l5 1 16 8V11l-16 8z" /><path d="m15 29 2 9h5l-2-7" /><circle class="glow" stroke="none" cx="39" cy="24" r="4" /></>,
    values: <><path d="M24 41S8 32 8 19a9 9 0 0 1 16-5.5A9 9 0 0 1 40 19c0 13-16 22-16 22z" /><path d="M17 23l5 5 9-10" /></>,
    social: <><rect x="14" y="5" width="20" height="38" rx="4" /><path d="M21 37h6M19 13h10l-3.5 6 3.5 6H19l3.5-6z" /></>,
    games: <><path d="M14 15h20c5 0 9 8 9 16 0 5-5 6-8 2l-3-4H16l-3 4c-3 4-8 3-8-2 0-8 4-16 9-16z" /><path d="M15 19v6M12 22h6" /><circle class="glow" stroke="none" cx="33" cy="22" r="3" /></>,
    bedtime: <><path d="M36 30a15 15 0 0 1-18-20 16 16 0 1 0 18 20z" /><circle class="glow" stroke="none" cx="33" cy="12" r="3" /><circle class="glow" stroke="none" cx="40" cy="20" r="2" /></>,
    protect: <><rect x="11" y="21" width="26" height="20" rx="4" /><path d="M16 21v-6a8 8 0 0 1 16 0v6" /><circle class="glow" stroke="none" cx="24" cy="31" r="3.5" /></>,
    location: <><path d="M24 43S10 28 10 19a14 14 0 0 1 28 0c0 9-14 24-14 24z" /><circle class="glow" stroke="none" cx="24" cy="19" r="5" /></>,
    report: <><path d="M8 41h32" /><rect x="11" y="24" width="6" height="17" /><rect x="21" y="14" width="6" height="27" /><rect x="31" y="7" width="6" height="34" /></>,
}

const GROUPS: { title: string; cards: { id: CardId; title: string; text: string }[] }[] = [
    {
        title: t('rules.group.blocked'),
        cards: [
            { id: 'adult', title: t('rules.card.adult'), text: t('rules.card.adultText') },
            { id: 'ads', title: t('rules.card.ads'), text: t('rules.card.adsText') },
            { id: 'values', title: t('rules.card.values'), text: t('rules.card.valuesText') },
        ],
    },
    {
        title: t('rules.group.time'),
        cards: [
            { id: 'social', title: t('rules.card.social'), text: t('rules.card.socialText') },
            { id: 'games', title: t('rules.card.games'), text: t('rules.card.gamesText') },
            { id: 'bedtime', title: t('rules.card.bedtime'), text: t('rules.card.bedtimeText') },
        ],
    },
    {
        title: t('rules.group.safety'),
        cards: [
            { id: 'protect', title: t('rules.card.protect'), text: t('rules.card.protectText') },
            { id: 'location', title: t('rules.card.location'), text: t('rules.card.locationText') },
            { id: 'report', title: t('rules.card.report'), text: t('rules.card.reportText') },
        ],
    },
]

const FIXED_LABEL: Partial<Record<CardId, [string, string]>> = {
    adult: [t('rules.value.blocked'), t('rules.value.allowed')],
    ads: [t('rules.value.blocked'), t('rules.value.allowed')],
    values: [t('rules.value.blocked'), t('rules.value.allowed')],
    protect: [t('rules.value.locked'), t('rules.value.notLocked')],
    location: [t('rules.value.every15'), t('rules.value.notShared')],
    report: [t('rules.value.sentDaily'), t('rules.value.notSent')],
}

function Stepper({ label, value, busy, onLess, onMore }: { label: string; value: string; busy: boolean; onLess: () => void; onMore: () => void }) {
    return (
        <span class="stepper">
            <button type="button" class="step" disabled={busy} aria-label={t('rules.stepLess', { label })} onClick={onLess}>−</button>
            <b aria-live="polite">{value}</b>
            <button type="button" class="step" disabled={busy} aria-label={t('rules.stepMore', { label })} onClick={onMore}>+</button>
        </span>
    )
}

function CardFoot({ id, state, busy, change }: { id: CardId; state: CardsState; busy: boolean; change: (next: (policy: Policy) => Policy) => void }) {
    const on = state.on[id]
    if (id === 'social' || id === 'games') {
        const minutes = id === 'social' ? state.socialMinutes : state.gamesMinutes
        if (!on) return <span class="rule-value">{t('rules.value.noLimit')}</span>
        return <Stepper label={id === 'social' ? t('rules.socialMinutes') : t('rules.gamesMinutes')} value={minutesLabel(minutes)} busy={busy} onLess={() => change((p) => setMinutes(p, id, minutes - 15))} onMore={() => change((p) => setMinutes(p, id, minutes + 15))} />
    }
    if (id === 'bedtime') {
        if (!on) return <span class="rule-value">{t('rules.value.noBedtime')}</span>
        if (state.bedtimeCustom) return <span class="rule-value">{t('rules.value.customTimes')}</span>
        return <Stepper label={t('rules.card.bedtime')} value={t('rules.value.from', { hour: hourLabel(state.bedtimeHour) })} busy={busy} onLess={() => change((p) => setBedtimeHour(p, state.bedtimeHour - 1))} onMore={() => change((p) => setBedtimeHour(p, state.bedtimeHour + 1))} />
    }
    const labels = FIXED_LABEL[id]
    return <span class="rule-value">{labels ? labels[on ? 0 : 1] : ''}</span>
}

const MINUTE_CHOICES = [15, 30, 60, 120]

function CustomRules({ policy, busy, change }: { policy: Policy; busy: boolean; change: (next: (policy: Policy) => Policy) => void }) {
    const [text, setText] = useState('')
    const [minutes, setMinutesChoice] = useState(0)
    const [problem, setProblem] = useState('')
    const target: Target | null = text.trim() === '' ? null : parseTarget(text)
    const apps = customApps(policy)
    const sites = customSites(policy)

    function add(event: Event) {
        event.preventDefault()
        const parsed = parseTarget(text)
        if (parsed.kind === 'problem') {
            setProblem(parsed.message)
            return
        }
        if (parsed.kind === 'site') {
            const result = addSite(policy, parsed.site)
            if (!result.ok) {
                setProblem(result.message)
                return
            }
            change((latest) => {
                const applied = addSite(latest, parsed.site)
                return applied.ok ? applied.policy : latest
            })
        } else {
            change((latest) => addApp(latest, parsed.name, parsed.id, minutes))
        }
        setText('')
        setMinutesChoice(0)
        setProblem('')
    }

    return (
        <section class="rule-group">
            <h2 class="rule-heading">{t('rules.ownTitle')}</h2>
            <div class="custom">
                <form class="custom-form" onSubmit={add}>
                    <label>
                        {t('rules.ownTarget')}
                        <input
                            id="custom-target"
                            list="known-apps"
                            autoCapitalize="off"
                            spellcheck={false}
                            placeholder={t('rules.ownPlaceholder')}
                            value={text}
                            onInput={(event) => { setText(event.currentTarget.value); setProblem('') }}
                        />
                        <datalist id="known-apps">{KNOWN_APPS.map((app) => <option key={app.id} value={app.name} />)}</datalist>
                    </label>
                    {target?.kind === 'app' && (
                        <label>
                            {target.name}
                            <select id="custom-minutes" value={minutes} onChange={(event) => setMinutesChoice(Number(event.currentTarget.value))}>
                                <option value={0}>{t('rules.ownBlock')}</option>
                                {MINUTE_CHOICES.map((value) => <option key={value} value={value}>{t('common.perDay', { time: minutesLabel(value) })}</option>)}
                            </select>
                        </label>
                    )}
                    {target?.kind === 'site' && <p class="muted small">{t('rules.ownSite', { site: target.site })}</p>}
                    {problem && <p role="alert" class="error">{problem}</p>}
                    <button type="submit" disabled={busy || text.trim() === ''}>{t('rules.ownAdd')}</button>
                </form>
                {apps.length + sites.length > 0 ? (
                    <ul class="custom-list">
                        {apps.map((app) => (
                            <li key={app.category}>
                                <span><b>{app.category}</b> <span class="muted">{app.dailyMinutes === 0 ? t('rules.value.blocked') : t('common.perDay', { time: minutesLabel(app.dailyMinutes) })}</span></span>
                                <button type="button" class="link danger" disabled={busy} aria-label={t('rules.ownRemoveLabel', { name: app.category })} onClick={() => change((latest) => removeApp(latest, app.category))}>{t('common.remove')}</button>
                            </li>
                        ))}
                        {sites.map((site) => (
                            <li key={site}>
                                <span><b>{site}</b> <span class="muted">{t('rules.ownBlockedChrome')}</span></span>
                                <button type="button" class="link danger" disabled={busy} aria-label={t('rules.ownRemoveLabel', { name: site })} onClick={() => change((latest) => removeSite(latest, site))}>{t('common.remove')}</button>
                            </li>
                        ))}
                    </ul>
                ) : (
                    <p class="muted small">{t('rules.ownHelp')}</p>
                )}
            </div>
        </section>
    )
}

export function RuleCards({ api, device, onSessionExpired, advanced }: Props & { advanced: ComponentChildren }) {
    const [policy, setPolicy] = useState<Policy | null>(null)
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState('')
    const [message, setMessage] = useState('')

    const fail = useCallback((caught: unknown) => {
        if (isSessionError(caught)) onSessionExpired()
        else setError(errorText(caught))
    }, [onSessionExpired])

    useEffect(() => {
        let current = true
        api.getPolicy(device.deviceId).then((loaded) => { if (current) setPolicy(loaded) }).catch((caught) => { if (current) fail(caught) })
        return () => { current = false }
    }, [api, device.deviceId, fail])

    /** Every change re-reads the policy first, because a save replaces all of it. */
    async function change(next: (policy: Policy) => Policy) {
        setBusy(true)
        setError('')
        setMessage('')
        try {
            const latest = await api.getPolicy(device.deviceId)
            const updated = next(latest)
            const warning = warningFor(latest, updated)
            if (warning !== null && !window.confirm(warning)) {
                setPolicy(latest)
                return
            }
            const { policy: stored, woken } = await api.setPolicy(device.deviceId, updated)
            setPolicy(stored)
            setMessage(woken ? t('rules.savedWoken') : t('rules.savedLater'))
        } catch (caught) {
            fail(caught)
        } finally {
            setBusy(false)
        }
    }

    if (policy === null) {
        return error ? <p role="alert" class="error">{error}</p> : <p class="muted">{t('rules.loading')}</p>
    }

    const state = readCards(policy)
    const age = matchingAge(policy)
    const onCount = Object.values(state.on).filter(Boolean).length
    const lines = childLines(state)

    return (
        <div class="rules-screen">
            <div class="rules-top">
                <p>
                    <b>{t('rules.count', { on: onCount, all: Object.keys(state.on).length })}</b>
                    <span class="muted small rule-status" role="status">{busy ? t('common.saving') : message}</span>
                </p>
                <div class="ages">
                    <span id="ages-label">{t('rules.ageLabel')}</span>
                    <div class="seg" role="group" aria-labelledby="ages-label">
                        {AGES.map((name: Age) => (
                            <button key={name} type="button" aria-pressed={age === name} disabled={busy} onClick={() => change((latest) => applyAge(latest, name))}>{ageLabel(name)}</button>
                        ))}
                    </div>
                </div>
            </div>
            {error && <p role="alert" class="error">{error}</p>}
            <div class="rules-layout">
                <div class="rule-groups">
                    {GROUPS.map((group) => (
                        <section key={group.title} class="rule-group">
                            <h2 class="rule-heading">{group.title}</h2>
                            <div class="rule-cards">
                                {group.cards.map(({ id, title, text }) => (
                                    <article key={id} class={state.on[id] ? 'rule-card' : 'rule-card off'}>
                                        <div class="rule-top">
                                            <div class="rule-art">
                                                <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">{ART[id]}</svg>
                                            </div>
                                            <h3>{title}</h3>
                                            <button type="button" class="switch" role="switch" aria-checked={state.on[id]} aria-label={title} disabled={busy} onClick={() => change((latest) => setCard(latest, id, !readCards(latest).on[id]))}><i /></button>
                                        </div>
                                        <p class="muted">{text}</p>
                                        <div class="rule-foot"><CardFoot id={id} state={state} busy={busy} change={change} /></div>
                                    </article>
                                ))}
                            </div>
                        </section>
                    ))}
                    <PrayerChart api={api} device={device} />
                    <CustomRules policy={policy} busy={busy} change={change} />
                    <details class="advanced">
                        <summary>{t('rules.advanced')}</summary>
                        <div class="stack">{advanced}</div>
                    </details>
                </div>
                <aside class="child-preview" aria-label={t('rules.childSees')}>
                    <h2 class="rule-heading">{t('rules.childSees')}</h2>
                    <div class="phone-frame">
                        <div class="phone-screen">
                            <b>{t('rules.childTitle')}</b>
                            <span class="muted small">{t('rules.childSubtitle')}</span>
                            {lines.length > 0 ? <ul>{lines.map((line) => <li key={line}>{line}</li>)}</ul> : <p class="muted small">{t('rules.childNone')}</p>}
                        </div>
                    </div>
                </aside>
            </div>
        </div>
    )
}
