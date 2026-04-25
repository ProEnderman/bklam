import * as XLSX from 'xlsx'

export interface StoredClient {
  name: string
  phone: string
  /** Источник: 'booking' — из бронирований, 'import' — из Excel */
  source: 'booking' | 'import'
}

const LS_KEY = 'imported_clients'
const LS_HIDDEN_KEY = 'hidden_clients'
const LS_DELETED_KEY = 'deleted_clients'

/** Прочитать импортированных клиентов из localStorage */
export function getImportedClients(): StoredClient[] {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return []
    return JSON.parse(raw) as StoredClient[]
  } catch {
    return []
  }
}

/** Сохранить импортированных клиентов в localStorage */
export function saveImportedClients(clients: StoredClient[]): void {
  localStorage.setItem(LS_KEY, JSON.stringify(clients))
}

/** Добавить новых клиентов (без дубликатов по имени+телефон) */
export function addImportedClients(newClients: StoredClient[]): StoredClient[] {
  const existing = getImportedClients()
  const keys = new Set(existing.map(c => clientKey(c)))
  for (const c of newClients) {
    const k = clientKey(c)
    if (!keys.has(k)) {
      existing.push(c)
      keys.add(k)
    }
  }
  saveImportedClients(existing)
  return existing
}

/** Удалить импортированного клиента */
export function removeImportedClient(name: string, phone: string): StoredClient[] {
  const existing = getImportedClients().filter(
    c => !(c.name.toLowerCase() === name.toLowerCase() && c.phone.toLowerCase() === phone.toLowerCase())
  )
  saveImportedClients(existing)
  return existing
}

/** Очистить все импортированные данные */
export function clearImportedClients(): void {
  localStorage.removeItem(LS_KEY)
}

/* ===== Hidden (booking-derived) clients ===== */

/** Получить список скрытых клиентов (из бронирований) */
export function getHiddenClients(): Set<string> {
  try {
    const raw = localStorage.getItem(LS_HIDDEN_KEY)
    if (!raw) return new Set()
    return new Set(JSON.parse(raw) as string[])
  } catch {
    return new Set()
  }
}

/** Скрыть клиента из бронирований */
export function hideClient(name: string, phone: string): Set<string> {
  const hidden = getHiddenClients()
  hidden.add(clientKey({ name, phone }))
  localStorage.setItem(LS_HIDDEN_KEY, JSON.stringify([...hidden]))
  return hidden
}

/** Восстановить скрытого клиента */
export function unhideClient(name: string, phone: string): Set<string> {
  const hidden = getHiddenClients()
  hidden.delete(clientKey({ name, phone }))
  localStorage.setItem(LS_HIDDEN_KEY, JSON.stringify([...hidden]))
  return hidden
}

/** Проверить, скрыт ли клиент */
export function isClientHidden(name: string, phone: string): boolean {
  return getHiddenClients().has(clientKey({ name, phone }))
}

/** Очистить список скрытых клиентов */
export function clearHiddenClients(): void {
  localStorage.removeItem(LS_HIDDEN_KEY)
}

/* ===== Deleted (permanently removed) clients ===== */

/** Получить список удалённых клиентов */
export function getDeletedClients(): Set<string> {
  try {
    const raw = localStorage.getItem(LS_DELETED_KEY)
    if (!raw) return new Set()
    return new Set(JSON.parse(raw) as string[])
  } catch {
    return new Set()
  }
}

/** Навсегда удалить клиента (без возможности восстановления) */
export function deleteClient(name: string, phone: string): Set<string> {
  const deleted = getDeletedClients()
  deleted.add(clientKey({ name, phone }))
  localStorage.setItem(LS_DELETED_KEY, JSON.stringify([...deleted]))
  return deleted
}

/** Проверить, удалён ли клиент */
export function isClientDeleted(name: string, phone: string): boolean {
  return getDeletedClients().has(clientKey({ name, phone }))
}

function clientKey(c: { name: string; phone: string }): string {
  return `${(c.name || '').trim().toLowerCase()}|${(c.phone || '').trim().toLowerCase()}`
}

/**
 * Парсит Excel/CSV файл и возвращает список клиентов.
 * Ожидаемый формат: 1-й столбец — имя, 2-й столбец — телефон.
 * Первая строка может быть заголовком (автоматически определяется).
 *
 * Для CSV-файлов: пробует UTF-8, если встречает «?» вместо кириллицы —
 * перечитывает файл в кодировке Windows-1251.
 */
export function parseClientExcel(file: File): Promise<StoredClient[]> {
  const isCsv = /\.csv$/i.test(file.name)

  if (isCsv) {
    return parseCsvFile(file)
  }
  return parseXlsxFile(file)
}

/** Парсинг .xlsx / .xls через SheetJS */
function parseXlsxFile(file: File): Promise<StoredClient[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer)
        const workbook = XLSX.read(data, { type: 'array' })
        resolve(extractClients(workbook))
      } catch (err: any) {
        reject(new Error(`Ошибка чтения файла: ${err.message}`))
      }
    }
    reader.onerror = () => reject(new Error('Ошибка чтения файла'))
    reader.readAsArrayBuffer(file)
  })
}

