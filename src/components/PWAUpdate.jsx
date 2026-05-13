import { useRegisterSW } from 'virtual:pwa-register/react'
import Icon from './Icon.jsx'

export default function PWAUpdate() {
    const {
        needRefresh: [needRefresh, setNeedRefresh],
        updateServiceWorker,
    } = useRegisterSW({
        onRegistered(r) {
            console.log('SW Registered: ' + r)
        },
        onRegisterError(error) {
            console.log('SW registration error', error)
        },
    })

    if (!needRefresh) return null

    return (
        <div style={{
            position: 'fixed',
            top: '16px',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 9999,
            background: 'var(--primary)',
            color: 'white',
            padding: '12px 20px',
            borderRadius: 'var(--r3)',
            boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            animation: 'slideDown 0.3s ease-out'
        }}>
            <Icon name="system_update" size={24} />
            <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontWeight: 600, fontSize: '0.95rem' }}>Update Tersedia!</span>
                <span style={{ fontSize: '0.8rem', opacity: 0.9 }}>Versi baru aplikasi siap digunakan.</span>
            </div>
            <div style={{ display: 'flex', gap: '8px', marginLeft: '12px' }}>
                <button 
                    onClick={() => setNeedRefresh(false)}
                    style={{ background: 'rgba(255,255,255,0.2)', color: 'white', border: 'none', padding: '6px 12px', borderRadius: 'var(--r1)', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600, transition: 'background 0.2s' }}
                    onMouseOver={e => e.target.style.background = 'rgba(255,255,255,0.3)'}
                    onMouseOut={e => e.target.style.background = 'rgba(255,255,255,0.2)'}
                >
                    Nanti
                </button>
                <button 
                    onClick={() => updateServiceWorker(true)}
                    style={{ background: 'white', color: 'var(--primary)', border: 'none', padding: '6px 12px', borderRadius: 'var(--r1)', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600, transition: 'background 0.2s' }}
                    onMouseOver={e => e.target.style.background = '#f0f0f0'}
                    onMouseOut={e => e.target.style.background = 'white'}
                >
                    Update Sekarang
                </button>
            </div>
            <style>{`
                @keyframes slideDown {
                    from { transform: translate(-50%, -100%); opacity: 0; }
                    to { transform: translate(-50%, 0); opacity: 1; }
                }
            `}</style>
        </div>
    )
}
