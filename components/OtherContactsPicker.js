import Input from '@components/Input'
import InputWrapper from '@components/InputWrapper'
import AddIconButton from '@components/AddIconButton'
import { faTrashAlt } from '@fortawesome/free-solid-svg-icons'
import { faExchangeAlt } from '@fortawesome/free-solid-svg-icons/faExchangeAlt'
import { faPencilAlt } from '@fortawesome/free-solid-svg-icons/faPencilAlt'
import getPersonFullName from '@helpers/getPersonFullName'
import IconActionButton from '@components/IconActionButton'

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
}) => (
  <InputWrapper label={label} fullWidth centerLabel>
    <div className="flex w-full flex-col gap-2">
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
            className="tablet:flex-row tablet:items-start flex gap-2 rounded border border-gray-200 bg-gray-50 p-2"
          >
            <div className="tablet:grid tablet:grid-cols-2 flex w-full flex-1 flex-col gap-2">
              <button
                type="button"
                className="hover:shadow-card flex w-full cursor-pointer items-center justify-between gap-2 rounded border border-gray-300 bg-white px-3 py-2 text-left text-sm shadow-sm transition"
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
              />
            </div>
            <div className="flex items-center gap-2">
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
                icon={faExchangeAlt}
                onClick={() => onSelectContact?.(index)}
                title="Выбрать другого клиента"
                variant="neutral"
                size="sm"
              />
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
      {/* <button
        type="button"
        className="px-3 text-sm font-semibold text-gray-700 transition bg-white border border-gray-300 rounded shadow-sm cursor-pointer h-9 w-fit hover:bg-gray-50"
        onClick={onAddContact}
      >
        Добавить контакт
      </button> */}
      <div className="flex w-full justify-end">
        <AddIconButton
          onClick={onAddContact}
          title="Добавить контакт"
          size="sm"
        />
      </div>
    </div>
  </InputWrapper>
)

export default OtherContactsPicker
