import { useLiveQuery } from 'dexie-react-hooks'
import { BrowserRouter, NavLink, Route, Routes } from 'react-router-dom'
import './App.css'
import Icon from './components/Icon.jsx'
import { Toast } from './components/Toast.jsx'
import { CartProvider } from './context/CartContext.jsx'
import db from './db/db.js'
import Categories from './pages/Categories.jsx'
import History from './pages/History.jsx'
import POS from './pages/POS.jsx'
import Products from './pages/Products.jsx'
import Settings from './pages/Settings.jsx'

const NAV = [
  { to: '/', icon: 'point_of_sale', label: 'Kasir' },
  { to: '/products', icon: 'inventory_2', label: 'Produk' },
  { to: '/categories', icon: 'label', label: 'Kategori' },
  { to: '/history', icon: 'receipt_long', label: 'Riwayat' },
  { to: '/settings', icon: 'settings', label: 'Pengaturan' },
]

export default function App() {
  const backupRow = useLiveQuery(() => db.settings.get('lastBackupTime'), [])
  const txnCount = useLiveQuery(() => db.transactions.count(), [])

  // Show reminder if there are transactions and no backup in the last 7 days
  const needsBackup = txnCount > 0 && (!backupRow || (Date.now() - new Date(backupRow.value).getTime() > 7 * 24 * 60 * 60 * 1000))

  return (
    <BrowserRouter>
      <CartProvider>
        <div className="app-shell">
          <nav className="sidebar">
            <div className="sidebar-logo">
              <Icon name="storefront" size={28} filled className="logo-icon" />
              <span className="logo-text">POS</span>
            </div>
            {NAV.map(n => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.to === '/'}
                className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}
                style={{ position: 'relative' }}
              >
                <Icon name={n.icon} size={24} className="nav-icon" />
                <span className="nav-label">{n.label}</span>
                {n.to === '/settings' && needsBackup && (
                  <div style={{ position: 'absolute', top: '10px', right: '16px', width: '10px', height: '10px', background: 'var(--danger, #ef4444)', borderRadius: '50%', boxShadow: '0 0 0 2px var(--surface)' }} />
                )}
              </NavLink>
            ))}
          </nav>

          <main className="app-main">
            <Routes>
              <Route path="/" element={<POS />} />
              <Route path="/products" element={<Products />} />
              <Route path="/categories" element={<Categories />} />
              <Route path="/history" element={<History />} />
              <Route path="/settings" element={<Settings />} />
            </Routes>
          </main>
        </div>
        <Toast />
      </CartProvider>
    </BrowserRouter>
  )
}
