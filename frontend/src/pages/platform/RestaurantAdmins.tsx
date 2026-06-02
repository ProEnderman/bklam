import { useParams, useNavigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { platformService } from '../../api/services'
import type { User } from '../../api/types'
import DataTable from '../../components/DataTable'
import Modal from '../../components/Modal'
import FormInput from '../../components/FormInput'

export default function RestaurantAdmins() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [admins, setAdmins] = useState<User[]>([])
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [error, setError] = useState('')
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    firstName: '',
    lastName: '',
  })

  useEffect(() => {
    loadAdmins()
  }, [id])

  const loadAdmins = async () => {
    if (!id) return
    try {
      // Загружаем всех пользователей для данного ресторана (с большим размером страницы, чтобы получить всех)
      const data = await platformService.getUsers(0, 1000, parseInt(id))
      // Фильтруем только ADMIN роли
      const restaurantAdmins = data.content.filter(
        (u) => u.role === 'ADMIN' && u.isActive
      )
      setAdmins(restaurantAdmins)
    } catch (error) {
      console.error('Failed to load admins:', error)
      setAdmins([])
    }
  }

  const handleCreate = async () => {
    if (!id) return
    
    setError('')
    
    // Validate required fields
    if (!formData.email || !formData.password) {
      setError('Email and password are required')
      return
    }
    
    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(formData.email)) {
      setError('Invalid email format')
      return
    }
    
    if (formData.password.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }
    
    try {
      console.log('Creating admin with data:', { ...formData, password: '***' })
      await platformService.createRestaurantAdmin(parseInt(id), formData)
      setShowCreateModal(false)
      setError('')
      setFormData({ email: '', password: '', firstName: '', lastName: '' })
      loadAdmins()
    } catch (error: any) {
      console.error('Error creating admin:', error)
      const errorMessage = error.response?.data?.message || error.message || 'Failed to create admin'
      setError(errorMessage)
    }
  }

  const columns = [
    { key: 'username', header: 'Email' },
    { key: 'firstName', header: 'First Name' },
    { key: 'lastName', header: 'Last Name' },
    {
      key: 'isActive',
      header: 'Status',
      render: (item: User) => (
        <span className={item.isActive ? 'status-active' : 'status-inactive'}>
          {item.isActive ? 'Active' : 'Inactive'}
        </span>
      ),
    },
  ]

  return (
    <div style={{ padding: '20px' }}>
      <button className="btn-secondary" onClick={() => navigate(`/platform/restaurants/${id}`)}>
        ← Back
      </button>
      <div className="page-header">
        <h1>Manage Restaurant Admins</h1>
        <button className="btn-primary" onClick={() => setShowCreateModal(true)}>
          Add Admin
        </button>
      </div>

      <DataTable data={admins} columns={columns} emptyMessage="No admins assigned" />

      <Modal
        isOpen={showCreateModal}
        onClose={() => {
          setShowCreateModal(false)
          setError('')
          setFormData({ email: '', password: '', firstName: '', lastName: '' })
        }}
        title="Create Admin"
      >
        {error && (
          <div style={{ padding: '10px', marginBottom: '10px', backgroundColor: '#fee', color: '#c33', borderRadius: '4px' }}>
            {error}
          </div>
        )}
        <FormInput
          label="Email"
          type="email"
          value={formData.email}
          onChange={(v) => {
            setFormData({ ...formData, email: v })
            setError('')
          }}
          required
        />
        <FormInput
          label="Password"
          type="password"
          value={formData.password}
          onChange={(v) => {
            setFormData({ ...formData, password: v })
            setError('')
          }}
          required
        />
        <FormInput
          label="First Name"
          value={formData.firstName}
          onChange={(v) => setFormData({ ...formData, firstName: v })}
        />
        <FormInput
          label="Last Name"
          value={formData.lastName}
          onChange={(v) => setFormData({ ...formData, lastName: v })}
        />
        <div className="modal-actions">
          <button className="btn-secondary" onClick={() => {
            setShowCreateModal(false)
            setError('')
            setFormData({ email: '', password: '', firstName: '', lastName: '' })
          }}>
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
