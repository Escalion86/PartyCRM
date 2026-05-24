export const getCustomValue = (custom, key) => {
  if (!custom || !key) return undefined
  return typeof custom?.get === 'function' ? custom.get(key) : custom?.[key]
}
