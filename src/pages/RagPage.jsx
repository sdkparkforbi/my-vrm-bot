import { useState, useEffect, useCallback } from 'react'
import styles from './RagPage.module.css'
import AuthModal from '../components/AuthModal'
import { getUser, clearAuth, verifyToken } from '../lib/api'
import {
  getOwnerId, setOwnerId, normalizeNickname,
  personaGet, personaSet,
  ragList, ragSave, ragDelete, ragGenerate,
} from '../lib/rag'

// 봇 지식(RAG) + 페르소나 관리 페이지.
// 학생이 자기 봇 사이트의 /rag 에서 접속해 사용한다.
// 백엔드 미연결 시 모든 동작이 브라우저 로컬(목업)으로 처리된다.

export default function RagPage() {
  const [user, setUser] = useState(getUser())
  const [authOpen, setAuthOpen] = useState(false)
  const [owner, setOwner] = useState(getOwnerId())
  const [mock, setMock] = useState(false)   // 목업 모드 감지 (배지 표시용)

  // 토큰 검증
  useEffect(() => { verifyToken().then((u) => u && setUser(u)) }, [])

  const markMock = (r) => { if (r?.mock) setMock(true); return r }

  return (
    <div className={styles.wrap}>
      <header className={styles.topbar}>
        <a className={styles.home} href="/">← 내 봇으로</a>
        <h1 className={styles.h1}>🧠 봇 지식 관리 <span className={styles.dim}>RAG</span></h1>
        <div className={styles.auth}>
          {user ? (
            <>
              <span className={styles.who}>{user.name || user.nickname || '사용자'}님</span>
              <button className={styles.linkBtn} onClick={() => { clearAuth(); setUser(null) }}>로그아웃</button>
            </>
          ) : (
            <button className={styles.linkBtn} onClick={() => setAuthOpen(true)}>로그인</button>
          )}
        </div>
      </header>

      {mock && (
        <div className={styles.mockBanner}>
          ⚠️ <b>목업 모드</b> — 백엔드(aiforalab) 미연결. 변경사항은 이 브라우저에만 임시 저장됩니다.
        </div>
      )}

      <div className={styles.ownerRow}>
        <label>내 봇 닉네임</label>
        <input
          className={styles.ownerInput}
          value={owner}
          placeholder="예: bungae"
          onChange={(e) => setOwner(normalizeNickname(e.target.value))}
        />
        <button className={styles.btn} onClick={() => { setOwnerId(owner); }}>저장</button>
        <span className={styles.hint}>소문자/숫자/하이픈, 2~20자</span>
      </div>

      {!owner ? (
        <p className={styles.empty}>먼저 닉네임을 입력하세요.</p>
      ) : (
        <main className={styles.grid}>
          <PersonaSection owner={owner} markMock={markMock} />
          <ChunkerSection owner={owner} markMock={markMock} />
          <ChunksSection owner={owner} markMock={markMock} />
        </main>
      )}

      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} onSuccess={(u) => setUser(u)} />
    </div>
  )
}

// ─── ① PERSONA ────────────────────────────────────────────────
function PersonaSection({ owner, markMock }) {
  const [persona, setPersona] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    let alive = true
    personaGet(owner).then((r) => { if (alive) setPersona(markMock(r).persona) })
    return () => { alive = false }
  }, [owner])

  const save = async () => {
    setSaving(true); setSaved(false)
    markMock(await personaSet(owner, persona))
    setSaving(false); setSaved(true)
    setTimeout(() => setSaved(false), 1500)
  }

  return (
    <section className={`${styles.card} ${styles.persona}`}>
      <h2>① 페르소나 <small>봇의 성격·말투</small></h2>
      <textarea
        className={styles.textarea}
        rows={6}
        value={persona}
        placeholder="예: 너는 친근한 반말로 회계를 설명하는 '분개해' 봇이야. 항상 쉬운 예시를 든다."
        onChange={(e) => setPersona(e.target.value)}
      />
      <button className={styles.btn} onClick={save} disabled={saving}>
        {saving ? '저장 중…' : saved ? '저장됨 ✓' : '저장 (COMMIT)'}
      </button>
    </section>
  )
}

