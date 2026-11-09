import type { ComponentChildren } from 'preact'
import type { Api, DeviceSummary } from './api.ts'
import { applyLocation, MAX_INTERVAL, MIN_INTERVAL, toDraft as locationDraft, validateDraft as validateLocation } from './location.ts'
import type { Draft as LocationDraft, LocationPolicy } from './location.ts'
import { applySchedule, DAYS, emptyWindow, toDraft as scheduleDraft, validateDraft as validateSchedule } from './schedule.ts'
import type { Draft as ScheduleDraft, LockSchedule, LockWindow } from './schedule.ts'
import { applyTimeLimits, blocksImmediately, emptyRule, socialMediaRule, toDraft as limitsDraft, validateDraft as validateLimits } from './timeLimits.ts'
import type { Draft as LimitsDraft, RuleDraft, TimeLimits } from './timeLimits.ts'
import { applyRestrictions, RESTRICTIONS, toDraft as restrictionsDraft } from './restrictions.ts'
import type { Draft as RestrictionsDraft } from './restrictions.ts'
import { applySiteFilter, FAMILY_FILTER_HOST, filterWarning, toDraft as filterDraft, unlockedNote, validateDraft as validateFilter } from './siteFilter.ts'
import type { Draft as FilterDraft, SiteFilter } from './siteFilter.ts'
import { applyBrowser, MAX_SITES, secureDnsNote, toDraft as browserDraft, validateDraft as validateBrowser, YOUTUBE_MODES } from './browser.ts'
import type { BrowserPolicy, Draft as BrowserDraft, YouTubeMode } from './browser.ts'
import { applyCallLog, CALL_LOG_WARNING, toDraft as callLogDraft } from './callLog.ts'
import type { CallLogPolicy, Draft as CallLogDraft } from './callLog.ts'
import { usePolicyEditor } from './usePolicyEditor.ts'
import type { Section } from './usePolicyEditor.ts'
import { applyUsageReport, toDraft as usageReportDraft, USAGE_REPORT_WARNING } from './usageReport.ts'
import type { Draft as UsageReportDraft, UsageReportPolicy } from './usageReport.ts'

export interface Props {
    api: Api
    device: DeviceSummary
    onSessionExpired: () => void
}

const limitsSection: Section<LimitsDraft, TimeLimits> = {
    toDraft: limitsDraft,
    validate: (draft) => {
        const result = validateLimits(draft)
        return result.ok ? { ok: true, value: result.timeLimits } : result
    },
    apply: applyTimeLimits,
    confirm: (_before, after) =>
        blocksImmediately(after) ? 'A limit of 0 minutes blocks those apps as soon as the phone applies it. Save anyway?' : null,
}

const scheduleSection: Section<ScheduleDraft, LockSchedule> = {
    toDraft: scheduleDraft,
    validate: (draft) => {
        const result = validateSchedule(draft)
        return result.ok ? { ok: true, value: result.schedule } : result
    },
    apply: applySchedule,
    confirm: (_before, after) =>
        after.enabled && after.windows.length > 0
            ? "While a lock window is active, the phone is locked at each check-in (about every 15 minutes), using the phone's own clock. Save anyway?"
            : null,
}

const locationSection: Section<LocationDraft, LocationPolicy> = {
    toDraft: locationDraft,
    validate: (draft) => {
        const result = validateLocation(draft)
        return result.ok ? { ok: true, value: result.location } : result
    },
    apply: applyLocation,
    confirm: (before, after) =>
        after.enabled && !before.enabled ? "This starts sharing the phone's location. The phone shows its own notice that location is being shared. Save anyway?" : null,
}

const filterSection: Section<FilterDraft, SiteFilter> = {
    toDraft: filterDraft,
    validate: (draft) => {
        const result = validateFilter(draft)
        return result.ok ? { ok: true, value: result.filter } : result
    },
    apply: applySiteFilter,
    confirm: filterWarning,
}

