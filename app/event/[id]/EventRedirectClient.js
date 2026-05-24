'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

const EventRedirectClient = ({ id, targetPage }) => {
  const router = useRouter()

  useEffect(() => {
    if (!id || !targetPage) {
      router.replace('/cabinet/eventsUpcoming')
      return
    }
    if (typeof window !== 'undefined') {
      window.sessionStorage.setItem('openEvent', id)
      window.sessionStorage.setItem('openEventAt', Date.now().toString())
      window.sessionStorage.setItem('openEventPage', targetPage)
    }
    router.replace(`/cabinet/${targetPage}?openEvent=${id}`)
  }, [id, router, targetPage])

  return null
}

export default EventRedirectClient
