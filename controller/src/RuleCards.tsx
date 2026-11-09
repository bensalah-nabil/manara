import type { ComponentChildren } from 'preact'
import { useCallback, useEffect, useState } from 'preact/hooks'
import { isSessionError } from './api.ts'
import { addApp, addSite, customApps, customSites, KNOWN_APPS, parseTarget, removeApp, removeSite } from './customRules.ts'
import type { Target } from './customRules.ts'
import type { Props } from './Editors.tsx'
import { errorText } from './format.ts'
import type { Policy } from './policy.ts'
import { AGES, applyAge, childLines, hourLabel, matchingAge, minutesLabel, readCards, setBedtimeHour, setCard, setMinutes, warningFor } from './ruleCards.ts'
import type { Age, CardId, CardsState } from './ruleCards.ts'

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
        title: 'What gets blocked',
        cards: [
            { id: 'adult', title: 'Adult sites', text: 'Blocked in Chrome and in apps. Other browsers are closed, and Google stays on SafeSearch.' },
            { id: 'ads', title: 'Ads in games and apps', text: 'Stops most ad networks in games and apps. It can\'t remove YouTube or Facebook ads.' },
            { id: 'values', title: 'Family values', text: 'Well-known gambling, dating and alcohol websites, in Chrome only. Add more below.' },
        ],
    },
    {
        title: 'How long and when',
        cards: [
            { id: 'social', title: 'Social media', text: 'TikTok, Facebook and Instagram share one daily budget. Their websites stay closed.' },
            { id: 'games', title: 'Games', text: 'Apps that say they are games share one daily budget, including ones installed later.' },
            { id: 'bedtime', title: 'Bedtime', text: 'Locks every night until 07:00, and locks again if it is unlocked.' },
        ],
    },
    {
        title: 'Safety',
        cards: [
            { id: 'protect', title: 'Keep the rules on', text: 'No factory reset from Settings, safe mode, new users or clock changes.' },
            { id: 'location', title: 'Where the phone is', text: 'Sent to you every 15 minutes. The phone shows a notice the whole time.' },
            { id: 'report', title: 'Daily app report', text: 'Minutes per app each day. Never messages, photos, calls or passwords.' },
        ],
    },
]

const FIXED_LABEL: Partial<Record<CardId, [string, string]>> = {
    adult: ['Blocked', 'Allowed'],
    ads: ['Blocked', 'Allowed'],
    values: ['Blocked', 'Allowed'],
    protect: ['Locked', 'Not locked'],
    location: ['Every 15 min', 'Not shared'],
    report: ['Sent daily', 'Not sent'],
}

function Stepper({ label, value, busy, onLess, onMore }: { label: string; value: string; busy: boolean; onLess: () => void; onMore: () => void }) {
    return (
        <span class="stepper">
            <button type="button" class="step" disabled={busy} aria-label={`${label}: less`} onClick={onLess}>−</button>
            <b aria-live="polite">{value}</b>
            <button type="button" class="step" disabled={busy} aria-label={`${label}: more`} onClick={onMore}>+</button>
        </span>
    )
}

