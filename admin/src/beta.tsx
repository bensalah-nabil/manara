import { useEffect, useState } from 'preact/hooks'
import type { Api, BetaSignup, BetaStatus } from './api.ts'

/**
 * The "Familles pionnières" sign-ups from the public beta page, to book each setup call and follow
 * it up. These are parents' own contact details, given to be called back: shown in full, and every
 * opening of this list and every change is in the admin log. Deleted by the server after 180 days.
 */
const STATUS: Record<BetaStatus, string> = { new: 'New', contacted: 'Contacted', set_up: 'Set up', declined: 'Declined' }
const BRAND: Record<string, string> = { samsung: 'Samsung', xiaomi: 'Xiaomi', 'oppo-realme': 'Oppo/Realme', other: 'Other Android', iphone: 'iPhone (waiting list)' }
const AGE: Record<string, string> = { under10: 'Under 10', '10to13': '10 to 13', '14to17': '14 to 17' }
const LANG: Record<string, string> = { fr: 'French', ar: 'Arabic', en: 'English' }
const WORRY: Record<string, string> = { night: 'nights', 'screen-time': 'screen time', 'adult-content': 'adult content', strangers: 'strangers', games: 'games', other: 'other' }
const SLOT: Record<string, string> = { 'weekday-evening': 'weekday evenings', 'saturday-morning': 'Saturday mornings', other: 'another time' }

/** WhatsApp's own link: digits only, the country code included. */
export function whatsappLink(number: string): string {
    return `https://wa.me/${number.replace(/[^0-9]/g, '')}`
}

export function BetaView({ api }: { api: Api }) {
    const [list, setList] = useState<BetaSignup[] | null>(null)
    const [error, setError] = useState('')
    const [filter, setFilter] = useState<BetaStatus | 'all'>('all')
    const [busy, setBusy] = useState('')

    useEffect(() => {
        let current = true
        api.betaSignups().then((l) => { if (current) setList(l) }).catch((e) => { if (current) setError(String(e)) })
        return () => { current = false }
    }, [api])

    async function change(s: BetaSignup, status: BetaStatus) {
        setBusy(s.id)
        try {
            await api.setBetaStatus(s.id, status)
            setList((l) => l?.map((x) => (x.id === s.id ? { ...x, status } : x)) ?? null)
        } catch (e) {
            setError(String(e))
        } finally {
            setBusy('')
        }
    }

    if (!list) return error ? <p role="alert" class="error">{error}</p> : <p class="muted">Loading…</p>
    const counts = (Object.keys(STATUS) as BetaStatus[]).map((k) => [k, list.filter((s) => s.status === k).length] as const)
    const shown = filter === 'all' ? list : list.filter((s) => s.status === filter)

    return (
        <div class="stack">
            <h2>Familles pionnières</h2>
            <p class="muted small">Sign-ups from the beta page (/beta). Write to each family on WhatsApp within 48 hours, then set where they are. Kept 180 days.</p>
            {error && <p role="alert" class="error">{error}</p>}
            <div class="seg" role="group" aria-label="Show">
                <button type="button" class={filter === 'all' ? 'on' : ''} aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>All {list.length}</button>
                {counts.map(([k, n]) => (
                    <button key={k} type="button" class={filter === k ? 'on' : ''} aria-pressed={filter === k} onClick={() => setFilter(k)}>{STATUS[k]} {n}</button>
                ))}
            </div>
            {shown.length === 0 ? <p class="muted">Nothing here yet.</p> : (
                <div class="scroll">
                    <table>
                        <thead><tr><th>Signed up</th><th>Parent</th><th>Phone</th><th>Child</th><th>Call</th><th>Status</th></tr></thead>
                        <tbody>
                            {shown.map((s) => (
                                <tr key={s.id}>
                                    <td>{new Date(s.createdAt).toLocaleString()}</td>
                                    <td>
                                        <strong>{s.firstName}</strong><br />
                                        <a href={whatsappLink(s.whatsapp)} target="_blank" rel="noopener noreferrer">{s.whatsapp}</a><br />
                                        <span class="muted small">{s.place}</span>
                                    </td>
                                    <td>{BRAND[s.brand] ?? s.brand}{s.model && <><br /><span class="muted small">{s.model}</span></>}</td>
                                    <td>{AGE[s.childAge] ?? s.childAge}{s.worries.length > 0 && <><br /><span class="muted small">{s.worries.map((w) => WORRY[w] ?? w).join(', ')}</span></>}</td>
                                    <td>{LANG[s.callLanguage] ?? s.callLanguage}{s.slots.length > 0 && <><br /><span class="muted small">{s.slots.map((x) => SLOT[x] ?? x).join(', ')}</span></>}</td>
                                    <td>
                                        <select value={s.status} disabled={busy === s.id} aria-label={`Status of ${s.firstName}`}
                                            onChange={(e) => void change(s, (e.target as HTMLSelectElement).value as BetaStatus)}>
                                            {(Object.keys(STATUS) as BetaStatus[]).map((k) => <option key={k} value={k}>{STATUS[k]}</option>)}
                                        </select>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    )
}
