import { useState } from 'react'
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { router } from 'expo-router'
import { createApiClient } from '../../src/shared/api/client'
import { setAuthToken } from '../../src/shared/auth/tokenStore'

const api = createApiClient()

type LoginResponse = {
  success: boolean
  token?: string
  error?: string
}

export default function LoginScreen() {
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const onLogin = async () => {
    setError('')
    if (!phone.trim()) {
      setError('Введите телефон')
      return
    }
    if (!password.trim()) {
      setError('Введите пароль')
      return
    }

    setLoading(true)
    try {
      const result = await api.post<LoginResponse>('/mobile/auth/login', {
        phone: phone.trim(),
        password: password.trim(),
      })

      if (!result.success) {
        setError(result.error || 'Ошибка авторизации')
        return
      }

      await setAuthToken(result.token as string)
      router.replace('/(tabs)/tasks')
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : ''
      if (msg.includes('Неверный')) {
        setError('Неверный телефон или пароль')
      } else if (msg.includes('Укажите')) {
        setError('Введите телефон и пароль')
      } else {
        setError('Не удалось авторизоваться. Проверьте доступность API.')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>ArtistCRM</Text>
      <Text style={styles.subtitle}>Вход в мобильное приложение</Text>

      <TextInput
        value={phone}
        onChangeText={setPhone}
        placeholder="Телефон"
        keyboardType="phone-pad"
        autoCapitalize="none"
        style={styles.input}
      />
      <TextInput
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        placeholder="Пароль"
        style={styles.input}
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Pressable style={styles.button} onPress={onLogin} disabled={loading}>
        <Text style={styles.buttonText}>{loading ? 'Вход...' : 'Войти'}</Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: 20,
    backgroundColor: '#f7efe1',
    gap: 12,
  },
  title: {
    fontSize: 30,
    fontWeight: '700',
    color: '#1c1d1f',
  },
  subtitle: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 10,
    backgroundColor: '#ffffff',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  button: {
    marginTop: 6,
    borderRadius: 10,
    backgroundColor: '#8a6f3b',
    paddingVertical: 12,
    alignItems: 'center',
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  error: {
    color: '#b91c1c',
    fontSize: 13,
  },
})
