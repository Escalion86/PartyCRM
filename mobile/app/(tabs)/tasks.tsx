import { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { router } from 'expo-router'
import { createApiClient } from '../../src/shared/api/client'
import type { EventItem, TaskWithEvent, TasksGroup } from '../../src/shared/api/tasks'

const api = createApiClient()

const isTaskDue = (task: { date: string | null; done: boolean }, date: Date) => {
  if (task.done || !task.date) return false
  const taskDate = new Date(task.date)
  if (isNaN(taskDate.getTime())) return false
  return taskDate.getTime() < date.getTime()
}

const isTaskForDay = (task: { date: string | null; done: boolean }, startOfDay: Date, endOfDay: Date) => {
  if (task.done || !task.date) return false
  const taskDate = new Date(task.date)
  if (isNaN(taskDate.getTime())) return false
  return taskDate.getTime() >= startOfDay.getTime() && taskDate.getTime() < endOfDay.getTime()
}

const getStartOfDay = (date: Date) => {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

const getEndOfDay = (date: Date) => {
  const d = new Date(date)
  d.setHours(23, 59, 59, 999)
  return d
}

const formatTaskTime = (dateStr: string | null) => {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
}

const formatTaskDate = (dateStr: string | null) => {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
}

const groupTasks = (events: EventItem[]): TasksGroup[] => {
  const now = new Date()
  const startOfToday = getStartOfDay(now)
  const startOfTomorrow = getStartOfDay(new Date(now.getTime() + 86400000))
  const startOfDayAfter = getStartOfDay(new Date(now.getTime() + 2 * 86400000))

  const overdue: TaskWithEvent[] = []
  const today: TaskWithEvent[] = []
  const tomorrow: TaskWithEvent[] = []

  for (const event of events) {
    if (!event.additionalEvents || event.status === 'canceled' || event.status === 'closed') continue

    for (let i = 0; i < event.additionalEvents.length; i++) {
      const task = event.additionalEvents[i]
      if (!task || task.done) continue

      const taskWithEvent: TaskWithEvent = {
        task,
        event: {
          _id: event._id,
          eventType: event.eventType || 'Мероприятие',
          description: event.description,
          status: event.status,
        },
        index: i,
      }

      if (isTaskDue(task, startOfToday)) {
        overdue.push(taskWithEvent)
      } else if (isTaskForDay(task, startOfToday, startOfTomorrow)) {
        today.push(taskWithEvent)
      } else if (isTaskForDay(task, startOfTomorrow, startOfDayAfter)) {
        tomorrow.push(taskWithEvent)
      }
    }
  }

  // Sort each group by date
  const sortByDate = (a: TaskWithEvent, b: TaskWithEvent) => {
    const dateA = a.task.date ? new Date(a.task.date).getTime() : 0
    const dateB = b.task.date ? new Date(b.task.date).getTime() : 0
    return dateA - dateB
  }

  overdue.sort(sortByDate)
  today.sort(sortByDate)
  tomorrow.sort(sortByDate)

  const groups: TasksGroup[] = []
  if (overdue.length > 0) groups.push({ label: `Просрочено (${overdue.length})`, data: overdue })
  if (today.length > 0) groups.push({ label: `Сегодня (${today.length})`, data: today })
  if (tomorrow.length > 0) groups.push({ label: `Завтра (${tomorrow.length})`, data: tomorrow })

  return groups
}

export default function TasksScreen() {
  const [events, setEvents] = useState<EventItem[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')

  const fetchTasks = useCallback(async () => {
    try {
      setError('')
      const res = await api.get<{ success: boolean; data: EventItem[] }>('/mobile/events?scope=upcoming')
      if (res?.success && Array.isArray(res.data)) {
        setEvents(res.data)
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Не удалось загрузить задачи')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    fetchTasks()
  }, [fetchTasks])

  const onRefresh = useCallback(() => {
    setRefreshing(true)
    fetchTasks()
  }, [fetchTasks])

  const groups = groupTasks(events)

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#8a6f3b" />
        <Text style={styles.loadingText}>Загрузка задач...</Text>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Задачи</Text>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {!error && groups.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>Нет активных задач</Text>
          <Text style={styles.emptySubtext}>
            Задачи появляются при создании доп. событий в мероприятиях
          </Text>
        </View>
      ) : null}

      {groups.map((group) => (
        <View key={group.label} style={styles.group}>
          <Text style={styles.groupLabel}>{group.label}</Text>
          {group.data.map((item) => {
            const isOverdue = group.label.startsWith('Просрочено')
            return (
              <Pressable
                key={`${item.event._id}-${item.index}`}
                style={[styles.taskCard, isOverdue && styles.taskCardOverdue]}
                onPress={() => {
                  router.push('/(tabs)/events')
                }}
              >
                <View style={styles.taskHeader}>
                  <Text style={styles.taskTitle} numberOfLines={1}>
                    {item.task.title || 'Без названия'}
                  </Text>
                  <Text style={[styles.taskTime, isOverdue && styles.taskTimeOverdue]}>
                    {formatTaskTime(item.task.date)}
                  </Text>
                </View>
                <Text style={styles.taskEvent} numberOfLines={1}>
                  {item.event.eventType}
                </Text>
                {item.task.description ? (
                  <Text style={styles.taskDescription} numberOfLines={2}>
                    {item.task.description}
                  </Text>
                ) : null}
                <View style={styles.taskFooter}>
                  <Text style={styles.taskDate}>
                    {formatTaskDate(item.task.date)}
                  </Text>
                  {isOverdue && (
                    <View style={styles.overdueBadge}>
                      <Text style={styles.overdueText}>!</Text>
                    </View>
                  )}
                </View>
              </Pressable>
            )
          })}
        </View>
      ))}

      <View style={{ height: 80 }} />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: '#f5f6f8',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f6f8',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#6b7280',
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1c1d1f',
    marginBottom: 16,
  },
  error: {
    color: '#b91c1c',
    fontSize: 14,
    marginBottom: 12,
    padding: 12,
    backgroundColor: '#fef2f2',
    borderRadius: 8,
  },
  empty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 60,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#6b7280',
  },
  emptySubtext: {
    fontSize: 13,
    color: '#9ca3af',
    textAlign: 'center',
    marginTop: 8,
    paddingHorizontal: 40,
  },
  group: {
    marginBottom: 20,
  },
  groupLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6b7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  taskCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  taskCardOverdue: {
    borderColor: '#fca5a5',
    backgroundColor: '#fff5f5',
  },
  taskHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  taskTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1c1d1f',
    flex: 1,
    marginRight: 8,
  },
  taskTime: {
    fontSize: 14,
    fontWeight: '600',
    color: '#8a6f3b',
  },
  taskTimeOverdue: {
    color: '#dc2626',
  },
  taskEvent: {
    fontSize: 13,
    color: '#6b7280',
    marginBottom: 4,
  },
  taskDescription: {
    fontSize: 13,
    color: '#4b5563',
    marginTop: 4,
    lineHeight: 18,
  },
  taskFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  taskDate: {
    fontSize: 12,
    color: '#9ca3af',
  },
  overdueBadge: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#dc2626',
    justifyContent: 'center',
    alignItems: 'center',
  },
  overdueText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
})
