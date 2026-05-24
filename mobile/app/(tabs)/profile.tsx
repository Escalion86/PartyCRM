import { useEffect, useState } from 'react'
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native'
import { router } from 'expo-router'
import { clearAuthToken } from '../../src/shared/auth/tokenStore'
import {
  getContactPushPreferences,
  updateContactPushPreferences,
} from '../../src/services/notifications'

export default function ProfileScreen() {
  const [contactCreated, setContactCreated] = useState(true)
  const [contactUpdated, setContactUpdated] = useState(true)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadPreferences()
  }, [])

  const loadPreferences = async () => {
    const prefs = await getContactPushPreferences()
    if (prefs) {
      setContactCreated(prefs.created)
      setContactUpdated(prefs.updated)
    }
    setLoading(false)
  }

  const toggleCreated = async (value: boolean) => {
    setContactCreated(value)
    await updateContactPushPreferences({ created: value })
  }

  const toggleUpdated = async (value: boolean) => {
    setContactUpdated(value)
    await updateContactPushPreferences({ updated: value })
  }

  const onLogout = async () => {
    await clearAuthToken()
    router.replace('/(auth)/login')
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Профиль</Text>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Push-уведомления</Text>

        <View style={styles.settingRow}>
          <Text style={styles.settingLabel}>Новый контакт</Text>
          <Switch
            value={contactCreated}
            onValueChange={toggleCreated}
            disabled={loading}
            trackColor={{ false: '#d1d5db', true: '#c4a97d' }}
            thumbColor={contactCreated ? '#8a6f3b' : '#f4f3f4'}
          />
        </View>

        <View style={styles.settingRow}>
          <Text style={styles.settingLabel}>Обновление контакта</Text>
          <Switch
            value={contactUpdated}
            onValueChange={toggleUpdated}
            disabled={loading}
            trackColor={{ false: '#d1d5db', true: '#c4a97d' }}
            thumbColor={contactUpdated ? '#8a6f3b' : '#f4f3f4'}
          />
        </View>
      </View>

      <Pressable style={styles.button} onPress={onLogout}>
        <Text style={styles.buttonText}>Выйти</Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: '#f5f6f8',
    gap: 12,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1c1d1f',
  },
  section: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    gap: 4,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1c1d1f',
    marginBottom: 8,
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  settingLabel: {
    fontSize: 14,
    color: '#374151',
  },
  button: {
    marginTop: 8,
    width: 120,
    alignItems: 'center',
    borderRadius: 10,
    paddingVertical: 10,
    backgroundColor: '#8a6f3b',
  },
  buttonText: {
    color: '#fff',
    fontWeight: '600',
  },
})
