import { useEffect, useState } from 'react'
import DateTimePicker from '@components/DateTimePicker'
import QuickActionButtons from '@components/QuickActionButtons'
import Input from '@components/Input'
import Textarea from '@components/Textarea'
import IconCheckBox from '@components/IconCheckBox'
import { faCircleCheck } from '@fortawesome/free-solid-svg-icons'

const buildDefaultAdditionalEvent = () => ({
  title: '',
  description: '',
  date: new Date().toISOString(),
  done: false,
  doneAt: null,
  googleCalendarEventId: '',
})

const openEventAdditionalEventEditorModal = ({
  modalsFunc,
  index = null,
  sourceItem,
  onConfirm,
  title,
  confirmButtonName = 'Сохранить',
  declineButtonName = 'Отмена',
  introText,
}) => {
  if (!modalsFunc?.add) return

  const initialSource = sourceItem
    ? { ...sourceItem }
    : buildDefaultAdditionalEvent()
  const stateRef = {
    current: {
      title: initialSource?.title ?? '',
      description: initialSource?.description ?? '',
      date: initialSource?.date ?? new Date().toISOString(),
      done: Boolean(initialSource?.done),
      doneAt: initialSource?.doneAt ?? null,
      googleCalendarEventId: initialSource?.googleCalendarEventId ?? '',
    },
  }

  const AdditionalEventModal = () => {
    const [localTitle, setLocalTitle] = useState(stateRef.current.title)
    const [description, setDescription] = useState(stateRef.current.description)
    const [date, setDate] = useState(stateRef.current.date)
    const [done, setDone] = useState(stateRef.current.done)

    const parseDateSafe = (value) => {
      if (!value) return null
      const parsed = new Date(value)
      return Number.isNaN(parsed.getTime()) ? null : parsed
    }
    const getBaseDate = () => parseDateSafe(date) || new Date()
    const applyPresetTime = (hours, minutes) => {
      const next = getBaseDate()
      next.setHours(hours, minutes, 0, 0)
      setDate(next.toISOString())
    }
    const applyPresetDateFromToday = (days) => {
      const base = getBaseDate()
      const next = new Date()
      next.setDate(next.getDate() + days)
      next.setHours(base.getHours(), base.getMinutes(), 0, 0)
      setDate(next.toISOString())
    }

    useEffect(() => {
      stateRef.current = {
        ...stateRef.current,
        title: localTitle,
        description,
        date,
        done,
        doneAt: done ? stateRef.current.doneAt ?? new Date().toISOString() : null,
      }
    }, [date, description, done, localTitle])

    return (
      <div className="mt-2 flex flex-col gap-y-2.5">
        {introText ? (
          <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800">
            {introText}
          </div>
        ) : null}
        <div className="mt-2 text-xs font-semibold text-gray-700">
          Быстрый заголовок
        </div>
        <QuickActionButtons
          actions={[
            {
              key: 'title-follow-up',
              label: 'Узнать что решили',
              onClick: () => setLocalTitle('Узнать что решили'),
            },
            {
              key: 'title-meeting',
              label: 'Встреча',
              onClick: () => setLocalTitle('Встреча'),
            },
            {
              key: 'title-deposit',
              label: 'Жду задаток',
              onClick: () => setLocalTitle('Жду задаток'),
            },
          ]}
        />
        <Input
          label="Заголовок"
          value={localTitle}
          onChange={setLocalTitle}
          noMargin
          fullWidth
        />
        <div className="text-xs font-semibold text-gray-700">
          Быстрая дата и время
        </div>
        <QuickActionButtons
          actions={[
            {
              key: 'time-11',
              label: '11:00',
              onClick: () => applyPresetTime(11, 0),
            },
            {
              key: 'time-19',
              label: '19:00',
              onClick: () => applyPresetTime(19, 0),
            },
            {
              key: 'date-today',
              label: 'Сегодня',
              onClick: () => applyPresetDateFromToday(0),
            },
            {
              key: 'date-tomorrow',
              label: 'Завтра',
              onClick: () => applyPresetDateFromToday(1),
            },
            {
              key: 'date-plus-2',
              label: 'Через 2 дня',
              onClick: () => applyPresetDateFromToday(3),
            },
            {
              key: 'date-plus-7',
              label: 'Через неделю',
              onClick: () => applyPresetDateFromToday(7),
            },
          ]}
        />
        <DateTimePicker
          value={date ?? null}
          onChange={(value) => setDate(value ?? null)}
          label="Дата и время"
          noMargin
        />
        <Textarea
          label="Описание"
          value={description}
          onChange={setDescription}
          rows={3}
          noMargin
        />
        <IconCheckBox
          checked={done}
          onClick={() => setDone((prev) => !prev)}
          label="Сделано"
          checkedIcon={faCircleCheck}
          checkedIconColor="#16A34A"
          noMargin
        />
      </div>
    )
  }

  modalsFunc.add({
    title: title ?? `${index !== null ? 'Редактирование' : 'Создание'} доп. события`,
    confirmButtonName,
    declineButtonName,
    showDecline: true,
    onConfirm: async () => {
      const nextItem = {
        title: stateRef.current.title?.trim() ?? '',
        description: stateRef.current.description?.trim() ?? '',
        date: stateRef.current.date ?? null,
        done: Boolean(stateRef.current.done),
        doneAt: stateRef.current.done
          ? stateRef.current.doneAt ?? new Date().toISOString()
          : null,
        googleCalendarEventId: stateRef.current.googleCalendarEventId ?? '',
      }
      if (typeof onConfirm === 'function') {
        await onConfirm(nextItem)
      }
    },
    Children: AdditionalEventModal,
  })
}

export default openEventAdditionalEventEditorModal
