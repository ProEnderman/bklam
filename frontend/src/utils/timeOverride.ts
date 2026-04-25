/**
 * Глобальный механизм подмены времени для тестирования.
 *
 * Хранит смещение (offset) в миллисекундах.
 * Подменяет глобальный Date, чтобы ВСЕ `new Date()` и `Date.now()` возвращали
 * «виртуальное» время = реальное + offset.
 *
 * Сохраняется в localStorage, поэтому переживает обновления страницы.
 */

const STORAGE_KEY = 'app_time_offset_ms'

// Сохраняем оригинальный Date до патча
const _OriginalDate = globalThis.Date

let _offsetMs = 0

/** Инициализация — читаем offset из localStorage и патчим Date */
export function initTimeOverride() {
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored) {
    _offsetMs = parseInt(stored, 10) || 0
  }
  patchDate()
}

/** Установить конкретное «текущее» время. Offset = target - realNow */
export function setOverrideTime(target: Date) {
  _offsetMs = target.getTime() - _OriginalDate.now()
  localStorage.setItem(STORAGE_KEY, String(_offsetMs))
  patchDate()
}

/** Сбросить к реальному времени */
export function resetOverrideTime() {
  _offsetMs = 0
  localStorage.removeItem(STORAGE_KEY)
  patchDate()
}

/** Текущий offset в ms */
export function getOffsetMs(): number {
  return _offsetMs
}

/** Проверка: включена ли подмена? */
export function isTimeOverridden(): boolean {
  return _offsetMs !== 0
}

/** Получить «виртуальное» текущее время как Date */
export function appNow(): Date {
  return new _OriginalDate(_OriginalDate.now() + _offsetMs)
}

/** Реальное текущее время (без подмены) */
export function realNow(): Date {
  return new _OriginalDate()
}

// ========== Date monkey-patch ==========

function patchDate() {
  const offset = _offsetMs

  // Создаём подкласс, чтобы new Date() / Date.now() учитывали offset
  const PatchedDate = function (this: any, ...args: any[]) {
    if (!(this instanceof PatchedDate)) {
      // Вызов без new — Date() возвращает строку
      return new _OriginalDate(_OriginalDate.now() + offset).toString()
    }
    if (args.length === 0) {
      return new _OriginalDate(_OriginalDate.now() + offset)
    }
    // @ts-ignore — пробрасываем аргументы как есть
    return new _OriginalDate(...args)
  } as any

  // Статические методы
  PatchedDate.now = () => _OriginalDate.now() + offset
  PatchedDate.parse = _OriginalDate.parse
  PatchedDate.UTC = _OriginalDate.UTC

  // Прототип
  PatchedDate.prototype = _OriginalDate.prototype
  PatchedDate.prototype.constructor = PatchedDate

  // Подменяем глобальный Date
  ;(globalThis as any).Date = PatchedDate
}

// Экспортируем оригинальный Date на случай, если где-то нужен реальный
export const OriginalDate = _OriginalDate
