import { useNavigate, useOutletContext } from 'react-router-dom'
import type { User } from '../api/types'

const QUICK_LINKS_ADMIN = [
  { label: 'Аналитика', desc: 'Decision Dashboard', path: '/booking-analytics', icon: '📊' },
  { label: 'Бронирования', desc: 'Список заказов', path: '/booking-orders', icon: '📋' },
  { label: 'Новая бронь', desc: 'Создать заказ', path: '/booking-orders/new', icon: '➕' },
  { label: 'Тарифы', desc: 'Планы и правила', path: '/tariffs', icon: '🏷' },
  { label: 'Заказы ресторана', desc: 'Текущие заказы', path: '/orders', icon: '🍽' },
  { label: 'Карта зала', desc: 'Схема столов', path: '/hall', icon: '🗺' },
  { label: 'Лояльность', desc: 'Программа и гости', path: '/loyalty', icon: '💎' },
  { label: 'Смены', desc: 'График сотрудников', path: '/shifts', icon: '🕐' },
]

const QUICK_LINKS_WORKER = [
  { label: 'Заказы', desc: 'Текущие заказы', path: '/orders', icon: '🍽' },
  { label: 'Новый заказ', desc: 'Создать заказ', path: '/orders/new', icon: '➕' },
  { label: 'Карта зала', desc: 'Схема столов', path: '/hall', icon: '🗺' },
  { label: 'Бронирования', desc: 'Календарь броней', path: '/booking-calendar', icon: '📅' },
]

export default function Welcome() {
  const navigate = useNavigate()
  const { user } = useOutletContext<{ user?: User }>()

  const isAdmin = user?.role === 'ADMIN'
  const links = isAdmin ? QUICK_LINKS_ADMIN : QUICK_LINKS_WORKER
  const greeting = getGreeting()

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto', padding: '40px 20px' }}>
      {/* Hero */}
      <div style={{
        textAlign: 'center',
        marginBottom: '48px',
      }}>
        <div style={{
          fontSize: '48px',
          fontWeight: 800,
          letterSpacing: '-0.02em',
          background: 'linear-gradient(135deg, #4f46e5, #7c3aed, #ec4899)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          marginBottom: '8px',
        }}>
          BKLAM
        </div>
        <div style={{
          fontSize: '15px',
          color: '#6b7280',
          fontWeight: 500,
          letterSpacing: '0.05em',
          textTransform: 'uppercase',
          marginBottom: '24px',
        }}>
          Система управления бизнесом
        </div>
        <div style={{
          fontSize: '22px',
          fontWeight: 600,
          color: '#111827',
        }}>
          {greeting}, {user?.firstName || user?.username || 'Пользователь'}
        </div>
        <div style={{
          fontSize: '14px',
          color: '#9ca3af',
          marginTop: '6px',
        }}>
          {new Date().toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </div>
      </div>

      {/* Quick Links Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))',
        gap: '14px',
      }}>
        {links.map(link => (
          <button
            key={link.path}
            onClick={() => navigate(link.path)}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-start',
              padding: '20px',
              background: '#fff',
              border: '1px solid #e5e7eb',
              borderRadius: '14px',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              textAlign: 'left',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.borderColor = '#a5b4fc'
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(79,70,229,0.1)'
              e.currentTarget.style.transform = 'translateY(-2px)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.borderColor = '#e5e7eb'
              e.currentTarget.style.boxShadow = 'none'
              e.currentTarget.style.transform = 'none'
            }}
          >
            <span style={{ fontSize: '28px', marginBottom: '10px' }}>{link.icon}</span>
            <span style={{ fontSize: '15px', fontWeight: 600, color: '#111827' }}>{link.label}</span>
            <span style={{ fontSize: '12px', color: '#9ca3af', marginTop: '3px' }}>{link.desc}</span>
          </button>
        ))}
      </div>

      {/* Footer hint */}
      <div style={{
        textAlign: 'center',
        marginTop: '48px',
        fontSize: '12px',
        color: '#d1d5db',
      }}>
        Используйте боковое меню для навигации по всем разделам
      </div>
    </div>
  )
}

function getGreeting(): string {
  const h = new Date().getHours()
  if (h < 6) return 'Доброй ночи'
  if (h < 12) return 'Доброе утро'
  if (h < 18) return 'Добрый день'
  return 'Добрый вечер'
}
