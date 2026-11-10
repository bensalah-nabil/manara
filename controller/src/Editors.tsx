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
import { t } from './i18n.ts'

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
        blocksImmediately(after) ? t('limitsEditor.confirmZero') : null,
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
            ? t('scheduleEditor.confirm')
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
        after.enabled && !before.enabled ? t('locationEditor.confirm') : null,
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
        return added.length === 0 ? null : t('restrictEditor.confirm', { list: added.join('; ') })
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
            <button type="button" onClick={editor.load} disabled={editor.loading} aria-label={t('editor.editLabel', { title })}>
                {editor.loading ? t('common.loading') : t('common.edit')}
            </button>
        </section>
    )
}

function Open({ title, version, children }: { title: string; version: number; children: ComponentChildren }) {
    return (
        <section class="card editing">
            <div class="card-head">
                <h3>{title}</h3>
                <span class="muted small">{t('editor.policyVersion', { n: version })}</span>
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
                <button type="button" class="ghost" onClick={editor.close}>{t('common.close')}</button>
                <button type="button" class="primary" onClick={editor.save} disabled={editor.saving}>{editor.saving ? t('common.saving') : saveLabel}</button>
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
        return <Row title={t('limitsEditor.title')} summary={t('limitsEditor.summary')} editor={editor} />
    }

    function updateRule(index: number, change: Partial<RuleDraft>) {
        setDraft({ ...draft!, rules: draft!.rules.map((rule, i) => (i === index ? { ...rule, ...change } : rule)) })
    }

    return (
        <Open title={t('limitsEditor.title')} version={policy.version}>
            <p class="muted">{t('limitsEditor.only')}</p>
            <Toggle checked={draft.enabled} onChange={(enabled) => setDraft({ ...draft, enabled })}>{t('limitsEditor.enforce')}</Toggle>
            {draft.rules.map((rule, index) => (
                <fieldset key={index} class="group">
                    <legend>{t('limitsEditor.rule', { n: index + 1 })}</legend>
                    <label>
                        {t('limitsEditor.name')}
                        <input value={rule.category} onInput={(event) => updateRule(index, { category: event.currentTarget.value })} />
                    </label>
                    <label>
                        {t('limitsEditor.packages')}
                        <textarea rows={3} spellcheck={false} value={rule.packages} onInput={(event) => updateRule(index, { packages: event.currentTarget.value })} />
                    </label>
                    <label class="narrow">
                        {t('limitsEditor.minutes')}
                        <input inputMode="numeric" value={rule.dailyMinutes} onInput={(event) => updateRule(index, { dailyMinutes: event.currentTarget.value })} />
                    </label>
                    <button type="button" class="link danger" onClick={() => setDraft({ ...draft, rules: draft.rules.filter((_, i) => i !== index) })}>
                        {t('limitsEditor.removeRule', { n: index + 1 })}
                    </button>
                </fieldset>
            ))}
            <button type="button" class="ghost" onClick={() => setDraft({ ...draft, rules: [...draft.rules, emptyRule()] })}>{t('limitsEditor.addRule')}</button>
            <button type="button" class="ghost" onClick={() => setDraft({ ...draft, enabled: true, rules: [...draft.rules, socialMediaRule()] })}>{t('limitsEditor.addSocial')}</button>
            <Footer editor={editor} saveLabel={t('limitsEditor.save')} />
        </Open>
    )
}

