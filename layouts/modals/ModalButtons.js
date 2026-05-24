import isObject from '@helpers/isObject'
import Button from '@components/Button'
import AppButton from '@components/AppButton'
import Divider from '@components/Divider'

const ModalButtons = ({
  confirmName = 'Подтвердить',
  confirmName2 = 'Действие',
  declineName = 'Отмена',
  closeButtonName = 'Закрыть',
  onConfirmClick,
  onConfirm2Click,
  onDeclineClick,
  // showConfirm = true,
  // showConfirm2,
  // showDecline,
  disableConfirm = false,
  disableDecline = false,
  children,
  closeButtonShow,
  declineButtonShow,
  closeModal,
  bottomLeftButton,
  bottomLeftComponent,
  declineButtonBgClassName = 'bg-danger',
}) => {
  if (
    !onConfirmClick &&
    !onConfirm2Click &&
    !onDeclineClick &&
    !closeButtonShow
  )
    return null

  return (
    <>
      <Divider light thin />
      <div className="flex flex-wrap justify-between px-2 tablet:px-3 tablet:pt-1">
        {children}
        <div className="flex flex-1 flex-wrap justify-end gap-1 tablet:gap-x-2">
          {isObject(bottomLeftButton) ? (
            <div className="flex-1">{<Button {...bottomLeftButton} />}</div>
          ) : null}
          {isObject(bottomLeftComponent) ? (
            <div className="flex-1">{bottomLeftComponent}</div>
          ) : null}
          {onConfirm2Click && (
            <AppButton
              variant="primary"
              size="md"
              className="modal-action-button rounded"
              onClick={onConfirm2Click}
              disabled={disableConfirm}
            >
              {confirmName2}
            </AppButton>
          )}
          {onConfirmClick && (
            <AppButton
              variant="primary"
              size="md"
              className="modal-action-button rounded"
              onClick={onConfirmClick}
              disabled={disableConfirm}
            >
              {confirmName}
            </AppButton>
          )}
          {declineButtonShow &&
          (onConfirmClick || onConfirm2Click || onDeclineClick) ? (
            <AppButton
              variant={declineButtonBgClassName === 'bg-danger' ? 'danger' : 'secondary'}
              size="md"
              className="modal-action-button rounded"
              onClick={
                typeof onDeclineClick === 'function'
                  ? onDeclineClick
                  : closeModal
              }
              disabled={disableDecline}
            >
              {declineName}
            </AppButton>
          ) : (
            closeButtonShow && (
              <AppButton
                variant="secondary"
                size="md"
                className="modal-action-button rounded"
                onClick={closeModal}
              >
                {closeButtonName}
              </AppButton>
            )
          )}
        </div>
      </div>
    </>
  )
}

export default ModalButtons
