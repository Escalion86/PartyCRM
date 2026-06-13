# PartyCRM Technical Preview Deploy

PartyCRM пока деплоится из того же репозитория и того же Next.js приложения, что и ArtistCRM. Это не два отдельных build-процесса, а один production build с двумя доменами и разными БД.

## Целевая схема

```txt
Один репозиторий
Один Next.js build
Один Node/Next runtime

artistcrm.ru -> текущий ArtistCRM
partycrm.ru  -> PartyCRM landing через rewrite на /party

ArtistCRM DB -> отдельный env набор ArtistCRM
ArtistCRM DB -> MONGODB_URI / MONGODB_DBNAME
PartyCRM DB  -> PARTYCRM_MONGODB_URI / PARTYCRM_MONGODB_DBNAME
```

Для текущего сервера:

```txt
Next.js process -> 127.0.0.1:3006
Project path    -> /home/apps/artistcrm
Nginx config    -> /etc/nginx/sites-available/artistcrm
```

## DNS

`partycrm.ru` нужно направить туда же, куда сейчас направлен `artistcrm.ru`:

- если используется VPS: A-запись на тот же IP;
- если используется reverse proxy: добавить `server_name partycrm.ru`;
- если используется PaaS: добавить `partycrm.ru` как дополнительный custom domain к этому же приложению.

## ENV production

Общий checklist по переменным окружения:

```txt
docs/PRODUCTION_ENV_CHECKLIST.md
```

Обязательные переменные ArtistCRM остаются как есть:

```env
MONGODB_URI=...
MONGODB_DBNAME=...
DOMAIN=https://artistcrm.ru
NEXTAUTH_SECRET=...
```

Новые переменные PartyCRM:

```env
DOMAIN=partycrm.ru
PARTYCRM_SHARED_RUNTIME=true
PARTYCRM_MONGODB_URI=...
PARTYCRM_MONGODB_DBNAME=...
AUTH_SECRET=...
```

Для отдельного PartyCRM process допустим fallback на обычные
`MONGODB_URI/MONGODB_DBNAME`, а `PARTYCRM_SHARED_RUNTIME` задавать не нужно. В
описанном здесь общем runtime обязательны флаг и `PARTYCRM_MONGODB_*`;
приложение остановит подключение, если итоговая пара URI+DB совпадёт с
ArtistCRM.

Auth-переменные ArtistCRM остаются привязаны к `artistcrm.ru`:

```env
NEXTAUTH_URL=https://artistcrm.ru
NEXTAUTH_URL_INTERNAL=http://127.0.0.1:3006
```

PartyCRM использует отдельный вход `/party/login`, отдельные endpoints `/api/party/auth/*`, отдельную модель `PartyUsers` и отдельную cookie `partycrm_session`. `AUTH_SECRET` должен отличаться от публичных значений и не должен переиспользоваться как обычный пароль.

## Reverse proxy

Оба домена должны проксироваться в один и тот же Next.js process.

Пример логики:

```txt
artistcrm.ru -> http://127.0.0.1:3006
partycrm.ru  -> http://127.0.0.1:3006
```

Внутри приложения `proxy.js` переписывает корень `partycrm.ru/` на `/party`.
Для PWA `partycrm.ru/manifest.json` также переписывается на отдельный `PartyCRM` manifest, чтобы браузер не предлагал установить приложение как `ArtistCRM`.

Готовый HTTP-only nginx-конфиг без сертификатов лежит в:

```txt
docs/PARTYCRM_NGINX.conf
```

Установка на сервер:

```bash
sudo cp docs/PARTYCRM_NGINX.conf /etc/nginx/sites-available/partycrm
sudo ln -s /etc/nginx/sites-available/artistcrm /etc/nginx/sites-enabled/artistcrm
sudo nginx -t
sudo systemctl reload nginx
```

Если symlink уже существует, повторно создавать его не нужно.

## Проверка после деплоя

1. ArtistCRM:

```txt
https://artistcrm.ru
https://artistcrm.ru/cabinet
```

2. PartyCRM landing:

```txt
https://partycrm.ru
```

3. PartyCRM PWA manifest:

```txt
https://partycrm.ru/manifest.json
```

Ожидаемо: в JSON указаны `name` и `short_name` со значением `PartyCRM`.

4. PartyCRM DB health:

```txt
https://partycrm.ru/api/party/health
```

Ожидаемо:

- `200`, если PartyCRM DB настроена и доступна;
- `503 partycrm_db_unavailable`, если env/БД не настроены.

5. PartyCRM текущий доступ:

```txt
https://partycrm.ru/api/party/memberships
```

Ожидаемо:

- `401`, если не авторизован;
- `200`, если пользователь авторизован; в payload есть список membership'ов и `tenantId` компаний.

Для проверки выбранной компании и company API теперь обязательно передавать header:

```txt
x-partycrm-company-id: <tenantId из /api/party/memberships>
```

Тогда `GET /api/party/me` ожидаемо возвращает:

- `400 partycrm_company_id_required`, если header не передан;
- `403 partycrm_company_access_denied`, если передана чужая компания;
- `403 partycrm_access_not_configured`, если membership есть, но staff/company недоступны;
- `200`, если активная компания выбрана корректно.

## Создание первой компании

Создание компании выполняется из UI: войти в аккаунт, открыть `https://partycrm.ru/company` и нажать `Создать компанию`.

После создания:

- создается `PartyCompanies`;
- создается `PartyStaff` с ролью `owner`;
- `/company` начинает показывать точки и сотрудников.

## Что менять в существующих deploy-скриптах

Build/start команды остаются теми же:

```bash
npm install
npm run build
PORT=3006 npm run start
```

Перед build удалить legacy-файлы старого `next-pwa`, поскольку они игнорируются
Git и не удаляются обычным `git pull`:

```bash
rm -f public/sw.js public/sw.js.map public/workbox-*.js public/workbox-*.js.map
rm -f public/worker-*.js public/worker-*.js.map
```

Актуальный service worker хранится в Git как `public/party-sw.js`. После deploy
проверить, что `https://partycrm.ru/party-sw.js` возвращает `200` и заголовок
`Cache-Control: no-cache, no-store, must-revalidate`.

Сборка не использует `output: 'standalone'`: deploy идет обычным `next start` из проекта с установленными `node_modules`. Это уменьшает лишний tracing/copy-слой при production build.

Нужно добавить только:

- env-переменные PartyCRM;
- домен `partycrm.ru` в DNS/reverse proxy/PaaS;
- SSL-сертификат для `partycrm.ru`;
- после деплоя войти в аккаунт и создать компанию через `/company`.

## Что не делать на technical preview

- Не поднимать отдельный process только для PartyCRM.
- Не делать отдельный репозиторий.
- Не смешивать PartyCRM и ArtistCRM DB.
- Не давать публичный доступ клиентам до готовности onboarding и тарифов.
