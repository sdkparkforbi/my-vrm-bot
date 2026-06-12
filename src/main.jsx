import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import RagPage from './pages/RagPage'
import './index.css'

// 가벼운 경로 분기 (라우터 라이브러리 없이).
//   /rag → 봇 지식 관리 페이지
//   그 외 → 봇 본체
const isRag = window.location.pathname.replace(/\/+$/, '').endsWith('/rag')

ReactDOM.createRoot(document.getElementById('root')).render(isRag ? <RagPage /> : <App />)
