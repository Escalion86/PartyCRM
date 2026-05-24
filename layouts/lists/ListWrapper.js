import cn from 'classnames'
import { List } from 'react-window'

const ListWrapper = ({ itemCount, itemSize, children, className }) => {
  const RowComponent = ({ index, style, ...rowProps }) =>
    children({ index, style, ...rowProps })

  return (
    <div className={cn('flex-1 w-full h-full', className)}>
      <List
        rowCount={itemCount}
        rowHeight={itemSize}
        rowComponent={RowComponent}
        rowProps={{}}
                        style={{ height: '100%', width: '100%' }}
      />
    </div>
  )
}

export default ListWrapper
