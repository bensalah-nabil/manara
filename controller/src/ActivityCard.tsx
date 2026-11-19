import { useEffect, useState } from 'preact/hooks'
import { isSessionError } from './api.ts'
import type { Api } from './api.ts'
import { activityText } from './activity.ts'
import type { ActivityEntry } from './activity.ts'
import { deviceName, errorText, lastSeenText } from './format.ts'
import { t } from './i18n.ts'

/** How many entries show before "Show all". */
const FIRST = 10

/** The account's own log (security.md, item 1): what was done from it, and when. */
export function ActivityCard({ api, onSessionExpired }: { api: Api; onSessionExpired: () => void }) {
    const [entries, setEntries] = useState<ActivityEntry[] | null>(null)
    const [names, setNames] = useState<Map<string, string>>(new Map())
    const [all, setAll] = useState(false)
    const [error, setError] = useState('')

    useEffect(() => {
        let current = true
        Promise.all([api.listActivity(), api.listDevices()])
            .then(([log, devices]) => {
                if (!current) return
                setEntries(log)
                setNames(new Map(devices.map((d) => [d.deviceId, deviceName(d)])))
            })
            .catch((caught) => {
                if (!current) return
                if (isSessionError(caught)) onSessionExpired()
                else setError(errorText(caught))
            })
        return () => { current = false }
    }, [api, onSessionExpired])

    const shown = entries === null ? [] : all ? entries : entries.slice(0, FIRST)

    return (
        <section class="card stack">
            <h3>{t('activity.title')}</h3>
            <p class="muted small">{t('activity.help')}</p>
            {error && <p role="alert" class="error">{error}</p>}
            {entries === null && !error && <p class="muted">{t('common.loading')}</p>}
            {entries !== null && entries.length === 0 && <p class="muted">{t('activity.none')}</p>}
            {shown.length > 0 && (
                <ul class="activity">
                    {shown.map((entry, i) => (
                        <li key={`${entry.at}-${i}`}>
                            <span>{activityText(entry, (id) => names.get(id))}</span>
                            <span class="muted small"> · <time dateTime={entry.at}>{lastSeenText(entry.at)}</time></span>
                        </li>
                    ))}
                </ul>
            )}
            {entries !== null && !all && entries.length > FIRST && (
                <button type="button" class="ghost" onClick={() => setAll(true)}>{t('activity.more')}</button>
            )}
        </section>
    )
}