export function ScheduleEditor(props: Props) {
    const editor = usePolicyEditor({ ...props, section: scheduleSection })
    const { draft, policy, setDraft } = editor
    if (draft === null || policy === null) {
        return <Row title={t('scheduleEditor.title')} summary={t('scheduleEditor.summary')} editor={editor} />
    }

    function updateWindow(index: number, change: Partial<LockWindow>) {
        setDraft({ ...draft!, windows: draft!.windows.map((window, i) => (i === index ? { ...window, ...change } : window)) })
    }

    function toggleDay(index: number, day: number, on: boolean) {
        const days = draft!.windows[index].days
        updateWindow(index, { days: on ? [...new Set([...days, day])] : days.filter((value) => value !== day) })
    }

    return (
        <Open title={t('scheduleEditor.title')} version={policy.version}>
            <p class="muted">
                {t('scheduleEditor.help')}
            </p>
            <Toggle checked={draft.enabled} onChange={(enabled) => setDraft({ ...draft, enabled })}>{t('scheduleEditor.enforce')}</Toggle>
            {draft.windows.map((window, index) => (
                <fieldset key={index} class="group">
                    <legend>{t('scheduleEditor.window', { n: index + 1 })}</legend>
                    <div class="days" role="group" aria-label={t('scheduleEditor.daysLabel', { n: index + 1 })}>
                        {DAYS.map((day) => (
                            <label key={day.value} class="chip">
                                <input type="checkbox" checked={window.days.includes(day.value)} onChange={(event) => toggleDay(index, day.value, event.currentTarget.checked)} />
                                <span>{day.label}</span>
                            </label>
                        ))}
                    </div>
                    <div class="pair">
                        <label>
                            {t('scheduleEditor.from')}
                            <select value={window.fromHour} onChange={(event) => updateWindow(index, { fromHour: Number(event.currentTarget.value) })}>
                                {HOURS.map((hour) => <option key={hour} value={hour}>{String(hour).padStart(2, '0')}:00</option>)}
                            </select>
                        </label>
                        <label>
                            {t('scheduleEditor.until')}
                            <select value={window.toHour} onChange={(event) => updateWindow(index, { toHour: Number(event.currentTarget.value) })}>
                                {HOURS.map((hour) => <option key={hour} value={hour}>{String(hour).padStart(2, '0')}:00</option>)}
                            </select>
                        </label>
                    </div>
                    <button type="button" class="link danger" onClick={() => setDraft({ ...draft, windows: draft.windows.filter((_, i) => i !== index) })}>
                        {t('scheduleEditor.removeWindow', { n: index + 1 })}
                    </button>
                </fieldset>
            ))}
            <button type="button" class="ghost" onClick={() => setDraft({ ...draft, windows: [...draft.windows, emptyWindow()] })}>{t('scheduleEditor.addWindow')}</button>
            <Footer editor={editor} saveLabel={t('scheduleEditor.save')} />
        </Open>
    )
}

export function LocationEditor(props: Props) {
    const editor = usePolicyEditor({ ...props, section: locationSection })
    const { draft, policy, setDraft } = editor
    if (draft === null || policy === null) {
        return <Row title={t('locationEditor.title')} summary={t('locationEditor.summary')} editor={editor} />
    }

    return (
        <Open title={t('locationEditor.title')} version={policy.version}>
            <p class="muted">
                {t('locationEditor.help', { min: MIN_INTERVAL, max: MAX_INTERVAL })}
            </p>
            <Toggle checked={draft.enabled} onChange={(enabled) => setDraft({ ...draft, enabled })}>{t('locationEditor.share')}</Toggle>
            <label class="narrow">
                {t('locationEditor.interval')}
                <input inputMode="numeric" value={draft.intervalMinutes} onInput={(event) => setDraft({ ...draft, intervalMinutes: event.currentTarget.value })} />
            </label>
            <Footer editor={editor} saveLabel={t('locationEditor.save')} />
        </Open>
    )
}

export function CallLogEditor(props: Props) {
    const editor = usePolicyEditor({ ...props, section: callLogSection })
    const { draft, policy, setDraft } = editor
    if (draft === null || policy === null) {
        return <Row title={t('calls.title')} summary={t('callEditor.summary')} editor={editor} />
    }

    return (
        <Open title={t('calls.title')} version={policy.version}>
            <p class="muted">
                {t('callEditor.help1')}
            </p>
            <p class="muted">
                {t('callEditor.help2')}
            </p>
            <Toggle checked={draft.enabled} onChange={(enabled) => setDraft({ enabled })}>{t('callEditor.send')}</Toggle>
            <Footer editor={editor} saveLabel={t('callEditor.save')} />
        </Open>
    )
}

export function UsageReportEditor(props: Props) {
    const editor = usePolicyEditor({ ...props, section: usageReportSection })
    const { draft, policy, setDraft } = editor
    if (draft === null || policy === null) {
        return <Row title={t('usageEditor.title')} summary={t('usageEditor.summary')} editor={editor} />
    }

    return (
        <Open title={t('usageEditor.title')} version={policy.version}>
            <p class="muted">
                {t('usageEditor.help')}
            </p>
            <Toggle checked={draft.enabled} onChange={(enabled) => setDraft({ enabled })}>{t('usageEditor.send')}</Toggle>
            <Footer editor={editor} saveLabel={t('usageEditor.save')} />
        </Open>
    )
}

