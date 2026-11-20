import { useEffect, useState } from 'preact/hooks'
import type { ComponentChildren } from 'preact'
import type { Account, ActionBody, AgentUpdateState, Api, Phone, SiteNotice } from './api.ts'
import { ActionError } from './api.ts'

/**
 * The admin console's actions (docs/admin-console.md, part 1). Every one opens the same panel: what
 * will happen, a reason (kept in the admin log), and the target typed out to confirm. The server
 * checks both again; this panel only makes a slip harder.
 */
export function phoneCode(id: string): string {
    return id.slice(0, 8)
}

interface Pending {
    title: string
    effect: string
    /** What to type to confirm; none for actions without one target. */
    confirm?: string
    danger?: boolean
    run: (body: ActionBody) => Promise<unknown>
}

function ConfirmPanel({ pending, onClose, onDone }: { pending: Pending; onClose: () => void; onDone: () => void }) {
    const [reason, setReason] = useState('')
    const [typed, setTyped] = useState('')
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState('')
    const ready = reason.trim() !== '' && (!pending.confirm || typed.trim().toLowerCase() === pending.confirm.toLowerCase())

    async function go(event: Event) {
        event.preventDefault()
        if (!ready) return
        setBusy(true)
        setError('')
        try {
            await pending.run({ reason: reason.trim(), confirm: typed.trim() || undefined })
            onDone()
        } catch (caught) {
            setError(caught instanceof ActionError ? `${caught.message} (${caught.code})` : String(caught))
        } finally {
            setBusy(false)
        }
    }

    return (
        <form class={pending.danger ? 'card confirm danger' : 'card confirm'} role="dialog" aria-labelledby="confirm-title" onSubmit={go}>
            <h3 id="confirm-title">{pending.title}</h3>
            <p>{pending.effect}</p>
            <label>
                Why (kept in the admin log)
                <textarea rows={2} maxLength={300} required value={reason} onInput={(e) => setReason(e.currentTarget.value)} />
            </label>
            {pending.confirm && (
                <label>
                    Type <code>{pending.confirm}</code> to confirm
                    <input autoComplete="off" spellcheck={false} value={typed} onInput={(e) => setTyped(e.currentTarget.value)} />
                </label>
            )}
            {error && <p role="alert" class="error">{error}</p>}
            <div class="row">
                <button type="button" class="ghost" onClick={onClose}>Cancel</button>
                <button type="submit" class={pending.danger ? 'danger' : 'primary'} disabled={!ready || busy}>{busy ? 'Working…' : pending.title}</button>
            </div>
        </form>
    )
}

/** A row of action buttons; clicking one opens the confirmation panel under it. */
function ActionBar({ actions, onDone, children }: { actions: (Pending & { label: string; disabled?: string })[]; onDone: () => void; children?: ComponentChildren }) {
    const [pending, setPending] = useState<Pending | null>(null)
    const [note, setNote] = useState('')
    return (
        <div class="stack">
            <div class="row wrap">
                {children}
                {actions.map((a) => (
                    <button key={a.label} type="button" class={a.danger ? 'ghost danger-text' : 'ghost'} disabled={a.disabled !== undefined} title={a.disabled} onClick={() => { setNote(''); setPending(a) }}>{a.label}</button>
                ))}
            </div>
            {pending && <ConfirmPanel pending={pending} onClose={() => setPending(null)} onDone={() => { setNote(`Done: ${pending.title}.`); setPending(null); onDone() }} />}
            {note && <p role="status" class="ok-text">{note}</p>}
        </div>
    )
}

