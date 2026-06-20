# PartyCRM Backup And Restore Runbook

## Цель

PartyCRM хранит данные отдельно от ArtistCRM. Backup, restore, migration и seed-операции должны выполняться только против PartyCRM DB и не должны использовать ArtistCRM DB даже при общем runtime.

Runbook рассчитан на MongoDB через `mongodump` и `mongorestore`.

## Как определить PartyCRM DB

В общем ArtistCRM + PartyCRM runtime PartyCRM обязан использовать:

```env
PARTYCRM_SHARED_RUNTIME=true
PARTYCRM_MONGODB_URI=...
PARTYCRM_MONGODB_DBNAME=partycrm_prod
```

В отдельном PartyCRM runtime допустим fallback:

```env
MONGODB_URI=...
MONGODB_DBNAME=partycrm_prod
```

Перед любым backup или restore явно выведите итоговую пару URI + DB:

```bash
node -e "console.log({ uri: process.env.PARTYCRM_MONGODB_URI || process.env.MONGODB_URI, db: process.env.PARTYCRM_MONGODB_DBNAME || process.env.MONGODB_DBNAME })"
```

Остановитесь, если:

- `db` пустой;
- `db` похож на ArtistCRM production DB;
- `PARTYCRM_SHARED_RUNTIME=true`, но `PARTYCRM_MONGODB_URI` или `PARTYCRM_MONGODB_DBNAME` не заданы;
- URI + DB совпадают с ArtistCRM.

## Имена коллекций

PartyCRM использует отдельную DB, но коллекции внутри нее имеют обычные имена:

- `companies`
- `users`
- `staff`
- `staffInvites`
- `locations`
- `clients`
- `services`
- `servicegroups`
- `orders`
- `transactions`
- `payments`
- `tariffs`
- `assignments`

Для tenant-owned коллекций ключ компании хранится в `tenantId`.

## Backup production

1. Подключитесь к серверу приложения или к рабочей машине с доступом к MongoDB.
2. Загрузите production env PartyCRM.
3. Проверьте итоговую PartyCRM DB.
4. Создайте каталог backup.

```bash
export BACKUP_ROOT="/var/backups/partycrm"
export BACKUP_DATE="$(date -u +%Y%m%dT%H%M%SZ)"
export PARTY_DB_URI="${PARTYCRM_MONGODB_URI:-$MONGODB_URI}"
export PARTY_DB_NAME="${PARTYCRM_MONGODB_DBNAME:-$MONGODB_DBNAME}"

mkdir -p "$BACKUP_ROOT/$BACKUP_DATE"

echo "Backing up DB: $PARTY_DB_NAME"
test -n "$PARTY_DB_URI"
test -n "$PARTY_DB_NAME"

mongodump \
  --uri "$PARTY_DB_URI" \
  --db "$PARTY_DB_NAME" \
  --archive="$BACKUP_ROOT/$BACKUP_DATE/partycrm-$PARTY_DB_NAME.archive.gz" \
  --gzip
```

5. Сохраните checksum.

```bash
sha256sum "$BACKUP_ROOT/$BACKUP_DATE/partycrm-$PARTY_DB_NAME.archive.gz" \
  > "$BACKUP_ROOT/$BACKUP_DATE/SHA256SUMS"
```

6. Проверьте, что archive не пустой.

```bash
ls -lh "$BACKUP_ROOT/$BACKUP_DATE"
```

## Restore в staging или локальную DB

Никогда не проверяйте backup первым restore в production. Сначала восстановите архив в staging или локальную DB.

```bash
export RESTORE_URI="mongodb://127.0.0.1:27017"
export RESTORE_DB_NAME="partycrm_restore_drill"
export BACKUP_ARCHIVE="/var/backups/partycrm/20260621T000000Z/partycrm-partycrm_prod.archive.gz"

mongorestore \
  --uri "$RESTORE_URI" \
  --nsFrom="partycrm_prod.*" \
  --nsTo="$RESTORE_DB_NAME.*" \
  --archive="$BACKUP_ARCHIVE" \
  --gzip \
  --drop
```

