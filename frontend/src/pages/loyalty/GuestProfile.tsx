import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { loyaltyGuestApi, loyaltyBonusApi } from '../../api/loyaltyService'
import type { GuestProfile as GuestProfileType, BonusLedgerEntry, Page } from '../../api/loyaltyTypes'
import './Loyalty.css'

export default function GuestProfile() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [profile, setProfile] = useState<GuestProfileType | null>(null)
  const [history, setHistory] = useState<BonusLedgerEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  // Earn/Burn modal
  const [showTx, setShowTx] = useState<'earn' | 'burn' | null>(null)
  const [txAmount, setTxAmount] = useState('')
  const [txDesc, setTxDesc] = useState('')

  useEffect(() => {
    if (id) loadProfile(Number(id))
  }, [id])

  const loadProfile = async (guestId: number) => {
    setLoading(true)
    setLoadError('')
    try {
      const [p, h] = await Promise.all([
        loyaltyGuestApi.getProfile(guestId),
        loyaltyBonusApi.getHistory(guestId, 0, 50).catch(() => ({ content: [], totalElements: 0, totalPages: 0, number: 0, size: 50 } as Page<BonusLedgerEntry>)),
      ])
      setProfile(p)
      setHistory(h.content)
    } catch (e: any) {
      console.error('Failed to load profile', e)
      if (e.response?.status === 404) {
        setLoadError('Гость не найден')
      } else {
        setLoadError(e.response?.data?.message || 'Ошибка загрузки профиля')
      }
    } finally {
      setLoading(false)
    }
  }

  const handleTransaction = async () => {
    if (!showTx || !id || !txAmount) return
    const amount = parseFloat(txAmount)
    if (isNaN(amount) || amount <= 0) return

    try {
      if (showTx === 'earn') {
        await loyaltyBonusApi.earn({ guestId: Number(id), amount, description: txDesc || undefined })
      } else {
        await loyaltyBonusApi.burn({ guestId: Number(id), amount, description: txDesc || undefined })
      }
      setShowTx(null)
      setTxAmount('')
      setTxDesc('')
      loadProfile(Number(id))
    } catch (e: any) {
      alert(e.response?.data?.message || 'Ошибка операции')
    }
  }

  if (loading) return <div className="loyalty-page"><p>Загрузка...</p></div>
  if (!profile) return (
    <div className="loyalty-page">
      <button className="btn-back" onClick={() => navigate('/loyalty/guests')}>← Назад к списку</button>
      {loadError ? <div className="error-message">{loadError}</div> : <p>Гость не найден</p>}
    </div>
  )

  const { guest, bonusAccount, currentTier, activeMissions, achievements, rfmSnapshot } = profile

  return (
    <div className="loyalty-page">
      <button className="btn-back" onClick={() => navigate('/loyalty/guests')}>← Назад к списку</button>

      <div className="guest-profile-header">
        <h1>{guest.name || 'Без имени'}</h1>
        <span className="guest-phone">{guest.phoneNormalized}</span>
        {currentTier && <span className="guest-tier-badge">{currentTier.name}</span>}
      </div>

      <div className="profile-grid">
        {/* Bonus card */}
        <div className="profile-card">
          <h3>Бонусный счёт</h3>
          {bonusAccount ? (
            <>
              <div className="bonus-balance">{bonusAccount.currentBalance.toFixed(2)} баллов</div>
              <div className="bonus-stats">
                <span>Начислено: {bonusAccount.totalEarned?.toFixed(2) || '0'}</span>
                <span>Списано: {bonusAccount.totalBurned?.toFixed(2) || '0'}</span>
              </div>
              <div className="bonus-status">Статус: {bonusAccount.status}</div>
              <div className="bonus-actions">
                <button className="btn btn-success" onClick={() => setShowTx('earn')}>+ Начислить</button>
                <button className="btn btn-danger" onClick={() => setShowTx('burn')}>− Списать</button>
              </div>
            </>
          ) : (
            <p>Аккаунт не найден</p>
          )}
        </div>

        {/* Guest info card */}
        <div className="profile-card">
          <h3>Информация</h3>
          <div className="info-rows">
            <div><b>Email:</b> {guest.email || '—'}</div>
            <div><b>День рождения:</b> {guest.birthday || '—'}</div>
            <div><b>Зарегистрирован:</b> {new Date(guest.createdAt).toLocaleDateString()}</div>
          </div>
        </div>

        {/* Tier card */}
        {currentTier && (
          <div className="profile-card">
            <h3>Текущий уровень</h3>
            <div className="tier-name">{currentTier.name}</div>
            <div className="tier-info">
              <span>Кэшбэк: {currentTier.cashbackPercent}%</span>
              <span>Порог: {currentTier.threshold} баллов</span>
            </div>
          </div>
        )}

        {/* RFM card */}
        {rfmSnapshot && (
          <div className="profile-card">
            <h3>RFM-профиль</h3>
            <div className="rfm-scores">
              <span className="rfm-score">R: {rfmSnapshot.rScore}</span>
              <span className="rfm-score">F: {rfmSnapshot.fScore}</span>
              <span className="rfm-score">M: {rfmSnapshot.mScore}</span>
            </div>
            <div className="rfm-segment">{rfmSnapshot.rfmSegment?.replace(/_/g, ' ') || '—'}</div>
          </div>
        )}
      </div>

      {/* Missions */}
      {activeMissions.length > 0 && (
        <div className="profile-section">
          <h3>Активные миссии</h3>
          <div className="missions-list">
            {activeMissions.map(m => (
              <div key={m.id} className="mission-card">
                <div className="mission-name">{m.missionName}</div>
                <div className="mission-progress-bar">
                  <div className="mission-bar-fill" style={{ width: `${m.progressPercent}%` }} />
                </div>
                <div className="mission-progress-text">{m.currentValue}/{m.goalValue} ({m.progressPercent.toFixed(0)}%)</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Achievements */}
      {achievements.length > 0 && (
        <div className="profile-section">
          <h3>Достижения</h3>
          <div className="achievements-grid">
            {achievements.map(a => (
              <div key={a.id} className="achievement-badge">
                <div className="achievement-name">{a.name}</div>
                <div className="achievement-desc">{a.description}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Transaction history */}
      <div className="profile-section">
        <h3>История операций</h3>
        {history.length === 0 ? (
          <p className="empty-message">Нет операций</p>
        ) : (
          <table className="loyalty-table">
            <thead>
              <tr>
                <th>Дата</th>
                <th>Тип</th>
                <th>Сумма</th>
                <th>Источник</th>
                <th>Описание</th>
              </tr>
            </thead>
            <tbody>
              {history.map(h => (
                <tr key={h.id} className={h.entryType === 'EARN' || h.entryType === 'ADJUST' ? 'row-earn' : 'row-burn'}>
                  <td>{new Date(h.createdAt).toLocaleString()}</td>
                  <td><span className={`badge badge-${h.entryType.toLowerCase()}`}>{h.entryType}</span></td>
                  <td className={h.entryType === 'EARN' || h.entryType === 'ADJUST' ? 'amount-positive' : 'amount-negative'}>
                    {h.entryType === 'EARN' || h.entryType === 'ADJUST' ? '+' : '-'}{h.amount.toFixed(2)}
                  </td>
                  <td>{h.sourceType || '—'}</td>
                  <td>{h.description || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Earn/Burn Modal */}
      {showTx && (
        <div className="modal-overlay" onClick={() => setShowTx(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h2>{showTx === 'earn' ? 'Начислить баллы' : 'Списать баллы'}</h2>
            <div className="form-group">
              <label>Сумма *</label>
              <input type="number" min="0.01" step="0.01" value={txAmount} onChange={e => setTxAmount(e.target.value)} />
            </div>
            <div className="form-group">
              <label>Описание</label>
              <input type="text" value={txDesc} onChange={e => setTxDesc(e.target.value)} placeholder="Причина" />
            </div>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setShowTx(null)}>Отмена</button>
              <button className={`btn ${showTx === 'earn' ? 'btn-success' : 'btn-danger'}`} onClick={handleTransaction} disabled={!txAmount}>
                {showTx === 'earn' ? 'Начислить' : 'Списать'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
