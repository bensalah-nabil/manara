/** A translated sentence with `<b>…</b>` parts shown bold. Nothing else in the text is treated as markup. */
export function Rich({ text }: { text: string }) {
    const parts = text.split(/<b>(.*?)<\/b>/)
    return <>{parts.map((part, index) => (index % 2 === 1 ? <strong key={index}>{part}</strong> : part))}</>
}