const restrictionsSection: Section<RestrictionsDraft, RestrictionsDraft> = {
    toDraft: restrictionsDraft,
    validate: (draft) => ({ ok: true, value: draft }),
    apply: applyRestrictions,
    confirm: (before, after) => {
        const added = RESTRICTIONS.filter(({ key }) => after[key] && !before[key]).map(({ label }) => label)
        return added.length === 0 ? null : `This takes effect on the child's phone: ${added.join('; ')}. Save anyway?`
    },
}

const browserSection: Section<BrowserDraft, BrowserPolicy> = {
    toDraft: browserDraft,
    validate: (draft) => {
        const result = validateBrowser(draft)
        return result.ok ? { ok: true, value: result.browser } : result
    },
    apply: applyBrowser,
}

const usageReportSection: Section<UsageReportDraft, UsageReportPolicy> = {
    toDraft: usageReportDraft,
    validate: (draft) => ({ ok: true, value: { enabled: draft.enabled } }),
    apply: applyUsageReport,
    confirm: (before, after) => (after.enabled && !before.enabled ? USAGE_REPORT_WARNING : null),
}

const callLogSection: Section<CallLogDraft, CallLogPolicy> = {
    toDraft: callLogDraft,
    validate: (draft) => ({ ok: true, value: { enabled: draft.enabled } }),
    apply: applyCallLog,
    confirm: (before, after) => (after.enabled && !before.enabled ? CALL_LOG_WARNING : null),
}

type Editor = ReturnType<typeof usePolicyEditor<unknown, unknown>>

/** A setting while closed: a title, what it does, and an Edit button. Nothing is fetched until it opens. */
function Row({ title, summary, editor }: { title: string; summary: string; editor: Pick<Editor, 'loading' | 'error' | 'load'> }) {
    return (
        <section class="card setting">
            <div class="setting-text">
                <h3>{title}</h3>
                <p class="muted">{summary}</p>
                {editor.error && <p role="alert" class="error">{editor.error}</p>}
            </div>
            <button type="button" onClick={editor.load} disabled={editor.loading} aria-label={`Edit ${title.toLowerCase()}`}>
                {editor.loading ? 'Loading…' : 'Edit'}
            </button>
        </section>
    )
}

function Open({ title, version, children }: { title: string; version: number; children: ComponentChildren }) {
    return (
        <section class="card editing">
            <div class="card-head">
                <h3>{title}</h3>
                <span class="muted small">Policy version {version}</span>
            </div>
            {children}
        </section>
    )
}

function Footer({ editor, saveLabel }: { editor: Pick<Editor, 'problems' | 'error' | 'saved' | 'saving' | 'save' | 'close'>; saveLabel: string }) {
    return (
        <>
            {editor.problems.length > 0 && (
                <ul role="alert" class="error">
                    {editor.problems.map((problem) => <li key={problem}>{problem}</li>)}
                </ul>
            )}
            {editor.error && <p role="alert" class="error">{editor.error}</p>}
            {editor.saved && <p role="status" class="banner ok">{editor.saved}</p>}
            <div class="actions">
                <button type="button" class="ghost" onClick={editor.close}>Close</button>
                <button type="button" class="primary" onClick={editor.save} disabled={editor.saving}>{editor.saving ? 'Saving…' : saveLabel}</button>
            </div>
        </>
    )
}

function Toggle({ checked, onChange, children }: { checked: boolean; onChange: (on: boolean) => void; children: ComponentChildren }) {
    return (
        <label class="check">
            <input type="checkbox" checked={checked} onChange={(event) => onChange(event.currentTarget.checked)} />
            <span>{children}</span>
        </label>
    )
}

const HOURS = Array.from({ length: 24 }, (_, hour) => hour)

