import LoadingSpinner from '@components/LoadingSpinner'

const LoadingContent = () => {
  return (
    <div
      style={{ gridArea: 'loading' }}
      className="flex h-[100dvh] w-full flex-1 flex-col items-center justify-center overflow-hidden"
    >
      <LoadingSpinner size="lg" text="Загрузка..." />
    </div>
  )
}

export default LoadingContent
