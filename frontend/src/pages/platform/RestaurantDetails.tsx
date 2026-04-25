import { useParams, useNavigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { platformService } from '../../api/services'
import type { Restaurant } from '../../api/types'

export default function RestaurantDetails() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null)
  const [name, setName] = useState('')
  const [telegramBotToken, setTelegramBotToken] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (id) {
      loadRestaurant(parseInt(id))
    }
  }, [id])

  const loadRestaurant = async (restaurantId: number) => {
    try {
      const data = await platformService.getRestaurant(restaurantId)
      setRestaurant(data)
      setName(data.name)
      setTelegramBotToken('')
    } catch (error) {
      console.error('Failed to load restaurant:', error)
    }
  }

  const handleSave = async () => {
    if (!restaurant) return
    try {
      setSaving(true)
      setMessage('')
      const trimmedToken = telegramBotToken.trim()
      await platformService.updateRestaurant(restaurant.id, {
        name: name.trim(),
        telegramBotToken: trimmedToken ? trimmedToken : undefined,
      })
      await loadRestaurant(restaurant.id)
      setMessage('Saved')
    } catch (error: any) {
      setMessage(error?.response?.data?.error || error?.response?.data?.message || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!restaurant) return
    const confirmed = window.confirm(
      `Permanently delete restaurant "${restaurant.name}"? All related data will be removed. This cannot be undone.`
    )
    if (!confirmed) return
    try {
      await platformService.deleteRestaurant(restaurant.id)
      navigate('/platform/restaurants')
    } catch (error: any) {
      setMessage(error?.response?.data?.message || 'Failed to delete restaurant')
    }
  }

  const handleClearToken = async () => {
    if (!restaurant) return
    if (!window.confirm('Clear Telegram bot token for this restaurant?')) return
    try {
      setSaving(true)
      setMessage('')
      await platformService.updateRestaurant(restaurant.id, {
        name: name.trim(),
        telegramBotToken: '',
      })
      await loadRestaurant(restaurant.id)
      setMessage('Telegram token cleared')
    } catch (error: any) {
      setMessage(error?.response?.data?.error || error?.response?.data?.message || 'Failed to clear token')
    } finally {
      setSaving(false)
    }
  }

  if (!restaurant) return <div>Loading...</div>

  return (
    <div style={{ padding: '20px' }}>
      <button className="btn-secondary" onClick={() => navigate('/platform/restaurants')}>
        ← Back
      </button>
      <h1>{restaurant.name}</h1>
      <p>Created: {new Date(restaurant.createdAt).toLocaleDateString()}</p>
      <p>Telegram bot token: {restaurant.hasTelegramBotToken ? 'configured' : 'not configured'}</p>

      <div style={{ margin: '16px 0', maxWidth: 520 }}>
        <label style={{ display: 'block', marginBottom: 6 }}>Restaurant Name</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={{ width: '100%', padding: 10, marginBottom: 12 }}
        />

        <label style={{ display: 'block', marginBottom: 6 }}>Telegram Bot Token</label>
        <input
          value={telegramBotToken}
          onChange={(e) => setTelegramBotToken(e.target.value)}
          placeholder="Leave empty to clear token"
          style={{ width: '100%', padding: 10, marginBottom: 12 }}
        />

        <button className="btn-primary" onClick={handleSave} disabled={saving || !name.trim()}>
          {saving ? 'Saving...' : 'Save restaurant settings'}
        </button>
        <button
          className="btn-secondary"
          onClick={handleClearToken}
          disabled={saving}
          style={{ marginLeft: 8 }}
        >
          Clear token
        </button>
        {message && <p style={{ marginTop: 10 }}>{message}</p>}
      </div>

      <button
        className="btn-primary"
        onClick={() => navigate(`/platform/restaurants/${id}/admins`)}
      >
        Manage Admins
      </button>

      <div style={{ marginTop: 32, paddingTop: 16, borderTop: '1px solid #eee' }}>
        <button
          type="button"
          className="btn-secondary"
          onClick={handleDelete}
          style={{ background: '#dc3545', color: '#fff', border: 'none' }}
        >
          Delete restaurant
        </button>
      </div>
    </div>
  )
}
