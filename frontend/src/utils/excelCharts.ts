/**
 * Excel export with styled tables and embedded bar-chart images.
 * Uses ExcelJS for rich formatting + Canvas API for chart rendering.
 */
import ExcelJS from 'exceljs'
import { saveAs } from 'file-saver'

// ─── Colour palette ───
const HEADER_BG = '2B3A67'
const HEADER_FG = 'FFFFFF'
const ALT_ROW   = 'F0F4FF'
const BORDER_CLR = 'D0D5DD'
const GREEN = '10B981'
const BLUE  = '3B82F6'
const ORANGE = 'F59E0B'
const RED   = 'EF4444'
const PURPLE = '8B5CF6'
const INDIGO = '6366F1'
const TEAL = '14B8A6'

const PALETTE = [GREEN, BLUE, ORANGE, PURPLE, INDIGO, TEAL, RED, '#EC4899']

// ─── Types ───
export interface KpiItem { label: string; value: string | number; color?: string }
export interface ChartData { [label: string]: number }

// ─── Helper: create workbook ───
export function createWorkbook(): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Booking Analytics'
  wb.created = new Date()
  return wb
}

// ─── Helper: save workbook ───
export async function saveWorkbook(wb: ExcelJS.Workbook, filename: string) {
  const buf = await wb.xlsx.writeBuffer()
  saveAs(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), filename)
}

// ─── Thin border style ───
function thinBorder(): Partial<ExcelJS.Borders> {
  const side: Partial<ExcelJS.Border> = { style: 'thin', color: { argb: BORDER_CLR } }
  return { top: side, bottom: side, left: side, right: side }
}

// ─── Style a header row ───
function styleHeader(row: ExcelJS.Row, colCount: number) {
  row.height = 28
  for (let c = 1; c <= colCount; c++) {
    const cell = row.getCell(c)
    cell.font = { bold: true, color: { argb: HEADER_FG }, size: 11 }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_BG } }
    cell.alignment = { vertical: 'middle', horizontal: c === 1 ? 'left' : 'center' }
    cell.border = thinBorder()
  }
}

// ─── Style a data row ───
function styleDataRow(row: ExcelJS.Row, colCount: number, isAlt: boolean) {
  row.height = 22
  for (let c = 1; c <= colCount; c++) {
    const cell = row.getCell(c)
    cell.font = { size: 10 }
    cell.alignment = { vertical: 'middle', horizontal: c === 1 ? 'left' : 'center' }
    cell.border = thinBorder()
    if (isAlt) {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ALT_ROW } }
    }
  }
}

// ═══════════════════════════════════════════════════════════
//  Render a horizontal bar chart on a Canvas → PNG base64
// ═══════════════════════════════════════════════════════════
function renderBarChartImage(
  data: ChartData,
  opts: { title?: string; color?: string; width?: number; valueFormatter?: (n: number) => string } = {},
): string | null {
  const entries = Object.entries(data)
  if (entries.length === 0) return null

  const W = opts.width ?? 620
  const barH = 28
  const gap = 6
  const labelW = 160
  const valueW = 90
  const chartL = labelW + 12
  const chartR = W - valueW - 8
  const barMaxW = chartR - chartL
  const topPad = opts.title ? 40 : 12
  const H = topPad + entries.length * (barH + gap) + 12

  const canvas = document.createElement('canvas')
  canvas.width = W * 2   // retina
  canvas.height = H * 2
  const ctx = canvas.getContext('2d')!
  ctx.scale(2, 2)

  // Background
  ctx.fillStyle = '#FFFFFF'
  ctx.fillRect(0, 0, W, H)

  // Title
  if (opts.title) {
    ctx.font = 'bold 13px Inter, system-ui, sans-serif'
    ctx.fillStyle = '#1F2937'
    ctx.textBaseline = 'middle'
    ctx.fillText(opts.title, 12, 22)
  }

  const maxVal = Math.max(...entries.map(e => Math.abs(e[1])), 1)
  const baseColor = opts.color ?? BLUE
  const fmt = opts.valueFormatter ?? ((n: number) => n.toLocaleString('ru-RU'))

  entries.forEach(([label, value], i) => {
    const y = topPad + i * (barH + gap)

    // Label
    ctx.font = '10px Inter, system-ui, sans-serif'
    ctx.fillStyle = '#6B7280'
    ctx.textBaseline = 'middle'
    ctx.textAlign = 'right'
    const truncLabel = label.length > 22 ? label.slice(0, 20) + '…' : label
    ctx.fillText(truncLabel, labelW, y + barH / 2)

    // Bar
    const barW = Math.max(2, (Math.abs(value) / maxVal) * barMaxW)
    const gradient = ctx.createLinearGradient(chartL, y, chartL + barW, y)
    gradient.addColorStop(0, `#${baseColor}`)
    gradient.addColorStop(1, `#${baseColor}AA`)
    ctx.fillStyle = gradient
    roundRect(ctx, chartL, y + 3, barW, barH - 6, 4)

    // Value
    ctx.font = 'bold 10px Inter, system-ui, sans-serif'
    ctx.fillStyle = '#374151'
    ctx.textAlign = 'left'
    ctx.fillText(fmt(value), chartL + barW + 8, y + barH / 2)
  })

  return canvas.toDataURL('image/png')
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h - r)
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
  ctx.fill()
}

