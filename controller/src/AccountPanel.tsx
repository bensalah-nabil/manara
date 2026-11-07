import { useEffect, useState } from 'preact/hooks'
import { isSessionError } from './api.ts'
import type { Account, Api } from './api.ts'
import { DELETE_WORD, canDelete, phonesLeftText } from './account.ts'
import { errorText } from './format.ts'

/** The parent's own account: who is signed in, and deleting the account with all its data. */
export function AccountPanel({ api, onSessionExpired, onDeleted }: { api: Api; onSessionExpired: () => void; onDeleted: () => void }) {
    const [account, setAccount] = useState<Account | null>(null)
    const [error, setError] = useState('')
    const [password, setPassword] = useState('')
    const [typed, setTyped] = useState('')
    const [deleting, setDeleting] = useState(false)

    useEffect(() => {
        let current = true
        api.getAccount()
            .then((value) => current && setAccount(value))
            .catch((caught: unknown) => {
                if (!current) return
                if (isSessionError(caught)) onSessionExpired()
                else setError(errorText(caught))
            })
        return () => {
            current = false
        }
    }, [api, onSessionExpired])

    async function remove(event: Event) {
        event.preventDefault()
        if (account === null || !canDelete(account.phones, password, typed)) return
        setDeleting(true)
        setError('')
        try {
            await api.deleteAccount(password)
            onDeleted()
        } catch (caught) {
            if (isSessionError(caught)) onSessionExpired()
            else setError(errorText(caught))
            setDeleting(false)
        }
    }

    if (account === null) {
        return error ? <p role="alert" class="error">{error}</p> : <p class="muted">Loading…</p>
    }

    return (
        <div class="stack">
            <h1>Your account</h1>
            <section class="card">
                <h3>Signed in as</h3>
                <p>{account.email}</p>
                <p class="muted small">
                    {account.passwordReset
                        ? 'If you forget your password, use "Forgot your password?" on the sign-in page: a link is sent to this address.'
                        : 'This server cannot send email, so a forgotten password cannot be reset by email. Keep it somewhere safe.'}
                </p>
            </section>

            <form class="card danger-zone" onSubmit={remove}>
                <h3>Delete your account</h3>
                <p>
                    This permanently deletes your account and everything stored with it: your sign-in, every phone's rules,
                    activity, locations, usage reports and setup records. It cannot be undone.
                </p>
                {account.phones > 0 ? (
                    <p role="status" class="banner">{phonesLeftText(account.phones)} A phone still managed by an account that no longer exists could not be released by anyone.</p>
                ) : (
                    <>
                        <label>
                            Your password
                            <input type="password" autoComplete="current-password" required value={password} onInput={(e) => setPassword(e.currentTarget.value)} />
                        </label>
                        <label>
                            Type {DELETE_WORD} to confirm
                            <input autoComplete="off" value={typed} onInput={(e) => setTyped(e.currentTarget.value)} />
                        </label>
                        <button type="submit" class="danger" disabled={deleting || !canDelete(account.phones, password, typed)}>
                            {deleting ? 'Deleting…' : 'Delete my account'}
                        </button>
                    </>
                )}
                {error && <p role="alert" class="error">{error}</p>}
            </form>
        </div>
    )
}
