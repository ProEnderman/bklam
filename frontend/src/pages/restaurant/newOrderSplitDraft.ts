export type SplitDraftShare = {
  name: string
  pendingQtys: Record<number, number>
  guestId?: number
  guestLabel?: string
  newGuestName?: string
  newGuestPhone?: string
}
