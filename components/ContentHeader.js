const ContentHeader = ({ children }) => {
  return (
    <div className="content-toolbar z-10 flex w-full flex-wrap items-center justify-between gap-2 overflow-x-hidden px-2 py-1 text-black">
      {children}
    </div>
  )
}

export default ContentHeader
