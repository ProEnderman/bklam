import { useState, useEffect } from 'react'
import { loyaltySegmentApi, loyaltyRfmApi } from '../../api/loyaltyService'
import type { Segment } from '../../api/loyaltyTypes'
import './Loyalty.css'

export default function LoyaltySegments() {
  const [segments, setSegments] = useState<Segment[]>([])
  const [rfmDistribution, setRfmDistribution] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({ name: '', definition: '{}' })

  useEffect(() => { loadAll() }, [])

  const loadAll = async () => {
    setLoading(true)
    try {
      const [segs, rfm] = await Promise.all([
        loyaltySegmentApi.getAll().catch(() => []),
        loyaltyRfmApi.getDistribution().catch(() => ({})),
      ])
      setSegments(segs)
      setRfmDistribution(rfm)
    } catch (e) { console.error(e) } finally { setLoading(false) }
  }

  const handleCreate = async () => {
    try {
      await loyaltySegmentApi.create(form)
      setShowCreate(false)
      setForm({ name: '', definition: '{}' })
      loadAll()
    } catch (e: any) { alert(e.response?.data?.message || 'Ошибка') }
  }

  const handleDelete = async (id: number) => {
    if (!confirm('Удалить сегмент?')) return
    try {
      await loyaltySegmentApi.delete(id)
      loadAll()
    } catch (e: any) {
      alert(e.response?.data?.message || 'Не удалось удалить сегмент')
    }
  }

  const rfmEntries = Object.entries(rfmDistribution)
  const rfmTotal = rfmEntries.reduce((s, [, v]) => s + v, 0)

  if (loading) return <div className="loyalty-page"><p>Загрузка...</p></div>

  return (
    <div className="loyalty-page">
      <div className="loyalty-header">
        <h1>Сегменты и RFM-анализ</h1>
        <button className="btn btn-primary" onClick={() => setShowCreate(true)}>+ Новый сегмент</button>
      </div>

      <div className="loyalty-sections-row">
        {/* Manual segments */}
        <div className="loyalty-section-card">
          <h3>Сегменты ({segments.length})</h3>
          {segments.length === 0 ? <p className="empty-message">Нет сегментов</p> : (
            <table className="loyalty-table">
              <thead><tr><th>Название</th><th>Кол-во гостей</th><th>Определение</th><th>Действия</th></tr></thead>
              <tbody>
                {segments.map(s => (
                  <tr key={s.id}>
                    <td>{s.name}</td>
                    <td>{s.guestCount}</td>
                    <td><code>{s.definition}</code></td>
                    <td><button className="btn btn-sm btn-danger" onClick={() => handleDelete(s.id)}>Удалить</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* RFM segments */}
        <div className="loyalty-section-card">
          <h3>RFM-сегменты</h3>
          {rfmTotal === 0 ? <p className="empty-message">Нет данных RFM. Запустите анализ.</p> : (
            <div className="rfm-distribution">
              {rfmEntries.map(([seg, count]) => (
                <div key={seg} className="rfm-bar-row">
                  <span className="rfm-label">{seg.replace(/_/g, ' ')}</span>
                  <div className="rfm-bar-bg">
                    <div className="rfm-bar-fill" style={{ width: `${(count / rfmTotal) * 100}%` }} />
                  </div>
                  <span className="rfm-count">{count}</span>
                </div>
              ))}
            </div>
          )}
          <button className="btn btn-secondary" style={{ marginTop: '1rem' }} onClick={async () => {
            try { await loyaltyRfmApi.runAnalysis(); loadAll() } catch (e: any) { alert(e.response?.data?.message || 'Ошибка') }
          }}>Запустить RFM-анализ</button>
        </div>
      </div>

      {showCreate && (
        <div className="modal-overlay" onClick={() => setShowCreate(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h2>Новый сегмент</h2>
            <div className="form-group"><label>Название *</label>
              <input type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="form-group"><label>Определение (JSON)</label>
              <textarea rows={3} value={form.definition} onChange={e => setForm({ ...form, definition: e.target.value })} />
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
