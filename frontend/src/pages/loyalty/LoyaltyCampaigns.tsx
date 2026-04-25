import { useState, useEffect } from 'react'
import { loyaltyCampaignApi } from '../../api/loyaltyService'
import type { LoyaltyScope } from '../../api/loyaltyService'
import type { Campaign, Page, CreateCampaignRequest, CampaignType, CampaignStatus } from '../../api/loyaltyTypes'
import './Loyalty.css'

const CAMPAIGN_TYPES: CampaignType[] = ['CASHBACK', 'MULTIPLIER', 'WELCOME', 'BIRTHDAY', 'WINBACK', 'REFERRAL', 'CATEGORY_BONUS']
const CAMPAIGN_TYPE_LABELS: Record<CampaignType, string> = {
  CASHBACK: 'Кэшбэк', MULTIPLIER: 'Множитель', WELCOME: 'Welcome-бонус',
  BIRTHDAY: 'День рождения', WINBACK: 'Win-back', REFERRAL: 'Реферал', CATEGORY_BONUS: 'Бонус по категории',
}
const STATUS_LABELS: Record<CampaignStatus, string> = {
  DRAFT: 'Черновик', ACTIVE: 'Активна', PAUSED: 'На паузе', ARCHIVED: 'Архив',
}
const SCOPE_LABELS: Record<LoyaltyScope, string> = {
  RESTAURANT: 'Ресторан',
  TARIFF: 'Тарифы / Брони',
}

function defaultRulesForScope(scope: LoyaltyScope): string {
  return JSON.stringify({ percent: 5, scope })
}

