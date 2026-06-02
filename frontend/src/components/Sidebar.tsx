import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import type { User } from '../api/types'
import './Sidebar.css'

interface SidebarProps {
  user: User
  showPlatformNav: boolean
  showRestaurantNav: boolean
}

export default function Sidebar({ user, showPlatformNav, showRestaurantNav }: SidebarProps) {
  const isHeadAdmin = user.role === 'HEAD_ADMIN'
  const isAdmin = user.role === 'ADMIN'
  const isWorker = user.role === 'REGULAR_WORKER'

  // All sections collapsed by default; user opens them manually
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    platform: false,
    restaurant: false,
    tariffs: false,
    management: false,
  })

  const toggleSection = (section: string) => {
    setOpenSections(prev => ({ ...prev, [section]: !prev[section] }))
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <NavLink to="/home" style={{ textDecoration: 'none', color: 'inherit' }}>
          <h2>BKLAM</h2>
        </NavLink>
      </div>
      <nav className="sidebar-nav">
        <NavLink to="/home" end className={({ isActive }) => `nav-home-link ${isActive ? 'active' : ''}`}>
          Главная
        </NavLink>
        {/* ===== Platform (HEAD_ADMIN) ===== */}
        {showPlatformNav && isHeadAdmin && (
          <div className="nav-folder">
            <button
              className={`nav-folder-toggle ${openSections.platform ? 'open' : ''}`}
              onClick={() => toggleSection('platform')}
            >
              <span className="nav-folder-icon">{openSections.platform ? '▾' : '▸'}</span>
              Платформа
            </button>
            {openSections.platform && (
              <div className="nav-folder-content">
                <NavLink to="/platform" end className={({ isActive }) => (isActive ? 'active' : '')}>
                  Dashboard
                </NavLink>
                <NavLink to="/platform/restaurants" className={({ isActive }) => (isActive ? 'active' : '')}>
                  Рестораны
                </NavLink>
                <NavLink to="/platform/activity-log" className={({ isActive }) => (isActive ? 'active' : '')}>
                  Лог активности
                </NavLink>
              </div>
            )}
          </div>
        )}

        {/* ===== Restaurant section ===== */}
        {showRestaurantNav && (
          <>
            <div className="nav-folder">
              <button
                className={`nav-folder-toggle ${openSections.restaurant ? 'open' : ''}`}
                onClick={() => toggleSection('restaurant')}
              >
                <span className="nav-folder-icon">{openSections.restaurant ? '▾' : '▸'}</span>
                Ресторан
              </button>
              {openSections.restaurant && (
                <div className="nav-folder-content">
                  {isAdmin && (
                    <>
                      <NavLink to="/ingredients" className={({ isActive }) => (isActive ? 'active' : '')}>
                        Ингредиенты
                      </NavLink>
                      <NavLink to="/stock-movements" className={({ isActive }) => (isActive ? 'active' : '')}>
                        Движения склада
                      </NavLink>
                    </>
                  )}
                  {isWorker && (
                    <NavLink to="/ingredients" className={({ isActive }) => (isActive ? 'active' : '')}>
                      Ингредиенты
                    </NavLink>
                  )}
                  {isAdmin && (
                    <NavLink to="/menu" className={({ isActive }) => (isActive ? 'active' : '')}>
                      Меню
                    </NavLink>
                  )}
                  <NavLink to="/orders/new" className={({ isActive }) => (isActive ? 'active' : '')}>
                    Новый заказ
                  </NavLink>
                  <NavLink to="/orders" className={({ isActive }) => (isActive ? 'active' : '')}>
                    Заказы
                  </NavLink>
                  <NavLink to="/hall" className={({ isActive }) => (isActive ? 'active' : '')}>
                    Карта зала
                  </NavLink>
                  {isAdmin && (
                    <NavLink to="/hall/editor" className={({ isActive }) => (isActive ? 'active' : '')}>
                      Редактор зала
                    </NavLink>
                  )}
                  <NavLink to="/table-reservations" className={({ isActive }) => (isActive ? 'active' : '')}>
                    Бронирование столиков
                  </NavLink>
                  <NavLink to="/table-reservation-calendar" className={({ isActive }) => (isActive ? 'active' : '')}>
                    Календарь столиков
                  </NavLink>
                  {isAdmin && (
                    <>
                      <NavLink to="/analytics" className={({ isActive }) => (isActive ? 'active' : '')}>
                        Аналитика
                      </NavLink>
                      <NavLink to="/data-export" className={({ isActive }) => (isActive ? 'active' : '')}>
                        Экспорт данных
                      </NavLink>
                      <NavLink to="/qr-menu-config" className={({ isActive }) => (isActive ? 'active' : '')}>
                        QR-меню
                      </NavLink>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* ===== Tariffs & bookings section ===== */}
            {isAdmin && (
              <div className="nav-folder">
                <button
                  className={`nav-folder-toggle ${openSections.tariffs ? 'open' : ''}`}
                  onClick={() => toggleSection('tariffs')}
                >
                  <span className="nav-folder-icon">{openSections.tariffs ? '▾' : '▸'}</span>
                  Тарифы и бронирования
                </button>
                {openSections.tariffs && (
                  <div className="nav-folder-content">
                    <NavLink to="/tariffs" className={({ isActive }) => (isActive ? 'active' : '')}>
                      Тарифы
                    </NavLink>
                    <NavLink to="/calendar" className={({ isActive }) => (isActive ? 'active' : '')}>
                      Календарь
                    </NavLink>
                    <NavLink to="/booking-orders/new" className={({ isActive }) => (isActive ? 'active' : '')}>
                      Новый заказ
                    </NavLink>
                    <NavLink to="/booking-orders" className={({ isActive }) => (isActive ? 'active' : '')}>
                      Заказы
                    </NavLink>
                    <NavLink to="/booking-analytics" className={({ isActive }) => (isActive ? 'active' : '')}>
                      📊 Аналитика бронирований
                    </NavLink>
                    <NavLink to="/activities" className={({ isActive }) => (isActive ? 'active' : '')}>
                      Мероприятия
                    </NavLink>
                    <NavLink to="/bookings" className={({ isActive }) => (isActive ? 'active' : '')}>
                      Бронирования
                    </NavLink>
                    <NavLink to="/booking-calendar" className={({ isActive }) => (isActive ? 'active' : '')}>
                      Календарь занятости
                    </NavLink>
                  </div>
                )}
              </div>
            )}

            {/* ===== Management section ===== */}
            {isAdmin && (
              <div className="nav-folder">
                <button
                  className={`nav-folder-toggle ${openSections.management ? 'open' : ''}`}
                  onClick={() => toggleSection('management')}
                >
                  <span className="nav-folder-icon">{openSections.management ? '▾' : '▸'}</span>
                  Управление
                </button>
                {openSections.management && (
                  <div className="nav-folder-content">
                    <NavLink to="/activity-log" className={({ isActive }) => (isActive ? 'active' : '')}>
                      Лог активности
                    </NavLink>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        <div className="nav-section-divider" />
        <NavLink to="/profile" className={({ isActive }) => (isActive ? 'active' : '')}>
          Профиль
        </NavLink>
      </nav>
    </aside>
  )
}
