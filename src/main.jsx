import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

// One-time migration: if user had the old hardcoded /qris.jpg asset and hasn't
// uploaded via settings yet, seed localStorage so they don't need to re-upload.
if (!localStorage.getItem('qris_image')) {
  fetch('/qris.jpg')
    .then(r => r.ok ? r.blob() : null)
    .then(blob => {
      if (!blob) return
      const reader = new FileReader()
      reader.onload = e => localStorage.setItem('qris_image', e.target.result)
      reader.readAsDataURL(blob)
    })
    .catch(() => {}) // silently ignore if asset doesn't exist
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
