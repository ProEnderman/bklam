import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { platformService } from '../../api/services'
import { ensureCsrfPrimed } from '../../api/client'
import { retryOnRateLimit } from '../../utils/apiRetry'
import { getCache, setCache } from '../../utils/cache'
import type { Restaurant } from '../../api/types'
import DataTable from '../../components/DataTable'
import Modal from '../../components/Modal'
import FormInput from '../../components/FormInput'
import SearchBar from '../../components/SearchBar'
import './RestaurantsList.css'

const RESTAURANTS_LIST_CACHE_KEY = 'restaurants_list_cache'

export default function RestaurantsList() {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [formData, setFormData] = useState({ name: '', telegramBotToken: '' })
  
  // Initialize with cached data if available (after state is defined)
  const cacheKey = `${RESTAURANTS_LIST_CACHE_KEY}_${search}`
  const cachedData = getCache<Restaurant[]>(cacheKey)
  const [restaurants, setRestaurants] = useState<Restaurant[]>(cachedData || [])
  const [loading, setLoading] = useState(!cachedData)

  useEffect(() => {
    const currentCacheKey = `${RESTAURANTS_LIST_CACHE_KEY}_${search}`
    const cached = getCache<Restaurant[]>(currentCacheKey)
    
    if (cached) {
      setRestaurants(cached)
      setLoading(false)
      const timeoutId = setTimeout(() => {
        loadRestaurants(true)
      }, 200)
      return () => clearTimeout(timeoutId)
    } else {
      loadRestaurants(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search])

  const loadRestaurants = async (isBackground = false) => {
    if (!isBackground) {
      setLoading(true)
    }
    try {
      const data = await retryOnRateLimit(
        () => platformService.getRestaurants(search || undefined),
        1,
        200
      )
      setRestaurants(data.content)
      const currentCacheKey = `${RESTAURANTS_LIST_CACHE_KEY}_${search}`
      setCache(currentCacheKey, data.content)
    } catch (error) {
      console.error('Failed to load restaurants:', error)
      if (!isBackground) {
        setRestaurants([])
      }
    } finally {
      if (!isBackground) {
        setLoading(false)
      }
    }
  }

  const handleDelete = async (item: Restaurant, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!window.confirm(`Delete restaurant "${item.name}"? This cannot be undone.`)) return
    try {
      await platformService.deleteRestaurant(item.id)
      loadRestaurants()
    } catch (error: any) {
      alert(error.response?.data?.message || 'Failed to delete restaurant')
    }
  }

  const handleCreate = async () => {
    try {
      await ensureCsrfPrimed()
      await new Promise((r) => setTimeout(r, 50))
      await platformService.createRestaurant(formData)
      setShowCreateModal(false)
      setFormData({ name: '', telegramBotToken: '' })
      loadRestaurants()
    } catch (error: any) {
      alert(error.response?.data?.message || 'Failed to create restaurant')
    }
  }

  const columns = [
    { key: 'id', header: 'ID' },
    { key: 'name', header: 'Name' },
    {
      key: 'createdAt',
      header: 'Created At',
      render: (item: Restaurant) => new Date(item.createdAt).toLocaleDateString(),
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (item: Restaurant) => (
        <>
          <button
            className="btn-small btn-primary"
            onClick={() => navigate(`/platform/restaurants/${item.id}`)}
          >
            Open
          </button>
          <button
            type="button"
            className="btn-small"
            style={{ marginLeft: 8, background: '#dc3545', color: '#fff', border: 'none' }}
            onClick={(e) => handleDelete(item, e)}
          >
            Delete
          </button>
        </>
      ),
    },
  ]

  return (
    <div className="restaurants-list">
      <div className="page-header">
        <h1>Restaurants</h1>
        <button
          className="btn-primary"
          onClick={() => {
            ensureCsrfPrimed() // prime CSRF as soon as modal is opened so first submit has token
            setShowCreateModal(true)
          }}
        >
          Create Restaurant
        </button>
      </div>

      <SearchBar value={search} onChange={setSearch} placeholder="Search restaurants..." />

      <DataTable
        data={restaurants}
        columns={columns}
        loading={loading}
        emptyMessage="No restaurants yet"
        onRowClick={(r) => navigate(`/platform/restaurants/${r.id}`)}
      />

      <Modal
        isOpen={showCreateModal}
        onClose={() => {
          setShowCreateModal(false)
          setFormData({ name: '', telegramBotToken: '' })
        }}
        title="Create Restaurant"
      >
        <FormInput
          label="Restaurant Name"
          value={formData.name}
          onChange={(v) => setFormData(prev => ({ ...prev, name: v }))}
          required
        />
        <FormInput
          label="Telegram Bot Token (optional)"
          value={formData.telegramBotToken}
          onChange={(v) => setFormData(prev => ({ ...prev, telegramBotToken: v }))}
          placeholder="123456789:AA..."
        />
        <div className="modal-actions">
          <button className="btn-secondary" onClick={() => setShowCreateModal(false)}>
            Cancel
          </button>
          <button className="btn-primary" onClick={handleCreate}>
            Create
          </button>
        </div>
      </Modal>
    </div>
  )
}
