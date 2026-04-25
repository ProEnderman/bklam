import axios from 'axios'
import type { QrMenuCategory, QrOrder, AddItemRequest } from './qrTypes'

const telegramClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  headers: { 'Content-Type': 'application/json' },
  withCredentials: false,
})

const authHeaders = (initData: string) => ({
  'X-Telegram-Init-Data': initData,
})

export const telegramShopService = {
  async getMenu(restaurantId: number | undefined, initData: string): Promise<{ categories: QrMenuCategory[]; restaurantName?: string }> {
    const response = await telegramClient.get<QrMenuCategory[]>('/telegram/menu', {
      params: restaurantId ? { restaurantId } : undefined,
      headers: authHeaders(initData),
    })
    const restaurantName = response.headers['x-restaurant-name'] as string | undefined
    return { categories: response.data, restaurantName }
  },

  async createOrGetCurrentOrder(telegramUserId: number, restaurantId: number | undefined, initData: string): Promise<QrOrder> {
    const response = await telegramClient.post<QrOrder>('/telegram/orders/current', {
      telegramUserId,
      restaurantId,
    }, {
      headers: authHeaders(initData),
    })
    return response.data
  },

  async addItem(orderId: number, req: AddItemRequest, telegramUserId: number, initData: string): Promise<QrOrder> {
    const response = await telegramClient.post<QrOrder>(`/telegram/orders/${orderId}/items`, {
      telegramUserId,
      dishId: req.dishId,
      qty: req.qty,
      comment: req.comment,
      selections: req.selections,
    }, {
      headers: authHeaders(initData),
    })
    return response.data
  },

  async removeItem(orderId: number, itemId: number, telegramUserId: number, initData: string): Promise<QrOrder> {
    const response = await telegramClient.delete<QrOrder>(`/telegram/orders/${orderId}/items/${itemId}`, {
      params: { telegramUserId },
      headers: authHeaders(initData),
    })
    return response.data
  },

  async getOrder(orderId: number, telegramUserId: number, initData: string): Promise<QrOrder> {
    const response = await telegramClient.get<QrOrder>(`/telegram/orders/${orderId}`, {
      params: { telegramUserId },
      headers: authHeaders(initData),
    })
    return response.data
  },
}
