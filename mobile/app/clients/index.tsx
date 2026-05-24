import { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { router } from 'expo-router'
import { getAuthToken } from '../../src/shared/auth/tokenStore'
import { env } from '../../src/shared/config/env'

interface Client {
  _id: string
  firstName: string
  secondName: string
  phone?: number
  email?: string
  clientType?: string
}

export default function ClientsScreen() {
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadClients()
  }, [])

  const loadClients = async () => {
    try {
      const token = await getAuthToken()
      if (!token) {
        router.replace('/(auth)/login')
        return
      }

      const response = await fetch(`${env.apiBaseUrl}/clients`, {
        headers: { Authorization: `Bearer ${token}` },
      })

      if (!response.ok) {
        throw new Error('Failed to load clients')
      }

      const data = await response.json()
      setClients(data.data || [])
    } catch (err: any) {
      setError(err.message || 'Ошибка загрузки')
    } finally {
      setLoading(false)
    }
  }

  const renderClient = ({ item }: { item: Client }) => {
    const name = `${item.firstName || ''} ${item.secondName || ''}`.trim() || 'Без имени'
    return (
      <Pressable
        style={styles.clientCard}
        onPress={() => router.push(`/clients/${item._id}` as any)}
      >
        <Text style={styles.clientName}>{name}</Text>
        {item.phone ? <Text style={styles.clientInfo}>{String(item.phone)}</Text> : null}
        {item.email ? <Text style={styles.clientInfo}>{item.email}</Text> : null}
        {item.clientType && item.clientType !== 'none' ? (
          <Text style={styles.clientType}>{item.clientType}</Text>
        ) : null}
      </Pressable>
    )
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#8a6f3b" />
      </View>
    )
  }

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>{error}</Text>
        <Pressable style={styles.retryButton} onPress={loadClients}>
          <Text style={styles.retryText}>Повторить</Text>
        </Pressable>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Клиенты</Text>
      {clients.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyText}>Нет клиентов</Text>
        </View>
      ) : (
        <FlatList
          data={clients}
          keyExtractor={(item) => item._id}
          renderItem={renderClient}
          contentContainerStyle={styles.list}
          refreshing={loading}
          onRefresh={loadClients}
        />
      )}
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
    padding: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1c1d1f',
    marginBottom: 16,
  },
  list: {
    paddingBottom: 16,
  },
  clientCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  clientName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1c1d1f',
    marginBottom: 4,
  },
  clientInfo: {
    fontSize: 13,
    color: '#6b7280',
    marginTop: 2,
  },
  clientType: {
    fontSize: 12,
    color: '#8a6f3b',
    marginTop: 4,
    fontWeight: '500',
  },
  error: {
    fontSize: 14,
    color: '#dc2626',
    marginBottom: 12,
  },
  emptyText: {
    fontSize: 14,
    color: '#6b7280',
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
})
