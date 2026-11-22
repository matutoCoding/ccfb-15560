// DOM 构造辅助
export const h = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] => {
  const el = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'className') el.className = v
    else el.setAttribute(k, v)
  }
  for (const child of children) {
    el.append(child instanceof Node ? child : document.createTextNode(child))
  }
  return el
}

export const clear = (el: HTMLElement): void => {
  el.innerHTML = ''
}

export const icon = (svgString: string, size = 18): HTMLSpanElement => {
  const span = h('span', { className: 'ico', style: `width:${size}px;height:${size}px;display:inline-flex` })
  span.innerHTML = svgString
  const svgEl = span.querySelector('svg')
  if (svgEl) {
    svgEl.setAttribute('width', String(size))
    svgEl.setAttribute('height', String(size))
  }
  return span
}

export const numberField = (
  label: string,
  value: number,
  onChange: (v: number) => void,
  step = 1
): HTMLDivElement => {
  const wrap = h('div')
  wrap.append(h('label', {}, label))
  const input = h('input', { type: 'number', step: String(step), value: String(value) }) as HTMLInputElement
  input.addEventListener('change', () => onChange(Number(input.value)))
  wrap.append(input)
  return wrap
}

export const selectField = <T extends string>(
  label: string,
  value: T,
  options: { value: T; label: string }[],
  onChange: (v: T) => void
): HTMLDivElement => {
  const wrap = h('div')
  wrap.append(h('label', {}, label))
  const select = h('select') as HTMLSelectElement
  for (const opt of options) {
    const o = h('option', { value: opt.value }, opt.label)
    if (opt.value === value) o.setAttribute('selected', 'selected')
    select.append(o)
  }
  select.addEventListener('change', () => onChange(select.value as T))
  wrap.append(select)
  return wrap
}

export const textField = (
  label: string,
  value: string,
  onChange: (v: string) => void
): HTMLDivElement => {
  const wrap = h('div')
  wrap.append(h('label', {}, label))
  const input = h('input', { type: 'text', value }) as HTMLInputElement
  input.addEventListener('change', () => onChange(input.value))
  wrap.append(input)
  return wrap
}

export const emptyState = (title: string, sub: string, icoSvg: string): HTMLDivElement =>
  h('div', { className: 'empty-state' },
    icon(icoSvg, 40),
    h('div', { className: 'title' }, title),
    h('div', {}, sub)
  )
