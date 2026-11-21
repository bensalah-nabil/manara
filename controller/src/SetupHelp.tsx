import { useEffect, useRef, useState } from 'preact/hooks'
import { ApiError, isSessionError } from './api.ts'
import type { Api } from './api.ts'
import { language, t } from './i18n.ts'
import { MAX_QUESTION, failureKey, helpRequest, looksPrivate, suggestions } from './setupHelp.ts'
import type { HelpTurn } from './setupHelp.ts'

const SUPPORT_EMAIL = 'nabil.bsalah0@gmail.com'

interface SetupHelpProps {
    api: Api
    onSessionExpired: () => void
    /** The setup step the console shows: a server step key, or 'add_phone' / 'before'. */
    step: string
    status?: string
    /** The phone's maker as it reports it, or '' before it connected. */
    maker?: string
}

/**
 * "Stuck? Ask the setup assistant": answers from Manara's setup guide (backend/internal/setuphelp).
 * Shown only when the server has the assistant on. Sends the question, the last few turns, the
 * step, the maker and the language; never the child's name, the phone's id or an account.
 */
export function SetupHelp({ api, onSessionExpired, step, status = '', maker = '' }: SetupHelpProps) {
    const [available, setAvailable] = useState(false)
    const [open, setOpen] = useState(false)
    const [turns, setTurns] = useState<HelpTurn[]>([])
    const [question, setQuestion] = useState('')
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState('')
    const endRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        let current = true
        api.setupHelpAvailable()
            .then((on) => { if (current) setAvailable(on) })
            .catch((caught) => { if (current && isSessionError(caught)) onSessionExpired() })
        return () => { current = false }
    }, [api, onSessionExpired])

    useEffect(() => { endRef.current?.scrollIntoView?.({ block: 'nearest' }) }, [turns, busy])

    if (!available) return null
    if (!open) {
        return (
            <p class="help-open">
                <button type="button" class="ghost" onClick={() => setOpen(true)}>💬 {t('help.open')}</button>
            </p>
        )
    }

    const privateText = looksPrivate(question)

    async function ask(text: string) {
        const q = text.trim()
        if (!q || busy || looksPrivate(q)) return
        setBusy(true)
        setError('')
        const before = turns
        setTurns([...before, { role: 'parent', text: q }])
        setQuestion('')
        try {
            const answer = await api.askSetupHelp(helpRequest(q, before, { step, status, maker, language: language() }))
            setTurns([...before, { role: 'parent', text: q }, { role: 'assistant', text: answer }])
        } catch (caught) {
            if (isSessionError(caught)) { onSessionExpired(); return }
            // Give the question back so it can be sent again.
            setTurns(before)
            setQuestion(q)
            const code = caught instanceof ApiError ? caught.code : ''
            const statusCode = caught instanceof ApiError ? caught.status : 0
            setError(t(failureKey(code, statusCode)))
        } finally {
            setBusy(false)
        }
    }

    return (
        <section class="card stack setup-help" aria-labelledby="setup-help-title">
            <div class="card-head">
                <h3 id="setup-help-title">💬 {t('help.title')}</h3>
                <button type="button" class="ghost" onClick={() => setOpen(false)}>{t('help.close')}</button>
            </div>
            <p>{t('help.intro')}</p>
            <p class="muted small">{t('help.privacy')}</p>

            {turns.length === 0 && (
                <div class="help-suggestions" role="group" aria-label={t('help.suggested')}>
                    {suggestions(step, status).map((key) => (
                        <button key={key} type="button" class="chip" disabled={busy} onClick={() => void ask(t(key))}>{t(key)}</button>
                    ))}
                </div>
            )}

            {turns.length > 0 && (
                <div class="help-turns" aria-live="polite">
                    {turns.map((turn, index) => (
                        <div key={index} class={`help-turn ${turn.role}`}>
                            <span class="muted small">{turn.role === 'parent' ? t('help.you') : t('help.assistant')}</span>
                            <p dir="auto">{turn.text}</p>
                        </div>
                    ))}
                    {busy && <p class="muted" role="status">{t('help.sending')}</p>}
                    <div ref={endRef} />
                </div>
            )}

            <form class="help-ask" onSubmit={(event) => { event.preventDefault(); void ask(question) }}>
                <label class="sr-only" for="setup-help-question">{t('help.placeholder')}</label>
                <textarea
                    id="setup-help-question"
                    dir="auto"
                    rows={2}
                    maxLength={MAX_QUESTION}
                    placeholder={t('help.placeholder')}
                    value={question}
                    disabled={busy}
                    aria-describedby={privateText ? 'setup-help-private' : undefined}
                    onInput={(event) => setQuestion((event.target as HTMLTextAreaElement).value)}
                />
                <button type="submit" class="primary" disabled={busy || !question.trim() || privateText}>{busy ? t('help.sending') : t('help.send')}</button>
            </form>
            {privateText && <p id="setup-help-private" class="error" role="alert">{t('help.privateWarn')}</p>}
            <p class="error" role="alert">{error}</p>
            <p class="muted small">{t('help.contact', { email: SUPPORT_EMAIL })}</p>
        </section>
    )
}
