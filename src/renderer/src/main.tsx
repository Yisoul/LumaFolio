import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { GlobalTextContextMenu } from './ContextMenu'
import { ShortcutProvider } from './shortcuts'
import './styles.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ShortcutProvider>
      <App />
      <GlobalTextContextMenu />
    </ShortcutProvider>
  </React.StrictMode>
)
