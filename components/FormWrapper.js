import cn from 'classnames'

const FormWrapper = ({ children, className, title, grid }) => {
  if (!title)
    return (
      <div
        className={cn(
          `w-full`,
          grid
            ? 'tablet:grid-cols-3 grid grid-cols-1 gap-x-2 sm:grid-cols-2 xl:grid-cols-4'
            : '',
          className
        )}
      >
        {children}
      </div>
    )

  return (
    <div className="flex w-full flex-col">
      <div className="text-center text-lg font-bold">{title}</div>
      <div
        className={cn(
          `flex w-full flex-col gap-x-2`,
          flexRowWrap ? 'flex-row flex-wrap' : '',
          className
        )}
      >
        {children}
      </div>
    </div>
  )
}

export default FormWrapper
