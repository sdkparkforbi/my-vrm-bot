// 봇별 맞춤 설문 클라이언트
// - 정의(survey_def): 봇 주인이 /survey 빌더에서 작성
// - 응답(survey_<owner>): 방문자가 SurveyModal에서 제출
// - 집계(survey_summary_bot): /dashboard 공개 페이지에서 조회
const API_BASE = '/api/school-api'
const TOKEN_KEY = 'cha_interview_token'

async function call(action, payload = {}, auth = false) {
  const headers = { 'Content-Type': 'application/json' }
  const token = localStorage.getItem(TOKEN_KEY)
  if (auth && token) headers['Authorization'] = 'Bearer ' + token
  const res = await fetch(`${API_BASE}?action=${action}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  })
  return res.json()
}

// 설문 정의 읽기 (공개)
export async function surveyDefGet(owner) {
  try {
    const r = await call('survey_def_get', { owner_id: owner })
    return { title: r?.title || '', questions: Array.isArray(r?.questions) ? r.questions : [] }
  } catch {
    return { title: '', questions: [] }
  }
}

// 설문 정의 저장 (로그인 필요)
export async function surveyDefSet(owner, title, questions) {
  return call('survey_def_set', { owner_id: owner, title, questions }, true)
}

// 응답 제출 (방문자, 비로그인 가능)
export async function surveySubmit(owner, answers, sessionId, durationSeconds) {
  return call('survey_submit', {
    owner_id: owner,
    answers,
    session_id: sessionId || null,
    duration_seconds: durationSeconds || null,
  })
}

// 봇별 집계 (공개 — 대시보드용)
export async function surveySummaryBot(owner) {
  try {
    return await call('survey_summary_bot', { owner_id: owner })
  } catch {
    return { success: false, total: 0, questions: {} }
  }
}

// 이 봇(배포 단위)의 owner id
export function deployedBotId() {
  return import.meta.env.VITE_BOT_ID || ''
}