// ═══════════════════════════════════════════════════════════
//  Render a pie/donut chart on Canvas → PNG base64
// ═══════════════════════════════════════════════════════════
function renderPieChartImage(
  data: ChartData,
  opts: { title?: string; width?: number } = {},
): string | null {
  const entries = Object.entries(data)
  if (entries.length === 0) return null

  const W = opts.width ?? 420
  const H = 260
  const canvas = document.createElement('canvas')
  canvas.width = W * 2
  canvas.height = H * 2
  const ctx = canvas.getContext('2d')!
  ctx.scale(2, 2)

  ctx.fillStyle = '#FFFFFF'
  ctx.fillRect(0, 0, W, H)

  if (opts.title) {
    ctx.font = 'bold 13px Inter, system-ui, sans-serif'
    ctx.fillStyle = '#1F2937'
    ctx.textBaseline = 'top'
    ctx.textAlign = 'left'
    ctx.fillText(opts.title, 12, 10)
  }

  const total = entries.reduce((s, [, v]) => s + Math.abs(v), 0)
  if (total === 0) return null

  const cx = 120, cy = 145, radius = 85, innerR = 45
  let angle = -Math.PI / 2

  entries.forEach(([, value], i) => {
    const sliceAngle = (Math.abs(value) / total) * Math.PI * 2
    ctx.beginPath()
    ctx.moveTo(cx + innerR * Math.cos(angle), cy + innerR * Math.sin(angle))
    ctx.arc(cx, cy, radius, angle, angle + sliceAngle)
    ctx.arc(cx, cy, innerR, angle + sliceAngle, angle, true)
    ctx.closePath()
    ctx.fillStyle = `#${PALETTE[i % PALETTE.length]}`
    ctx.fill()
    angle += sliceAngle
  })

  // Legend
  const legX = 230, legY = 40
  entries.forEach(([label, value], i) => {
    const y = legY + i * 24
    ctx.fillStyle = `#${PALETTE[i % PALETTE.length]}`
    ctx.fillRect(legX, y, 14, 14)
    ctx.font = '10px Inter, system-ui, sans-serif'
    ctx.fillStyle = '#374151'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    const pct = ((value / total) * 100).toFixed(1)
    const truncLabel = label.length > 16 ? label.slice(0, 14) + '…' : label
    ctx.fillText(`${truncLabel} — ${pct}%`, legX + 20, y + 7)
  })

  return canvas.toDataURL('image/png')
}

// ═══════════════════════════════════════════════════════════
//  Public helpers to add sheets to a workbook
// ═══════════════════════════════════════════════════════════

