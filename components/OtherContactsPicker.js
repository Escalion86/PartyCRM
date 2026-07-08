import Input from '@components/Input'
import InputWrapper from '@components/InputWrapper'
import AddIconButton from '@components/AddIconButton'
import { faTrashAlt } from '@fortawesome/free-solid-svg-icons'
import { faExchangeAlt } from '@fortawesome/free-solid-svg-icons/faExchangeAlt'
import { faPencilAlt } from '@fortawesome/free-solid-svg-icons/faPencilAlt'
import getPersonFullName from '@helpers/getPersonFullName'
import IconActionButton from '@components/IconActionButton'
import cn from 'classnames'

const OtherContactsPicker = ({
  contacts = [],
  clients = [],
  onSelectContact,
  onChangeComment,
  onRemoveContact,
  onEditContact,
  onViewContact,
  onAddContact,
  label = 'Прочие контакты',
  tone = 'default',
}) => {
  const isPartyTone = tone === 'party'

  return (
    <InputWrapper label={label} fullWidth centerLabel tone={tone}>
      <div className="flex flex-col w-full gap-2">
        {contacts.map((contact, index) => {
          const contactClient = clients.find(
            (client) => client._id === contact.clientId
          )
          const contactName = getPersonFullName(contactClient, {
            fallback: 'Выберите клиента',
          })
          return (
            <div
              key={`other-contact-${index}`}
              className={cn(
                'tablet:flex-row tablet:items-start flex gap-2 rounded border p-2',
                isPartyTone
                  ? 'border-sky-100 bg-sky-50'
                  : 'border-gray-200 bg-gray-50'
              )}
            >
              <div className="flex flex-col flex-1 w-full gap-2 tablet:grid tablet:grid-cols-2">
                <button
                  type="button"
                  className={cn(
                    'flex w-full cursor-pointer items-center justify-between gap-2 rounded border bg-white px-3 py-2 text-left text-sm shadow-sm transition',
                    isPartyTone
                      ? 'border-sky-100 hover:border-sky-300 hover:bg-white hover:shadow-sm'
                      : 'hover:shadow-card border-gray-300'
                  )}
                  onClick={() =>
                    contactClient
                      ? onViewContact?.(index)
                      : onSelectContact?.(index)
                  }
                  title={
                    contactClient
                      ? 'Открыть карточку клиента'
                      : 'Выбрать клиента'
                  }
                >
                  <span className="font-semibold text-gray-900">
                    {contactName}
                  </span>
                  <span className="text-xs text-gray-500">
                    {contactClient?.phone
                      ? `+${contactClient.phone}`
                      : 'Телефон не указан'}
                  </span>
                </button>
                <Input
                  label="Кем является"
                  value={contact.comment}
                  onChange={(value) => onChangeComment?.(index, value)}
                  noMargin
                  fullWidth
                  tone={tone}
                />
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {contactClient && (
                  <IconActionButton
                    icon={faPencilAlt}
                    onClick={() => onEditContact?.(index)}
                    title="Редактировать клиента"
                    variant="warning"
                    size="sm"
                  />
                )}
                <IconActionButton
                  icon={faTrashAlt}
                  onClick={() => onRemoveContact?.(index)}
                  title="Удалить"
                  variant="danger"
                  size="sm"
                />
              </div>
            </div>
          )
        })}
        <div className="flex justify-end w-full">
          <AddIconButton
            onClick={onAddContact}
            title="Добавить контакт"
            size="sm"
            tone={tone}
          />
        </div>
      </div>
    </InputWrapper>
  )
}

export default OtherContactsPicker
