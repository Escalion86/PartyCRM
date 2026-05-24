import SideBar from '@layouts/SideBar'

const ContentWrapper = ({ children, page }) => {
  return (
    <div
      className="font-futuraPT relative flex h-[calc(100dvh-4rem)] max-h-[calc(100dvh-4rem)] max-w-[100vw]"
      style={{
        gridArea: 'content',
        // gridTemplateRows: 'auto',
        // gridTemplateColumns: 'auto 1fr',
        // gridTemplateAreas: `
        //   'sidebar child'
        // `,
      }}
    >
      <SideBar page={page} />
      <div
        className="cabinet-canvas flex max-w-[100vw] flex-1 flex-col"
        // style={{ gridArea: 'child' }}
      >
        {children}
      </div>
    </div>
  )
}

export default ContentWrapper
