# Contributing to @yuppay/sdk

Спасибо, что хотите помочь!

## Локальная разработка

```bash
git clone git@github.com:Se-La-Via/YupPay.git
cd YupPay
npm install
npm test          # vitest
npm run build     # tsup → dist/
npm run typecheck # tsc --noEmit
```

## Структура

- `src/` — исходники TypeScript.
- `test/` — unit-тесты на vitest.
- `examples/` — самодостаточные примеры (Express, Next.js, browser, CLI).
- `dist/` — собранные артефакты (не коммитим).

## Принципы

- **Нет потерь точности.** Все суммы — `bigint`/строки в минимальных единицах. JS `number` допускается только для USD-цен.
- **Нет тяжёлых зависимостей.** Runtime должен оставаться чистым: только нативный `fetch` и `node:crypto` (опционально).
- **Совместимость.** Поддерживаем Node ≥ 18, Bun, Deno, Cloudflare Workers, Vercel Edge, современные браузеры.
- **Тесты обязательны.** Любая логика конвертации, форматирования или подписи должна быть покрыта тестами.

## Релиз

Релизы публикуются автоматически при пуше тега `vX.Y.Z` (workflow `release.yml`).
Перед тегом обновите версию в `package.json` и добавьте запись в `CHANGELOG.md`.

```bash
npm version patch    # или minor / major
git push --follow-tags
```

## Лицензия

Все вклады публикуются под лицензией [MIT](./LICENSE).