Если имя исходной DB отличается, замените `partycrm_prod` в `--nsFrom`.

После restore:

```bash
mongosh "$RESTORE_URI/$RESTORE_DB_NAME" --eval "db.companies.countDocuments(); db.orders.countDocuments(); db.users.countDocuments();"
```

Минимальная проверка:

- есть хотя бы одна `companies`, если backup не пустой;
- у `orders`, `staff`, `locations`, `clients`, `services`, `transactions` есть `tenantId`;
- `users` относится к PartyCRM auth, а не к ArtistCRM NextAuth users;
- приложение со staging env открывает `/api/party/health`.

## Restore production

Production restore допускается только после restore drill в staging.

Перед production restore:

1. Зафиксируйте причину restore.
2. Уведомите владельцев продукта.
3. Остановите запись в приложение: остановите Next.js process или временно закройте write endpoints на уровне reverse proxy.
4. Сделайте fresh backup текущего production состояния.
5. Проверьте checksum архива, который будете восстанавливать.

Команда restore:

```bash
export PARTY_DB_URI="${PARTYCRM_MONGODB_URI:-$MONGODB_URI}"
export PARTY_DB_NAME="${PARTYCRM_MONGODB_DBNAME:-$MONGODB_DBNAME}"
export BACKUP_ARCHIVE="/var/backups/partycrm/20260621T000000Z/partycrm-partycrm_prod.archive.gz"

echo "Restoring DB: $PARTY_DB_NAME"
test -n "$PARTY_DB_URI"
test -n "$PARTY_DB_NAME"

mongorestore \
  --uri "$PARTY_DB_URI" \
  --db "$PARTY_DB_NAME" \
  --archive="$BACKUP_ARCHIVE" \
  --gzip \
  --drop
```

После restore:

1. Запустите приложение.
2. Проверьте `/api/party/health`.
3. Войдите в `/party/login`.
4. Откройте `/company` для реальной компании.
5. Проверьте заказы, клиентов, сотрудников, точки, финансы и документы.
6. Проверьте, что ArtistCRM работает со своей DB и не получил PartyCRM данные.

## Backup перед миграциями

Перед любой миграцией PartyCRM:

1. Создайте backup по инструкции выше.
2. Выполните restore drill в отдельную DB.
3. Прогоните миграцию сначала на restore DB.
4. Сравните количество документов до и после миграции.
5. Только после этого запускайте миграцию на production.

Минимальная форма migration log:

```text
Дата:
Оператор:
Причина:
Backup archive:
Source DB:
Target DB:
Команда миграции:
Проверка до:
Проверка после:
Rollback plan:
```

## Seed-данные

Seed-данные PartyCRM можно запускать только для dev/staging DB.

Правила:

- production seed запрещен без отдельного письменного плана;
- seed не должен создавать ArtistCRM пользователей или tenant'ы;
- seed-компании должны иметь явный `tenantId`;
- seed-пользователи должны попадать в PartyCRM `users`;
- тестовые API keys, платежи и интеграционные токены должны быть фиктивными.

Перед запуском seed:

```bash
node -e "const db=process.env.PARTYCRM_MONGODB_DBNAME||process.env.MONGODB_DBNAME; if (/prod|production/i.test(db)) throw new Error('Refusing to seed production DB: '+db); console.log('Seed target DB:', db)"
```

## Retention

Рекомендуемая политика хранения:

- daily backup: 14 дней;
- weekly backup: 8 недель;
- monthly backup: 12 месяцев;
- backup перед миграцией: хранить минимум до следующего стабильного релиза.

Архивы должны храниться вне директории приложения и не попадать в Git.

## Что не делать

- Не запускать `mongorestore --drop`, пока не проверена итоговая DB.
- Не использовать generic `MONGODB_*` в общем runtime для PartyCRM backup.
- Не хранить backup archive в репозитории.
- Не восстанавливать PartyCRM архив в ArtistCRM DB.
- Не запускать seed в production.
- Не считать backup рабочим, пока не выполнен restore drill.
