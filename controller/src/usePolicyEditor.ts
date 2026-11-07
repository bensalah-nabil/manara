import { useState } from 'preact/hooks'
import type { Api, DeviceSummary } from './api.ts'
import { isSessionError } from './api.ts'
import { errorText } from './format.ts'
import type { Policy } from './policy.ts'

export type Validation<V> = { ok: true; value: V } | { ok: false; errors: string[] }

/** One editable part of a policy: how to read it, check it, and write it back. */
export interface Section<D, V> {
    toDraft: (policy: Policy) => D
    validate: (draft: D) => Validation<V>
    apply: (policy: Policy, value: V) => Policy
    /** A warning to confirm before saving, or null when none is needed. Receives the stored policy's draft and the new one. */
    confirm?: (before: D, after: D) => string | null
}

interface Options<D, V> {
    api: Api
    device: DeviceSummary
    onSessionExpired: () => void
    section: Section<D, V>
}

export function usePolicyEditor<D, V>({ api, device, onSessionExpired, section }: Options<D, V>) {
    const [policy, setPolicy] = useState<Policy | null>(null)
    const [draft, setDraftState] = useState<D | null>(null)
    const [loading, setLoading] = useState(false)
    const [saving, setSaving] = useState(false)
    const [problems, setProblems] = useState<string[]>([])
    const [error, setError] = useState('')
    const [saved, setSaved] = useState('')

    function fail(caught: unknown) {
        if (isSessionError(caught)) onSessionExpired()
        else setError(errorText(caught))
    }

    async function load() {
        setLoading(true)
        setError('')
        try {
            const current = await api.getPolicy(device.deviceId)
            setPolicy(current)
            setDraftState(section.toDraft(current))
        } catch (caught) {
            fail(caught)
        } finally {
            setLoading(false)
        }
    }

    function setDraft(next: D) {
        setSaved('')
        setDraftState(next)
    }

    function close() {
        setPolicy(null)
        setDraftState(null)
        setProblems([])
        setSaved('')
    }

    async function save() {
        if (draft === null || policy === null) return
        const result = section.validate(draft)
        if (!result.ok) {
            setProblems(result.errors)
            return
        }
        setProblems([])
        const warning = section.confirm?.(section.toDraft(policy), draft) ?? null
        if (warning !== null && !window.confirm(warning)) return

        setSaving(true)
        setError('')
        setSaved('')
        try {
            // The save replaces the whole policy, so re-read it first: another change may have landed since this panel opened.
            const latest = await api.getPolicy(device.deviceId)
            const stored = await api.setPolicy(device.deviceId, section.apply(latest, result.value))
            setPolicy(stored)
            setDraftState(section.toDraft(stored))
            setSaved(`Saved as version ${stored.version}. The phone applies it at its next check-in, within about 15 minutes.`)
        } catch (caught) {
            fail(caught)
        } finally {
            setSaving(false)
        }
    }

    return { policy, draft, loading, saving, problems, error, saved, load, save, close, setDraft }
}
