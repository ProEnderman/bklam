import { useNavigate } from 'react-router-dom'
import './Forbidden.css'

export default function Forbidden() {
  const navigate = useNavigate()

  return (
    <div className="forbidden-container">
      <div className="forbidden-content">
        <h1>403</h1>
        <h2>Access Forbidden</h2>
        <p>You don't have permission to access this page.</p>
        <button onClick={() => navigate('/home')} className="go-home-btn">
          К заказам
        </button>
      </div>
    </div>
  )
}

