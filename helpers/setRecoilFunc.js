import { setAtomValue } from '@state/storeHelpers'

const setRecoilFunc = (atom) => (value) => setAtomValue(atom, value)

export default setRecoilFunc