export function TimeLimitsEditor(props: Props) {
    const editor = usePolicyEditor({ ...props, section: limitsSection })
    const { draft, policy, setDraft } = editor
    if (draft === null || policy === null) {
        return <Row title="App time limits" summary="Daily minutes for the apps you choose, shared within each rule." editor={editor} />
    }

    function updateRule(index: number, change: Partial<RuleDraft>) {
        setDraft({ ...draft!, rules: draft!.rules.map((rule, i) => (i === index ? { ...rule, ...change } : rule)) })
    }

    return (
        <Open title="App time limits" version={policy.version}>
            <p class="muted">Only time limits change here; the phone's other settings are kept.</p>
            <Toggle checked={draft.enabled} onChange={(enabled) => setDraft({ ...draft, enabled })}>Enforce these limits</Toggle>
            {draft.rules.map((rule, index) => (
                <fieldset key={index} class="group">
                    <legend>Rule {index + 1}</legend>
                    <label>
                        Name
                        <input value={rule.category} onInput={(event) => updateRule(index, { category: event.currentTarget.value })} />
                    </label>
                    <label>
                        App package names, one per line
                        <textarea rows={3} spellcheck={false} value={rule.packages} onInput={(event) => updateRule(index, { packages: event.currentTarget.value })} />
                    </label>
                    <label class="narrow">
                        Minutes per day, shared by these apps
                        <input inputMode="numeric" value={rule.dailyMinutes} onInput={(event) => updateRule(index, { dailyMinutes: event.currentTarget.value })} />
                    </label>
                    <button type="button" class="link danger" onClick={() => setDraft({ ...draft, rules: draft.rules.filter((_, i) => i !== index) })}>
                        Remove rule {index + 1}
                    </button>
                </fieldset>
            ))}
            <button type="button" class="ghost" onClick={() => setDraft({ ...draft, rules: [...draft.rules, emptyRule()] })}>+ Add a rule</button>
            <button type="button" class="ghost" onClick={() => setDraft({ ...draft, enabled: true, rules: [...draft.rules, socialMediaRule()] })}>+ Add TikTok, Facebook and Instagram</button>
            <Footer editor={editor} saveLabel="Save time limits" />
        </Open>
    )
}

export function ScheduleEditor(props: Props) {
    const editor = usePolicyEditor({ ...props, section: scheduleSection })
    const { draft, policy, setDraft } = editor
    if (draft === null || policy === null) {
        return <Row title="Lock schedule" summary="Hours when the phone stays locked, such as bedtime or school." editor={editor} />
    }

    function updateWindow(index: number, change: Partial<LockWindow>) {
        setDraft({ ...draft!, windows: draft!.windows.map((window, i) => (i === index ? { ...window, ...change } : window)) })
    }

    function toggleDay(index: number, day: number, on: boolean) {
        const days = draft!.windows[index].days
        updateWindow(index, { days: on ? [...new Set([...days, day])] : days.filter((value) => value !== day) })
    }

    return (
        <Open title="Lock schedule" version={policy.version}>
            <p class="muted">
                Hours use the phone's own clock. If the end is earlier than the start, the window runs past midnight and belongs to
                the day it starts on.
            </p>
            <Toggle checked={draft.enabled} onChange={(enabled) => setDraft({ ...draft, enabled })}>Enforce this schedule</Toggle>
            {draft.windows.map((window, index) => (
                <fieldset key={index} class="group">
                    <legend>Window {index + 1}</legend>
                    <div class="days" role="group" aria-label={`Days for window ${index + 1}`}>
                        {DAYS.map((day) => (
                            <label key={day.value} class="chip">
                                <input type="checkbox" checked={window.days.includes(day.value)} onChange={(event) => toggleDay(index, day.value, event.currentTarget.checked)} />
                                <span>{day.label}</span>
                            </label>
                        ))}
                    </div>
                    <div class="pair">
                        <label>
                            From
                            <select value={window.fromHour} onChange={(event) => updateWindow(index, { fromHour: Number(event.currentTarget.value) })}>
                                {HOURS.map((hour) => <option key={hour} value={hour}>{String(hour).padStart(2, '0')}:00</option>)}
                            </select>
                        </label>
                        <label>
                            Until
                            <select value={window.toHour} onChange={(event) => updateWindow(index, { toHour: Number(event.currentTarget.value) })}>
                                {HOURS.map((hour) => <option key={hour} value={hour}>{String(hour).padStart(2, '0')}:00</option>)}
                            </select>
                        </label>
                    </div>
                    <button type="button" class="link danger" onClick={() => setDraft({ ...draft, windows: draft.windows.filter((_, i) => i !== index) })}>
                        Remove window {index + 1}
                    </button>
                </fieldset>
            ))}
            <button type="button" class="ghost" onClick={() => setDraft({ ...draft, windows: [...draft.windows, emptyWindow()] })}>+ Add a window</button>
            <Footer editor={editor} saveLabel="Save lock schedule" />
        </Open>
    )
}