export function AccountActions({ api, account, onDone }: { api: Api; account: Account; onDone: () => void }) {
    const email = account.email
    const actions: (Pending & { label: string; disabled?: string })[] = [
        {
            label: 'Turn off two-step sign-in', title: 'Turn off two-step sign-in', confirm: email,
            effect: `${email} will sign in with the password only, and their recovery codes stop working. For a parent who lost their authenticator. They see this in their Recent activity.`,
            disabled: account.twoStep ? undefined : 'Two-step sign-in is already off',
            run: (b) => api.twoStepOff(account.id, b),
        },
        {
            label: 'Send a password-reset link', title: 'Send a password-reset link', confirm: email,
            effect: `An email with a one-hour link goes to ${email}. Nobody else receives it.`,
            run: (b) => api.passwordReset(account.id, b),
        },
        account.suspendedAt
            ? {
                label: 'Reactivate', title: 'Reactivate the account', confirm: email,
                effect: `${email} can sign in again.`,
                run: (b) => api.reactivate(account.id, b),
            }
            : {
                label: 'Suspend', title: 'Suspend the account', confirm: email, danger: true,
                effect: `${email} is signed out everywhere and can't sign in until reactivated. Their phones keep their rules. For misuse, or at the parent's request.`,
                run: (b) => api.suspend(account.id, b),
            },
        {
            label: 'Delete the account', title: 'Delete the account', confirm: email, danger: true,
            effect: `${email} and everything stored with it are deleted for good.`,
            disabled: account.phones > 0 ? 'Only an account with no phone: a phone left behind could never be released' : undefined,
            run: (b) => api.deleteAccount(account.id, b),
        },
    ]
    return <ActionBar actions={actions} onDone={onDone} />
}

export function PhoneActions({ api, phone, onDone }: { api: Api; phone: Phone; onDone: () => void }) {
    const code = phoneCode(phone.id)
    const name = [phone.manufacturer, phone.model].filter(Boolean).join(' ') || 'this phone'
    return (
        <ActionBar onDone={onDone} actions={[
            {
                label: 'Clear setup', title: 'Clear guided setup', confirm: code,
                effect: `The console forgets ${name}'s guided-setup record, so the parent can start setup again. Nothing changes on the phone.`,
                disabled: phone.setupStatus ? undefined : 'No setup record',
                run: (b) => api.resetSetup(phone.id, b),
            },
            {
                label: 'Remove phone', title: 'Remove the phone from the account', confirm: code, danger: true,
                effect: `${name} and everything stored about it leave ${phone.accountEmail}'s account. Only for a phone that was reset or lost: a phone still managed keeps its rules and can't be released any more.`,
                run: (b) => api.removePhone(phone.id, b),
            },
        ]} />
    )
}

export function ReleasesView({ api }: { api: Api }) {
    const [state, setState] = useState<AgentUpdateState | null>(null)
    const [error, setError] = useState('')
    const [reload, setReload] = useState(0)
    const [code, setCode] = useState('')
    const [name, setName] = useState('')
    const [sha, setSha] = useState('')
    useEffect(() => {
        api.agentUpdate().then(setState).catch((e) => setError(String(e)))
    }, [api, reload])
    if (!state) return error ? <p role="alert" class="error">{error}</p> : <p class="muted">Loading…</p>
    const offered = state.offered
    const source = state.setting === null ? 'Render settings (AGENT_UPDATE_*)' : state.setting.paused ? 'paused from this console' : 'this console'
    return (
        <div class="stack">
            <div class="tiles">
                <div class={offered ? 'tile' : 'tile warn'}><span class="muted small">Phones are offered</span><b>{offered ? offered.versionName : 'nothing'}</b><span class="muted small">set by {source}</span></div>
                <div class="tile"><span class="muted small">Render's setting</span><b>{state.fallback ? state.fallback.versionName : 'none'}</b><span class="muted small">used when this console has no choice</span></div>
            </div>
            <ActionBar onDone={() => setReload((n) => n + 1)} actions={[
                {
                    label: 'Pause every update', title: 'Pause every update', danger: true,
                    effect: 'No phone downloads a new version until you offer one again. Phones already updated stay as they are.',
                    disabled: offered ? undefined : 'Already held back',
                    run: (b) => api.pauseUpdates(b),
                },
                {
                    label: "Use Render's setting again", title: "Use Render's setting again",
                    effect: 'This console stops choosing; phones are offered what the AGENT_UPDATE_* settings on Render say.',
                    disabled: state.setting === null ? 'Already' : undefined,
                    run: (b) => api.updatesFromServer(b),
                },
            ]} />
            <h3>Offer a new version</h3>
            <p class="muted small">Publish the GitHub release first, with <code>manara.apk</code> attached. The server downloads that file and checks its SHA-256 before any phone is told.</p>
            <div class="form-grid">
                <label>Version code<input inputMode="numeric" value={code} onInput={(e) => setCode(e.currentTarget.value)} placeholder="36" /></label>
                <label>Version name<input value={name} onInput={(e) => setName(e.currentTarget.value)} placeholder="1.0.36" /></label>
                <label class="wide">SHA-256 of manara.apk<input spellcheck={false} value={sha} onInput={(e) => setSha(e.currentTarget.value)} placeholder="64 hexadecimal characters" /></label>
            </div>
            <ActionBar onDone={() => setReload((n) => n + 1)} actions={[{
                label: 'Offer this version', title: `Offer ${name || 'this version'} to every phone`, confirm: name || undefined,
                effect: `Every phone installed from the site updates to ${name} the next time it charges on Wi-Fi.`,
                disabled: /^\d+$/.test(code) && name.trim() !== '' && /^[0-9a-fA-F]{64}$/.test(sha.trim()) ? undefined : 'Fill in the three fields',
                run: (b) => api.offerVersion({ ...b, versionCode: Number(code), versionName: name.trim(), sha256: sha.trim().toLowerCase() }),
            }]} />
        </div>
    )
}

