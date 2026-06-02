import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { registerGlobalErrorHandlers } from './utils/errorHandler'
import './assets/main.css'

// Register global error handlers before rendering the app
registerGlobalErrorHandlers()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

// Fade out splash screen after React has mounted
const splash = document.getElementById('splash')
if (splash) {
  // Small delay to ensure first paint is complete
  requestAnimationFrame(() => {
    splash.classList.add('fade-out')
    splash.addEventListener('transitionend', () => {
      splash.remove()
    })
  })
}
