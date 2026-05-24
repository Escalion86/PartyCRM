import { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { useLocalSearchParams, router } from 'expo-router'
import { getAuthToken } from '../../src/shared/auth/tokenStore'
import { env } from '../../src/shared/config/env'

interface Client {
  _id: string
  firstName: string
  secondName: string
  thirdName: string
  phone?: number
  whatsapp?: number
  telegram?: string
  email?: string
  vk?: string
  instagram?: string
  comment?: string
  clientType?: string
  town?: string
  preferredContactChannel?: string
  significantDates?: Array<{ title: string; date: string; comment?: string }>
}

export default function ClientDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const [client, setClient] = useState<Client | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (id) loadClient()
  }, [id])

  const loadClient = async () => {
    try {
      const token = await getAuthToken()
      if (!token) {
        router.replace('/(auth)/login')
        return
      }

      const response = await fetch(`${env.apiBaseUrl}/clients/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      })

      if (!response.ok) {
        throw new Error('Failed to load client')
      }

      const data = await response.json()
      setClient(data.data)
    } catch (err: any) {
      setError(err.message || 'Ошибка загрузки')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#8a6f3b" />
      </View>
    )
  }

  if (error || !client) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>{error || 'Клиент не найден'}</Text>
        <Pressable style={styles.retryButton} onPress={loadClient}>
          <Text style={styles.retryText}>Повторить</Text>
        </Pressable>
      </View>
    )
  }

  const name = `${client.firstName || ''} ${client.secondName || ''} ${client.thirdName || ''}`.trim() || 'Без имени'

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>{name}</Text>

      {client.phone ? (
        <View style={styles.section}>
          <Text style={styles.label}>Телефон</Text>
          <Text style={styles.value}>{String(client.phone)}</Text>
        </View>
      ) : null}

      {client.email ? (
        <View style={styles.section}>
          <Text style={styles.label}>Email</Text>
          <Text style={styles.value}>{client.email}</Text>
        </View>
      ) : null}

      {client.telegram ? (
        <View style={styles.section}>
          <Text style={styles.label}>Telegram</Text>
          <Text style={styles.value}>{client.telegram}</Text>
        </View>
      ) : null}

      {client.whatsapp ? (
        <View style={styles.section}>
          <Text style={styles.label}>WhatsApp</Text>
          <Text style={styles.value}>{String(client.whatsapp)}</Text>
        </View>
      ) : null}

      {client.vk ? (
        <View style={styles.section}>
          <Text style={styles.label}>VK</Text>
          <Text style={styles.value}>{client.vk}</Text>
        </View>
      ) : null}

      {client.instagram ? (
        <View style={styles.section}>
          <Text style={styles.label}>Instagram</Text>
          <Text style={styles.value}>{client.instagram}</Text>
        </View>
      ) : null}

      {client.town ? (
        <View style={styles.section}>
          <Text style={styles.label}>Город</Text>
          <Text style={styles.value}>{client.town}</Text>
        </View>
      ) : null}

      {client.clientType && client.clientType !== 'none' ? (
        <View style={styles.section}>
          <Text style={styles.label}>Тип</Text>
          <Text style={styles.value}>{client.clientType}</Text>
        </View>
      ) : null}

      {client.preferredContactChannel ? (
        <View style={styles.section}>
          <Text style={styles.label}>Предпочтительный канал</Text>
          <Text style={styles.value}>{client.preferredContactChannel}</Text>
        </View>
      ) : null}

      {client.comment ? (
        <View style={styles.section}>
          <Text style={styles.label}>Комментарий</Text>
          <Text style={styles.value}>{client.comment}</Text>
        </View>
      ) : null}

      {client.significantDates && client.significantDates.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.label}>Важные даты</Text>
          {client.significantDates.map((date, index) => (
            <View key={index} style={styles.dateItem}>
              <Text style={styles.dateTitle}>{date.title}</Text>
              <Text style={styles.dateValue}>
                {date.date ? new Date(date.date).toLocaleDateString('ru-RU') : ''}
              </Text>
              {date.comment ? <Text style={styles.dateComment}>{date.comment}</Text> : null}
            </View>
          ))}
        </View>
      ) : null}

      <View style={styles.spacer} />
    </ScrollView>
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
    padding: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1c1d1f',
    marginBottom: 20,
  },
  section: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 14,
    marginBottom: 8,
  },
  label: {
    fontSize: 12,
    color: '#6b7280',
    marginBottom: 4,
    fontWeight: '500',
  },
  value: {
    fontSize: 15,
    color: '#1c1d1f',
  },
  dateItem: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
  },
  dateTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1c1d1f',
  },
  dateValue: {
    fontSize: 13,
    color: '#8a6f3b',
    marginTop: 2,
  },
  dateComment: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 2,
  },
  error: {
    fontSize: 14,
    color: '#dc2626',
    marginBottom: 12,
  },
  retryButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: '#8a6f3b',
    borderRadius: 8,
  },
  retryText: {
    color: '#fff',
    fontWeight: '600',
  },
  spacer: {
    height: 40,
  },
})
