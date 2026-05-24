import { atom } from 'jotai'
import servicesAtom from '@state/atoms/servicesAtom'

const filteredServicesSelector = atom((get) => {
  const services = get(servicesAtom)
  return services.filter((service) => service?.showOnSite !== false)
})

export default filteredServicesSelector
