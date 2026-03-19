# Welcome & Changelog pages — dotmd.tools

## URL структура

| Событие | URL |
|---|---|
| Первая установка | `https://dotmd.tools/<locale>/welcome` |
| Обновление расширения | `https://dotmd.tools/<locale>/changelog` |

## Поддерживаемые локали

```
en, de, fr, es, it, nl, sv, da, no, fi, ar, id, ru, pt-PT, ja, fil, vi, tr, th, ko
```

Fallback для неподдерживаемых → `en`.

## Логика определения локали (уже реализована в расширении)

| Chrome UI Language | URL locale |
|---|---|
| `ru` | `ru` |
| `en-US`, `en-GB` | `en` |
| `pt-PT` | `pt-PT` |
| `pt-BR` | `pt-PT` |
| `nb`, `nn` | `no` |
| `zh-CN`, `zh-TW` | `en` (не поддерживается) |

## Что нужно сделать на сайте

### Страницы для создания

1. `/<locale>/welcome` — страница после первой установки
2. `/<locale>/changelog` — страница с историей обновлений

### Требования к `/welcome`

- Поблагодарить за установку
- Показать ключевые возможности расширения (capture selection, highlighter mode, side panel)
- Опционально: короткий onboarding / GIF / скриншот
- CTA: открыть расширение, попробовать на странице

### Требования к `/changelog`

- Открывается только для значимых релизов (разработчик включает вручную через `SHOW_CHANGELOG_ON_UPDATE = true` в service-worker.ts)
- Показывает что нового в текущей версии
- Версию можно читать из `manifest.json` (поле `version`)

### Роутинг

Все 20 локалей должны возвращать страницу (не 404). Если страница не переведена — отдавать английскую версию.

Пример структуры:
```
/en/welcome
/ru/welcome
/de/welcome
... (все 20 локалей)

/en/changelog
/ru/changelog
...
```

## Управление changelog в расширении

Файл: `src/background/service-worker.ts`

```typescript
// Менять вручную перед значимым релизом
const SHOW_CHANGELOG_ON_UPDATE = false; // → true для крупных обновлений
```
