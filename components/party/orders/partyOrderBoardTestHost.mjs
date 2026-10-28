// A React-like scheduler for executing actual hooks/handlers without a browser.
// No domain/query/transition logic is duplicated here.
export const createHookHost = (factory, initialProps = {}) => {
  const slots = [],
    effects = [],
    timers = new Map()
  let index = 0,
    dirty = true,
    value,
    props = initialProps,
    serial = 0
  const equal = (a, b) =>
    Boolean(
      a &&
      b &&
      a.length === b.length &&
      a.every((part, i) => Object.is(part, b[i]))
    )
  const useState = (initial) => {
    const slot = index++
    if (!(slot in slots))
      slots[slot] = typeof initial === 'function' ? initial() : initial
    return [
      slots[slot],
      (next) => {
        slots[slot] = typeof next === 'function' ? next(slots[slot]) : next
        dirty = true
      },
    ]
  }
  const useRef = (initial) => {
    const slot = index++
    if (!(slot in slots)) slots[slot] = { current: initial }
    return slots[slot]
  }
  const memoValue = (calculate, deps) => {
    const slot = index++
    if (!equal(slots[slot]?.deps, deps))
      slots[slot] = { deps, value: calculate() }
    return slots[slot].value
  }
  const useCallback = (callback, deps) => memoValue(() => callback, deps)
  const useEffect = (run, deps) => {
    const slot = index++
    if (!equal(slots[slot]?.deps, deps))
      effects.push(() => {
        slots[slot]?.cleanup?.()
        slots[slot] = { deps, cleanup: run() }
      })
  }
  const component = factory({
    useState,
    useRef,
    useMemo: memoValue,
    useCallback,
    useEffect,
    useLayoutEffect: useEffect,
    useId: () => `id-${index++}`,
    setTimeout: (run) => {
      const id = ++serial
      timers.set(id, run)
      return id
    },
    clearTimeout: (id) => timers.delete(id),
  })
  const render = () => {
    let turns = 0
    do {
      if (++turns > 50) throw new Error('Hook host did not settle')
      dirty = false
      index = 0
      value = component(props)
      while (effects.length) effects.shift()()
    } while (dirty)
    return value
  }
  const flush = async () => {
    for (let attempt = 0; attempt < 30; attempt += 1) {
      await Promise.resolve()
      if (dirty) render()
    }
    return value
  }
  return {
    render,
    flush,
    get value() {
      if (dirty) render()
      return value
    },
    setProps: (next) => {
      props = { ...props, ...next }
      dirty = true
      return render()
    },
    timers: () => {
      const pending = [...timers.values()]
      timers.clear()
      pending.forEach((run) => run())
      if (dirty) render()
    },
    dispose: () => slots.forEach((slot) => slot?.cleanup?.()),
  }
}

export const nodes = function* (node) {
  if (Array.isArray(node)) {
    for (const child of node) yield* nodes(child)
    return
  }
  if (!node || typeof node !== 'object') return
  yield node
  yield* nodes(node.props?.children)
}
export const textOf = (node) => {
  if (Array.isArray(node)) return node.map(textOf).join('')
  if (node == null || typeof node === 'boolean') return ''
  if (typeof node !== 'object') return String(node)
  return textOf(node.props?.children)
}
