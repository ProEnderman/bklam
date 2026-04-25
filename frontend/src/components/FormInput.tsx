import './FormInput.css'

interface FormInputProps {
  label: string
  type?: string
  value: string | number
  onChange: (value: string) => void
  placeholder?: string
  required?: boolean
  error?: string
  disabled?: boolean
  min?: number
  max?: number
  step?: number
  onFocus?: (e: React.FocusEvent<HTMLInputElement>) => void
  onBlur?: (e: React.FocusEvent<HTMLInputElement>) => void
}

export default function FormInput({
  label,
  type = 'text',
  value,
  onChange,
  placeholder,
  required = false,
  error,
  disabled = false,
  min,
  max,
  step,
  onFocus,
  onBlur,
}: FormInputProps) {
  return (
    <div className="form-input">
      <label>
        {label}
        {required && <span className="required">*</span>}
      </label>
      {type === 'textarea' ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          required={required}
          disabled={disabled}
          className={error ? 'error' : ''}
          rows={4}
        />
      ) : (
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={onFocus}
          onBlur={onBlur}
          placeholder={placeholder}
          required={required}
          disabled={disabled}
          min={min}
          max={max}
          step={step}
          className={error ? 'error' : ''}
        />
      )}
      {error && <div className="error-message">{error}</div>}
    </div>
  )
}

