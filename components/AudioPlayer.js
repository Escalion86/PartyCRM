import { faFileAudio } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import cn from 'classnames'

const AudioPlayer = ({
  src,
  title = 'Аудиозапись',
  subtitle = '',
  className = '',
  compact = false,
}) => {
  if (!src) return null

  return (
    <div
      className={cn(
        'audio-player-shell rounded-lg border border-gray-200 p-2',
        compact ? 'max-w-80' : 'w-full',
        className
      )}
    >
      <div className="mb-2 flex items-center gap-2">
        <span className="audio-player-icon flex h-8 w-8 shrink-0 items-center justify-center rounded-full">
          <FontAwesomeIcon icon={faFileAudio} className="h-3.5 w-3.5" />
        </span>
        <span className="min-w-0">
          <span className="card-title block truncate text-sm">{title}</span>
          {subtitle ? (
            <span className="card-muted block truncate text-xs">{subtitle}</span>
          ) : null}
        </span>
      </div>
      <audio
        className="audio-player-control w-full"
        controls
        preload="none"
        src={src}
      >
        Ваш браузер не поддерживает аудио.
      </audio>
    </div>
  )
}

export default AudioPlayer
