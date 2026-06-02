import * as XLSX from 'xlsx'
import { saveAs } from 'file-saver'
import type { Dish, RecipeItem } from '../api/types'

/** Текст для ExcelHoverHint: как устроен экспортируемый файл и ожидаемая структура при ручной работе */
export const MENU_INGREDIENTS_EXPORT_HINT = `Экспорт .xlsx в том же виде, что и шаблон меню с ингредиентами и ценами:

• Строка 1 — заголовки: Menu item | Menu price (RUB) | Ingredient | Quantity | Unit(G/ML/PCS) | Category | Note | Price note

• Далее: одна строка на каждую строку рецепта блюда. Название блюда, цена (₽) и категория повторяются для каждого ингредиента.

• Unit — буквы G, ML или PCS (как в справочнике ингредиентов).

• Если у блюда нет рецепта — одна строка с пустыми полями ингредиента; столбцы Note и Price note при экспорте пустые (их можно заполнить в Excel).

• Тот же файл можно загрузить обратно кнопкой «Импорт Excel» (раздел меню, права администратора).`

const HEADER: string[] = [
  'Menu item',
  'Menu price (RUB)',
  'Ingredient',
  'Quantity',
  'Unit(G/ML/PCS)',
  'Category',
  'Note',
  'Price note',
]

export type MenuIngredientExportEntry = {
  dish: Dish
  categoryName: string
  recipe: RecipeItem[]
}

export function buildMenuIngredientRows(entries: MenuIngredientExportEntry[]): (string | number)[][] {
  const rows: (string | number)[][] = []
  for (const { dish, categoryName, recipe } of entries) {
    if (!recipe?.length) {
      rows.push([dish.name, dish.price, '', '', '', categoryName, '', ''])
      continue
    }
    for (const r of recipe) {
      rows.push([
        dish.name,
        dish.price,
        r.ingredientName,
        r.qtyPerDish,
        r.unit,
        categoryName,
        '',
        '',
      ])
    }
  }
  return rows
}

export function downloadMenuIngredientsXlsx(dataRows: (string | number)[][], filename: string) {
  const ws = XLSX.utils.aoa_to_sheet([HEADER, ...dataRows])
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Menu')
  const raw = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
  const bytes = raw instanceof Uint8Array ? raw : new Uint8Array(raw as ArrayLike<number>)
  saveAs(
    new Blob([bytes as unknown as BlobPart], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
    filename
  )
}

export function sanitizeMenuExportBasename(name: string): string {
  const t = name.replace(/[/\\?%*:|"<>]/g, '-').trim()
  return t.length > 0 ? t.slice(0, 80) : 'menu'
}
