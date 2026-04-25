/**
 * Spatial index for fast O(1) lookup of items by cell coordinates.
 * 
 * This replaces O(n) scans over all items for hit-testing and collision checks.
 * 
 * Structure: Map<"x,y", Set<itemId>>
 * - Each cell can contain multiple items (if items overlap)
 * - Items are indexed by all cells they occupy
 */
import type { HallPlacedItem } from '../api/types'

export class SpatialIndex {
  private grid: Map<string, Set<number>> = new Map()
  private itemsById: Map<number, HallPlacedItem> = new Map()

  /**
   * Build index from scratch (used when items array changes)
   */
  build(items: HallPlacedItem[]): void {
    const start = performance.now()
    this.grid.clear()
    this.itemsById.clear()

    for (const item of items) {
      this.itemsById.set(item.id, item)
      this.indexAddRect(item)
    }

    const elapsed = performance.now() - start
    if (elapsed > 1) {
      console.warn(`[SpatialIndex] build took ${elapsed.toFixed(2)}ms for ${items.length} items`)
    }
  }

  /**
   * Add item to index (incremental update)
   */
  add(item: HallPlacedItem): void {
    this.itemsById.set(item.id, item)
    this.indexAddRect(item)
  }

  /**
   * Remove item from index (incremental update)
   */
  remove(itemId: number): void {
    const item = this.itemsById.get(itemId)
    if (item) {
      this.indexRemoveRect(item)
      this.itemsById.delete(itemId)
    }
  }

  /**
   * Update item in index (incremental update)
   */
  update(prevItem: HallPlacedItem, nextItem: HallPlacedItem): void {
    // Remove old position
    this.indexRemoveRect(prevItem)
    // Add new position
    this.itemsById.set(nextItem.id, nextItem)
    this.indexAddRect(nextItem)
  }

  /**
   * Get item at specific cell (hit-test)
   * Returns first item found (by layer/zIndex, then by id for stability)
   */
  getItemAt(x: number, y: number): HallPlacedItem | null {
    const key = `${x},${y}`
    const itemIds = this.grid.get(key)
    if (!itemIds || itemIds.size === 0) return null

    // Return item with highest layer (zIndex), then lowest id for stability
    let best: HallPlacedItem | null = null
    for (const id of itemIds) {
      const item = this.itemsById.get(id)
      if (!item) continue
      if (!best) {
        best = item
        continue
      }
      const itemLayer = item.layer ?? 0
      const bestLayer = best.layer ?? 0
      if (itemLayer > bestLayer || (itemLayer === bestLayer && item.id < best.id)) {
        best = item
      }
    }
    return best
  }

  /**
   * Get all items intersecting a rectangle
   */
  getItemsInRect(x: number, y: number, w: number, h: number): HallPlacedItem[] {
    const found = new Set<number>()
    for (let cy = y; cy < y + h; cy++) {
      for (let cx = x; cx < x + w; cx++) {
        const key = `${cx},${cy}`
        const itemIds = this.grid.get(key)
        if (itemIds) {
          itemIds.forEach((id) => found.add(id))
        }
      }
    }
    return Array.from(found)
      .map((id) => this.itemsById.get(id))
      .filter((item): item is HallPlacedItem => item !== undefined)
  }

  /**
   * Check if any table (with halo) intersects the given rectangle
   * Used for "too close to any table" checks
   * @param excludeId - Optional item ID to exclude from check (e.g., the table being rotated)
   */
  hasTableInHalo(x: number, y: number, w: number, h: number, excludeId?: number): boolean {
    // Expand search area by 1 cell in all directions (halo)
    const searchX = x - 1
    const searchY = y - 1
    const searchW = w + 2
    const searchH = h + 2

    for (let cy = searchY; cy < searchY + searchH; cy++) {
      for (let cx = searchX; cx < searchX + searchW; cx++) {
        const key = `${cx},${cy}`
        const itemIds = this.grid.get(key)
        if (itemIds) {
          for (const id of itemIds) {
            // Exclude the specified item (e.g., the table being rotated)
            if (excludeId && id === excludeId) continue
            
            const item = this.itemsById.get(id)
            if (item && item.type === 'TABLE') {
              // Check if the table's halo (expanded by 1) intersects the candidate rect
              const tableLeft = item.x - 1
              const tableTop = item.y - 1
              const tableRight = item.x + item.w + 1
              const tableBottom = item.y + item.h + 1
              const noOverlap =
                x + w <= tableLeft ||
                tableRight <= x ||
                y + h <= tableTop ||
                tableBottom <= y
              if (!noOverlap) {
                return true
              }
            }
          }
        }
      }
    }
    return false
  }

