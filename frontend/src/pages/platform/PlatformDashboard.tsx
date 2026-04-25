import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { platformService } from '../../api/services'
import { retryOnRateLimit } from '../../utils/apiRetry'
import { getCache, setCache } from '../../utils/cache'
import type { Restaurant } from '../../api/types'
import './PlatformDashboard.css'

const PLATFORM_DASHBOARD_CACHE_KEY = 'platform_dashboard_cache'

export default function PlatformDashboard() {
  const navigate = useNavigate()
  const cachedData = getCache<Restaurant[]>(PLATFORM_DASHBOARD_CACHE_KEY)
  const [restaurants, setRestaurants] = useState<Restaurant[]>(cachedData || [])
  const [loading, setLoading] = useState(!cachedData)

  useEffect(() => {
    if (cachedData) {
      const timeoutId = setTimeout(() => {
        loadData(true)
      }, 200)
      return () => clearTimeout(timeoutId)
    } else {
      loadData(false)
    }
  }, [])

  const loadData = async (isBackground = false) => {
    if (!isBackground) {
      setLoading(true)
    }
    try {
      const data = await retryOnRateLimit(
        () => platformService.getRestaurants(undefined, 0, 5),
        1,
        200
      )
      setRestaurants(data.content)
      setCache(PLATFORM_DASHBOARD_CACHE_KEY, data.content)
    } catch (error) {
      console.error('Failed to load data:', error)
      if (!isBackground) {
        setRestaurants([])
      }
    } finally {
      if (!isBackground) {
        setLoading(false)
      }
    }
  }

  if (loading) return <div>Loading...</div>

  return (
    <div className="platform-dashboard">
      <h1>Platform Dashboard</h1>
      <div className="dashboard-cards">
        <div className="card" onClick={() => navigate('/platform/restaurants')}>
          <h3>Total Restaurants</h3>
          <p className="card-value">{restaurants.length}</p>
        </div>
      </div>
      <div className="recent-section">
        <h2>Recent Restaurants</h2>
        {restaurants.length === 0 ? (
          <p>No restaurants yet</p>
        ) : (
          <ul>
            {restaurants.map((r) => (
              <li key={r.id} onClick={() => navigate(`/platform/restaurants/${r.id}`)}>
                {r.name}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
