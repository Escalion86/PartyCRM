import { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  SectionList,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { router } from 'expo-router'
import { createApiClient } from '../../src/shared/api/client'
import type { EventItem } from '../../src/shared/api/tasks'

const api = createApiClient()

const statusLabels: Record<string, string> = {
  draft: 'Черновик',
  active: 'Активно',
  canceled: 'Отменено',
  closed: 'Закрыто',
}

const formatDate = (dateStr: string | null) => {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export default function EventsScreen() {
  const [events, setEvents] = useState<EventItem[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')

  const fetchEvents = useCallback(async () => {
    try {
      setError('')
      const res = await api.get<{ success: boolean; data: EventItem[] }>(
        '/mobile/events?scope=upcoming',
      )
      if (res?.success && Array.isArray(res.data)) {
        setEvents(res.data)
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Не удалось загрузить мероприятия')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    fetchEvents()
  }, [fetchEvents])

  const onRefresh = useCallback(() => {
    setRefreshing(true)
    fetchEvents()
  }, [fetchEvents])

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#8a6f3b" />
        <Text style={styles.loadingText}>Загрузка мероприятий...</Text>
      </View>
    )
  }

  const sections = [
    {
      title: `Предстоящие (${events.length})`,
      data: events.length > 0 ? events : [{ _id: '__empty__', description: '', eventType: '', status: 'draft' as const, additionalEvents: [] }],
    },
  ]

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Мероприятия</Text>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <SectionList
        sections={sections}
        keyExtractor={(item, index) => item._id + index}
        renderItem={({ item }) => {
          if (item._id === '__empty__') {
            return (
              <View style={styles.empty}>
                <Text style={styles.emptyText}>Нет предстоящих мероприятий</Text>
                <Text style={styles.emptySubtext}>
                  Мероприятия появятся при создании в веб-версии CRM
                </Text>
              </View>
            )
          }
          return (
            <Pressable
              style={styles.card}
              onPress={() => {
                // TODO: navigate to event detail when implemented
              }}
            >
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle} numberOfLines={1}>
                  {item.eventType || 'Мероприятие'}
                </Text>
                <View
                  style={[
                    styles.statusBadge,
                    item.status === 'active' && styles.statusActive,
                    item.status === 'canceled' && styles.statusCanceled,
                    item.status === 'closed' && styles.statusClosed,
                  ]}
                >
                  <Text style={styles.statusText}>
                    {statusLabels[item.status] || item.status}
                  </Text>
                </View>
              </View>
              {item.description ? (
                <Text style={styles.cardDescription} numberOfLines={2}>
                  {item.description}
                </Text>
              ) : null}
              <View style={styles.cardFooter}>
                <Text style={styles.cardDate}>{formatDate(item.eventDate)}</Text>
                {item.address?.town ? (
                  <Text style={styles.cardLocation} numberOfLines={1}>
                    {item.address.town}
                  </Text>
                ) : null}
              </View>
              {item.additionalEvents && item.additionalEvents.length > 0 ? (
                <Text style={styles.cardTasks}>
                  Задач: {item.additionalEvents.filter((t) => !t.done).length} активных
                </Text>
              ) : null}
            </Pressable>
          )
        }}
        renderSectionHeader={({ section }) => (
          <Text style={styles.sectionTitle}>{section.title}</Text>
        )}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        contentContainerStyle={styles.listContent}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
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
    padding: 16,
    paddingBottom: 8,
  },
  error: {
    color: '#b91c1c',
    fontSize: 14,
    marginHorizontal: 16,
    marginBottom: 8,
    padding: 12,
    backgroundColor: '#fef2f2',
    borderRadius: 8,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 80,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6b7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
    marginTop: 4,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1c1d1f',
    flex: 1,
    marginRight: 8,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: '#f3f4f6',
  },
  statusActive: {
    backgroundColor: '#d1fae5',
  },
  statusCanceled: {
    backgroundColor: '#fee2e2',
  },
  statusClosed: {
    backgroundColor: '#f3f4f6',
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#374151',
  },
  cardDescription: {
    fontSize: 13,
    color: '#4b5563',
    marginTop: 4,
    lineHeight: 18,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  cardDate: {
    fontSize: 12,
    color: '#9ca3af',
  },
  cardLocation: {
    fontSize: 12,
    color: '#9ca3af',
    flex: 1,
    textAlign: 'right',
  },
  cardTasks: {
    fontSize: 12,
    color: '#8a6f3b',
    marginTop: 4,
    fontWeight: '500',
  },
  empty: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: 16,
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
})
