import * as XLSX from 'xlsx'
import type { Dish, DishCategory, Ingredient, RecipeItem, Unit } from '../api/types'
import { apiPaceMs, retryOnRateLimitBulk } from './apiRetry'

async function pacedApi<T>(fn: () => Promise<T>): Promise<T> {
  await apiPaceMs(90)
  return retryOnRateLimitBulk(fn)
}

/** Подсказка для импорта (тот же формат, что экспорт / extra_virgin_menu_…) */
export const MENU_INGREDIENTS_IMPORT_HINT = `Импорт .xlsx — тот же формат, что и кнопка «Экспорт Excel»:

• Строка 1 — заголовки (как в экспорте): Menu item | Menu price (RUB) | Ingredient | Quantity | Unit(G/ML/PCS) | Category | Note | Price note

• Каждая следующая строка — одна позиция рецепта; название блюда, цена и категория повторяются на каждой строке одного блюда.

• Unit: G, ML или PCS.

• Можно загрузить в пустое меню: создаются категории и блюда, рецепт перезаписывается из файла.

• Если ингредиента с таким названием ещё нет — он будет создан (остаток 0, мин. остаток 0) с указанной единицей.

• Название блюда в ресторане должно быть уникальным; при конфликте имя будет дополнено названием категории в скобках.

• Столбцы Note и Price note при импорте не используются (можно оставить пустыми).`

export type MenuImportRecipeLine = {
  ingredientName: string
  qty: number
  unit: Unit
}

export type MenuImportDishGroup = {
  dishName: string
  price: number
  categoryName: string
  lines: MenuImportRecipeLine[]
}

function nfcLower(s: string): string {
  return s.normalize('NFC').trim().toLowerCase()
}

function cellStr(v: unknown): string {
  if (v == null) return ''
  if (typeof v === 'number' && Number.isFinite(v)) return String(v)
  return String(v).replace(/\uFEFF/g, '').trim()
}

function parseNumber(v: unknown): number | null {
  const s = cellStr(v).replace(/\s/g, '').replace(',', '.')
  if (!s) return null
  const x = parseFloat(s)
  return Number.isFinite(x) ? x : null
}

function parseUnit(raw: unknown): Unit | null {
  const u = cellStr(raw).toUpperCase().replace(/\s/g, '')
  if (u === 'G' || u === 'GRAM' || u === 'GRAMS') return 'G'
  if (u === 'ML' || u === 'MILLILITER' || u === 'MILLILITERS') return 'ML'
  if (u === 'PCS' || u === 'PC' || u === 'PIECE' || u === 'PIECES' || u === 'ШТ') return 'PCS'
  return null
}

function findCol(headers: string[], pred: (norm: string) => boolean): number {
  for (let i = 0; i < headers.length; i++) {
    const norm = nfcLower(headers[i] || '')
    if (pred(norm)) return i
  }
  return -1
}

