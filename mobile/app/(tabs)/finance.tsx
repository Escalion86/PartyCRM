import { StyleSheet, Text, View } from 'react-native'

export default function FinanceScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Финансы</Text>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Статус задатков и оплат</Text>
        <Text style={styles.cardText}>
          Раздел в разработке. Здесь будет отображаться информация о задатках, оплатах и маржинальности мероприятий.
        </Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Скоро</Text>
        <Text style={styles.cardText}>
          — Список транзакций{'\n'}
          — Статус задатков по мероприятиям{'\n'}
          — Финансовая сводка{'\n'}
          — Экспорт данных
        </Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: '#f5f6f8',
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1c1d1f',
    marginBottom: 16,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1c1d1f',
    marginBottom: 8,
  },
  cardText: {
    fontSize: 14,
    color: '#4b5563',
    lineHeight: 20,
  },
})
