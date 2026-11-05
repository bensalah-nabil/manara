import type { Api, DeviceSummary } from './api.ts'
import { applyLocation, MAX_INTERVAL, MIN_INTERVAL, toDraft as locationDraft, validateDraft as validateLocation } from './location.ts'
import type { Draft as LocationDraft, LocationPolicy } from './location.ts'
import { applySchedule, DAYS, emptyWindow, toDraft as scheduleDraft, validateDraft as validateSchedule } from './schedule.ts'
import type { Draft as ScheduleDraft, LockSchedule, LockWindow } from './schedule.ts'
import { applyTimeLimits, blocksImmediately, emptyRule, toDraft as limitsDraft, validateDraft as validateLimits } from './timeLimits.ts'
import type { Draft as LimitsDraft, RuleDraft, TimeLimits } from './timeLimits.ts'
import { applyRestrictions, RESTRICTIONS, toDraft as restrictionsDraft } from './restrictions.ts'
import type { Draft as RestrictionsDraft } from './restrictions.ts'
import { applySiteFilter, filterWarning, toDraft as filterDraft, unlockedNote, validateDraft as validateFilter } from './siteFilter.ts'
import type { Draft as FilterDraft, SiteFilter } from './siteFilter.ts'
import { usePolicyEditor } from './usePolicyEditor.ts'
import type { Section } from './usePolicyEditor.ts'

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

function Closed({ label, loading, error, onOpen }: { label: string; loading: boolean; error: string; onOpen: () => void }) {
    return (
        <div className="stack">
            <button type="button" onClick={onOpen} disabled={loading}>{loading ? 'Loading...' : label}</button>
            <p role="alert" className="error">{error}</p>
        </div>
    )
}

function Footer({ editor, saveLabel }: { editor: { problems: string[]; error: string; saved: string; saving: boolean; save: () => void; close: () => void }; saveLabel: string }) {
    return (
        <>
            {editor.problems.length > 0 && (
                <ul role="alert" className="error">
                    {editor.problems.map((problem) => <li key={problem}>{problem}</li>)}
                </ul>
            )}
            <p role="alert" className="error">{editor.error}</p>
            {editor.saved && <p role="status" className="hint">{editor.saved}</p>}
            <div className="row">
                <button type="button" onClick={editor.save} disabled={editor.saving}>{editor.saving ? 'Saving...' : saveLabel}</button>
                <button type="button" className="link" onClick={editor.close}>Close</button>
            </div>
        </>
    )
}

export function TimeLimitsEditor(props: Props) {
    const editor = usePolicyEditor({ ...props, section: limitsSection })
    const { draft, policy, setDraft } = editor
    if (draft === null || policy === null) {
        return <Closed label="Edit app time limits" loading={editor.loading} error={editor.error} onOpen={editor.load} />
    }

    function updateRule(index: number, change: Partial<RuleDraft>) {
        setDraft({ ...draft!, rules: draft!.rules.map((rule, i) => (i === index ? { ...rule, ...change } : rule)) })
    }

    return (
        <div className="stack">
            <strong>App time limits</strong>
            <p className="hint">Current policy version {policy.version}. Only time limits are changed here; the device's other settings are kept.</p>
            <label className="check">
                <input type="checkbox" checked={draft.enabled} onChange={(event) => setDraft({ ...draft, enabled: event.target.checked })} />
                Enforce these limits
            </label>
            {draft.rules.map((rule, index) => (
                <fieldset key={index} className="rule">
                    <legend>Rule {index + 1}</legend>
                    <label>
                        Name
                        <input value={rule.category} onChange={(event) => updateRule(index, { category: event.target.value })} />
                    </label>
                    <label>
                        App package names (one per line)
                        <textarea rows={3} value={rule.packages} onChange={(event) => updateRule(index, { packages: event.target.value })} />
                    </label>
                    <label>
                        Minutes per day, shared by these apps
                        <input inputMode="numeric" value={rule.dailyMinutes} onChange={(event) => updateRule(index, { dailyMinutes: event.target.value })} />
                    </label>
                    <button type="button" className="link" onClick={() => setDraft({ ...draft, rules: draft.rules.filter((_, i) => i !== index) })}>
                        Remove rule {index + 1}
                    </button>
                </fieldset>
            ))}
            <button type="button" onClick={() => setDraft({ ...draft, rules: [...draft.rules, emptyRule()] })}>Add a rule</button>
            <Footer editor={editor} saveLabel="Save time limits" />
        </div>
    )
}

