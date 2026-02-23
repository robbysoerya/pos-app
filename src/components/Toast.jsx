import { useState } from 'react'
import Icon from './Icon.jsx'
import './Toast.css'

let _setToasts = null

export function Toast() {
    const [toasts, setToasts] = useState([])
    _setToasts = setToasts

    return (
        <div className="toast-container">
            {toasts.map(t => (
                <div key={t.id} className={`toast toast-${t.type}`}>
                    <Icon
                        name={t.type === 'success' ? 'check_circle' : t.type === 'error' ? 'cancel' : 'info'}
                        size={18}
                        filled
                        className="toast-icon"
                    />
                    {t.message}
                </div>
            ))}
        </div>
    )
}

export function showToast(message, type = 'info', duration = 3000) {
    if (!_setToasts) return
    const id = Date.now()
    _setToasts(prev => [...prev, { id, message, type }])
    setTimeout(() => {
        _setToasts(prev => prev.filter(t => t.id !== id))
    }, duration)
}
