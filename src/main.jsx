import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import RagPage from './pages/RagPage'
import SurveyBuilderPage from './pages/SurveyBuilderPage'
import DashboardPage from './pages/DashboardPage'
import './index.css'

// 가벼운 경로 분기 (라우터 라이브러리 없이).
//   /rag       → 봇 지식 관리 페이지
//   /survey    → 설문 빌더 페이지
//   /dashboard → 공개 대시보드 (비번 없이)
//   그 외      → 봇 본체
const path = window.location.pathname.replace(/\/+$/, '')

let page
if (path.endsWith('/rag')) page = <RagPage />
else if (path.endsWith('/survey')) page = <SurveyBuilderPage />
else if (path.endsWith('/dashboard')) page = <DashboardPage />
else page = <App />

ReactDOM.createRoot(document.getElementById('root')).render(page)
