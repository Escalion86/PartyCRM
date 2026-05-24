'use client'

import { SnackbarProvider } from 'notistack'

const AppSnackbarProvider = ({ children }) => {
  return (
    <SnackbarProvider
      maxSnack={4}
      autoHideDuration={3500}
      preventDuplicate
      anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
    >
      {children}
    </SnackbarProvider>
  )
}

export default AppSnackbarProvider
