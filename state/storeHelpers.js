import store from './store'

export const getAtomValue = (atom) => store.get(atom)

export const setAtomValue = (atom, value) => store.set(atom, value)

export const subscribeAtom = (atom, callback) => store.sub(atom, callback)

export default store