export function NoticeView({ api }: { api: Api }) {
    const [current, setCurrent] = useState<SiteNotice | null | undefined>(undefined)
    const [reload, setReload] = useState(0)
    const [level, setLevel] = useState<'info' | 'warning'>('info')
    const [en, setEn] = useState('')
    const [fr, setFr] = useState('')
    const [ar, setAr] = useState('')
    const [until, setUntil] = useState('')
    useEffect(() => {
        api.notice().then((r) => setCurrent(r.notice)).catch(() => setCurrent(null))
    }, [api, reload])
    const notice: SiteNotice = {
        level,
        text: Object.fromEntries(Object.entries({ en, fr, ar }).filter(([, v]) => v.trim() !== '').map(([k, v]) => [k, v.trim()])),
        ...(until ? { until: new Date(until).toISOString() } : {}),
    }
    return (
        <div class="stack">
            <h3>Shown now</h3>
            {current === undefined ? <p class="muted">Loading…</p> : current === null ? <p class="muted">No notice: parents see nothing.</p> : (
                <div class={current.level === 'warning' ? 'card notice warn' : 'card notice'}>
                    {Object.entries(current.text).map(([lang, text]) => <p key={lang} dir={lang === 'ar' ? 'rtl' : 'ltr'}><b>{lang}</b> {text}</p>)}
                    <p class="muted small">{current.until ? `Until ${new Date(current.until).toLocaleString()}` : 'Until removed'}</p>
                </div>
            )}
            <ActionBar onDone={() => setReload((n) => n + 1)} actions={[{
                label: 'Remove the notice', title: 'Remove the notice', effect: 'Parents stop seeing it at their next page load.',
                disabled: current ? undefined : 'Nothing shown',
                run: (b) => api.clearNotice(b),
            }]} />
            <h3>New notice</h3>
            <p class="muted small">Shown at the top of every parent's console, in their language (English when there is no translation). At most 300 characters each.</p>
            <div class="form-grid">
                <label>Kind<select value={level} onChange={(e) => setLevel(e.currentTarget.value as 'info' | 'warning')}><option value="info">Information</option><option value="warning">Warning</option></select></label>
                <label>Until (optional)<input type="datetime-local" value={until} onInput={(e) => setUntil(e.currentTarget.value)} /></label>
                <label class="wide">English (required)<textarea rows={2} maxLength={300} value={en} onInput={(e) => setEn(e.currentTarget.value)} /></label>
                <label class="wide">Français<textarea rows={2} maxLength={300} value={fr} onInput={(e) => setFr(e.currentTarget.value)} /></label>
                <label class="wide">العربية<textarea rows={2} maxLength={300} dir="rtl" value={ar} onInput={(e) => setAr(e.currentTarget.value)} /></label>
            </div>
            <ActionBar onDone={() => { setReload((n) => n + 1); setEn(''); setFr(''); setAr(''); setUntil('') }} actions={[{
                label: 'Show this notice', title: 'Show this notice to every parent', effect: `"${en.trim()}" appears at the top of every parent's console.`,
                disabled: en.trim() !== '' ? undefined : 'Write the English text first',
                run: (b) => api.setNotice({ ...b, notice }),
            }]} />
        </div>
    )
}