/** Add a KPI summary sheet */
export function addKpiSheet(
  wb: ExcelJS.Workbook,
  name: string,
  kpis: KpiItem[],
) {
  const ws = wb.addWorksheet(name.substring(0, 31))
  ws.columns = [
    { width: 36 },
    { width: 24 },
  ]
  const hdr = ws.addRow(['Показатель', 'Значение'])
  styleHeader(hdr, 2)

  kpis.forEach((kpi, i) => {
    const row = ws.addRow([kpi.label, kpi.value])
    styleDataRow(row, 2, i % 2 === 1)
    row.getCell(2).font = { bold: true, size: 11, color: { argb: kpi.color === 'red' ? RED : kpi.color === 'blue' ? BLUE : kpi.color === 'orange' ? ORANGE : kpi.color === 'green' ? GREEN : '1F2937' } }
  })
  return ws
}

/** Add a chart sheet: image on top + data table below */
export async function addBarChartSheet(
  wb: ExcelJS.Workbook,
  name: string,
  data: ChartData,
  opts: { headerLabel?: string; headerValue?: string; color?: string; valueFormatter?: (n: number) => string; title?: string } = {},
) {
  const ws = wb.addWorksheet(name.substring(0, 31))

  // Render chart image
  const imgBase64 = renderBarChartImage(data, { title: opts.title ?? name, color: opts.color, valueFormatter: opts.valueFormatter })

  if (imgBase64) {
    const imageId = wb.addImage({ base64: imgBase64.split(',')[1], extension: 'png' })
    const entries = Object.entries(data)
    const imgRows = Math.max(8, Math.ceil((entries.length * 34 + 52) / 20))
    ws.addImage(imageId, {
      tl: { col: 0, row: 0 } as any,
      br: { col: 5, row: imgRows } as any,
    })
    for (let r = 0; r < imgRows; r++) ws.addRow([])
  }

  // Data table
  ws.columns = [
    { width: 30 },
    { width: 18 },
    { width: 10 },
  ]

  const entries = Object.entries(data)
  const maxVal = Math.max(...entries.map(e => Math.abs(e[1])), 1)
  const hdrLabel = opts.headerLabel ?? 'Категория'
  const hdrValue = opts.headerValue ?? 'Значение'

  ws.addRow([]) // spacer
  const hdr = ws.addRow([hdrLabel, hdrValue, '%'])
  styleHeader(hdr, 3)

  entries.forEach(([label, value], i) => {
    const pct = ((Math.abs(value) / maxVal) * 100).toFixed(1) + '%'
    const row = ws.addRow([label, value, pct])
    styleDataRow(row, 3, i % 2 === 1)
    // Colour the value cell
    row.getCell(2).font = { bold: true, size: 10, color: { argb: opts.color ?? BLUE } }
  })

  return ws
}

/** Add a pie chart sheet */
export async function addPieChartSheet(
  wb: ExcelJS.Workbook,
  name: string,
  data: ChartData,
  opts: { headerLabel?: string; headerValue?: string; title?: string } = {},
) {
  const ws = wb.addWorksheet(name.substring(0, 31))

  const imgBase64 = renderPieChartImage(data, { title: opts.title ?? name })

  if (imgBase64) {
    const imageId = wb.addImage({ base64: imgBase64.split(',')[1], extension: 'png' })
    ws.addImage(imageId, {
      tl: { col: 0, row: 0 } as any,
      br: { col: 5, row: 13 } as any,
    })
    for (let r = 0; r < 14; r++) ws.addRow([])
  }

  ws.columns = [
    { width: 28 },
    { width: 16 },
    { width: 12 },
  ]

  const entries = Object.entries(data)
  const total = entries.reduce((s, [, v]) => s + Math.abs(v), 0)

  ws.addRow([])
  const hdr = ws.addRow([opts.headerLabel ?? 'Категория', opts.headerValue ?? 'Значение', 'Доля %'])
  styleHeader(hdr, 3)

  entries.forEach(([label, value], i) => {
    const pct = total > 0 ? ((Math.abs(value) / total) * 100).toFixed(1) + '%' : '0%'
    const row = ws.addRow([label, value, pct])
    styleDataRow(row, 3, i % 2 === 1)
    row.getCell(1).font = { size: 10, color: { argb: PALETTE[i % PALETTE.length] } }
    row.getCell(2).font = { bold: true, size: 10 }
  })

  return ws
}