// ─── ② AUTO_CHUNKER ───────────────────────────────────────────
function ChunkerSection({ owner, markMock }) {
  const [text, setText] = useState('')
  const [preview, setPreview] = useState([])
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState('')

  const generate = async () => {
    if (!text.trim()) return
    setBusy(true); setDone('')
    const r = markMock(await ragGenerate(text))
    setPreview(r.chunks)
    setBusy(false)
  }

  const commit = async () => {
    if (!preview.length) return
    setBusy(true)
    markMock(await ragSave(owner, preview))
    setBusy(false); setDone(`${preview.length}개 청크 저장됨 ✓`)
    setPreview([]); setText('')
    window.dispatchEvent(new Event('rag-updated'))
  }

  const editPreview = (i, field, val) => {
    setPreview((p) => p.map((c, idx) => (idx === i ? { ...c, [field]: val } : c)))
  }
  const removePreview = (i) => setPreview((p) => p.filter((_, idx) => idx !== i))

  return (
    <section className={`${styles.card} ${styles.chunker}`}>
      <h2>② 자동 청크 만들기 <small>텍스트 → AI Q&A</small></h2>
      <textarea
        className={styles.textarea}
        rows={6}
        value={text}
        placeholder="뉴스 기사, 강의 노트, 위키 등 어떤 텍스트든 붙여넣으세요 (500~5,000자 권장)."
        onChange={(e) => setText(e.target.value)}
      />
      <div className={styles.row}>
        <button className={styles.btn} onClick={generate} disabled={busy || !text.trim()}>
          {busy ? '처리 중…' : '🤖 청크 생성'}
        </button>
        {done && <span className={styles.ok}>{done}</span>}
      </div>

      {preview.length > 0 && (
        <div className={styles.preview}>
          <div className={styles.previewHead}>미리보기 ({preview.length})</div>
          {preview.map((c, i) => (
            <div key={i} className={styles.chunkEdit}>
              <input value={c.question} onChange={(e) => editPreview(i, 'question', e.target.value)} placeholder="질문" />
              <textarea rows={2} value={c.answer} onChange={(e) => editPreview(i, 'answer', e.target.value)} placeholder="답변" />
              <button className={styles.del} onClick={() => removePreview(i)}>삭제</button>
            </div>
          ))}
          <button className={`${styles.btn} ${styles.commit}`} onClick={commit} disabled={busy}>
            이대로 저장 (COMMIT TO RAG)
          </button>
        </div>
      )}
    </section>
  )
}

// ─── ③ RAG_CHUNKS ─────────────────────────────────────────────
function ChunksSection({ owner, markMock }) {
  const [chunks, setChunks] = useState([])
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    setLoading(true)
    const r = markMock(await ragList(owner))
    setChunks(r.chunks)
    setLoading(false)
  }, [owner])

  useEffect(() => {
    reload()
    const h = () => reload()
    window.addEventListener('rag-updated', h)
    return () => window.removeEventListener('rag-updated', h)
  }, [reload])

  const del = async (id) => {
    markMock(await ragDelete(owner, id))
    reload()
  }

  return (
    <section className={`${styles.card} ${styles.chunks}`}>
      <h2>③ 등록된 지식 <small>{chunks.length}개</small></h2>
      {loading ? (
        <p className={styles.empty}>불러오는 중…</p>
      ) : chunks.length === 0 ? (
        <p className={styles.empty}>아직 지식이 없어요. ②에서 추가하세요.</p>
      ) : (
        <ul className={styles.list}>
          {chunks.map((c) => (
            <li key={c.chunk_id} className={styles.item}>
              <div className={styles.q}>{c.question}</div>
              <div className={styles.a}>{c.answer}</div>
              <button className={styles.del} onClick={() => del(c.chunk_id)}>삭제</button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
