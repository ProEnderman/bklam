import client from './client'
import type {
  LoyaltyGuest, CreateGuestRequest, UpdateGuestRequest, GuestMergeRequest,
  BonusAccount, BonusLedgerEntry, BonusTransactionRequest,
  Tier, Campaign, CreateCampaignRequest, CampaignStatus,
  Segment, CreateSegmentRequest, PersonalizedOffer,
  Mission, CreateMissionRequest, MissionProgress, Achievement,
  RfmSnapshot, GuestProfile, Page
} from './loyaltyTypes'

const BASE = '/loyalty'

// ── Guests ────────────────────────────────────────────────────────

export const loyaltyGuestApi = {
  search: (query?: string, page = 0, size = 20) =>
    client.get<Page<LoyaltyGuest>>(`${BASE}/guests`, { params: { query, page, size } }).then(r => r.data),

  findByPhone: (phone: string) =>
    client.get<LoyaltyGuest>(`${BASE}/guests/by-phone`, { params: { phone } }).then(r => r.data).catch(() => null),

  getById: (id: number) =>
    client.get<LoyaltyGuest>(`${BASE}/guests/${id}`).then(r => r.data),

  getProfile: (id: number) =>
    client.get<GuestProfile>(`${BASE}/guests/${id}/profile`).then(r => r.data),

  create: (data: CreateGuestRequest) =>
    client.post<LoyaltyGuest>(`${BASE}/guests`, data).then(r => r.data),

  /** Если гость с таким телефоном уже есть — возвращает его (без Business Rule Violation). */
  createOrReuseByPhone: async (data: CreateGuestRequest) => {
    const existing = await loyaltyGuestApi.findByPhone(data.phone)
    if (existing) return existing
    return loyaltyGuestApi.create(data)
  },

  update: (id: number, data: UpdateGuestRequest) =>
    client.put<LoyaltyGuest>(`${BASE}/guests/${id}`, data).then(r => r.data),

  merge: (data: GuestMergeRequest) =>
    client.post<LoyaltyGuest>(`${BASE}/guests/merge`, data).then(r => r.data),

  count: () =>
    client.get<number>(`${BASE}/guests/count`).then(r => r.data),
}

// ── Bonus ─────────────────────────────────────────────────────────

export const loyaltyBonusApi = {
  getAccount: (guestId: number) =>
    client.get<BonusAccount>(`${BASE}/bonus/${guestId}`).then(r => r.data),

  earn: (data: BonusTransactionRequest) =>
    client.post<BonusLedgerEntry>(`${BASE}/bonus/earn`, data).then(r => r.data),

  burn: (data: BonusTransactionRequest) =>
    client.post<BonusLedgerEntry>(`${BASE}/bonus/burn`, data).then(r => r.data),

  adjust: (guestId: number, amount: number, reason?: string) =>
    client.post<BonusLedgerEntry>(`${BASE}/bonus/${guestId}/adjust`, null, { params: { amount, reason } }).then(r => r.data),

  getHistory: (guestId: number, page = 0, size = 20) =>
    client.get<Page<BonusLedgerEntry>>(`${BASE}/bonus/${guestId}/history`, { params: { page, size } }).then(r => r.data),

  reconcile: (guestId: number) =>
    client.post<BonusAccount>(`${BASE}/bonus/${guestId}/reconcile`).then(r => r.data),
}

// ── Tiers ─────────────────────────────────────────────────────────

export const loyaltyTierApi = {
  getAll: () =>
    client.get<Tier[]>(`${BASE}/tiers`).then(r => r.data),

  create: (data: Partial<Tier>) =>
    client.post<Tier>(`${BASE}/tiers`, data).then(r => r.data),

  update: (id: number, data: Partial<Tier>) =>
    client.put<Tier>(`${BASE}/tiers/${id}`, data).then(r => r.data),

  delete: (id: number) =>
    client.delete(`${BASE}/tiers/${id}`),

  evaluateGuest: (guestId: number) =>
    client.post<Tier>(`${BASE}/tiers/evaluate/${guestId}`).then(r => r.data),

  getGuestTier: (guestId: number) =>
    client.get<Tier>(`${BASE}/tiers/guest/${guestId}`).then(r => r.data).catch(() => null),
}

// ── Campaigns ─────────────────────────────────────────────────────

export type LoyaltyScope = 'RESTAURANT' | 'TARIFF'