function CardFoot({ id, state, busy, change }: { id: CardId; state: CardsState; busy: boolean; change: (next: (policy: Policy) => Policy) => void }) {
    const on = state.on[id]
    if (id === 'social' || id === 'games') {
        const minutes = id === 'social' ? state.socialMinutes : state.gamesMinutes
        if (!on) return <span class="rule-value">No limit</span>
        return <Stepper label={`${id === 'social' ? 'Social media' : 'Games'} minutes`} value={minutesLabel(minutes)} busy={busy} onLess={() => change((p) => setMinutes(p, id, minutes - 15))} onMore={() => change((p) => setMinutes(p, id, minutes + 15))} />
    }
    if (id === 'bedtime') {
        if (!on) return <span class="rule-value">No bedtime</span>
        if (state.bedtimeCustom) return <span class="rule-value">Custom times, see Advanced</span>
        return <Stepper label="Bedtime" value={`From ${hourLabel(state.bedtimeHour)}`} busy={busy} onLess={() => change((p) => setBedtimeHour(p, state.bedtimeHour - 1))} onMore={() => change((p) => setBedtimeHour(p, state.bedtimeHour + 1))} />
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
            <h2 class="rule-heading">Your own rules</h2>
            <div class="custom">
                <form class="custom-form" onSubmit={add}>
                    <label>
                        App or website
                        <input
                            id="custom-target"
                            list="known-apps"
                            autoCapitalize="off"
                            spellcheck={false}
                            placeholder="Roblox, a Play Store link, or example.com"
                            value={text}
                            onInput={(event) => { setText(event.currentTarget.value); setProblem('') }}
                        />
                        <datalist id="known-apps">{KNOWN_APPS.map((app) => <option key={app.id} value={app.name} />)}</datalist>
                    </label>
                    {target?.kind === 'app' && (
                        <label>
                            {target.name}
                            <select id="custom-minutes" value={minutes} onChange={(event) => setMinutesChoice(Number(event.currentTarget.value))}>
                                <option value={0}>Block it completely</option>
                                {MINUTE_CHOICES.map((value) => <option key={value} value={value}>{minutesLabel(value)} a day</option>)}
                            </select>
                        </label>
                    )}
                    {target?.kind === 'site' && <p class="muted small">Blocks {target.site} in Chrome.</p>}
                    {problem && <p role="alert" class="error">{problem}</p>}
                    <button type="submit" disabled={busy || text.trim() === ''}>Add rule</button>
                </form>
                {apps.length + sites.length > 0 ? (
                    <ul class="custom-list">
                        {apps.map((app) => (
                            <li key={app.category}>
                                <span><b>{app.category}</b> <span class="muted">{app.dailyMinutes === 0 ? 'Blocked' : `${minutesLabel(app.dailyMinutes)} a day`}</span></span>
                                <button type="button" class="link danger" disabled={busy} aria-label={`Remove the rule for ${app.category}`} onClick={() => change((latest) => removeApp(latest, app.category))}>Remove</button>
                            </li>
                        ))}
                        {sites.map((site) => (
                            <li key={site}>
                                <span><b>{site}</b> <span class="muted">Blocked in Chrome</span></span>
                                <button type="button" class="link danger" disabled={busy} aria-label={`Remove the rule for ${site}`} onClick={() => change((latest) => removeSite(latest, site))}>Remove</button>
                            </li>
                        ))}
                    </ul>
                ) : (
                    <p class="muted small">Limit or block any app, or block any website. Type a name, or paste a link.</p>
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
            setMessage(woken ? 'Saved. The phone applies it in a few seconds.' : 'Saved. The phone applies it at its next check-in, within about 15 minutes.')
        } catch (caught) {
            fail(caught)
        } finally {
            setBusy(false)
        }
    }

    if (policy === null) {
        return error ? <p role="alert" class="error">{error}</p> : <p class="muted">Loading rules…</p>
    }

    const state = readCards(policy)
    const age = matchingAge(policy)
    const onCount = Object.values(state.on).filter(Boolean).length
    const lines = childLines(state)

    return (
        <div class="rules-screen">
            <div class="rules-top">
                <p class="muted">{onCount} of {Object.keys(state.on).length} rules on</p>
                <div class="ages">
                    <span id="ages-label">Start from your child's age</span>
                    <div class="seg" role="group" aria-labelledby="ages-label">
                        {AGES.map((name: Age) => (
                            <button key={name} type="button" aria-pressed={age === name} disabled={busy} onClick={() => change((latest) => applyAge(latest, name))}>{name}</button>
                        ))}
                    </div>
                </div>
            </div>
            {error && <p role="alert" class="error">{error}</p>}
            <p class="muted small rule-status" role="status">{busy ? 'Saving…' : message}</p>
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
                                                <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">{ART[id]}</svg>
                                            </div>
                                            <button type="button" class="switch" role="switch" aria-checked={state.on[id]} aria-label={title} disabled={busy} onClick={() => change((latest) => setCard(latest, id, !readCards(latest).on[id]))}><i /></button>
                                        </div>
                                        <h3>{title}</h3>
                                        <p class="muted">{text}</p>
                                        <div class="rule-foot"><CardFoot id={id} state={state} busy={busy} change={change} /></div>
                                    </article>
                                ))}
                            </div>
                        </section>
                    ))}
                    <CustomRules policy={policy} busy={busy} change={change} />
                    <details class="advanced">
                        <summary>Advanced settings</summary>
                        <div class="stack">{advanced}</div>
                    </details>
                </div>
                <aside class="child-preview" aria-label="What your child sees">
                    <h2 class="rule-heading">What your child sees</h2>
                    <div class="phone-frame">
                        <div class="phone-screen">
                            <b>This phone is managed</b>
                            <span class="muted small">By your parent, with Manara.</span>
                            {lines.length > 0 ? <ul>{lines.map((line) => <li key={line}>{line}</li>)}</ul> : <p class="muted small">No rules are on.</p>}
                        </div>
                    </div>
                </aside>
            </div>
        </div>
    )
}
