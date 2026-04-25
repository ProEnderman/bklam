import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { authService } from '../api/services'
import { startTokenRefreshTimer } from '../api/client'
import { useAuth } from '../contexts/AuthContext'
import type { LoginRequest } from '../api/types'
import './Login.css'

export default function Login() {
  const navigate = useNavigate()
  const { user, loading: authLoading } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const [step, setStep] = useState<'request' | 'verify'>(
    searchParams.get('step') === 'verify' ? 'verify' : 'request'
  )
  const [email, setEmail] = useState(searchParams.get('email') || '')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [challengeId, setChallengeId] = useState(searchParams.get('challengeId') || '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [canResend, setCanResend] = useState(false)
  const [attemptsLeft, setAttemptsLeft] = useState<number | null>(null)

  // Redirect if already authenticated (uses AuthContext, no redundant API calls)
  useEffect(() => {
    if (authLoading || step === 'verify') return
    if (user) {
      if (user.role === 'HEAD_ADMIN') {
        navigate('/platform', { replace: true })
      } else {
        navigate('/home', { replace: true })
      }
    }
  }, [user, authLoading, navigate, step])

  const handleRequestCode = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const request: LoginRequest = { email, password }
      const response = await authService.requestCode(request)
      setChallengeId(response.challengeId)
      setStep('verify')
      setSearchParams({ step: 'verify', email })
      setCanResend(false)
      setTimeout(() => setCanResend(true), 60000) // 60 seconds
    } catch (err: any) {
      const isTimeout = err.code === 'ECONNABORTED' || err.message?.includes('timeout')
      const message = isTimeout
        ? 'Request timed out. The server may be sending the email—check your inbox and try again in a minute.'
        : (err.response?.data?.message || 'Failed to request verification code')
      if (message.includes('Invalid') || message.includes('credentials')) {
        setError('Invalid email or password')
      } else if (message.includes('wait') || message.includes('attempts')) {
        setError('Too many attempts, try later')
      } else {
        setError(message)
      }
    } finally {
      setLoading(false)
    }
  }

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    if (code.length !== 6 || !/^\d{6}$/.test(code)) {
      setError('Code must be 6 digits')
      setLoading(false)
      return
    }

    if (!challengeId) {
      setError('Challenge ID is missing. Please request a new code.')
      setLoading(false)
      return
    }

    try {
      console.log('Verifying code with challengeId:', challengeId, 'code:', code)
      const response = await authService.verifyCode({ challengeId, code })
      console.log('Verification successful, response:', response)
      const user = response.user
      console.log('User from response:', user)

      // Небольшая задержка, чтобы убедиться, что cookies установлены
      await new Promise(resolve => setTimeout(resolve, 100))

      // Кешируем пользователя сразу после логина
      try {
        sessionStorage.setItem('auth_user_cache', JSON.stringify(user))
        sessionStorage.setItem('auth_user_cache_timestamp', Date.now().toString())
        console.log('[Login] User cached after successful login')
      } catch (e) {
        console.warn('[Login] Failed to cache user:', e)
      }

      // Запускаем таймер для автоматического обновления токена для автоматического обновления токена
      startTokenRefreshTimer()

      // Отправляем событие для обновления AuthProvider
      // Это безопаснее, чем прямой доступ к window.__authContext
      window.dispatchEvent(new CustomEvent('auth:login-success', { detail: { user } }))

      // Небольшая задержка, чтобы AuthProvider успел обновиться
      await new Promise(resolve => setTimeout(resolve, 200))

      // Навигируем после обновления AuthProvider
      if (user.role === 'HEAD_ADMIN') {
        navigate('/platform', { replace: true })
      } else {
        navigate('/home', { replace: true })
      }
    } catch (err: any) {
      const message = err.response?.data?.message || 'Failed to verify code'
      
      // Извлекаем attempts left из сообщения, если есть
      const attemptsMatch = message.match(/Attempts left: (\d+)/)
      if (attemptsMatch) {
        setAttemptsLeft(parseInt(attemptsMatch[1]))
      }
      
      if (message.includes('Invalid verification code')) {
        setError(message) // Сообщение уже содержит "Attempts left: X"
      } else if (message.includes('expired') || message.includes('Expired')) {
        setError('Code expired. Request a new one')
        setAttemptsLeft(null)
      } else if (message.includes('Too many attempts') || message.includes('no attempts')) {
        setError('Too many attempts. Please request a new code')
        setAttemptsLeft(0)
      } else if (message.includes('not found') || message.includes('already used')) {
        setError('Code not found or already used. Please request a new code')
        setAttemptsLeft(null)
      } else {
        setError(message)
      }
    } finally {
      setLoading(false)
    }
  }

  const handleResendCode = async () => {
    if (!canResend) return
    setError('')
    setLoading(true)

    try {
      const request: LoginRequest = { email, password }
      const response = await authService.requestCode(request)
      console.log('Resent code, new challengeId:', response.challengeId)
      setChallengeId(response.challengeId)
      setSearchParams({ step: 'verify', email, challengeId: response.challengeId })
      setCanResend(false)
      setAttemptsLeft(null) // Сбрасываем attempts при новом коде
      setTimeout(() => setCanResend(true), 60000)
      setError('')
    } catch (err: any) {
      const message = err.response?.data?.message || 'Failed to resend code'
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  if (step === 'verify') {
    return (
      <div className="login-container">
        <div className="login-box">
          <h1>Verify Code</h1>
          <p className="login-hint">Code sent to {email}</p>
          {error && <div className="error-message">{error}</div>}
          {attemptsLeft !== null && (
            <div className="attempts-info">Attempts left: {attemptsLeft}</div>
          )}
          <form onSubmit={handleVerifyCode}>
            <div className="form-group">
              <label>Verification Code (6 digits)</label>
              <input
                type="text"
                value={code}
                onChange={(e) => {
                  const value = e.target.value.replace(/\D/g, '').slice(0, 6)
                  setCode(value)
                }}
                placeholder="000000"
                maxLength={6}
                required
                autoFocus
              />
            </div>
            <button type="submit" disabled={loading || code.length !== 6}>
              {loading ? 'Verifying...' : 'Verify & Sign in'}
            </button>
          </form>
          <div className="resend-section">
            <button
              type="button"
              onClick={handleResendCode}
              disabled={!canResend || loading}
              className="resend-btn"
            >
              {canResend ? 'Resend code' : 'Resend code (available in 60s)'}
            </button>
          </div>
          <button
            type="button"
            onClick={() => {
              setStep('request')
              setSearchParams({})
              setCode('')
              setChallengeId('')
            }}
            className="back-btn"
          >
            Back to login
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="login-container">
      <div className="login-box">
        <h1>Login</h1>
        <p className="login-hint">Enter your credentials to receive a verification code</p>
        {error && <div className="error-message">{error}</div>}
        <form onSubmit={handleRequestCode}>
          <div className="form-group">
            <label>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              required
              autoFocus
            />
          </div>
          <div className="form-group">
            <label>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              required
            />
          </div>
          <button type="submit" disabled={loading}>
            {loading ? 'Sending...' : 'Send verification code'}
          </button>
        </form>
        <div className="login-info">
          <p>• Code will be valid for 10 minutes</p>
          <p>• You can request a new code after 60 seconds</p>
        </div>
      </div>
    </div>
  )
}
