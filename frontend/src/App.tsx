import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import AuthProvider from './components/AuthProvider'
import Layout from './components/Layout'
import ProtectedRoute from './components/ProtectedRoute'
import Login from './pages/Login'
import RootRedirect from './components/RootRedirect'

// Platform pages (HEAD_ADMIN)
import PlatformDashboard from './pages/platform/PlatformDashboard'
import RestaurantsList from './pages/platform/RestaurantsList'
import RestaurantDetails from './pages/platform/RestaurantDetails'
import RestaurantAdmins from './pages/platform/RestaurantAdmins'
import PlatformActivityLog from './pages/platform/PlatformActivityLog'

// Restaurant pages (ADMIN/WORKER)
import Ingredients from './pages/restaurant/Ingredients'
import StockMovements from './pages/restaurant/StockMovements'
import Menu from './pages/restaurant/Menu'
import NewOrder from './pages/restaurant/NewOrder'
import OrdersHistory from './pages/restaurant/OrdersHistory'
import OrderDetails from './pages/restaurant/OrderDetails'
import Analytics from './pages/restaurant/Analytics'
import DataExport from './pages/restaurant/DataExport'
import HallMapPage from './pages/restaurant/HallMap'
import HallEditor from './pages/restaurant/HallEditor'
import TableReservations from './pages/restaurant/TableReservations'
import TableReservationCalendar from './pages/restaurant/TableReservationCalendar'

// Tariff & booking pages
import Tariffs from './pages/tariffs/Tariffs'
import TariffRules from './pages/tariffs/TariffRules'
import CalendarPage from './pages/tariffs/Calendar'
import NewBookingOrder from './pages/tariffs/NewBookingOrder'
import BookingOrders from './pages/tariffs/BookingOrders'
import BookingAnalytics from './pages/tariffs/BookingAnalytics'
import Activities from './pages/tariffs/Activities'
import Bookings from './pages/tariffs/Bookings'
import BookingCalendar from './pages/tariffs/BookingCalendar'
import Shifts from './pages/tariffs/Shifts'

// Loyalty pages
import LoyaltyDashboard from './pages/loyalty/LoyaltyDashboard'
import LoyaltyGuests from './pages/loyalty/LoyaltyGuests'
import GuestProfile from './pages/loyalty/GuestProfile'
import LoyaltyCampaigns from './pages/loyalty/LoyaltyCampaigns'
import LoyaltyTiers from './pages/loyalty/LoyaltyTiers'
import LoyaltyGamification from './pages/loyalty/LoyaltyGamification'
import LoyaltySegments from './pages/loyalty/LoyaltySegments'

// Welcome page
import Welcome from './pages/Welcome'

// Standalone pages
import ActivityLog from './pages/ActivityLog'
import Users from './pages/Users'
import Profile from './pages/Profile'
import NotFound from './pages/NotFound'
import Forbidden from './pages/Forbidden'

