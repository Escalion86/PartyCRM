# ArtistCRM Mobile (Expo)

## Что это
- Базовый каркас мобильного приложения ArtistCRM на React Native + Expo.
- Текущий этап: старт M1-T1 (архитектурный каркас, auth-flow заготовка, API client skeleton).

## Структура
- `app/` — маршруты Expo Router.
- `src/shared/api/` — HTTP-клиент, ошибки, типы.
- `src/shared/config/` — env-конфиг.
- `src/shared/auth/` — хранение токена (SecureStore).

## Быстрый старт
1. Установить зависимости:
```bash
cd mobile
npm install
```

2. Создать `.env` из примера:
```bash
cp .env.example .env
```

3. Указать API URL:
```env
EXPO_PUBLIC_API_BASE_URL=http://localhost:3000/api
EXPO_PUBLIC_APP_SCHEME=artistcrm
```

4. Запуск:
```bash
npm run start
```

## Текущие экраны (skeleton)
- `/(auth)/login`
- `/(tabs)/tasks`
- `/(tabs)/events`
- `/(tabs)/finance`
- `/(tabs)/profile`

## Что уже есть в API-слое
- `ApiClient` с:
  - base URL из env;
  - автоматической подстановкой bearer token;
  - единым разбором backend-ошибок.
- тип `ApiErrorShape` под формат:
```json
{
  "success": false,
  "error": {
    "code": "SOME_CODE",
    "type": "validation|auth|rate_limit|unknown",
    "message": "Текст ошибки"
  }
}
```

## Следующий шаг (M1-T1 -> M1-T2)
- Реализовать реальную авторизацию (`/auth/login` или согласованный endpoint).
- Подключить список задач контактов с API.
- Добавить обработку offline outbox.
