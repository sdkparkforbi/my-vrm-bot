import { useState, useEffect } from 'react'
import styles from './SurveyBuilderPage.module.css'
import AuthModal from '../components/AuthModal'
import { getUser, clearAuth, verifyToken } from '../lib/api'
import { getOwnerId, setOwnerId, normalizeNickname } from '../lib/rag'
import { surveyDefGet, surveyDefSet } from '../lib/survey'

const TYPES = [
  { v: 'yesno', label: '예/아니오' },
  { v: 'choice', label: '객관식' },
  { v: 'scale', label: '척도(1~5)' },
  { v: 'text', label: '주관식' },
]

let _kid = 0
const newQ = () => ({ key: 'q' + (++_kid) + '_' + Math.random().toString(36).slice(2, 6), label: '', type: 'yesno', options: [] })

export default function SurveyBuilderPage() {
  const [user, setUser] = useState(getUser())
  const [authOpen, setAuthOpen] = useState(false)
  const [owner, setOwner] = useState(getOwnerId())
  const [title, setTitle] = useState('')
  const [questions, setQuestions] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => { verifyToken().then((u) => u && setUser(u)) }, [])

  useEffect(() => {
    if (!owner) { setLoading(false); return }
    let alive = true
    setLoading(true)
    surveyDefGet(owner).then((r) => {
      if (!alive) return
      setTitle(r.title || '')
      setQuestions((r.questions || []).map((q) => ({ options: [], ...q })))
      setLoading(false)
    })
    return () => { alive = false }
  }, [owner])

  const update = (i, patch) => setQuestions((qs) => qs.map((q, idx) => (idx === i ? { ...q, ...patch } : q)))
  const remove = (i) => setQuestions((qs) => qs.filter((_, idx) => idx !== i))
  const move = (i, d) => setQuestions((qs) => {
    const j = i + d
    if (j < 0 || j >= qs.length) return qs
    const copy = qs.slice()
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
    return copy
  })
  const add = () => setQuestions((qs) => [...qs, newQ()])

  const save = async () => {
    setSaving(true); setMsg('')
    const clean = questions
      .filter((q) => q.label.trim())
      .map((q) => ({
        key: q.key,
        label: q.label.trim(),
        type: q.type,
        options: q.type === 'choice' ? (q.options || []).map((o) => o.trim()).filter(Boolean) : [],
      }))
    const r = await surveyDefSet(owner, title.trim(), clean)
    setSaving(false)
    setMsg(r?.success ? `저장됨 ✓ (질문 ${r.count}개)` : '저장 실패 — 로그인 상태를 확인하세요.')
    setTimeout(() => setMsg(''), 3000)
  }

  return (
    <div className={styles.wrap}>
      <header className={styles.topbar}>
        <a className={styles.home} href="/">← 내 봇으로</a>
        <h1 className={styles.h1}>📋 설문 만들기 <span className={styles.dim}>SURVEY</span></h1>
        <div className={styles.auth}>
          <a className={styles.linkBtn} href="/dashboard">📊 대시보드</a>
          {user ? (
            <>
              <span className={styles.who}>{user.name || '사용자'}님</span>
              <button className={styles.linkBtn} onClick={() => { clearAuth(); setUser(null) }}>로그아웃</button>
            </>
          ) : (
            <button className={styles.linkBtn} onClick={() => setAuthOpen(true)}>로그인</button>
          )}
        </div>
      </header>

      <div className={styles.ownerRow}>
        <label>내 봇 닉네임</label>
        <input className={styles.ownerInput} value={owner} placeholder="예: bungae"
          onChange={(e) => setOwner(normalizeNickname(e.target.value))} />
        <button className={styles.btn} onClick={() => setOwnerId(owner)}>저장</button>
      </div>

      {!owner ? (
        <p className={styles.empty}>먼저 닉네임을 입력하세요.</p>
      ) : loading ? (
        <p className={styles.empty}>불러오는 중…</p>
      ) : (
        <main className={styles.card}>
          <div className={styles.field}>
            <label className={styles.flabel}>설문 제목</label>
            <input className={styles.titleInput} value={title} placeholder="예: 우리 봇 사용 후기"
              onChange={(e) => setTitle(e.target.value)} />
          </div>

          <div className={styles.qhead}>질문 ({questions.length})</div>
          {questions.length === 0 && <p className={styles.empty}>아래 ＋ 버튼으로 질문을 추가하세요.</p>}

          {questions.map((q, i) => (
            <div key={q.key} className={styles.qcard}>
              <div className={styles.qtop}>
                <span className={styles.qnum}>{i + 1}</span>
                <input className={styles.qlabel} value={q.label} placeholder="질문 내용을 입력하세요"
                  onChange={(e) => update(i, { label: e.target.value })} />
                <select className={styles.qtype} value={q.type} onChange={(e) => update(i, { type: e.target.value })}>
                  {TYPES.map((t) => <option key={t.v} value={t.v}>{t.label}</option>)}
                </select>
              </div>
              {q.type === 'choice' && (
                <input className={styles.qopts} value={(q.options || []).join(', ')}
                  placeholder="선택지를 쉼표로 구분 (예: 매우 좋음, 좋음, 보통, 나쁨)"
                  onChange={(e) => update(i, { options: e.target.value.split(',') })} />
              )}
              <div className={styles.qactions}>
                <button className={styles.miniBtn} onClick={() => move(i, -1)} disabled={i === 0}>↑</button>
                <button className={styles.miniBtn} onClick={() => move(i, 1)} disabled={i === questions.length - 1}>↓</button>
                <button className={styles.delBtn} onClick={() => remove(i)}>삭제</button>
              </div>
            </div>
          ))}

          <div className={styles.bottomRow}>
            <button className={styles.addBtn} onClick={add}>＋ 질문 추가</button>
            <div className={styles.saveArea}>
              {msg && <span className={styles.ok}>{msg}</span>}
              <button className={styles.btn} onClick={save} disabled={saving}>
                {saving ? '저장 중…' : '설문 저장 (COMMIT)'}
              </button>
            </div>
          </div>
        </main>
      )}

      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} onSuccess={(u) => setUser(u)} />
    </div>
  )
}
