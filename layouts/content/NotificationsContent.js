'use client'

import LabeledContainer from '@components/LabeledContainer'
import PushNotificationsSettings from '@components/PushNotificationsSettings'

const NotificationsContent = () => (
  <div className="flex h-full flex-col">
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
      <LabeledContainer label="Push-уведомления" noMargin>
        <PushNotificationsSettings />
      </LabeledContainer>
    </div>
  </div>
)

export default NotificationsContent
