import EventStatusToggleButtons from '@components/IconToggleButtons/EventStatusToggleButtons'
import { EventItem } from '@components/ItemCards'
import Search from '@components/Search'
import filterItems from '@helpers/filterItems'
import eventStatusFunc from '@helpers/eventStatus'
import isObject from '@helpers/isObject'
import sortFunctions from '@helpers/sortFunctions'
import ListWrapper from '@layouts/lists/ListWrapper'
import formatAddress from '@helpers/formatAddress'
import { useCallback, useEffect, useState } from 'react'
import { useEventsQuery } from '@helpers/useEventsQuery'

const selectEventsFunc = (
  state,
  filterRules,
  onConfirm,
  exceptedIds,
  acceptedIds,
  maxEvents,
  canSelectNone = true,
  title,
  showCountNumber
) => {
  const SelectEventsModal = ({
    closeModal,
    setOnConfirmFunc,
    setOnDeclineFunc,
    setOnShowOnCloseConfirmDialog,
    setDisableConfirm,
    setDisableDecline,
    setComponentInFooter,
  }) => {
    const { data: eventsPayload } = useEventsQuery({
      scope: 'all',
      enabled: false,
    })
    const events = eventsPayload?.data ?? []
    const [selectedEvents, setSelectedEvents] = useState(
      isObject(state)
        ? state.filter((item) => typeof item === 'string' && item !== '')
        : []
    )
    const [showErrorMax, setShowErrorMax] = useState(false)

    const [filter, setFilter] = useState({
      active: true,
      finished: true,
      closed: true,
      canceled: true,
    })

    const [searchText, setSearchText] = useState('')

    const preparedEvents = events.map((event) => ({
      ...event,
      addressString: formatAddress(event.address, event.location ?? ''),
    }))

    var filteredEvents = filterItems(
      preparedEvents.filter((event) => {
        const status = eventStatusFunc(event)
        if (status === 'canceled') return filter.canceled
        if (status === 'closed') return filter.closed
        if (status === 'finished') return filter.finished
        return filter.active
      }),
      searchText,
      exceptedIds,
      {},
      ['addressString']
    )

    if (exceptedIds) {
      filteredEvents = filteredEvents.filter(
        (event) => !exceptedIds.includes(event._id)
      )
    }

    const sortedEvents = [...filteredEvents].sort(sortFunctions.eventDate.asc)

    const onClick = (eventId) => {
      const index = selectedEvents.indexOf(eventId)
      // Клик по уже выбранному зрителю?
      if (index >= 0) {
        setShowErrorMax(false)
        setSelectedEvents((state) => state.filter((item) => item !== eventId)) //state.splice(index, 1)
      } else {
        if (!maxEvents || selectedEvents.length < maxEvents) {
          setShowErrorMax(false)
          setSelectedEvents((state) => [...state, eventId])
        } else {
          if (maxEvents === 1) {
            setSelectedEvents([eventId])
          } else setShowErrorMax(true)
        }
      }
    }

    const handleConfirm = useCallback(() => {
      onConfirm(selectedEvents)
      closeModal()
    }, [closeModal, selectedEvents])

    useEffect(() => {
      // const isFormChanged =
      //   assistantsIds !== eventAssistantsIds ||
      //   mansIds !== eventMansIds ||
      //   womansIds !== eventWomansIds ||
      //   reservedParticipantsIds !== eventReservedParticipantsIds ||
      //   bannedParticipantsIds !== eventBannedParticipantsIds
      // maxEvents !== 1 &&
      setComponentInFooter(
        <div className="flex text-lg gap-x-1 teblet:text-base flex-nowrap">
          <span>Выбрано:</span>
          <span className="font-bold">{selectedEvents.length}</span>
          {maxEvents && (
            <>
              <span>/</span>
              <span>{maxEvents}</span>
            </>
          )}
          <span>меропр.</span>
        </div>
      )
      setOnConfirmFunc(handleConfirm)
      // setOnShowOnCloseConfirmDialog(isFormChanged)
      // setDisableConfirm(!isFormChanged)
    }, [
      handleConfirm,
      selectedEvents,
      setComponentInFooter,
      setOnConfirmFunc,
      // mansIds,
      // womansIds,
      // assistantsIds,
      // reservedParticipantsIds,
      // bannedParticipantsIds,
    ])

    useEffect(() => {
      if (!canSelectNone) setDisableConfirm(selectedEvents.length === 0)
    }, [selectedEvents, setDisableConfirm])

    return (
      <div className="flex flex-col w-full h-full max-h-full gap-y-0.5">
        <EventStatusToggleButtons value={filter} onChange={setFilter} />
        <Search
          searchText={searchText}
          show={true}
          onChange={setSearchText}
          className="h-[38px] min-h-[38px]"
        />
        <div
          style={{ height: sortedEvents.length * 34 + 2 }}
          className={`tablet:flex-none border-gray-700 border-t flex-col tablet:max-h-[calc(100dvh-185px)]`}
        >
          <ListWrapper itemCount={sortedEvents.length} itemSize={34}>
            {({ index, style }) => (
              <div style={style} className="border-b border-gray-700">
                <EventItem
                  key={sortedEvents[index]._id}
                  item={sortedEvents[index]}
                  active={
                    showCountNumber
                      ? selectedEvents.indexOf(sortedEvents[index]._id) + 1
                      : selectedEvents.includes(sortedEvents[index]._id)
                  }
                  onClick={() => onClick(sortedEvents[index]._id)}
                />
              </div>
            )}
          </ListWrapper>
        </div>
        {showErrorMax && (
          <div className="text-danger">
            Выбрано максимальное количество мероприятий
          </div>
        )}

        {/* <div className="flex-1 overflow-y-auto max-h-200">
          {sortedEvents.map((event) => (
            <EventItem
              key={event._id}
              item={event}
              active={selectedEvents.includes(event._id)}
              onClick={() => onClick(event._id)}
            />
          ))}

          {showErrorMax && (
            <div className="text-danger">
              Выбрано максимальное количество мероприятий
            </div>
          )}
        </div> */}
      </div>
    )
  }

  return {
    title:
      title ?? (maxEvents === 1 ? `Выбор мероприятия` : `Выбор мероприятий`),
    confirmButtonName: 'Применить',
    // showConfirm: true,
    Children: SelectEventsModal,
  }
}

export default selectEventsFunc
