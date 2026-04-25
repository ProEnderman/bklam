import axios from 'axios'
import type {
  QrMenuCategory, CreateSessionRequest, CreateSessionResponse,
  QrOrder, AddItemRequest,
} from './qrTypes'
import { getGuestSession, getMenuETag, setMenuETag } from '../utils/qrSession'

const BASE = '/api/public'

const pub = axios.create({ baseURL: BASE, headers: { 'Content-Type': 'application/json' } })

function sessionHeaders(): Record<string, string> {
  const t = getGuestSession()
  return t ? { 'X-Guest-Session': t } : {}
}

export interface MenuResult {
  data: QrMenuCategory[] | null
  notModified: boolean
}

export const qrService = {
  async getMenu(token: string): Promise<MenuResult> {
    const etag = getMenuETag(token)
    const headers: Record<string, string> = {}
    if (etag) headers['If-None-Match'] = etag

    try {
      const res = await pub.get<QrMenuCategory[]>('/menu', { params: { token }, headers })
      const newEtag = res.headers['etag']
      if (newEtag) setMenuETag(token, newEtag)
      return { data: res.data, notModified: false }
    } catch (err: any) {
      if (err.response?.status === 304) {
        return { data: null, notModified: true }
      }
      throw err
    }
  },

  async createSession(req: CreateSessionRequest): Promise<CreateSessionResponse> {
    const res = await pub.post<CreateSessionResponse>('/sessions', req)
    return res.data
  },

  async getCurrentOrder(): Promise<QrOrder | null> {
    try {
      const res = await pub.get<QrOrder>('/orders/current', { headers: sessionHeaders() })
      return res.data
    } catch (err: any) {
      if (err.response?.status === 404) return null
      throw err
    }
  },

  async createOrder(): Promise<QrOrder> {
    const res = await pub.post<QrOrder>('/orders', null, { headers: sessionHeaders() })
    return res.data
  },

  async addItem(orderId: number, req: AddItemRequest): Promise<QrOrder> {
    const res = await pub.post<QrOrder>(`/orders/${orderId}/items`, req, { headers: sessionHeaders() })
    return res.data
  },

  async removeItem(orderId: number, itemId: number): Promise<QrOrder> {
    const res = await pub.delete<QrOrder>(`/orders/${orderId}/items/${itemId}`, { headers: sessionHeaders() })
    return res.data
  },
}
