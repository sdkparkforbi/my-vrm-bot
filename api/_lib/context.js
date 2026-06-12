// RAG 컨텍스트 + 페르소나 수집 (서버 측, best-effort)
// ──────────────────────────────────────────────────────────────
// 개인 봇 학습판의 핵심: 채팅 시 aiforalab DB 에서
//   ① 이 봇(owner_id = BOT_ID)의 페르소나
//   ② 질문과 관련된 RAG 청크 top-k (rag_search)
// 를 가져와 프롬프트를 조립한 뒤, 미들턴 LLM 에 "완성만" 요청한다.
//
// 백엔드(rag_search/persona_get)가 아직 없으면 빈 컨텍스트를 반환 →
// 채팅은 그대로 흐른다(목업/폴백). 절대 throw 하지 않음.
//
// _lib 폴더는 Vercel 에서 서버리스 함수(엔드포인트)로 취급되지 않고,
// 다른 api/*.js 가 import 하는 공용 모듈로만 쓰인다.

const SCHOOL_API_BASE =
  process.env.SCHOOL_API_BASE || 'https://aiforalab.com/liveavatar-api/api.php'
const RAG_TOP_K = Number(process.env.RAG_TOP_K || 5)

async function callSchool(action, payload) {
  const res = await fetch(
    `${SCHOOL_API_BASE}?action=${encodeURIComponent(action)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify(payload),
    }
  )
  if (!res.ok) throw new Error('school api ' + res.status)
  return res.json()
}

// 봇의 페르소나 + 질문 관련 청크를 동시에 수집. 실패해도 빈 값으로.
export async function fetchContext(botId, message) {
  if (!botId) return { persona: '', chunks: [] }

  const personaP = callSchool('persona_get', { owner_id: botId })
    .then((r) => (typeof r?.persona === 'string' ? r.persona : ''))
    .catch(() => '')

  const chunksP = callSchool('rag_search', {
    owner_id: botId,
    query: message,
    k: RAG_TOP_K,
  })
    .then((r) => (Array.isArray(r?.chunks) ? r.chunks : []))
    .catch(() => [])

  const [persona, chunks] = await Promise.all([personaP, chunksP])
  return { persona, chunks }
}

// 페르소나 + 청크 → 시스템 프롬프트 문자열.
export function buildSystemPrompt({ persona, chunks }) {
  const parts = []
  if (persona && persona.trim()) parts.push(persona.trim())
  if (Array.isArray(chunks) && chunks.length) {
    const kb = chunks
      .map(
        (c, i) =>
          `(${i + 1}) Q: ${c.question || ''}\n    A: ${c.answer || ''}`
      )
      .join('\n')
    parts.push(
      '아래는 너의 지식(RAG)이다. 질문과 관련될 때 적극 활용해 답하라:\n' + kb
    )
  }
  return parts.join('\n\n')
}
