// client/src/main.jsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Provider } from 'react-redux'
import { BrowserRouter } from 'react-router-dom'
import { store } from './store/store'
import { BrandingProvider } from './context/BrandingContext'
import './index.css'
import App from './App.jsx'

// Expose store globally for session instrumentation
window.__store = store;

// Disable global authentication logging
window.__authLogger = () => {};
window.__traceLogout = () => {};

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Provider store={store}>
      <BrowserRouter>
        <BrandingProvider>
          <App />
        </BrandingProvider>
      </BrowserRouter>
    </Provider>
  </StrictMode>,
)