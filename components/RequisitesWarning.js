import AppButton from '@components/AppButton'

const RequisitesWarning = ({
  missingArtistRequisites = false,
  missingClientRequisites = false,
  onEditArtistRequisites,
  onEditClient,
  canEditClient = false,
}) => {
  if (!missingArtistRequisites && !missingClientRequisites) return null

  return (
    <div className="flex flex-col gap-2 rounded border border-red-200 bg-red-50/80 px-3 py-2">
      {missingArtistRequisites ? (
        <div className="text-xs text-red-700">
          Необходимо заполнить реквизиты артиста
        </div>
      ) : null}
      {missingClientRequisites ? (
        <div className="text-xs text-red-700">
          Необходимо заполнить реквизиты в карточке клиента
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        {missingArtistRequisites ? (
          <AppButton
            variant="danger"
            size="sm"
            className="rounded"
            onClick={onEditArtistRequisites}
          >
            Редактировать реквизиты
          </AppButton>
        ) : null}
        {missingClientRequisites ? (
          <AppButton
            variant="danger"
            size="sm"
            className="rounded"
            disabled={!canEditClient}
            onClick={canEditClient ? onEditClient : undefined}
          >
            Редактировать клиента
          </AppButton>
        ) : null}
      </div>
    </div>
  )
}

export default RequisitesWarning

