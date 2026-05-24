import LabeledContainer from '@components/LabeledContainer'
import AddIconButton from '@components/AddIconButton'
import { faTrashAlt } from '@fortawesome/free-solid-svg-icons'
import IconActionButton from '@components/IconActionButton'

const LinksListEditor = ({ label, links = [], onChange, noMargin = false }) => {
  const safeLinks = Array.isArray(links) ? links : []

  const handleUpdateLink = (index, value) => {
    onChange?.(safeLinks.map((item, idx) => (idx === index ? value : item)))
  }

  const handleRemoveLink = (index) => {
    onChange?.(safeLinks.filter((_, idx) => idx !== index))
  }

  const handleAddLink = () => {
    onChange?.([...safeLinks, ''])
  }

  return (
    <LabeledContainer label={label} noMargin={noMargin}>
      <div className="flex flex-col gap-2">
        {safeLinks.map((link, index) => (
          <div key={`${label}-link-${index}`} className="flex items-center gap-2">
            <input
              className="focus:border-general h-8 w-full rounded border border-gray-200 px-2 text-sm text-gray-900 focus:outline-none"
              type="text"
              value={link}
              placeholder="Введите ссылку"
              onChange={(event) => handleUpdateLink(index, event.target.value)}
            />
            <IconActionButton
              icon={faTrashAlt}
              onClick={() => handleRemoveLink(index)}
              title="Удалить ссылку"
              variant="danger"
              size="xs"
            />
          </div>
        ))}
        <AddIconButton
          onClick={handleAddLink}
          title="Добавить ссылку"
          size="xs"
        />
      </div>
    </LabeledContainer>
  )
}

export default LinksListEditor
