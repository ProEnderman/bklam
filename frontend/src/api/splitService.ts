import client from './client'
import type { CreateSplitRequest, OrderSplitDto } from './qrTypes'

export const splitService = {
  async getSplit(orderId: number): Promise<OrderSplitDto | null> {
    try {
      const res = await client.get<OrderSplitDto>(`/orders/${orderId}/split`)
      return res.data
    } catch (err: any) {
      if (err.response?.status === 404) return null
      throw err
    }
  },

  async createSplit(orderId: number, req: CreateSplitRequest): Promise<OrderSplitDto> {
    const res = await client.post<OrderSplitDto>(`/orders/${orderId}/split`, req)
    return res.data
  },

  async deleteSplit(orderId: number): Promise<void> {
    await client.delete(`/orders/${orderId}/split`)
  },
}
