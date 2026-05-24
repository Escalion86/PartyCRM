const CabinetWrapper = ({ children }) => {
  return (
    <div
      className="grid h-[100dvh] max-h-[100dvh] w-full overflow-hidden"
      style={{
        gridTemplateRows: 'auto 1fr',
        gridTemplateColumns: '64px 1fr',
        gridTemplateAreas: `
          'burger header'
          'content content'
        `,
      }}
    >
      {children}
    </div>
  )
}

export default CabinetWrapper
