// ── Loyalty Platform Types ─────────────────────────────────────────

export interface LoyaltyGuest {
  id: number
  restaurantId: number
  phoneNormalized: string
  name?: string
  email?: string
  birthday?: string
  consentFlags?: string
  createdAt: string
  updatedAt: string
}

export interface CreateGuestRequest {
  phone: string
  name?: string
  email?: string
  birthday?: string
}

export interface UpdateGuestRequest {
  name?: string
  email?: string
  birthday?: string
}

export interface GuestMergeRequest {
  sourceGuestId: number
  targetGuestId: number
}

export type BonusAccountStatus = 'ACTIVE' | 'FROZEN' | 'CLOSED'

export interface BonusAccount {
  id: number
  guestId: number
  status: BonusAccountStatus
  currentBalance: number
  totalEarned?: number
  totalBurned?: number
  updatedAt: string
}

export type LedgerEntryType = 'EARN' | 'BURN' | 'EXPIRE' | 'ADJUST'

export interface BonusLedgerEntry {
  id: number
  accountId: number
  entryType: LedgerEntryType
  amount: number
  pointsUnit: string
  sourceType?: string
  sourceId?: string
  description?: string
  metadata?: string
  createdAt: string
}

export interface BonusTransactionRequest {
  guestId: number
  amount: number
  sourceType?: string
  sourceId?: string
  description?: string
  idempotencyKey?: string
}

export interface Tier {
  id: number
  restaurantId: number
  name: string
  level: number
  threshold: number
  cashbackPercent: number
  benefits?: string
  validFrom?: string
  validTo?: string
  createdAt: string
}

export type CampaignType = 'CASHBACK' | 'MULTIPLIER' | 'WELCOME' | 'BIRTHDAY' | 'WINBACK' | 'REFERRAL' | 'CATEGORY_BONUS'
export type CampaignStatus = 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'ARCHIVED'

export interface Campaign {
  id: number
  restaurantId: number
  name: string
  campaignType: CampaignType
  rules: string
  schedule?: string
  status: CampaignStatus
  priority: number
  validFrom?: string
  validTo?: string
  createdAt: string
  updatedAt: string
}

export interface CreateCampaignRequest {
  name: string
  campaignType: CampaignType
  rules?: string
  schedule?: string
  priority?: number
  validFrom?: string
  validTo?: string
}

export interface Segment {
  id: number
  restaurantId: number
  name: string
  definition: string
  guestCount: number
  createdAt: string
  updatedAt: string
}

export interface CreateSegmentRequest {
  name: string
  definition?: string
}

export type OfferStatus = 'PENDING' | 'SENT' | 'REDEEMED' | 'EXPIRED'

export interface PersonalizedOffer {
  id: number
  guestId: number
  campaignId: number
  campaignName: string
  reason?: string
  status: OfferStatus
  validFrom?: string
  validTo?: string
  createdAt: string
}

export type MissionType = 'PURCHASE_COUNT' | 'SPEND_AMOUNT' | 'VISIT_STREAK' | 'CATEGORY_TRY' | 'REFERRAL_COUNT'
export type MissionProgressStatus = 'IN_PROGRESS' | 'COMPLETED' | 'CLAIMED' | 'EXPIRED'

export interface Mission {
  id: number
  restaurantId: number
  name: string
  description?: string
  missionType: MissionType
  goal: string
  reward: string
  status: string
  validFrom?: string
  validTo?: string
  createdAt: string
}

export interface CreateMissionRequest {
  name: string
  description?: string
  missionType: MissionType
  goal?: string
  reward?: string
  validFrom?: string
  validTo?: string
}

export interface MissionProgress {
  id: number
  guestId: number
  missionId: number
  missionName: string
  currentValue: number
  goalValue: number
  progressPercent: number
  status: MissionProgressStatus
  startedAt: string
  completedAt?: string
}

export interface Achievement {
  id: number
  restaurantId: number
  name: string
  description?: string
  iconUrl?: string
  criteria: string
  reward?: string
  createdAt: string
}

export interface RfmSnapshot {
  id: number
  guestId: number
  snapshotDate: string
  recencyDays: number
  frequencyCount: number
  monetarySum: number
  rScore: number
  fScore: number
  mScore: number
  rfmSegment?: string
}

export interface GuestProfile {
  guest: LoyaltyGuest
  bonusAccount?: BonusAccount
  currentTier?: Tier
  activeMissions: MissionProgress[]
  achievements: Achievement[]
  rfmSnapshot?: RfmSnapshot
}

export interface Page<T> {
  content: T[]
  totalElements: number
  totalPages: number
  number: number
  size: number
}