/**
 * Парсинг CSV с автоопределением кодировки.
 * Пробуем UTF-8, если результат содержит «?» / «�» (типичный признак
 * неправильной кодировки для кириллицы) — перечитываем как Windows-1251.
 */
function parseCsvFile(file: File): Promise<StoredClient[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        let text = e.target?.result as string

        // Если в тексте есть «�» или подозрительно много «?», пробуем Windows-1251
        if (looksGarbled(text)) {
          // Перечитаем как Windows-1251
          const reader1251 = new FileReader()
          reader1251.onload = (e2) => {
            try {
              const text1251 = e2.target?.result as string
              resolve(parseCsvText(text1251))
            } catch (err: any) {
              reject(new Error(`Ошибка чтения CSV: ${err.message}`))
            }
          }
          reader1251.onerror = () => reject(new Error('Ошибка чтения файла'))
          // Читаем как текст в кодировке windows-1251
          reader1251.readAsText(file, 'windows-1251')
          return
        }

        resolve(parseCsvText(text))
      } catch (err: any) {
        reject(new Error(`Ошибка чтения CSV: ${err.message}`))
      }
    }
    reader.onerror = () => reject(new Error('Ошибка чтения файла'))
    // Сначала пробуем UTF-8
    reader.readAsText(file, 'utf-8')
  })
}

/** Проверяет, выглядит ли текст «битым» (неправильная кодировка) */
function looksGarbled(text: string): boolean {
  // Замена символ «�» — явный признак
  if (text.includes('\uFFFD')) return true
  // Много «?» подряд или в начале строк — тоже подозрительно
  const lines = text.split('\n').filter(l => l.trim())
  if (lines.length === 0) return false
  // Проверяем первые 5 строк: если >50% символов это '?' — считаем битым
  const sample = lines.slice(0, 5).join('')
  const questionMarks = (sample.match(/\?/g) || []).length
  return questionMarks > sample.length * 0.2
}

/** Парсит CSV-текст в массив клиентов */
function parseCsvText(text: string): StoredClient[] {
  const lines = text.split(/\r?\n/).filter(l => l.trim())
  if (lines.length === 0) throw new Error('Файл пуст')

  // Определяем разделитель: ; или , или \t
  const firstLine = lines[0]
  let separator = ','
  if (firstLine.includes(';')) separator = ';'
  else if (firstLine.includes('\t')) separator = '\t'

  const rows = lines.map(line => line.split(separator).map(cell => cell.trim().replace(/^["']|["']$/g, '')))

  // Определяем, является ли первая строка заголовком
  const isHeader = rows[0].length >= 2 && isLikelyHeader(rows[0][0], rows[0][1])
  const startIdx = isHeader ? 1 : 0

  const clients: StoredClient[] = []
  for (let i = startIdx; i < rows.length; i++) {
    const row = rows[i]
    const name = (row[0] || '').trim()
    const phone = normalizePhone((row[1] || '').trim())
    if (name || phone) {
      clients.push({ name, phone, source: 'import' })
    }
  }

  if (clients.length === 0) throw new Error('Не найдено ни одного клиента в файле')
  return clients
}

/** Извлекает клиентов из XLSX workbook */
function extractClients(workbook: XLSX.WorkBook): StoredClient[] {
  const sheetName = workbook.SheetNames[0]
  if (!sheetName) throw new Error('Файл не содержит листов')

  const sheet = workbook.Sheets[sheetName]
  const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' })

  if (rows.length === 0) throw new Error('Файл пуст')

  const firstRow = rows[0]
  const isHeader = firstRow.length >= 2 && isLikelyHeader(String(firstRow[0]), String(firstRow[1]))
  const startIdx = isHeader ? 1 : 0

  const clients: StoredClient[] = []
  for (let i = startIdx; i < rows.length; i++) {
    const row = rows[i]
    const name = String(row[0] || '').trim()
    const phone = normalizePhone(String(row[1] || '').trim())
    if (name || phone) {
      clients.push({ name, phone, source: 'import' })
    }
  }

  if (clients.length === 0) throw new Error('Не найдено ни одного клиента в файле')
  return clients
}

/** Проверяет, похожи ли значения на заголовок */
function isLikelyHeader(col1: string, col2: string): boolean {
  const headerWords = [
    'имя', 'name', 'фамилия', 'клиент', 'customer', 'client', 'фио',
    'телефон', 'phone', 'номер', 'тел', 'мобильный', 'mobile', 'контакт',
  ]
  const c1 = col1.toLowerCase()
  const c2 = col2.toLowerCase()
  return headerWords.some(w => c1.includes(w) || c2.includes(w))
}

/** Нормализация телефона — оставляем как есть, но добавляем +7 если начинается с 8 */
function normalizePhone(phone: string): string {
  if (!phone) return ''
  // Если это чисто число (например, Excel может хранить как число)
  const digits = phone.replace(/\D/g, '')
  if (digits.length === 11 && digits.startsWith('8')) {
    return '+7' + digits.slice(1)
  }
  if (digits.length === 11 && digits.startsWith('7')) {
    return '+' + digits
  }
  if (digits.length === 10) {
    return '+7' + digits
  }
  return phone
}
