import { useEffect } from 'react'
import Icon from './Icon.jsx'
import './Modal.css'

export default function Modal({ open, onClose, title, children, width = '480px' }) {
    useEffect(() => {
        if (!open) return
        const handler = (e) => { if (e.key === 'Escape') onClose() }
        window.addEventListener('keydown', handler)
        return () => window.removeEventListener('keydown', handler)
    }, [open, onClose])

    if (!open) return null

    return (
        <div className="modal-backdrop" onClick={onClose}>
            <div className="modal-box" style={{ maxWidth: width }} onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h2>{title}</h2>
                    <button className="modal-close btn btn-ghost btn-sm" onClick={onClose}>
                        <Icon name="close" size={20} />
                    </button>
                </div>
                <div className="modal-body">{children}</div>
            </div>
        </div>
    )
}