// Public feature pages (no auth)
import QrMenu from './pages/QrMenu'
import TelegramShop from './pages/TelegramShop'
import QrMenuConfig from './pages/QrMenuConfig'

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
      <Routes>
        {/* Public routes */}
        <Route path="/login" element={<Login />} />
        <Route path="/403" element={<Forbidden />} />
        <Route path="/qr" element={<QrMenu />} />
        <Route path="/telegram" element={<TelegramShop />} />

        {/* Root path - redirect based on auth status */}
        <Route path="/" element={<RootRedirect />} />

        {/* Protected routes with Layout */}
        <Route
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          {/* Platform routes (HEAD_ADMIN only) */}
          <Route
            path="platform"
            element={
              <ProtectedRoute allowedRoles={['HEAD_ADMIN']}>
                <PlatformDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="platform/restaurants"
            element={
              <ProtectedRoute allowedRoles={['HEAD_ADMIN']}>
                <RestaurantsList />
              </ProtectedRoute>
            }
          />
          <Route
            path="platform/restaurants/:id"
            element={
              <ProtectedRoute allowedRoles={['HEAD_ADMIN']}>
                <RestaurantDetails />
              </ProtectedRoute>
            }
          />
          <Route
            path="platform/restaurants/:id/admins"
            element={
              <ProtectedRoute allowedRoles={['HEAD_ADMIN']}>
                <RestaurantAdmins />
              </ProtectedRoute>
            }
          />
          <Route
            path="platform/activity-log"
            element={
              <ProtectedRoute allowedRoles={['HEAD_ADMIN']}>
                <PlatformActivityLog />
              </ProtectedRoute>
            }
          />

          {/* Welcome / Home */}
            <Route path="home" element={<Welcome />} />
            <Route path="dashboard" element={<Navigate to="/home" replace />} />
            <Route path="ingredients" element={<Ingredients />} />
            <Route path="stock-movements" element={<StockMovements />} />
            <Route path="menu" element={<Menu />} />
            <Route path="orders/new" element={<NewOrder />} />
            <Route path="orders" element={<OrdersHistory />} />
            <Route path="orders/:id" element={<OrderDetails />} />
            <Route path="hall" element={<HallMapPage />} />
          <Route
            path="hall/editor"
            element={
              <ProtectedRoute allowedRoles={['ADMIN']}>
                <HallEditor />
              </ProtectedRoute>
            }
          />
          <Route path="table-reservations" element={<TableReservations />} />
          <Route path="table-reservation-calendar" element={<TableReservationCalendar />} />
          <Route
            path="analytics"
            element={
              <ProtectedRoute allowedRoles={['ADMIN']}>
                <Analytics />
              </ProtectedRoute>
            }
          />
          <Route
            path="data-export"
            element={
              <ProtectedRoute allowedRoles={['ADMIN']}>
                <DataExport />
              </ProtectedRoute>
            }
          />
          <Route
            path="qr-menu-config"
            element={
              <ProtectedRoute allowedRoles={['ADMIN']}>
                <QrMenuConfig />
              </ProtectedRoute>
            }
          />
          <Route
            path="booking-analytics"
            element={
              <ProtectedRoute allowedRoles={['ADMIN']}>
                <BookingAnalytics />
              </ProtectedRoute>
            }
          />
          <Route
            path="tariffs"
            element={
              <ProtectedRoute allowedRoles={['ADMIN']}>
                <Tariffs />
              </ProtectedRoute>
            }
          />
          <Route
            path="tariffs/:planId/rules"
            element={
              <ProtectedRoute allowedRoles={['ADMIN']}>
                <TariffRules />
              </ProtectedRoute>
            }
          />
          <Route
            path="calendar"
            element={
              <ProtectedRoute allowedRoles={['ADMIN']}>
                <CalendarPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="booking-orders/new"
            element={
              <ProtectedRoute allowedRoles={['ADMIN']}>
                <NewBookingOrder />
              </ProtectedRoute>
            }
          />
          <Route
            path="booking-orders"
            element={
              <ProtectedRoute allowedRoles={['ADMIN']}>
                <BookingOrders />
              </ProtectedRoute>
            }
          />
          <Route
            path="shifts"
            element={
              <ProtectedRoute allowedRoles={['ADMIN']}>
                <Shifts />
              </ProtectedRoute>
            }
          />
          <Route
            path="activities"
            element={
              <ProtectedRoute allowedRoles={['ADMIN']}>
                <Activities />
              </ProtectedRoute>
            }
          />
          <Route
            path="bookings"
            element={
              <ProtectedRoute allowedRoles={['ADMIN']}>
                <Bookings />
              </ProtectedRoute>
            }
          />
          <Route
            path="booking-calendar"
            element={
              <ProtectedRoute allowedRoles={['ADMIN']}>
                <BookingCalendar />
              </ProtectedRoute>
            }
          />
          {/* Loyalty routes */}
          <Route
            path="loyalty"
            element={
              <ProtectedRoute allowedRoles={['ADMIN']}>
                <LoyaltyDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="loyalty/guests"
            element={
              <ProtectedRoute allowedRoles={['ADMIN']}>
                <LoyaltyGuests />
              </ProtectedRoute>
            }
          />
          <Route
            path="loyalty/guests/:id"
            element={
              <ProtectedRoute allowedRoles={['ADMIN']}>
                <GuestProfile />
              </ProtectedRoute>
            }
          />
          <Route
            path="loyalty/campaigns"
            element={
              <ProtectedRoute allowedRoles={['ADMIN']}>
                <LoyaltyCampaigns />
              </ProtectedRoute>
            }
          />
          <Route
            path="loyalty/tiers"
            element={
              <ProtectedRoute allowedRoles={['ADMIN']}>
                <LoyaltyTiers />
              </ProtectedRoute>
            }
          />
          <Route
            path="loyalty/gamification"
            element={
              <ProtectedRoute allowedRoles={['ADMIN']}>
                <LoyaltyGamification />
              </ProtectedRoute>
            }
          />
          <Route
            path="loyalty/segments"
            element={
              <ProtectedRoute allowedRoles={['ADMIN']}>
                <LoyaltySegments />
              </ProtectedRoute>
            }
          />

          <Route
            path="activity-log"
            element={
              <ProtectedRoute allowedRoles={['ADMIN']}>
                <ActivityLog />
              </ProtectedRoute>
            }
          />
          <Route
            path="users"
            element={
              <ProtectedRoute allowedRoles={['ADMIN']}>
                <Users />
              </ProtectedRoute>
            }
          />
          <Route path="profile" element={<Profile />} />
        </Route>

        {/* 404 */}
        <Route path="*" element={<NotFound />} />
      </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
