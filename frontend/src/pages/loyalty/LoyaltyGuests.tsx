import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { loyaltyGuestApi } from '../../api/loyaltyService'
import type { LoyaltyGuest, Page } from '../../api/loyaltyTypes'
import './Loyalty.css'

export default function LoyaltyGuests() {
  const navigate = useNavigate()
  const [guests, setGuests] = useState<LoyaltyGuest[]>([])
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(0)
  const [totalPages, setTotalPages] = useState(0)
  const [totalElements, setTotalElements] = useState(0)
  const [loading, setLoading] = useState(true)

  // Create guest modal
  const [showCreate, setShowCreate] = useState(false)
  const [newGuest, setNewGuest] = useState({ phone: '', name: '', email: '', birthday: '' })
  const [createError, setCreateError] = useState('')

  const loadGuests = useCallback(async () => {
    setLoading(true)
    try {
      const data: Page<LoyaltyGuest> = await loyaltyGuestApi.search(query || undefined, page, 20)
      setGuests(data.content)
      setTotalPages(data.totalPages)
      setTotalElements(data.totalElements)
    } catch (e) {
      console.error('Failed to load guests', e)
    } finally {
      setLoading(false)
    }
  }, [query, page])

  useEffect(() => { loadGuests() }, [loadGuests])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    setPage(0)
  }

  const handleCreate = async () => {
    setCreateError('')
    try {
      await loyaltyGuestApi.create({
        phone: newGuest.phone,
        name: newGuest.name || undefined,
        email: newGuest.email || undefined,
        birthday: newGuest.birthday || undefined,
      })
      setShowCreate(false)
      setNewGuest({ phone: '', name: '', email: '', birthday: '' })
      loadGuests()
    } catch (e: any) {
      setCreateError(e.response?.data?.message || 'Ошибка создания гостя')
    }
  }

  return (
    <div className="loyalty-page">
      <div className="loyalty-header">
        <h1>База гостей</h1>
        <button className="btn btn-primary" onClick={() => setShowCreate(true)}>+ Новый гость</button>
      </div>

      <form onSubmit={handleSearch} className="loyalty-search-bar">
        <input
          type="text"
          placeholder="Поиск по телефону, имени или email..."
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
        <button type="submit" className="btn btn-secondary">Найти</button>
      </form>

      <div className="loyalty-count">Всего: {totalElements}</div>

      {loading ? (
        <p>Загрузка...</p>
      ) : guests.length === 0 ? (
        <p className="empty-message">Гости не найдены</p>
      ) : (
        <table className="loyalty-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Телефон</th>
              <th>Имя</th>
              <th>Email</th>
              <th>День рождения</th>
              <th>Дата регистрации</th>
            </tr>
          </thead>
          <tbody>
            {guests.map(g => (
              <tr key={g.id} className="clickable-row" onClick={() => navigate(`/loyalty/guests/${g.id}`)}>
                <td>{g.id}</td>
                <td>{g.phoneNormalized}</td>
                <td>{g.name || '—'}</td>
                <td>{g.email || '—'}</td>
                <td>{g.birthday || '—'}</td>
                <td>{new Date(g.createdAt).toLocaleDateString()}</td>
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

      {/* Create Guest Modal */}
      {showCreate && (
        <div className="modal-overlay" onClick={() => setShowCreate(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h2>Новый гость</h2>
            {createError && <div className="error-message">{createError}</div>}
            <div className="form-group">
              <label>Телефон *</label>
              <input type="text" value={newGuest.phone} onChange={e => setNewGuest({ ...newGuest, phone: e.target.value })} placeholder="+79991234567" />
            </div>
            <div className="form-group">
              <label>Имя</label>
              <input type="text" value={newGuest.name} onChange={e => setNewGuest({ ...newGuest, name: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Email</label>
              <input type="email" value={newGuest.email} onChange={e => setNewGuest({ ...newGuest, email: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Дата рождения</label>
              <input type="date" value={newGuest.birthday} onChange={e => setNewGuest({ ...newGuest, birthday: e.target.value })} />
            </div>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setShowCreate(false)}>Отмена</button>
              <button className="btn btn-primary" onClick={handleCreate} disabled={!newGuest.phone}>Создать</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
