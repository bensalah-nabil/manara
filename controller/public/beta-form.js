// The beta page's sign-up form (beta.html, beta-ar.html, beta-en.html): five short steps, sent to
// POST /api/v1/beta-signups. Every word shown comes from the page (data-* attributes), so this file
// has no language of its own. An external file because the site's CSP allows scripts from 'self' only.
(() => {
  const form = document.getElementById('signup')
  if (!form) return
  const steps = [...form.querySelectorAll('[data-step]')]
  const bar = form.querySelector('.progress span')
  const counter = form.querySelector('[data-counter]')
  const status = form.querySelector('[data-status]')
  const api = form.dataset.api
  let current = 0

  function show(i) {
    current = i
    steps.forEach((s, k) => { s.hidden = k !== i })
    bar.style.width = `${((i + 1) / steps.length) * 100}%`
    counter.textContent = counter.dataset.template.replace('{n}', i + 1).replace('{total}', steps.length)
    status.textContent = ''
    const first = steps[i].querySelector('input:not([type=hidden]), button.next')
    if (first && i > 0) first.focus({ preventScroll: true })
    form.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' })
  }

  function setError(container, message) {
    const slot = container.querySelector('.error') ?? container.closest('label, fieldset')?.querySelector('.error')
    if (slot) slot.textContent = message
  }

  function valid(step) {
    let ok = true
    step.querySelectorAll('.error').forEach((e) => { e.textContent = '' })
    step.querySelectorAll('input[required]:not([type=radio]):not([type=checkbox])').forEach((input) => {
      const value = input.value.trim()
      const pattern = input.dataset.pattern ? new RegExp(input.dataset.pattern) : null
      if (!value || (pattern && !pattern.test(value))) {
        setError(input.closest('label'), input.dataset.error)
        if (ok) input.focus()
        ok = false
      }
    })
    step.querySelectorAll('fieldset[data-required]').forEach((group) => {
      if (!group.querySelector('input:checked')) {
        setError(group, group.dataset.error)
        ok = false
      }
    })
    step.querySelectorAll('input[type=checkbox][required]').forEach((box) => {
      if (!box.checked) {
        setError(box.closest('label'), box.dataset.error)
        ok = false
      }
    })
    return ok
  }

  form.addEventListener('click', (event) => {
    const button = event.target.closest('button')
    if (!button) return
    if (button.classList.contains('next')) {
      event.preventDefault()
      if (valid(steps[current])) show(current + 1)
    } else if (button.classList.contains('back')) {
      event.preventDefault()
      show(current - 1)
    }
  })

  // An iPhone can't be set up yet: say so at once, honestly, and keep a place on the waiting list.
  form.addEventListener('change', (event) => {
    if (event.target.name === 'brand') {
      form.querySelector('[data-iphone]').hidden = event.target.value !== 'iphone'
    }
  })

  function values(name) {
    return [...form.querySelectorAll(`input[name="${name}"]:checked`)].map((i) => i.value)
  }

  async function send(body, attempt) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 25000)
    try {
      const response = await fetch(`${api}/beta-signups`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      })
      const answer = await response.json().catch(() => ({}))
      return { ok: response.ok, status: response.status, answer }
    } catch {
      // The free server sleeps when idle and takes up to a minute to wake: try again.
      if (attempt < 3) {
        status.textContent = form.dataset.waking
        await new Promise((r) => setTimeout(r, 4000 * (attempt + 1)))
        return send(body, attempt + 1)
      }
      return { ok: false, status: 0, answer: {} }
    } finally {
      clearTimeout(timer)
    }
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault()
    if (!valid(steps[current])) return
    const submit = form.querySelector('button[type=submit]')
    submit.disabled = true
    status.textContent = form.dataset.sending
    const data = new FormData(form)
    const body = {
      firstName: data.get('firstName') ?? '',
      whatsapp: data.get('whatsapp') ?? '',
      place: data.get('place') ?? '',
      brand: data.get('brand') ?? '',
      model: data.get('model') ?? '',
      childAge: data.get('childAge') ?? '',
      worries: values('worries'),
      callLanguage: data.get('callLanguage') ?? '',
      slots: values('slots'),
      ownChild: data.get('ownChild') === 'yes',
      pageLanguage: document.documentElement.lang,
      website: data.get('website') ?? '',
    }
    const result = await send(body, 0)
    submit.disabled = false
    if (result.ok) {
      form.hidden = true
      const done = document.querySelector(result.answer.waitlist ? '[data-done-waitlist]' : '[data-done]')
      done.querySelector('[data-name]').textContent = body.firstName.trim()
      done.hidden = false
      done.scrollIntoView({ block: 'center' })
      done.focus()
      return
    }
    if (result.answer.code === 'invalid_field') {
      const input = form.querySelector(`[name="${result.answer.message}"]`)
      const step = input?.closest('[data-step]')
      if (step) {
        show(steps.indexOf(step))
        setError(input.closest('label, fieldset'), input.dataset.error ?? input.closest('fieldset')?.dataset.error ?? '')
        return
      }
    }
    status.textContent = result.status === 429 ? form.dataset.tooMany : form.dataset.failed
  })

  show(0)
})()