export function ScheduleEditor(props: Props) {
    const editor = usePolicyEditor({ ...props, section: scheduleSection })
    const { draft, policy, setDraft } = editor
    if (draft === null || policy === null) {
        return <Closed label="Edit lock schedule" loading={editor.loading} error={editor.error} onOpen={editor.load} />
    }

    function updateWindow(index: number, change: Partial<LockWindow>) {
        setDraft({ ...draft!, windows: draft!.windows.map((window, i) => (i === index ? { ...window, ...change } : window)) })
    }

    function toggleDay(index: number, day: number, on: boolean) {
        const days = draft!.windows[index].days
        updateWindow(index, { days: on ? [...new Set([...days, day])] : days.filter((value) => value !== day) })
    }

    return (
        <div className="stack">
            <strong>Lock schedule</strong>
            <p className="hint">
                Current policy version {policy.version}. Hours use the phone's own clock. If the end is earlier than the start,
                the window runs past midnight and belongs to the day it starts on.
            </p>
            <label className="check">
                <input type="checkbox" checked={draft.enabled} onChange={(event) => setDraft({ ...draft, enabled: event.target.checked })} />
                Enforce this schedule
            </label>
            {draft.windows.map((window, index) => (
                <fieldset key={index} className="rule">
                    <legend>Window {index + 1}</legend>
                    <div className="days" role="group" aria-label={`Days for window ${index + 1}`}>
                        {DAYS.map((day) => (
                            <label key={day.value} className="check">
                                <input type="checkbox" checked={window.days.includes(day.value)} onChange={(event) => toggleDay(index, day.value, event.target.checked)} />
                                {day.label}
                            </label>
                        ))}
                    </div>
                    <label>
                        Start hour
                        <select value={window.fromHour} onChange={(event) => updateWindow(index, { fromHour: Number(event.target.value) })}>
                            {Array.from({ length: 24 }, (_, hour) => <option key={hour} value={hour}>{String(hour).padStart(2, '0')}:00</option>)}
                        </select>
                    </label>
                    <label>
                        End hour
                        <select value={window.toHour} onChange={(event) => updateWindow(index, { toHour: Number(event.target.value) })}>
                            {Array.from({ length: 24 }, (_, hour) => <option key={hour} value={hour}>{String(hour).padStart(2, '0')}:00</option>)}
                        </select>
                    </label>
                    <button type="button" className="link" onClick={() => setDraft({ ...draft, windows: draft.windows.filter((_, i) => i !== index) })}>
                        Remove window {index + 1}
                    </button>
                </fieldset>
            ))}
            <button type="button" onClick={() => setDraft({ ...draft, windows: [...draft.windows, emptyWindow()] })}>Add a window</button>
            <Footer editor={editor} saveLabel="Save lock schedule" />
        </div>
    )
}

export function LocationEditor(props: Props) {
    const editor = usePolicyEditor({ ...props, section: locationSection })
    const { draft, policy, setDraft } = editor
    if (draft === null || policy === null) {
        return <Closed label="Edit location sharing" loading={editor.loading} error={editor.error} onOpen={editor.load} />
    }

    return (
        <div className="stack">
            <strong>Location sharing</strong>
            <p className="hint">
                Current policy version {policy.version}. When on, the phone shows its own notice that location is being shared.
                Shorter intervals use more battery, so this console asks for {MIN_INTERVAL} to {MAX_INTERVAL} minutes.
            </p>
            <label className="check">
                <input type="checkbox" checked={draft.enabled} onChange={(event) => setDraft({ ...draft, enabled: event.target.checked })} />
                Share this phone's location
            </label>
            <label>
                Minutes between updates
                <input inputMode="numeric" value={draft.intervalMinutes} onChange={(event) => setDraft({ ...draft, intervalMinutes: event.target.value })} />
            </label>
            <Footer editor={editor} saveLabel="Save location sharing" />
        </div>
    )
}

export function SiteFilterEditor(props: Props) {
    const editor = usePolicyEditor({ ...props, section: filterSection })
    const { draft, policy, setDraft } = editor
    if (draft === null || policy === null) {
        return <Closed label="Edit site filtering" loading={editor.loading} error={editor.error} onOpen={editor.load} />
    }
    const note = unlockedNote(draft.enabled, policy)

    return (
        <div className="stack">
            <strong>Site filtering</strong>
            <p className="hint">
                Current policy version {policy.version}. The phone is pointed at a filtering Private DNS host, for example
                family.adguard-dns.com. Enter a host name only (no web address, port or IP address).
            </p>
            <label className="check">
                <input type="checkbox" checked={draft.enabled} onChange={(event) => setDraft({ ...draft, enabled: event.target.checked })} />
                Filter sites on this phone
            </label>
            <label>
                Filtering host name
                <input value={draft.dnsHost} autoCapitalize="off" spellCheck={false} onChange={(event) => setDraft({ ...draft, dnsHost: event.target.value })} />
            </label>
            {note && <p role="note" className="hint">{note}</p>}
            <Footer editor={editor} saveLabel="Save site filtering" />
        </div>
    )
}

export function RestrictionsEditor(props: Props) {
    const editor = usePolicyEditor({ ...props, section: restrictionsSection })
    const { draft, policy, setDraft } = editor
    if (draft === null || policy === null) {
        return <Closed label="Edit settings restrictions" loading={editor.loading} error={editor.error} onOpen={editor.load} />
    }
    const draftNow = draft

    return (
        <div className="stack">
            <strong>Settings restrictions</strong>
            <p className="hint">
                Current policy version {policy.version}. These stop the child changing the phone's own settings. Turning one off lets the
                child use that setting again.
            </p>
            {RESTRICTIONS.map(({ key, label, help }) => (
                <label key={key} className="check">
                    <input type="checkbox" checked={draftNow[key]} onChange={(event) => setDraft({ ...draftNow, [key]: event.target.checked })} />
                    <span>{label}{help && <span className="hint"> {help}</span>}</span>
                </label>
            ))}
            <Footer editor={editor} saveLabel="Save restrictions" />
        </div>
    )
}
