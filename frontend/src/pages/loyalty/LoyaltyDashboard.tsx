import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { loyaltyGuestApi, loyaltyCampaignApi, loyaltyTierApi, loyaltyGamificationApi, loyaltyRfmApi } from '../../api/loyaltyService'
import type { Campaign } from '../../api/loyaltyTypes'
import './Loyalty.css'

export default function LoyaltyDashboard() {
  const navigate = useNavigate()
  const [stats, setStats] = useState({
    guestCount: 0,
    activeRestaurantCampaigns: 0,
    activeTariffCampaigns: 0,
    tiers: 0,
    missions: 0,
  })
  const [rfmDistribution, setRfmDistribution] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    loadDashboard()
  }, [])

  const loadDashboard = async () => {
    setError('')
    try {
      const [guestCount, restaurantCampaigns, tariffCampaigns, tiers, missions, rfm] = await Promise.all([
        loyaltyGuestApi.count().catch(() => 0),
        loyaltyCampaignApi.getActive('RESTAURANT').catch(() => [] as Campaign[]),
        loyaltyCampaignApi.getActive('TARIFF').catch(() => [] as Campaign[]),
        loyaltyTierApi.getAll().catch(() => []),
        loyaltyGamificationApi.getMissions().catch(() => []),
        loyaltyRfmApi.getDistribution().catch(() => ({})),
      ])
      setStats({
        guestCount: guestCount as number,
        activeRestaurantCampaigns: (restaurantCampaigns as Campaign[]).length,
        activeTariffCampaigns: (tariffCampaigns as Campaign[]).length,
        tiers: (tiers as any[]).length,
        missions: (missions as any[]).length,
      })
      setRfmDistribution(rfm as Record<string, number>)
    } catch (e) {
      console.error('Failed to load dashboard', e)
      setError('Не удалось загрузить данные')
    } finally {
      setLoading(false)
    }
  }

  if (loading) return <div className="loyalty-page"><p>Загрузка...</p></div>

  const rfmSegments = Object.entries(rfmDistribution)
  const rfmTotal = rfmSegments.reduce((s, [, v]) => s + v, 0)

  return (
    <div className="loyalty-page">
      <h1>Loyalty Platform</h1>

      {error && <div className="error-message">{error}</div>}

      <div className="loyalty-stats-grid">
        <div className="loyalty-stat-card" onClick={() => navigate('/loyalty/guests')}>
          <div className="stat-value">{stats.guestCount}</div>
          <div className="stat-label">Гостей</div>
        </div>
        <div className="loyalty-stat-card" onClick={() => navigate('/loyalty/campaigns')}>
          <div className="stat-value">{stats.activeRestaurantCampaigns}</div>
          <div className="stat-label">Акций (ресторан)</div>
        </div>
        <div className="loyalty-stat-card" onClick={() => navigate('/loyalty/campaigns')}>
          <div className="stat-value">{stats.activeTariffCampaigns}</div>
          <div className="stat-label">Акций (тарифы)</div>
        </div>
        <div className="loyalty-stat-card" onClick={() => navigate('/loyalty/tiers')}>
          <div className="stat-value">{stats.tiers}</div>
          <div className="stat-label">Уровней</div>
        </div>
        <div className="loyalty-stat-card" onClick={() => navigate('/loyalty/gamification')}>
          <div className="stat-value">{stats.missions}</div>
          <div className="stat-label">Миссий</div>
        </div>
      </div>

      <div className="loyalty-sections-row">
        <div className="loyalty-section-card">
          <h3>Быстрые действия</h3>
          <div className="quick-actions">
            <button className="btn btn-primary" onClick={() => navigate('/loyalty/guests')}>
              Найти гостя
            </button>
            <button className="btn btn-secondary" onClick={() => navigate('/loyalty/campaigns')}>
              Управление акциями
            </button>
            <button className="btn btn-secondary" onClick={() => navigate('/loyalty/segments')}>
              Сегменты
            </button>
          </div>
        </div>

        {rfmTotal > 0 && (
          <div className="loyalty-section-card">
            <h3>RFM-сегменты</h3>
            <div className="rfm-distribution">
              {rfmSegments.map(([segment, count]) => (
                <div key={segment} className="rfm-bar-row">
                  <span className="rfm-label">{segment.replace(/_/g, ' ')}</span>
                  <div className="rfm-bar-bg">
                    <div
                      className="rfm-bar-fill"
                      style={{ width: `${(count / rfmTotal) * 100}%` }}
                    />
                  </div>
                  <span className="rfm-count">{count}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {rfmTotal === 0 && (
          <div className="loyalty-section-card">
            <h3>RFM-сегменты</h3>
            <p className="empty-message">RFM-анализ ещё не запускался. Перейдите в «Сегменты» для запуска.</p>
          </div>
        )}
      </div>
    </div>
  )
}
