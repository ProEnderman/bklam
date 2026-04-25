import { useState, useEffect } from 'react'
import { loyaltyTierApi } from '../../api/loyaltyService'
import type { Tier } from '../../api/loyaltyTypes'
import './Loyalty.css'

export default function LoyaltyTiers() {
  const [tiers, setTiers] = useState<Tier[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({ name: '', level: 0, threshold: 0, cashbackPercent: 0, benefits: '{}' })

  useEffect(() => { loadTiers() }, [])

  const loadTiers = async () => {
    setLoading(true)
    try {
      setTiers(await loyaltyTierApi.getAll())
    } catch (e) { console.error(e) } finally { setLoading(false) }
  }

  const handleCreate = async () => {
    try {
      await loyaltyTierApi.create(form as any)
      setShowCreate(false)
      setForm({ name: '', level: 0, threshold: 0, cashbackPercent: 0, benefits: '{}' })
      loadTiers()
    } catch (e: any) { alert(e.response?.data?.message || 'Ошибка') }
  }

  const handleDelete = async (id: number) => {
    if (!confirm('Удалить уровень?')) return
    try {
      await loyaltyTierApi.delete(id)
      loadTiers()
    } catch (e: any) {
      alert(e.response?.data?.message || 'Не удалось удалить уровень')
    }
  }

  return (
    <div className="loyalty-page">
      <div className="loyalty-header">
        <h1>Уровни (тиры)</h1>
        <button className="btn btn-primary" onClick={() => setShowCreate(true)}>+ Новый уровень</button>
      </div>

      {loading ? <p>Загрузка...</p> : tiers.length === 0 ? (
        <p className="empty-message">Нет уровней</p>
      ) : (
        <div className="tiers-grid">
          {tiers.map(t => (
            <div key={t.id} className="tier-card">
              <div className="tier-level">Уровень {t.level}</div>
              <div className="tier-card-name">{t.name}</div>
              <div className="tier-details">
                <span>Порог: {t.threshold} баллов</span>
                <span>Кэшбэк: {t.cashbackPercent}%</span>
              </div>
              <button className="btn btn-sm btn-danger" onClick={() => handleDelete(t.id)}>Удалить</button>
            </div>
          ))}
        </div>
      )}

      {showCreate && (
        <div className="modal-overlay" onClick={() => setShowCreate(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h2>Новый уровень</h2>
            <div className="form-group"><label>Название *</label>
              <input type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="form-group"><label>Уровень (порядок)</label>
              <input type="number" value={form.level} onChange={e => setForm({ ...form, level: parseInt(e.target.value) })} />
            </div>
            <div className="form-group"><label>Порог (баллов)</label>
              <input type="number" value={form.threshold} onChange={e => setForm({ ...form, threshold: parseFloat(e.target.value) })} />
            </div>
            <div className="form-group"><label>Кэшбэк (%)</label>
              <input type="number" step="0.5" value={form.cashbackPercent} onChange={e => setForm({ ...form, cashbackPercent: parseFloat(e.target.value) })} />
            </div>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setShowCreate(false)}>Отмена</button>
              <button className="btn btn-primary" onClick={handleCreate} disabled={!form.name}>Создать</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
