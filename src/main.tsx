import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'

// Catch and display any React mount errors
const root = document.getElementById('root')
if (!root) {
  document.body.innerHTML =
    '<div style="color:red;padding:20px;font-size:16px;">Error: #root element not found</div>'
} else {
  try {
    createRoot(root).render(
      <StrictMode>
        <App />
      </StrictMode>,
    )
  } catch (err) {
    console.error('[FATAL] React mount error:', err)
    root.innerHTML = `<div style="color:red;padding:20px;font-size:14px;">React mount error: ${err}</div>`
  }
}

// Global error handler
window.addEventListener('error', (e) => {
  console.error('[WINDOW ERROR]', e.error, e.message, e.filename, e.lineno)
})

window.addEventListener('unhandledrejection', (e) => {
  console.error('[UNHANDLED REJECTION]', e.reason)
})
