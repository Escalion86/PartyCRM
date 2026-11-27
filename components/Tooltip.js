import MuiTooltip from '@mui/material/Tooltip'

const Tooltip = ({
  children,
  title,
  onClose,
  onOpen,
  open,
  disableFocusListener,
  disableHoverListener,
  disableTouchListener,
  PopperProps,
  disableInteractive = true,
  describeChild,
}) => {
  if (!title) return children
  return (
    <MuiTooltip
      title={title}
      onClose={onClose}
      onOpen={onOpen}
      open={open}
      disableFocusListener={disableFocusListener}
      disableHoverListener={disableHoverListener}
      disableTouchListener={disableTouchListener}
      describeChild={describeChild}
      PopperProps={PopperProps}
      placement="top"
      arrow
      disableInteractive={disableInteractive}
    >
      {children}
    </MuiTooltip>
  )
}

export default Tooltip
