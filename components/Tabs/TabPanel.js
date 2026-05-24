import { TabPanel as MuiTabPanel } from '@mui/lab'

const TabPanel = ({ tabName, children }) => (
  <MuiTabPanel
    value={tabName}
    className="overflow-x-hidden overflow-y-auto"
    sx={{ padding: '8px' }}
  >
    {children}
  </MuiTabPanel>
)

export default TabPanel