/** Add a styled data table sheet (for multi-column tables) */
export function addTableSheet(
  wb: ExcelJS.Workbook,
  name: string,
  headers: string[],
  rows: (string | number | null | undefined)[][],
  opts: { columnWidths?: number[] } = {},
) {
  const ws = wb.addWorksheet(name.substring(0, 31))

  const widths = opts.columnWidths ?? headers.map((h) => Math.max(h.length * 1.5 + 4, 14))
  ws.columns = widths.map(w => ({ width: w }))

  const hdr = ws.addRow(headers)
  styleHeader(hdr, headers.length)

  rows.forEach((rowData, i) => {
    const row = ws.addRow(rowData)
    styleDataRow(row, headers.length, i % 2 === 1)
  })

  return ws
}

/** Add a two-column KPI sheet with optional grouping */
export function addGroupedKpiSheet(
  wb: ExcelJS.Workbook,
  name: string,
  groups: { title: string; kpis: KpiItem[] }[],
) {
  const ws = wb.addWorksheet(name.substring(0, 31))
  ws.columns = [{ width: 40 }, { width: 28 }]

  for (const group of groups) {
    const titleRow = ws.addRow([group.title, ''])
    titleRow.height = 26
    titleRow.getCell(1).font = { bold: true, size: 12, color: { argb: '1F2937' } }
    titleRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'EEF2FF' } }
    titleRow.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'EEF2FF' } }

    group.kpis.forEach((kpi, i) => {
      const row = ws.addRow([kpi.label, kpi.value])
      styleDataRow(row, 2, i % 2 === 1)
      const colorMap: Record<string, string> = { red: RED, blue: BLUE, orange: ORANGE, green: GREEN, purple: PURPLE }
      row.getCell(2).font = { bold: true, size: 11, color: { argb: colorMap[kpi.color || ''] || '1F2937' } }
    })
    ws.addRow([])
  }
  return ws
}

/** Add a cohort matrix sheet */
export function addCohortSheet(
  wb: ExcelJS.Workbook,
  name: string,
  matrix: Record<string, (number | null)[]>,
  sizes: Record<string, number>,
  periodPrefix: string,
) {
  const ws = wb.addWorksheet(name.substring(0, 31))
  const numCols = Math.max(...Object.values(matrix).map(v => (Array.isArray(v) ? v.length : 0)), 0)

  const headers = ['Когорта', 'Размер', ...Array.from({ length: numCols }, (_, i) => `${periodPrefix}${i}`)]
  ws.columns = [{ width: 16 }, { width: 10 }, ...Array.from({ length: numCols }, () => ({ width: 10 }))]
  const hdr = ws.addRow(headers)
  styleHeader(hdr, headers.length)

  Object.entries(matrix).forEach(([period, vals], ri) => {
    const arr = Array.isArray(vals) ? vals : []
    const size = sizes[period] ?? 0
    const rowData: (string | number | null)[] = [period, size, ...Array.from({ length: numCols }, (_, i) => {
      const v = arr[i]
      return v != null ? Number(v.toFixed(1)) : null
    })]
    const row = ws.addRow(rowData)
    styleDataRow(row, headers.length, ri % 2 === 1)
  })
  return ws
}

/** Add a multi-section table sheet (for risks, recommendations, anomalies) */
export function addTextListSheet(
  wb: ExcelJS.Workbook,
  name: string,
  sections: { title: string; items: string[] }[],
) {
  const ws = wb.addWorksheet(name.substring(0, 31))
  ws.columns = [{ width: 8 }, { width: 80 }]

  for (const section of sections) {
    const titleRow = ws.addRow(['', section.title])
    titleRow.height = 24
    titleRow.getCell(2).font = { bold: true, size: 12, color: { argb: '1F2937' } }
    titleRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'EEF2FF' } }
    titleRow.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'EEF2FF' } }

    section.items.forEach((item, i) => {
      const row = ws.addRow([i + 1, item])
      styleDataRow(row, 2, i % 2 === 1)
      row.getCell(2).alignment = { wrapText: true, vertical: 'middle' }
    })
    ws.addRow([])
  }
  return ws
}

// Colour constants export for reuse
export const COLORS = { GREEN, BLUE, ORANGE, RED, PURPLE, INDIGO, TEAL }
