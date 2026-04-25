import { useNavigate } from 'react-router-dom'
import './NotFound.css'

export default function NotFound() {
  const navigate = useNavigate()

  return (
    <div className="not-found-container">
      <div className="not-found-content">
        <h1>404</h1>
        <h2>Page Not Found</h2>
        <p>The page you're looking for doesn't exist.</p>
        <button onClick={() => navigate('/home')} className="go-home-btn">
          К заказам
        </button>
      </div>
    </div>
  )
}

