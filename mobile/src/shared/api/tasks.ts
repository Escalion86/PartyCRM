export type AdditionalEvent = {
  _id?: string
  title: string
  description: string
  date: string | null
  done: boolean
  doneAt: string | null
  googleCalendarEventId: string
}

export type EventItem = {
  _id: string
  tenantId: string
  clientId: string | null
  description: string
  eventType: string
  eventDate: string | null
  dateEnd: string | null
  status: 'draft' | 'active' | 'canceled' | 'closed'
  additionalEvents: AdditionalEvent[]
  address?: {
    town?: string
    street?: string
    house?: string
  }
}

export type TaskWithEvent = {
  task: AdditionalEvent
  event: {
    _id: string
    eventType: string
    description: string
    status: string
  }
  index: number
}

export type TasksGroup = {
  label: string
  data: TaskWithEvent[]
}