export function SiteFilterEditor(props: Props) {
    const editor = usePolicyEditor({ ...props, section: filterSection })
    const { draft, policy, setDraft } = editor
    if (draft === null || policy === null) {
        return <Row title={t('filterEditor.title')} summary={t('filterEditor.summary')} editor={editor} />
    }
    const note = unlockedNote(draft.enabled, policy)

    return (
        <Open title={t('filterEditor.title')} version={policy.version}>
            <p class="muted">
                {t('filterEditor.help')}
            </p>
            <Toggle checked={draft.enabled} onChange={(enabled) => setDraft({ ...draft, enabled })}>{t('filterEditor.enable')}</Toggle>
            <label>
                {t('filterEditor.host')}
                <input value={draft.dnsHost} autoCapitalize="off" spellcheck={false} onInput={(event) => setDraft({ ...draft, dnsHost: event.currentTarget.value })} />
            </label>
            <button type="button" class="ghost" onClick={() => setDraft({ ...draft, enabled: true, dnsHost: FAMILY_FILTER_HOST })}>{t('filterEditor.family')}</button>
            {note && <p role="note" class="banner">{note}</p>}
            <Footer editor={editor} saveLabel={t('filterEditor.save')} />
        </Open>
    )
}

export function RestrictionsEditor(props: Props) {
    const editor = usePolicyEditor({ ...props, section: restrictionsSection })
    const { draft, policy, setDraft } = editor
    if (draft === null || policy === null) {
        return <Row title={t('restrictEditor.title')} summary={t('restrictEditor.summary')} editor={editor} />
    }
    const draftNow = draft

    return (
        <Open title={t('restrictEditor.title')} version={policy.version}>
            <p class="muted">{t('restrictEditor.help')}</p>
            {RESTRICTIONS.map(({ key, label, help }) => (
                <Toggle key={key} checked={draftNow[key]} onChange={(on) => setDraft({ ...draftNow, [key]: on })}>
                    {label}{help && <span class="muted small"> {help}</span>}
                </Toggle>
            ))}
            <Footer editor={editor} saveLabel={t('restrictEditor.save')} />
        </Open>
    )
}

export function BrowserEditor(props: Props) {
    const editor = usePolicyEditor({ ...props, section: browserSection })
    const { draft, policy, setDraft } = editor
    if (draft === null || policy === null) {
        return <Row title={t('chromeEditor.title')} summary={t('chromeEditor.summary')} editor={editor} />
    }
    const draftNow = draft
    const filterOn = (policy.siteFilter as { enabled?: boolean } | undefined)?.enabled === true

    return (
        <Open title={t('chromeEditor.title')} version={policy.version}>
            <p class="muted">
                {t('chromeEditor.help')}
            </p>
            <Toggle checked={draftNow.safeSearch} onChange={(on) => setDraft({ ...draftNow, safeSearch: on })}>
                {t('chromeEditor.safeSearch')}<span class="muted small"> {t('chromeEditor.safeSearchHelp')}</span>
            </Toggle>
            <label>
                {t('chromeEditor.youtube')}
                <select value={draftNow.youtube} onChange={(event) => setDraft({ ...draftNow, youtube: event.currentTarget.value as YouTubeMode })}>
                    {YOUTUBE_MODES.map((mode) => <option key={mode.key} value={mode.key}>{mode.label}</option>)}
                </select>
                <span class="muted small">{t('chromeEditor.youtubeHelp')}</span>
            </label>
            <Toggle checked={draftNow.secureDnsOff} onChange={(on) => setDraft({ ...draftNow, secureDnsOff: on })}>
                {t('chromeEditor.secureDns')}<span class="muted small"> {secureDnsNote(filterOn)}</span>
            </Toggle>
            <Toggle checked={draftNow.blockOtherBrowsers} onChange={(on) => setDraft({ ...draftNow, blockOtherBrowsers: on })}>
                {t('chromeEditor.otherBrowsers')}<span class="muted small"> {t('chromeEditor.otherBrowsersHelp')}</span>
            </Toggle>
            <label>
                {t('chromeEditor.sites')}
                <textarea
                    rows={5}
                    placeholder={'example.com\nanother.example'}
                    value={draftNow.sitesText}
                    onInput={(event) => setDraft({ ...draftNow, sitesText: event.currentTarget.value })}
                />
                <span class="muted small">{t('chromeEditor.sitesHelp', { n: MAX_SITES })}</span>
            </label>
            <Footer editor={editor} saveLabel={t('chromeEditor.save')} />
        </Open>
    )
}
