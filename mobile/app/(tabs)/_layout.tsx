import { Tabs } from 'expo-router'

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: true,
        tabBarActiveTintColor: '#8a6f3b',
      }}
    >
      <Tabs.Screen name="tasks" options={{ title: 'Задачи' }} />
      <Tabs.Screen name="events" options={{ title: 'Мероприятия' }} />
      <Tabs.Screen name="finance" options={{ title: 'Финансы' }} />
      <Tabs.Screen name="profile" options={{ title: 'Профиль' }} />
    </Tabs>
  )
}