export default function LoyaltyCampaigns() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [page, setPage] = useState(0)
  const [totalPages, setTotalPages] = useState(0)
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [scope, setScope] = useState<LoyaltyScope>('RESTAURANT')
  const [form, setForm] = useState<CreateCampaignRequest>({ name: '', campaignType: 'CASHBACK', rules: defaultRulesForScope('RESTAURANT') })
  const [error, setError] = useState('')
  const [listError, setListError] = useState('')

  useEffect(() => { loadCampaigns() }, [page, scope])

  const loadCampaigns = async () => {
    setLoading(true)
    setListError('')
    try {
      const data: Page<Campaign> = await loyaltyCampaignApi.getAll(page, 20, scope)
      setCampaigns(data.content)
      setTotalPages(data.totalPages)
    } catch (e: any) {
      console.error(e)
      setListError(e.response?.data?.message || 'Не удалось загрузить акции')
    } finally {
      setLoading(false)
    }
  }

  const handleScopeChange = (newScope: LoyaltyScope) => {
    setScope(newScope)
    setPage(0)
  }

  const handleCreate = async () => {
    setError('')
    try {
      let rules = form.rules || '{}'
      try {
        const parsed = JSON.parse(rules)
        parsed.scope = scope
        rules = JSON.stringify(parsed)
      } catch {
        rules = JSON.stringify({ scope })
      }
      await loyaltyCampaignApi.create({ ...form, rules })
      setShowCreate(false)
      setForm({ name: '', campaignType: 'CASHBACK', rules: defaultRulesForScope(scope) })
      loadCampaigns()
    } catch (e: any) {
      setError(e.response?.data?.message || 'Ошибка')
    }
  }

  const handleStatusChange = async (id: number, status: CampaignStatus) => {
    try {
      await loyaltyCampaignApi.changeStatus(id, status)
      loadCampaigns()
    } catch (e: any) {
      alert(e.response?.data?.message || 'Ошибка')
    }
  }

  const handleDelete = async (id: number) => {
    if (!confirm('Удалить акцию?')) return
    try {
      await loyaltyCampaignApi.delete(id)
      loadCampaigns()
    } catch (e: any) {
      alert(e.response?.data?.message || 'Не удалось удалить акцию')
    }
  }

  return (
    <div className="loyalty-page">
      <div className="loyalty-header">
        <h1>Акции и программы лояльности</h1>
        <button className="btn btn-primary" onClick={() => {
          setForm({ name: '', campaignType: 'CASHBACK', rules: defaultRulesForScope(scope) })
          setShowCreate(true)
        }}>+ Новая акция</button>
      </div>

      <div className="loyalty-scope-tabs">
        {(Object.keys(SCOPE_LABELS) as LoyaltyScope[]).map(s => (
          <button
            key={s}
            className={`scope-tab ${scope === s ? 'scope-tab-active' : ''}`}
            onClick={() => handleScopeChange(s)}
          >
            {SCOPE_LABELS[s]}
          </button>
        ))}
      </div>

      {listError && <div className="error-message">{listError}</div>}

      {loading ? <p>Загрузка...</p> : campaigns.length === 0 ? (
        <p className="empty-message">Нет акций для контекста «{SCOPE_LABELS[scope]}»</p>
      ) : (
        <table className="loyalty-table">
          <thead>
            <tr>
              <th>Название</th>
              <th>Тип</th>
              <th>Статус</th>
              <th>Приоритет</th>
              <th>Правила</th>
              <th>Действия</th>
            </tr>
          </thead>
          <tbody>
            {campaigns.map(c => (
              <tr key={c.id}>
                <td>{c.name}</td>
                <td><span className="badge">{CAMPAIGN_TYPE_LABELS[c.campaignType] || c.campaignType}</span></td>
                <td><span className={`badge badge-status-${c.status.toLowerCase()}`}>{STATUS_LABELS[c.status]}</span></td>
                <td>{c.priority}</td>
                <td className="rules-cell"><code>{c.rules}</code></td>
                <td>
                  <div className="action-buttons">
                    {c.status === 'DRAFT' && <button className="btn btn-sm btn-success" onClick={() => handleStatusChange(c.id, 'ACTIVE')}>Запустить</button>}
                    {c.status === 'ACTIVE' && <button className="btn btn-sm btn-warning" onClick={() => handleStatusChange(c.id, 'PAUSED')}>Пауза</button>}
                    {c.status === 'PAUSED' && <button className="btn btn-sm btn-success" onClick={() => handleStatusChange(c.id, 'ACTIVE')}>Возобновить</button>}
                    {c.status !== 'ARCHIVED' && <button className="btn btn-sm btn-secondary" onClick={() => handleStatusChange(c.id, 'ARCHIVED')}>Архив</button>}
                    <button className="btn btn-sm btn-danger" onClick={() => handleDelete(c.id)}>Удалить</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {totalPages > 1 && (
        <div className="loyalty-pagination">
          <button disabled={page === 0} onClick={() => setPage(p => p - 1)}>← Назад</button>
          <span>Стр. {page + 1} из {totalPages}</span>
          <button disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>Вперёд →</button>
        </div>
      )}

      {showCreate && (
        <div className="modal-overlay" onClick={() => setShowCreate(false)}>
          <div className="modal-content modal-wide" onClick={e => e.stopPropagation()}>
            <h2>Новая акция ({SCOPE_LABELS[scope]})</h2>
            {error && <div className="error-message">{error}</div>}
            <div className="form-group">
              <label>Название *</label>
              <input type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Тип *</label>
              <select value={form.campaignType} onChange={e => setForm({ ...form, campaignType: e.target.value as CampaignType })}>
                {CAMPAIGN_TYPES.map(t => <option key={t} value={t}>{CAMPAIGN_TYPE_LABELS[t]}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Правила (JSON)</label>
              <textarea rows={4} value={form.rules || ''} onChange={e => setForm({ ...form, rules: e.target.value })} placeholder='{"percent": 5}' />
            </div>
            <div className="form-group">
              <label>Расписание (JSON)</label>
              <textarea rows={2} value={form.schedule || ''} onChange={e => setForm({ ...form, schedule: e.target.value })} placeholder='{}' />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Приоритет</label>
                <input type="number" value={form.priority ?? 0} onChange={e => setForm({ ...form, priority: parseInt(e.target.value) })} />
              </div>
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
