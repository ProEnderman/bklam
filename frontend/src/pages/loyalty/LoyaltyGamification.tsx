import { useState, useEffect } from 'react'
import { loyaltyGamificationApi } from '../../api/loyaltyService'
import type { Mission, Achievement, CreateMissionRequest, MissionType } from '../../api/loyaltyTypes'
import './Loyalty.css'

const MISSION_TYPES: MissionType[] = ['PURCHASE_COUNT', 'SPEND_AMOUNT', 'VISIT_STREAK', 'CATEGORY_TRY', 'REFERRAL_COUNT']
const MISSION_TYPE_LABELS: Record<MissionType, string> = {
  PURCHASE_COUNT: 'Кол-во покупок', SPEND_AMOUNT: 'Сумма покупок',
  VISIT_STREAK: 'Серия визитов', CATEGORY_TRY: 'Попробовать категории', REFERRAL_COUNT: 'Рефералы',
}

export default function LoyaltyGamification() {
  const [missions, setMissions] = useState<Mission[]>([])
  const [achievements, setAchievements] = useState<Achievement[]>([])
  const [tab, setTab] = useState<'missions' | 'achievements'>('missions')
  const [loading, setLoading] = useState(true)

  // Create mission modal
  const [showCreateMission, setShowCreateMission] = useState(false)
  const [mForm, setMForm] = useState<CreateMissionRequest>({
    name: '', missionType: 'PURCHASE_COUNT', goal: '{"target": 10}', reward: '{"points": 50}',
  })

  // Create achievement modal
  const [showCreateAchievement, setShowCreateAchievement] = useState(false)
  const [aForm, setAForm] = useState({ name: '', description: '', criteria: '{}', reward: '{}' })

  useEffect(() => { loadAll() }, [])

  const loadAll = async () => {
    setLoading(true)
    try {
      const [m, a] = await Promise.all([
        loyaltyGamificationApi.getMissions().catch(() => []),
        loyaltyGamificationApi.getAchievements().catch(() => []),
      ])
      setMissions(m)
      setAchievements(a)
    } catch (e) { console.error(e) } finally { setLoading(false) }
  }

  const handleCreateMission = async () => {
    try {
      await loyaltyGamificationApi.createMission(mForm)
      setShowCreateMission(false)
      setMForm({ name: '', missionType: 'PURCHASE_COUNT', goal: '{"target": 10}', reward: '{"points": 50}' })
      loadAll()
    } catch (e: any) { alert(e.response?.data?.message || 'Ошибка') }
  }

  const handleDeleteMission = async (id: number) => {
    if (!confirm('Удалить миссию?')) return
    try {
      await loyaltyGamificationApi.deleteMission(id)
      loadAll()
    } catch (e: any) {
      alert(e.response?.data?.message || 'Не удалось удалить миссию')
    }
  }

  const handleCreateAchievement = async () => {
    try {
      await loyaltyGamificationApi.createAchievement(aForm)
      setShowCreateAchievement(false)
      setAForm({ name: '', description: '', criteria: '{}', reward: '{}' })
      loadAll()
    } catch (e: any) { alert(e.response?.data?.message || 'Ошибка') }
  }

  if (loading) return <div className="loyalty-page"><p>Загрузка...</p></div>

  return (
    <div className="loyalty-page">
      <h1>Геймификация</h1>

      <div className="tabs">
        <button className={`tab ${tab === 'missions' ? 'active' : ''}`} onClick={() => setTab('missions')}>Миссии ({missions.length})</button>
        <button className={`tab ${tab === 'achievements' ? 'active' : ''}`} onClick={() => setTab('achievements')}>Достижения ({achievements.length})</button>
      </div>

      {tab === 'missions' && (
        <>
          <div className="loyalty-header" style={{ marginTop: '1rem' }}>
            <h2>Миссии</h2>
            <button className="btn btn-primary" onClick={() => setShowCreateMission(true)}>+ Новая миссия</button>
          </div>
          {missions.length === 0 ? <p className="empty-message">Нет миссий</p> : (
            <table className="loyalty-table">
              <thead><tr><th>Название</th><th>Тип</th><th>Цель</th><th>Награда</th><th>Статус</th><th>Действия</th></tr></thead>
              <tbody>
                {missions.map(m => (
                  <tr key={m.id}>
                    <td>{m.name}</td>
                    <td><span className="badge">{MISSION_TYPE_LABELS[m.missionType] || m.missionType}</span></td>
                    <td><code>{m.goal}</code></td>
                    <td><code>{m.reward}</code></td>
                    <td>{m.status}</td>
                    <td><button className="btn btn-sm btn-danger" onClick={() => handleDeleteMission(m.id)}>Удалить</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}

      {tab === 'achievements' && (
        <>
          <div className="loyalty-header" style={{ marginTop: '1rem' }}>
            <h2>Достижения</h2>
            <button className="btn btn-primary" onClick={() => setShowCreateAchievement(true)}>+ Новое достижение</button>
          </div>
          {achievements.length === 0 ? <p className="empty-message">Нет достижений</p> : (
            <div className="achievements-grid">
              {achievements.map(a => (
                <div key={a.id} className="achievement-badge achievement-badge-large">
                  <div className="achievement-name">{a.name}</div>
                  <div className="achievement-desc">{a.description || '—'}</div>
                  <div className="achievement-criteria"><code>{a.criteria}</code></div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Create Mission Modal */}
      {showCreateMission && (
        <div className="modal-overlay" onClick={() => setShowCreateMission(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h2>Новая миссия</h2>
            <div className="form-group"><label>Название *</label>
              <input type="text" value={mForm.name} onChange={e => setMForm({ ...mForm, name: e.target.value })} />
            </div>
            <div className="form-group"><label>Тип *</label>
              <select value={mForm.missionType} onChange={e => setMForm({ ...mForm, missionType: e.target.value as MissionType })}>
                {MISSION_TYPES.map(t => <option key={t} value={t}>{MISSION_TYPE_LABELS[t]}</option>)}
              </select>
            </div>
            <div className="form-group"><label>Цель (JSON)</label>
              <textarea rows={2} value={mForm.goal || ''} onChange={e => setMForm({ ...mForm, goal: e.target.value })} />
            </div>
            <div className="form-group"><label>Награда (JSON)</label>
              <textarea rows={2} value={mForm.reward || ''} onChange={e => setMForm({ ...mForm, reward: e.target.value })} />
            </div>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setShowCreateMission(false)}>Отмена</button>
              <button className="btn btn-primary" onClick={handleCreateMission} disabled={!mForm.name}>Создать</button>
            </div>
          </div>
        </div>
      )}

      {/* Create Achievement Modal */}
      {showCreateAchievement && (
        <div className="modal-overlay" onClick={() => setShowCreateAchievement(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h2>Новое достижение</h2>
            <div className="form-group"><label>Название *</label>
              <input type="text" value={aForm.name} onChange={e => setAForm({ ...aForm, name: e.target.value })} />
            </div>
            <div className="form-group"><label>Описание</label>
              <input type="text" value={aForm.description} onChange={e => setAForm({ ...aForm, description: e.target.value })} />
            </div>
            <div className="form-group"><label>Критерии (JSON)</label>
              <textarea rows={2} value={aForm.criteria} onChange={e => setAForm({ ...aForm, criteria: e.target.value })} />
            </div>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setShowCreateAchievement(false)}>Отмена</button>
              <button className="btn btn-primary" onClick={handleCreateAchievement} disabled={!aForm.name}>Создать</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
