import { redirect } from 'next/navigation'
import Events from '@models/Events'
import dbConnect from '@server/dbConnect'
import EventRedirectClient from './EventRedirectClient'

export const runtime = 'nodejs'

export const metadata = {
  title: 'Переход к мероприятию',
  robots: {
    index: false,
    follow: false,
  },
}

const getTargetPage = (eventDate) => {
  if (!eventDate?.eventDate && !eventDate?.dateEnd) return 'eventsUpcoming'
  const now = new Date()
  const completionRaw = eventDate?.dateEnd ?? eventDate?.eventDate ?? null
  const completionTime = completionRaw ? new Date(completionRaw).getTime() : NaN
  if (Number.isNaN(completionTime)) return 'eventsUpcoming'
  return completionTime < now.getTime() ? 'eventsPast' : 'eventsUpcoming'
}

export default async function EventRedirectPage({ params }) {
  const resolvedParams = await params
  const id = typeof resolvedParams?.id === 'string' ? resolvedParams.id : null
  if (!id) return redirect('/cabinet/eventsUpcoming')
  await dbConnect()
  const event = await Events.findById(id).select('eventDate dateEnd').lean()
  if (!event) return redirect('/cabinet/eventsUpcoming')
  const targetPage = getTargetPage(event)
  return <EventRedirectClient id={id} targetPage={targetPage} />
}
