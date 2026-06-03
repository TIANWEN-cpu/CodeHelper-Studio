import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { registerGlobalErrorHandlers } from './utils/errorHandler'
import './assets/main.css'

// ---------------------------------------------------------------------------
// Safety net: catch errors that occur before React mounts
// ---------------------------------------------------------------------------

registerGlobalErrorHandlers()

// Guard against missing root element
const rootEl = document.getElementById('root')
if (!rootEl) {
  // Last-resort fallback — render directly into body
  const fallback = document.createElement('div')
  fallback.id = 'root'
  document.body.appendChild(fallback)
}

// ---------------------------------------------------------------------------
// Mount React
// ---------------------------------------------------------------------------

try {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  )
} catch (mountError) {
  // If React itself fails to mount (e.g. broken import), show a visible error
  console.error('[CodeHelper] Failed to mount React app:', mountError)
  document.getElementById('root')!.innerHTML =
    '<div style="display:flex;align-items:center;justify-content:center;height:100vh;font-family:system-ui;color:#888;flex-direction:column;gap:1rem">' +
    '<h2>应用加载失败</h2>' +
    '<p>请尝试重新加载页面，或重启应用。</p>' +
    '<button onclick="window.location.reload()" style="padding:0.5rem 1.5rem;border:none;border-radius:6px;background:#6366f1;color:#fff;cursor:pointer;font-size:1rem">重新加载</button>' +
    '</div>'
  removeSplash()
}

// ---------------------------------------------------------------------------
// Splash screen cleanup
// ---------------------------------------------------------------------------

function removeSplash(): void {
  const splash = document.getElementById('splash')
  if (!splash) return
  splash.classList.add('fade-out')
  splash.addEventListener('transitionend', () => splash.remove(), { once: true })
}

// Fade out splash screen after React has mounted
requestAnimationFrame(() => {
  // Give React one frame to paint, then start the fade
  requestAnimationFrame(() => removeSplash())
})

// Hard safety net: if splash is still visible after 8 seconds, force-remove it
// This prevents a permanently stuck splash if something hangs silently
setTimeout(() => {
  const splash = document.getElementById('splash')
  if (splash) {
    console.warn('[CodeHelper] Splash screen stuck for >8s — force-removing')
    removeSplash()
  }
}, 8000)