  /**
   * Check if a cell is too close to any table (halo check)
   */
  isCellTooCloseToAnyTable(x: number, y: number): boolean {
    // Check 3x3 area around the cell (cell itself + 1 cell halo)
    for (let cy = y - 1; cy <= y + 1; cy++) {
      for (let cx = x - 1; cx <= x + 1; cx++) {
        const key = `${cx},${cy}`
        const itemIds = this.grid.get(key)
        if (itemIds) {
          for (const id of itemIds) {
            const item = this.itemsById.get(id)
            if (item && item.type === 'TABLE') {
              const tableLeft = item.x - 1
              const tableTop = item.y - 1
              const tableRight = item.x + item.w + 1
              const tableBottom = item.y + item.h + 1
              if (x >= tableLeft && x < tableRight && y >= tableTop && y < tableBottom) {
                return true
              }
            }
          }
        }
      }
    }
    return false
  }

  /**
   * Check if rectangle collides with any existing item
   */
  hasCollision(x: number, y: number, w: number, h: number, excludeId?: number): boolean {
    const items = this.getItemsInRect(x, y, w, h)
    return items.some((item) => {
      if (excludeId && item.id === excludeId) return false
      // AABB collision check
      const noOverlap =
        x + w <= item.x ||
        item.x + item.w <= x ||
        y + h <= item.y ||
        item.y + item.h <= y
      return !noOverlap
    })
  }

  /**
   * Check if rectangle is too close to any existing TABLE (distance <= 1 cell)
   * Distance is measured between the edges of rectangles
   * For decor items, this check is not applied (they can be placed adjacent)
   * @param excludeId - Optional item ID to exclude from check (e.g., the item being moved)
   */
  isTooCloseToAnyTable(x: number, y: number, w: number, h: number, excludeId?: number): boolean {
    // Expand search area by 1 cell in all directions to check for items within 1 cell distance
    const searchX = x - 1
    const searchY = y - 1
    const searchW = w + 2
    const searchH = h + 2

    for (let cy = searchY; cy < searchY + searchH; cy++) {
      for (let cx = searchX; cx < searchX + searchW; cx++) {
        const key = `${cx},${cy}`
        const itemIds = this.grid.get(key)
        if (itemIds) {
          for (const id of itemIds) {
            // Exclude the specified item (e.g., the item being moved)
            if (excludeId && id === excludeId) continue
            
            const item = this.itemsById.get(id)
            // Проверяем только столы, элементы декора могут быть вплотную
            if (item && item.type === 'TABLE') {
              // Calculate distance between rectangles
              // Horizontal distance: how far apart are the rectangles horizontally?
              const horizontalDist = 
                x + w <= item.x ? item.x - (x + w) : // candidate is to the left, item is to the right
                item.x + item.w <= x ? x - (item.x + item.w) : // candidate is to the right, item is to the left
                0 // overlapping or touching horizontally
              
              // Vertical distance: how far apart are the rectangles vertically?
              const verticalDist = 
                y + h <= item.y ? item.y - (y + h) : // candidate is above, item is below
                item.y + item.h <= y ? y - (item.y + item.h) : // candidate is below, item is above
                0 // overlapping or touching vertically
              
              // If items overlap (both distances are 0), they are too close
              if (horizontalDist === 0 && verticalDist === 0) {
                return true
              }
              
              // If items are touching or overlapping on one axis, check the other axis
              // If they're touching on one axis (distance = 0) and close on the other (distance <= 1), they're too close
              if (horizontalDist === 0 && verticalDist <= 1) {
                return true
              }
              if (verticalDist === 0 && horizontalDist <= 1) {
                return true
              }
              
              // If both distances are positive, calculate the minimum distance
              // For diagonal placement, we use the minimum of horizontal and vertical distances
              // If minimum distance is <= 1, items are too close
              if (horizontalDist > 0 && verticalDist > 0) {
                const minDist = Math.min(horizontalDist, verticalDist)
                if (minDist <= 1) {
                  return true
                }
              }
            }
          }
        }
      }
    }
    return false
  }

