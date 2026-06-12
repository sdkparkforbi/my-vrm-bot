// 봇 지식(RAG) + 페르소나 클라이언트 (브라우저)
// ──────────────────────────────────────────────────────────────
// /rag 관리 페이지가 사용한다. aiforalab 액션(rag_*, persona_*)을 호출하되,
// 백엔드가 아직 없으면 localStorage 목업으로 폴백 → 백엔드 없이도 전체 동작 확인 가능.
// 각 함수는 { ..., mock: boolean } 을 반환해 UI 가 "목업" 배지를 표시할 수 있게 한다.

const API_BASE = '/api/school-api'
const OWNER_KEY = 'bot_owner_id'
const MOCK_KEY = 'rag_mock_store'
const TOKEN_KEY = 'cha_interview_token'

// ─── 소유자(닉네임) ───────────────────────────────────────────
export function getOwnerId() {
  return (
    localStorage.getItem(OWNER_KEY) ||
    (import.meta.env.VITE_BOT_ID || '')
  )
}
export function setOwnerId(id) {
  localStorage.setItem(OWNER_KEY, normalizeNickname(id))
}
export function normalizeNickname(id) {
  return String(id || '').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 20)
}

// ─── 목업 저장소 ──────────────────────────────────────────────
function loadMock() {
  try { return JSON.parse(localStorage.getItem(MOCK_KEY) || '{}') } catch { return {} }
}
function saveMock(store) {
  localStorage.setItem(MOCK_KEY, JSON.stringify(store))
}
function ownerMock(store, owner) {
  if (!store[owner]) store[owner] = { persona: '', chunks: [] }
  return store[owner]
}

// ─── 공통 호출 ────────────────────────────────────────────────
async function call(action, payload, { auth = false } = {}) {
  const headers = { 'Content-Type': 'application/json' }
  const token = localStorage.getItem(TOKEN_KEY)
  if (auth && token) headers['Authorization'] = 'Bearer ' + token
  const res = await fetch(`${API_BASE}?action=${action}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error('http ' + res.status)
  return res.json()
}

// ─── 페르소나 ─────────────────────────────────────────────────
export async function personaGet(owner) {
  try {
    const r = await call('persona_get', { owner_id: owner })
    return { persona: typeof r?.persona === 'string' ? r.persona : '', mock: false }
  } catch {
    return { persona: ownerMock(loadMock(), owner).persona, mock: true }
  }
}
export async function personaSet(owner, persona) {
  try {
    await call('persona_set', { owner_id: owner, persona }, { auth: true })
    return { mock: false }
  } catch {
    const s = loadMock(); ownerMock(s, owner).persona = persona; saveMock(s)
    return { mock: true }
  }
}

// ─── 청크 목록 / 저장 / 삭제 ──────────────────────────────────
export async function ragList(owner) {
  try {
    const r = await call('rag_list', { owner_id: owner })
    return { chunks: Array.isArray(r?.chunks) ? r.chunks : [], mock: false }
  } catch {
    return { chunks: ownerMock(loadMock(), owner).chunks, mock: true }
  }
}
export async function ragSave(owner, chunks) {
  try {
    await call('rag_save', { owner_id: owner, chunks }, { auth: true })
    return { mock: false }
  } catch {
    const s = loadMock(); const o = ownerMock(s, owner)
    for (const c of chunks) {
      const i = o.chunks.findIndex((x) => x.chunk_id === c.chunk_id)
      if (i >= 0) o.chunks[i] = c
      else o.chunks.push(c)
    }
    saveMock(s)
    return { mock: true }
  }
}
export async function ragDelete(owner, chunkId) {
  try {
    await call('rag_delete', { owner_id: owner, chunk_id: chunkId }, { auth: true })
    return { mock: false }
  } catch {
    const s = loadMock(); const o = ownerMock(s, owner)
    o.chunks = o.chunks.filter((c) => c.chunk_id !== chunkId)
    saveMock(s)
    return { mock: true }
  }
}

// ─── 텍스트 → AI 자동 청크 (미리보기) ─────────────────────────
export async function ragGenerate(text) {
  try {
    const r = await call('rag_generate', { text }, { auth: true })
    if (Array.isArray(r?.chunks)) return { chunks: r.chunks, mock: false }
  } catch {}
  return { chunks: mockChunksFromText(text), mock: true }
}

// 목업: 문장 단위로 단순 Q&A 청크 생성 (백엔드 AI 청크화의 자리표시자)
function mockChunksFromText(text) {
  const clean = (text || '').replace(/\s+/g, ' ').trim()
  if (!clean) return []
  const sentences = clean
    .split(/(?<=[.!?。])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 4)
    .slice(0, 25)
  return sentences.map((s, i) => ({
    chunk_id: 'q' + (i + 1),
    question: s.split(' ').slice(0, 6).join(' '),
    answer: s,
  }))
}
