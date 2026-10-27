import MuiTabContext from '@mui/lab/TabContext'
import Tab from '@mui/material/Tab'
import { useState } from 'react'
import TabList from './TabList'

const TabContext = ({
  value,
  requestedTab,
  children,
  variant = 'scrollable',
  scrollButtons = 'auto',
  allowScrollButtonsMobile = true,
}) => {
  const [tab, setTab] = useState(value)
  const [lastRequest, setLastRequest] = useState(requestedTab)
  if (requestedTab && requestedTab !== lastRequest) {
    setLastRequest(requestedTab)
    setTab(typeof requestedTab === 'string' ? requestedTab : requestedTab.name)
  }
  const tabs = []
  children.forEach((child, index) => {
    if (child?.props?.tabName) {
      const tabName = child.props.tabName
      const tabAddToLabel = child.props.tabAddToLabel
      tabs.push(
        <Tab
          key={tabName}
          label={
            <div className="flex flex-col">
              <div>{tabName}</div>
              {tabAddToLabel && <div>{tabAddToLabel}</div>}
            </div>
          }
          value={tabName}
        />
      )
    }
  })

  // console.log('tabNames', tabNames)

  return (
    <MuiTabContext value={tab}>
      <TabList
        onChange={setTab}
        variant={variant}
        scrollButtons={scrollButtons}
        allowScrollButtonsMobile={allowScrollButtonsMobile}
        className="w-full max-w-[100%]"
      >
        {tabs}
      </TabList>
      {children}
    </MuiTabContext>
  )
}

export default TabContext
