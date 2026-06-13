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

const JSON_EXAMPLE = `{
  "title": "우리 봇 사용 후기",
  "questions": [
    { "label": "봇이 도움이 되었나요?", "type": "yesno" },
    { "label": "가장 좋았던 점은?", "type": "choice", "options": ["정확도", "말투", "속도"] },
    { "label": "전체 만족도", "type": "scale" },
    { "label": "개선했으면 하는 점", "type": "text" }
  ]
}`

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
  const [jsonOpen, setJsonOpen] = useState(false)
  const [jsonText, setJsonText] = useState('')
  const [jsonErr, setJsonErr] = useState('')

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

  // LLM 등으로 만든 JSON을 붙여넣어 한 번에 불러오기.
  // 형식: {title?, questions:[{label, type, options?}]} 또는 [{...}] 배열.
  const importJson = () => {
    setJsonErr('')
    let parsed
    try { parsed = JSON.parse(jsonText) } catch { setJsonErr('JSON 형식 오류 — 따옴표·쉼표를 확인하세요.'); return }
    const arr = Array.isArray(parsed) ? parsed : (Array.isArray(parsed?.questions) ? parsed.questions : null)
    if (!arr) { setJsonErr('questions 배열을 찾을 수 없어요.'); return }
    if (!Array.isArray(parsed) && typeof parsed.title === 'string') setTitle(parsed.title)
    const loaded = arr.map((q, i) => {
      const type = ['yesno', 'choice', 'scale', 'text'].includes(q?.type) ? q.type : 'text'
      const options = Array.isArray(q?.options)
        ? q.options.map(String)
        : (typeof q?.options === 'string' ? q.options.split(',').map((s) => s.trim()).filter(Boolean) : [])
      return {
        key: (q?.key && String(q.key).replace(/[^a-zA-Z0-9_]/g, '')) || ('q' + (i + 1) + '_' + Math.random().toString(36).slice(2, 6)),
        label: String(q?.label || q?.question || '').slice(0, 500),
        type,
        options,
      }
    }).filter((q) => q.label)
    if (!loaded.length) { setJsonErr('불러올 질문이 없어요 (label 확인).'); return }
    setQuestions(loaded)
    setJsonOpen(false); setJsonText('')
    setMsg(`JSON에서 질문 ${loaded.length}개 불러옴 — 검토 후 "설문 저장"을 누르세요`)
    setTimeout(() => setMsg(''), 5000)
  }

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

          <div className={styles.jsonBox}>
            <button className={styles.jsonToggle} onClick={() => setJsonOpen((o) => !o)}>
              {jsonOpen ? '▾' : '▸'} 📥 JSON으로 가져오기 <span className={styles.dim}>(LLM으로 만든 설문 붙여넣기)</span>
            </button>
            {jsonOpen && (
              <div className={styles.jsonInner}>
                <p className={styles.jsonHint}>
                  ChatGPT/Claude 등에 "아래 형식의 설문 JSON으로 만들어줘"라고 요청해 받은 결과를 붙여넣고 <b>불러오기</b>를 누르세요.
                  타입: <code>yesno · choice · scale · text</code>
                </p>
                <textarea className={styles.jsonArea} rows={9} value={jsonText}
                  placeholder={JSON_EXAMPLE} onChange={(e) => setJsonText(e.target.value)} />
                {jsonErr && <div className={styles.jsonErr}>⚠️ {jsonErr}</div>}
                <button className={styles.btn} onClick={importJson} disabled={!jsonText.trim()}>불러오기</button>
              </div>
            )}
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
