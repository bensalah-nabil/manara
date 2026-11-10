import { useEffect, useState } from 'preact/hooks'
import { isSessionError } from './api.ts'
import type { Account, Api } from './api.ts'
import { DELETE_WORD, canDelete, phonesLeftText } from './account.ts'
import { errorText } from './format.ts'
import { TwoStepPanel } from './TwoStepPanel.tsx'
import { LanguageSwitch } from './LanguageSwitch.tsx'
import { t } from './i18n.ts'

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
        return error ? <p role="alert" class="error">{error}</p> : <p class="muted">{t('common.loading')}</p>
    }

    return (
        <div class="stack">
            <h1>{t('account.title')}</h1>
            <section class="card">
                <h3>{t('account.signedInAs')}</h3>
                <p>{account.email}</p>
                <p class="muted small">
                    {account.passwordReset
                        ? t('account.resetAvailable')
                        : t('account.resetUnavailable')}
                </p>
            </section>

            <section class="card">
                <h3>{t('language.label')}</h3>
                <p class="muted small">{t('account.languageHelp')}</p>
                <LanguageSwitch onChoose={(lang) => api.setLanguage(lang)} />
            </section>

            <TwoStepPanel
                api={api}
                on={account.twoFactor}
                onSessionExpired={onSessionExpired}
                onChanged={() => { api.getAccount().then(setAccount).catch(() => undefined) }}
            />

            <form class="card danger-zone" onSubmit={remove}>
                <h3>{t('account.deleteTitle')}</h3>
                <p>
                    {t('account.deleteHelp')}
                </p>
                {account.phones > 0 ? (
                    <p role="status" class="banner">{phonesLeftText(account.phones)} {t('account.orphanWarning')}</p>
                ) : (
                    <>
                        <label>
                            {t('account.yourPassword')}
                            <input type="password" autoComplete="current-password" required value={password} onInput={(e) => setPassword(e.currentTarget.value)} />
                        </label>
                        <label>
                            {t('account.typeToConfirm', { word: DELETE_WORD })}
                            <input autoComplete="off" value={typed} onInput={(e) => setTyped(e.currentTarget.value)} />
                        </label>
                        <button type="submit" class="danger" disabled={deleting || !canDelete(account.phones, password, typed)}>
                            {deleting ? t('account.deleting') : t('account.deleteButton')}
                        </button>
                    </>
                )}
                {error && <p role="alert" class="error">{error}</p>}
            </form>
        </div>
    )
}
