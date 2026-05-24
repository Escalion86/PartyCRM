import { NextResponse } from 'next/server'
import Events from '@models/Events'
import Transactions from '@models/Transactions'
import Clients from '@models/Clients'
import SiteSettings from '@models/SiteSettings'
import dbConnect from '@server/dbConnect'

export const POST = async () => {
  await dbConnect()

  const filter = {
    importedFromCalendar: true,
    calendarImportChecked: { $ne: true },
  }

  const eventsToDelete = await Events.find(filter)
    .select('_id clientId')
    .lean()
  const eventIds = eventsToDelete.map((event) => event._id)
  const clientIds = eventsToDelete
    .map((event) => event.clientId)
    .filter(Boolean)

  let transactionsResult = null
  if (eventIds.length) {
    transactionsResult = await Transactions.deleteMany({
      eventId: { $in: eventIds },
    })
  }

  let clientsResult = null
  if (clientIds.length) {
    clientsResult = await Clients.deleteMany({
      _id: { $in: clientIds },
    })
  }

  const result = await Events.deleteMany(filter)

  const settings = await SiteSettings.findOne()
  if (settings) {
    const remainingEvents = await Events.find({})
      .select('address.town')
      .lean()
    const townsSet = new Set(
      remainingEvents
        .map((event) => event?.address?.town)
        .filter((town) => typeof town === 'string' && town.trim())
        .map((town) => town.trim())
    )
    const towns = Array.from(townsSet).sort((a, b) => a.localeCompare(b, 'ru'))
    const defaultTown =
      settings.defaultTown && towns.includes(settings.defaultTown)
        ? settings.defaultTown
        : ''
    settings.towns = towns
    settings.defaultTown = defaultTown
    await settings.save()
  }

  return NextResponse.json(
    {
      success: true,
      data: {
        deleted: result?.deletedCount ?? 0,
        deletedTransactions: transactionsResult?.deletedCount ?? 0,
        deletedClients: clientsResult?.deletedCount ?? 0,
      },
    },
    { status: 200 }
  )
}