export function parseMenuIngredientsImportBuffer(buf: ArrayBuffer): {
  groups: MenuImportDishGroup[]
  warnings: string[]
  errors: string[]
} {
  const warnings: string[] = []
  const errors: string[] = []

  let workbook: XLSX.WorkBook
  try {
    workbook = XLSX.read(buf, { type: 'array' })
  } catch {
    errors.push('Не удалось прочитать файл как Excel (.xlsx).')
    return { groups: [], warnings, errors }
  }

  const sheetName = workbook.SheetNames[0]
  const sheet = workbook.Sheets[sheetName]
  if (!sheet) {
    errors.push('В книге нет листов.')
    return { groups: [], warnings, errors }
  }

  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: '',
    raw: false,
  }) as unknown[][]

  if (!matrix.length) {
    errors.push('Лист пустой.')
    return { groups: [], warnings, errors }
  }

  const headerRow = (matrix[0] || []).map((c) => cellStr(c))
  const ixMenu = findCol(headerRow, (h) => h.includes('menu item') || h.includes('блюд') || h.includes('наименование блюда'))
  const ixPrice = findCol(
    headerRow,
    (h) => h.includes('menu price') || (h.includes('price') && (h.includes('rub') || h.includes('₽'))) || h === 'цена'
  )
  const ixIng = findCol(headerRow, (h) => h === 'ingredient' || h.includes('ингредиент'))
  const ixQty = findCol(headerRow, (h) => h === 'quantity' || h.includes('количеств'))
  const ixUnit = findCol(headerRow, (h) => h.includes('unit') || h.includes('ед'))
  const ixCat = findCol(headerRow, (h) => h === 'category' || h.includes('категор'))

  if (ixMenu < 0 || ixPrice < 0 || ixCat < 0) {
    errors.push(
      'Не найдены обязательные колонки. Нужны заголовки вроде: Menu item, Menu price (RUB), Category (и при рецепте — Ingredient, Quantity, Unit).'
    )
    return { groups: [], warnings, errors }
  }
  if (ixIng < 0 || ixQty < 0 || ixUnit < 0) {
    warnings.push('Не найдены колонки Ingredient / Quantity / Unit — блюда без строк рецепта всё равно можно создать.')
  }

  type Acc = {
    dishName: string
    price: number
    categoryName: string
    lines: MenuImportRecipeLine[]
  }

  const map = new Map<string, Acc>()

  for (let r = 1; r < matrix.length; r++) {
    const row = matrix[r] || []
    const dishName = cellStr(row[ixMenu])
    const categoryName = cellStr(row[ixCat])
    const price = parseNumber(row[ixPrice])

    if (!dishName && !categoryName && price == null) continue

    if (!dishName) {
      warnings.push(`Строка ${r + 1}: пропущена (нет названия блюда).`)
      continue
    }
    if (price == null || price < 0) {
      warnings.push(`Строка ${r + 1} («${dishName}»): пропущена — неверная цена.`)
      continue
    }

    const catLabel = categoryName || 'Прочее'
    const key = `${nfcLower(catLabel)}|||${nfcLower(dishName)}|||${price}`

    if (!map.has(key)) {
      map.set(key, { dishName, price, categoryName: catLabel, lines: [] })
    }
    const acc = map.get(key)!

    if (ixIng >= 0 && ixQty >= 0 && ixUnit >= 0) {
      const ingName = cellStr(row[ixIng])
      if (!ingName) continue

      const qty = parseNumber(row[ixQty])
      if (qty == null || qty <= 0) {
        warnings.push(`Строка ${r + 1} («${dishName}», «${ingName}»): пропущена строка рецепта — неверное количество.`)
        continue
      }
      const unit = parseUnit(row[ixUnit])
      if (!unit) {
        warnings.push(`Строка ${r + 1} («${dishName}», «${ingName}»): пропущена — неизвестная единица «${cellStr(row[ixUnit])}».`)
        continue
      }

      const canonIng = nfcLower(ingName)
      const existing = acc.lines.find((l) => nfcLower(l.ingredientName) === canonIng)
      if (existing) {
        existing.qty += qty
      } else {
        acc.lines.push({ ingredientName: ingName, qty, unit })
      }
    }
  }

  const groups = [...map.values()]
  if (groups.length === 0) {
    errors.push('В файле нет ни одной строки с данными для импорта (проверьте заголовки и данные).')
  }

  return { groups, warnings, errors }
}

export type MenuImportApi = {
  getCategories: () => Promise<DishCategory[]>
  createCategory: (name: string) => Promise<DishCategory>
  getDishesByCategory: (id: number) => Promise<Dish[]>
  createDish: (data: Partial<Dish>) => Promise<Dish>
  updateDish: (id: number, data: Partial<Dish>) => Promise<Dish>
  getIngredients: () => Promise<Ingredient[]>
  createIngredient: (data: Partial<Ingredient>) => Promise<Ingredient>
  updateRecipe: (dishId: number, recipe: RecipeItem[]) => Promise<void>
}

