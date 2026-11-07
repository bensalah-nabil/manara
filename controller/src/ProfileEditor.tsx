import { useState } from 'preact/hooks'
import { isSessionError } from './api.ts'
import type { Props } from './Editors.tsx'
import { errorText } from './format.ts'
import { COLORS, MAX_NAME, checkName, colorHex, initial } from './profile.ts'

/** The child's name and color for this phone, as the parent sees it in the console. */
export function ProfileEditor({ api, device, onSessionExpired, onChanged }: Props & { onChanged: () => void }) {
    const [name, setName] = useState(device.label)
    const [color, setColor] = useState(device.color ?? '')
    const [saving, setSaving] = useState(false)
    const [saved, setSaved] = useState(false)
    const [error, setError] = useState('')
    const changed = name.trim() !== device.label || color !== (device.color ?? '')

    async function save(event: Event) {
        event.preventDefault()
        const checked = checkName(name)
        if ('error' in checked) {
            setError(checked.error)
            return
        }
        setSaving(true)
        setError('')
        try {
            await api.updateDevice(device.deviceId, { label: checked.name, color })
            setName(checked.name)
            setSaved(true)
            onChanged()
        } catch (caught) {
            if (isSessionError(caught)) onSessionExpired()
            else setError(errorText(caught))
        } finally {
            setSaving(false)
        }
    }

    return (
        <form class="card" onSubmit={save}>
            <h3>Name and color</h3>
            <div class="profile-preview">
                <span class="avatar large" style={{ background: colorHex(color) }} aria-hidden="true">{initial(name || device.model || '')}</span>
                <span class="muted small">How this phone shows in your list.</span>
            </div>
            <label>
                Your child's name
                <input
                    value={name}
                    maxLength={MAX_NAME}
                    placeholder="For example, Sara"
                    onInput={(event) => { setName(event.currentTarget.value); setSaved(false) }}
                />
            </label>
            <fieldset class="group">
                <legend>Color</legend>
                <div class="swatches" role="radiogroup" aria-label="Color">
                    {COLORS.map((c) => (
                        <button
                            key={c.key}
                            type="button"
                            role="radio"
                            aria-checked={color === c.key}
                            aria-label={c.name}
                            title={c.name}
                            class="swatch"
                            style={{ background: c.hex }}
                            onClick={() => { setColor(c.key); setSaved(false) }}
                        />
                    ))}
                </div>
            </fieldset>
            <button type="submit" class="primary" disabled={saving || !changed}>
                {saving ? 'Saving...' : 'Save'}
            </button>
            {saved && !changed && <p role="status" class="banner ok">Saved.</p>}
            {error && <p role="alert" class="error">{error}</p>}
        </form>
    )
}
