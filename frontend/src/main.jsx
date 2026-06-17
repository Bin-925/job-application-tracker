import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// 저장된 다크모드 설정 적용 (렌더 전에 실행)
if (localStorage.getItem('theme') === 'dark') {
    document.documentElement.classList.add('dark')
}

createRoot(document.getElementById('root')).render(
    <StrictMode>
        <App />
    </StrictMode>,
)