export function LocationEditor(props: Props) {
    const editor = usePolicyEditor({ ...props, section: locationSection })
    const { draft, policy, setDraft } = editor
    if (draft === null || policy === null) {
        return <Row title="Location sharing" summary="The phone's position at a set interval. The phone shows its own notice while it's on." editor={editor} />
    }

    return (
        <Open title="Location sharing" version={policy.version}>
            <p class="muted">
                When on, the phone shows its own notice that location is being shared. Shorter intervals use more battery, so this
                console asks for {MIN_INTERVAL} to {MAX_INTERVAL} minutes.
            </p>
            <Toggle checked={draft.enabled} onChange={(enabled) => setDraft({ ...draft, enabled })}>Share this phone's location</Toggle>
            <label class="narrow">
                Minutes between updates
                <input inputMode="numeric" value={draft.intervalMinutes} onInput={(event) => setDraft({ ...draft, intervalMinutes: event.currentTarget.value })} />
            </label>
            <Footer editor={editor} saveLabel="Save location sharing" />
        </Open>
    )
}

export function CallLogEditor(props: Props) {
    const editor = usePolicyEditor({ ...props, section: callLogSection })
    const { draft, policy, setDraft } = editor
    if (draft === null || policy === null) {
        return <Row title="Call history" summary="The number, direction, time and length of each call. Listed on the phone's own notice." editor={editor} />
    }

    return (
        <Open title="Call history" version={policy.version}>
            <p class="muted">
                When on, the phone sends the number, direction, time and length of each call made from now on. Never what was said,
                contact names or text messages. The phone lists this on its own notice and status screen, and this server keeps
                calls for 30 days. It works only with Manara installed from the website, not from Google Play.
            </p>
            <Toggle checked={draft.enabled} onChange={(enabled) => setDraft({ enabled })}>Send call history</Toggle>
            <Footer editor={editor} saveLabel="Save call history" />
        </Open>
    )
}

export function UsageReportEditor(props: Props) {
    const editor = usePolicyEditor({ ...props, section: usageReportSection })
    const { draft, policy, setDraft } = editor
    if (draft === null || policy === null) {
        return <Row title="Daily usage report" summary="Minutes per app, sent about once an hour. Listed on the phone's own notice." editor={editor} />
    }

    return (
        <Open title="Daily usage report" version={policy.version}>
            <p class="muted">
                When on, the phone sends how many minutes each app was used today, about once an hour (the busiest 30 apps, by
                package name). The phone lists this on its own notice and status screen, and this server keeps the reports for 30
                days. It needs Usage Access to be on for Manara.
            </p>
            <Toggle checked={draft.enabled} onChange={(enabled) => setDraft({ enabled })}>Send daily app usage</Toggle>
            <Footer editor={editor} saveLabel="Save usage report" />
        </Open>
    )
}