  /**
   * Check if rectangle collides with any existing item (overlapping)
   * This is used for decor items - they can be adjacent but not overlapping
   * @param excludeId - Optional item ID to exclude from check (e.g., the item being moved)
   */
  hasCollisionWithAnyItem(x: number, y: number, w: number, h: number, excludeId?: number): boolean {
    return this.hasCollision(x, y, w, h, excludeId)
  }

  /**
   * Check if rectangle is too close to ANY existing item (distance < 1 cell)
   * Used for tables - they must have at least 1 cell gap from ALL items (including decor/walls)
   * @param excludeId - Optional item ID to exclude from check (e.g., the item being moved)
   */
  isTooCloseToAnyItem(x: number, y: number, w: number, h: number, excludeId?: number): boolean {
    // Expand search area by 1 cell in all directions to check for items within 1 cell distance
    const searchX = x - 1
    const searchY = y - 1
    const searchW = w + 2
    const searchH = h + 2

    for (let cy = searchY; cy < searchY + searchH; cy++) {
      for (let cx = searchX; cx < searchX + searchW; cx++) {
        const key = `${cx},${cy}`
        const itemIds = this.grid.get(key)
        if (itemIds) {
          for (const id of itemIds) {
            // Exclude the specified item (e.g., the item being moved)
            if (excludeId && id === excludeId) continue
            
            const item = this.itemsById.get(id)
            // Проверяем ВСЕ элементы (столы, декор, стены)
            if (item) {
              // Calculate distance between rectangles
              const horizontalDist = 
                x + w <= item.x ? item.x - (x + w) :
                item.x + item.w <= x ? x - (item.x + item.w) :
                0
              
              const verticalDist = 
                y + h <= item.y ? item.y - (y + h) :
                item.y + item.h <= y ? y - (item.y + item.h) :
                0
              
              // If items overlap (both distances are 0), they are too close
              if (horizontalDist === 0 && verticalDist === 0) {
                return true
              }
              
              // If touching on one axis and close on the other
              if (horizontalDist === 0 && verticalDist < 1) {
                return true
              }
              if (verticalDist === 0 && horizontalDist < 1) {
                return true
              }
            }
          }
        }
      }
    }
    return false
  }

  /**
   * Check if rectangle has any item within halo (1 cell around)
   * Used for tables - they must have at least 1 cell gap from ALL items
   * @param excludeId - Optional item ID to exclude from check
   */
  hasAnyItemInHalo(x: number, y: number, w: number, h: number, excludeId?: number): boolean {
    // Expand search area by 1 cell in all directions (halo)
    const searchX = x - 1
    const searchY = y - 1
    const searchW = w + 2
    const searchH = h + 2

    for (let cy = searchY; cy < searchY + searchH; cy++) {
      for (let cx = searchX; cx < searchX + searchW; cx++) {
        const key = `${cx},${cy}`
        const itemIds = this.grid.get(key)
        if (itemIds) {
          for (const id of itemIds) {
            // Exclude the specified item
            if (excludeId && id === excludeId) continue
            
            const item = this.itemsById.get(id)
            if (item) {
              // Check if the item's halo (expanded by 1) intersects the candidate rect
              const itemLeft = item.x - 1
              const itemTop = item.y - 1
              const itemRight = item.x + item.w + 1
              const itemBottom = item.y + item.h + 1
              const noOverlap =
                x + w <= itemLeft ||
                itemRight <= x ||
                y + h <= itemTop ||
                itemBottom <= y
              if (!noOverlap) {
                return true
              }
            }
          }
        }
      }
    }
    return false
  }

  /**
   * Internal: Add item's rectangle to grid
   */
  private indexAddRect(item: HallPlacedItem): void {
    for (let y = item.y; y < item.y + item.h; y++) {
      for (let x = item.x; x < item.x + item.w; x++) {
        const key = `${x},${y}`
        let cell = this.grid.get(key)
        if (!cell) {
          cell = new Set()
          this.grid.set(key, cell)
        }
        cell.add(item.id)
      }
    }
  }

  /**
   * Internal: Remove item's rectangle from grid
   */
  private indexRemoveRect(item: HallPlacedItem): void {
    for (let y = item.y; y < item.y + item.h; y++) {
      for (let x = item.x; x < item.x + item.w; x++) {
        const key = `${x},${y}`
        const cell = this.grid.get(key)
        if (cell) {
          cell.delete(item.id)
          if (cell.size === 0) {
            this.grid.delete(key)
          }
        }
      }
    }
  }
}