export const loyaltyCampaignApi = {
  getAll: (page = 0, size = 20, scope?: LoyaltyScope) =>
    client.get<Page<Campaign>>(`${BASE}/campaigns`, { params: { page, size, scope } }).then(r => r.data),

  getActive: (scope?: LoyaltyScope) =>
    client.get<Campaign[]>(`${BASE}/campaigns/active`, { params: { scope } }).then(r => r.data),

  getById: (id: number) =>
    client.get<Campaign>(`${BASE}/campaigns/${id}`).then(r => r.data),

  create: (data: CreateCampaignRequest) =>
    client.post<Campaign>(`${BASE}/campaigns`, data).then(r => r.data),

  update: (id: number, data: CreateCampaignRequest) =>
    client.put<Campaign>(`${BASE}/campaigns/${id}`, data).then(r => r.data),

  changeStatus: (id: number, status: CampaignStatus) =>
    client.patch<Campaign>(`${BASE}/campaigns/${id}/status`, null, { params: { status } }).then(r => r.data),

  delete: (id: number) =>
    client.delete(`${BASE}/campaigns/${id}`),
}

// ── Segments ──────────────────────────────────────────────────────

export const loyaltySegmentApi = {
  getAll: () =>
    client.get<Segment[]>(`${BASE}/segments`).then(r => r.data),

  create: (data: CreateSegmentRequest) =>
    client.post<Segment>(`${BASE}/segments`, data).then(r => r.data),

  update: (id: number, data: CreateSegmentRequest) =>
    client.put<Segment>(`${BASE}/segments/${id}`, data).then(r => r.data),

  delete: (id: number) =>
    client.delete(`${BASE}/segments/${id}`),
}

// ── Offers ────────────────────────────────────────────────────────

export const loyaltyOfferApi = {
  getForGuest: (guestId: number, page = 0, size = 20) =>
    client.get<Page<PersonalizedOffer>>(`${BASE}/offers/guest/${guestId}`, { params: { page, size } }).then(r => r.data),

  getActive: (guestId: number) =>
    client.get<PersonalizedOffer[]>(`${BASE}/offers/guest/${guestId}/active`).then(r => r.data),

  create: (guestId: number, campaignId: number, reason?: string) =>
    client.post<PersonalizedOffer>(`${BASE}/offers`, null, { params: { guestId, campaignId, reason } }).then(r => r.data),

  redeem: (offerId: number) =>
    client.post<PersonalizedOffer>(`${BASE}/offers/${offerId}/redeem`).then(r => r.data),
}

// ── Gamification ──────────────────────────────────────────────────

export const loyaltyGamificationApi = {
  getMissions: () =>
    client.get<Mission[]>(`${BASE}/gamification/missions`).then(r => r.data),

  createMission: (data: CreateMissionRequest) =>
    client.post<Mission>(`${BASE}/gamification/missions`, data).then(r => r.data),

  deleteMission: (id: number) =>
    client.delete(`${BASE}/gamification/missions/${id}`),

  getGuestMissions: (guestId: number) =>
    client.get<MissionProgress[]>(`${BASE}/gamification/missions/guest/${guestId}`).then(r => r.data),

  getAchievements: () =>
    client.get<Achievement[]>(`${BASE}/gamification/achievements`).then(r => r.data),

  createAchievement: (data: Partial<Achievement>) =>
    client.post<Achievement>(`${BASE}/gamification/achievements`, data).then(r => r.data),

  awardAchievement: (achievementId: number, guestId: number) =>
    client.post(`${BASE}/gamification/achievements/${achievementId}/award/${guestId}`),

  getGuestAchievements: (guestId: number) =>
    client.get<Achievement[]>(`${BASE}/gamification/achievements/guest/${guestId}`).then(r => r.data),
}

// ── RFM ───────────────────────────────────────────────────────────

export const loyaltyRfmApi = {
  getLatest: (guestId: number) =>
    client.get<RfmSnapshot>(`${BASE}/rfm/guest/${guestId}`).then(r => r.data).catch(() => null),

  getHistory: (guestId: number) =>
    client.get<RfmSnapshot[]>(`${BASE}/rfm/guest/${guestId}/history`).then(r => r.data),

  getDistribution: () =>
    client.get<Record<string, number>>(`${BASE}/rfm/distribution`).then(r => r.data),

  runAnalysis: () =>
    client.post<RfmSnapshot[]>(`${BASE}/rfm/run`).then(r => r.data),
}