export function SiteFilterEditor(props: Props) {
    const editor = usePolicyEditor({ ...props, section: filterSection })
    const { draft, policy, setDraft } = editor
    if (draft === null || policy === null) {
        return <Row title="Site filtering" summary="Filter websites through a family Private DNS host." editor={editor} />
    }
    const note = unlockedNote(draft.enabled, policy)

    return (
        <Open title="Site filtering" version={policy.version}>
            <p class="muted">
                The phone is pointed at a filtering Private DNS host, for example family.adguard-dns.com. Enter a host name only (no
                web address, port or IP address).
            </p>
            <Toggle checked={draft.enabled} onChange={(enabled) => setDraft({ ...draft, enabled })}>Filter sites on this phone</Toggle>
            <label>
                Filtering host name
                <input value={draft.dnsHost} autoCapitalize="off" spellcheck={false} onInput={(event) => setDraft({ ...draft, dnsHost: event.currentTarget.value })} />
            </label>
            <button type="button" class="ghost" onClick={() => setDraft({ ...draft, enabled: true, dnsHost: FAMILY_FILTER_HOST })}>Block adult sites (AdGuard family filter)</button>
            {note && <p role="note" class="banner">{note}</p>}
            <Footer editor={editor} saveLabel="Save site filtering" />
        </Open>
    )
}

export function RestrictionsEditor(props: Props) {
    const editor = usePolicyEditor({ ...props, section: restrictionsSection })
    const { draft, policy, setDraft } = editor
    if (draft === null || policy === null) {
        return <Row title="Settings restrictions" summary="Stop the child changing the phone's own settings." editor={editor} />
    }
    const draftNow = draft

    return (
        <Open title="Settings restrictions" version={policy.version}>
            <p class="muted">Turning one off lets the child use that setting again.</p>
            {RESTRICTIONS.map(({ key, label, help }) => (
                <Toggle key={key} checked={draftNow[key]} onChange={(on) => setDraft({ ...draftNow, [key]: on })}>
                    {label}{help && <span class="muted small"> {help}</span>}
                </Toggle>
            ))}
            <Footer editor={editor} saveLabel="Save restrictions" />
        </Open>
    )
}

export function BrowserEditor(props: Props) {
    const editor = usePolicyEditor({ ...props, section: browserSection })
    const { draft, policy, setDraft } = editor
    if (draft === null || policy === null) {
        return <Row title="Chrome" summary="SafeSearch, YouTube Restricted Mode, and websites to block in Chrome." editor={editor} />
    }
    const draftNow = draft
    const filterOn = (policy.siteFilter as { enabled?: boolean } | undefined)?.enabled === true

    return (
        <Open title="Chrome" version={policy.version}>
            <p class="muted">
                These rules apply in Chrome only, so another browser could go around them and the site filter. Block other browsers below.
                The child sees each rule on the phone.
            </p>
            <Toggle checked={draftNow.safeSearch} onChange={(on) => setDraft({ ...draftNow, safeSearch: on })}>
                SafeSearch on Google<span class="muted small"> Hides explicit results in Google Search.</span>
            </Toggle>
            <label>
                YouTube in Chrome
                <select value={draftNow.youtube} onChange={(event) => setDraft({ ...draftNow, youtube: event.currentTarget.value as YouTubeMode })}>
                    {YOUTUBE_MODES.map((mode) => <option key={mode.key} value={mode.key}>{mode.label}</option>)}
                </select>
                <span class="muted small">The YouTube app is separate: give it a time limit to control it.</span>
            </label>
            <Toggle checked={draftNow.secureDnsOff} onChange={(on) => setDraft({ ...draftNow, secureDnsOff: on })}>
                Turn off Chrome's own secure DNS<span class="muted small"> {secureDnsNote(filterOn)}</span>
            </Toggle>
            <Toggle checked={draftNow.blockOtherBrowsers} onChange={(on) => setDraft({ ...draftNow, blockOtherBrowsers: on })}>
                Block every browser except Chrome<span class="muted small"> Includes browsers installed later. Make sure Chrome is installed and set as the phone's default browser.</span>
            </Toggle>
            <label>
                Websites to block
                <textarea
                    rows={5}
                    placeholder={'example.com\nanother.example'}
                    value={draftNow.sitesText}
                    onInput={(event) => setDraft({ ...draftNow, sitesText: event.currentTarget.value })}
                />
                <span class="muted small">One per line, up to {MAX_SITES}. A site also blocks its subdomains.</span>
            </label>
            <Footer editor={editor} saveLabel="Save Chrome rules" />
        </Open>
    )
}