export async function executeMenuIngredientsImport(
  groups: MenuImportDishGroup[],
  api: MenuImportApi
): Promise<{
  categoriesCreated: number
  dishesCreated: number
  dishesPriceUpdated: number
  ingredientsCreated: number
  extraWarnings: string[]
}> {
  const extraWarnings: string[] = []
  let categoriesCreated = 0
  let dishesCreated = 0
  let dishesPriceUpdated = 0
  let ingredientsCreated = 0

  const ingredients = await pacedApi(() => api.getIngredients())
  const ingByCanon = new Map<string, Ingredient>()
  for (const ing of ingredients) {
    ingByCanon.set(nfcLower(ing.name), ing)
  }

  const categories = await pacedApi(() => api.getCategories())
  const catByCanon = new Map<string, DishCategory>()
  for (const c of categories) {
    catByCanon.set(nfcLower(c.name), c)
  }

  async function tryCreateDish(name: string, price: number, categoryId: number, categoryDisplay: string): Promise<Dish> {
    const trimmedBase = name.trim().slice(0, 200)
    const shortCat = categoryDisplay.trim().slice(0, 60)
    const candidates = [
      trimmedBase,
      `${trimmedBase} (${shortCat})`.slice(0, 240),
      `${trimmedBase} — ${shortCat}`.slice(0, 240),
    ]
    let lastErr: unknown
    for (const nm of candidates) {
      if (!nm.trim()) continue
      try {
        return await pacedApi(() =>
          api.createDish({
            name: nm.trim(),
            price,
            isActive: true,
            categoryId,
          })
        )
      } catch (e) {
        lastErr = e
        const msg =
          e && typeof e === 'object' && 'response' in e
            ? String((e as { response?: { data?: { message?: string } } }).response?.data?.message || '')
            : ''
        const m = msg.toLowerCase()
        if (m.includes('already') || m.includes('exist') || m.includes('уже')) continue
        throw e
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error('Не удалось создать блюдо')
  }

  for (const g of groups) {
    const catLabel = (g.categoryName || 'Прочее').trim() || 'Прочее'
    const cKey = nfcLower(catLabel)
    let cat = catByCanon.get(cKey)
    if (!cat) {
      cat = await pacedApi(() => api.createCategory(catLabel.slice(0, 200)))
      categoriesCreated++
      catByCanon.set(nfcLower(cat.name), cat)
    }

    const inCat = await pacedApi(() => api.getDishesByCategory(cat.id))
    const dKey = nfcLower(g.dishName.trim())
    let dish = inCat.find((d) => nfcLower(d.name) === dKey)
    if (!dish) {
      dish = await tryCreateDish(g.dishName.trim(), g.price, cat.id, catLabel)
      dishesCreated++
    }
    if (!dish) {
      throw new Error(`Не удалось создать или найти блюдо: ${g.dishName}`)
    }
    if (Math.abs(Number(dish.price) - Number(g.price)) > 1e-6) {
      await pacedApi(() =>
        api.updateDish(dish.id, {
          name: dish.name,
          price: g.price,
          isActive: dish.isActive,
          categoryId: dish.categoryId ?? cat.id,
        })
      )
      dishesPriceUpdated++
    }

    const recipe: RecipeItem[] = []
    for (const line of g.lines) {
      const nm = line.ingredientName.trim()
      if (!nm) continue
      const ik = nfcLower(nm)
      let ing = ingByCanon.get(ik)
      if (!ing) {
        ing = await pacedApi(() =>
          api.createIngredient({
            name: nm.slice(0, 500),
            unit: line.unit,
            stockQty: 0,
            minQty: 0,
          })
        )
        ingredientsCreated++
        ingByCanon.set(nfcLower(ing.name), ing)
      }
      if (ing.unit !== line.unit) {
        extraWarnings.push(
          `«${g.dishName}»: «${nm}» в справочнике ${ing.unit}, в файле ${line.unit} — в рецепт записано количество из файла, единица справочника ${ing.unit}.`
        )
      }
      recipe.push({
        ingredientId: ing.id,
        ingredientName: ing.name,
        qtyPerDish: line.qty,
        unit: ing.unit,
      })
    }

    await pacedApi(() => api.updateRecipe(dish.id, recipe))
  }

  return {
    categoriesCreated,
    dishesCreated,
    dishesPriceUpdated,
    ingredientsCreated,
    extraWarnings,
  }
}
