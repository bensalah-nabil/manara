import { useEffect, useRef, useState } from 'preact/hooks'

/**
 * Moves keyboard and screen-reader focus to the returned heading when [key] changes (or once on
 * mount, with onMount), so a screen that swaps its content doesn't leave focus on <body> at the top
 * of the page (WCAG 2.4.3, audit 2026-11-21). Put the ref on the screen's h1/h2/h3 with
 * tabIndex={-1}.
 */
export function useFocusHeading<T extends HTMLElement = HTMLHeadingElement>(key: unknown, onMount = false) {
    const ref = useRef<T>(null)
    const [shown, setShown] = useState(key)
    useEffect(() => {
        if (onMount) ref.current?.focus()
    }, [onMount])
    useEffect(() => {
        if (key === shown) return
        setShown(key)
        ref.current?.focus()
    }, [key, shown])
    return ref
}

/**
 * Like [useFocusHeading] for a container whose content changes with [key]: focuses its first
 * heading, legend or control (headings get tabindex -1 so they can take focus).
 */
export function useFocusInto<T extends HTMLElement = HTMLDivElement>(key: unknown) {
    const ref = useRef<T>(null)
    const [shown, setShown] = useState(key)
    useEffect(() => {
        if (key === shown) return
        setShown(key)
        const target = ref.current?.querySelector<HTMLElement>('h2, h3, legend, input, button')
        if (!target) return
        if (target.matches('h2, h3, legend')) target.setAttribute('tabindex', '-1')
        target.focus()
    }, [key, shown])
    return ref
}
