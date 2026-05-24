import Burger from '@components/Burger'

function BurgerLayout() {
  return (
    <div
      className="burger-layout flex items-center justify-center h-16 sidebar-bg"
      style={{ gridArea: 'burger' }}
    >
      <Burger />
    </div>
  )
}

export default BurgerLayout
