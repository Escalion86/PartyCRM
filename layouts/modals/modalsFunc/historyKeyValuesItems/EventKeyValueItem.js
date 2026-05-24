import Chip from '@components/Chips/Chip'
import InputImages from '@components/InputImages'
import { EVENT_STATUSES, EVENT_STATUSES_SIMPLE } from '@helpers/constants'
import formatAddress from '@helpers/formatAddress'
import formatDateTime from '@helpers/formatDateTime'
import sanitizeHtml from '@helpers/sanitizeHtml'
import textAge from '@helpers/textAge'

const EventKeyValueItem = ({ objKey, value }) =>
  value === undefined ? (
    '[не указано]'
  ) : objKey === 'description' ? (
    <div
      className="textarea ql w-full max-w-full list-disc overflow-hidden"
      dangerouslySetInnerHTML={{
        __html: sanitizeHtml(value),
      }}
    />
  ) : objKey === 'tags' ? (
    Array.isArray(value) && value.length > 0 ? (
      <div className="flex flex-wrap gap-2">
        {value.map((tag) => (
          <Chip key={String(tag)} text={String(tag)} color="#f3f4f6" />
        ))}
      </div>
    ) : (
      '[не указано]'
    )
  ) : ['eventDate', 'dateEnd', 'createdAt', 'updatedAt'].includes(
      objKey
    ) ? (
    formatDateTime(value)
  ) : objKey === 'waitDeposit' ? (
    value ? 'Да' : 'Нет'
  ) : objKey === 'additionalEvents' ? (
    Array.isArray(value) && value.length > 0 ? (
      <div className="flex flex-col gap-2">
        {value.map((item, index) => (
          <div
            key={`history-additional-event-${index}`}
            className="rounded border border-gray-200 px-2 py-1"
          >
            <div className="text-sm font-semibold text-gray-900">
              {item?.done ? '✓ ' : ''}
              {item?.title || `Событие #${index + 1}`}
            </div>
            <div className="text-sm text-gray-600">{formatDateTime(item?.date)}</div>
            {item?.description ? (
              <div className="text-sm text-gray-700">{item.description}</div>
            ) : null}
          </div>
        ))}
      </div>
    ) : (
      '[не указано]'
    )
  ) : objKey === 'status' ? (
    EVENT_STATUSES_SIMPLE.find((item) => item.value === value)?.name ??
    EVENT_STATUSES.find((item) => item.value === value)?.name
  ) : objKey === 'images' ? (
    <InputImages
      images={value}
      readOnly
      noMargin
      paddingY={false}
      paddingX={false}
    />
  ) : objKey === 'address' ? (
    formatAddress(value, '[не указан]')
  ) : objKey === 'usersRelationshipAccess' ? (
    value === 'no' ? (
      'Без пары'
    ) : value === 'only' ? (
      'Только с парой'
    ) : (
      'Всем'
    )
  ) : objKey === 'price' ? (
    value / 100 + ' ₽'
  ) : objKey === 'contractSum' ? (
    typeof value === 'number' ? value.toLocaleString('ru-RU') + ' ₽' : value
  ) : objKey === 'depositExpectedAmount' ? (
    typeof value === 'number' ? value.toLocaleString('ru-RU') + ' ₽' : '[не указано]'
  ) : objKey === 'calendarSyncError' ? (
    value === 'calendar_sync_unavailable'
      ? 'Синхронизация недоступна по тарифу'
      : value === 'calendar_sync_failed'
        ? 'Ошибка синхронизации'
        : value
  ) : objKey === 'usersStatusAccess' ? (
    <div>
      <div>Не авторизован: {value?.noReg ? 'Да' : 'Нет'}</div>
      <div>Новичок: {value?.novice ? 'Да' : 'Нет'}</div>
      <div>Участник клуба: {value?.member ? 'Да' : 'Нет'}</div>
    </div>
  ) : objKey === 'usersStatusDiscount' ? (
    <div>
      <div>Новичок: {(value?.novice ?? 0) / 100 + ' ₽'}</div>
      <div>Участник клуба: {(value?.member ?? 0) / 100 + ' ₽'}</div>
    </div>
  ) : [
      'maxParticipants',
      'maxMans',
      'maxWomans',
      'maxMansNovice',
      'maxWomansNovice',
      'maxMansMember',
      'maxWomansMember',
    ].includes(objKey) ? (
    typeof value === 'number' ? (
      value + ' чел.'
    ) : (
      'Без ограничений'
    )
  ) : ['minMansAge', 'maxMansAge', 'minWomansAge', 'maxWomansAge'].includes(
      objKey
    ) ? (
    typeof value === 'number' ? (
      `${value} ${textAge(value)}`
    ) : (
      'Не задан'
    )
  ) : value !== null && typeof value === 'object' ? (
    <pre>{JSON.stringify(value)}</pre>
  ) : typeof value === 'boolean' ? (
    value ? (
      'Да'
    ) : (
      'Нет'
    )
  ) : (
    value
  )

export default EventKeyValueItem
