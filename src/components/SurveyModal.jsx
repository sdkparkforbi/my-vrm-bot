import { useState, useEffect, useRef } from 'react'
import styles from './SurveyModal.module.css'
import { surveyDefGet, surveySubmit, deployedBotId } from '../lib/survey'

// 봇 주인이 /survey 에서 정의한 설문을 동적으로 렌더링하고 응답을 받는다.
// 정의가 없으면(설문 미작성) 조용히 닫는다.
export default function SurveyModal({ open, onClose, sessionId }) {
  const [loading, setLoading] = useState(true)
  const [title, setTitle] = useState('')
  const [questions, setQuestions] = useState([])
  const [answers, setAnswers] = useState({})
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const startedAtRef = useRef(0)

  useEffect(() => {
    if (!open) return
    startedAtRef.current = Date.now()
    setDone(false); setError(''); setAnswers({}); setLoading(true)
    let alive = true
    surveyDefGet(deployedBotId()).then((r) => {
      if (!alive) return
      setTitle(r.title || '')
      setQuestions(r.questions || [])
      setLoading(false)
    })
    return () => { alive = false }
  }, [open])

  if (!open) return null

  const setAns = (key, val) => setAnswers((a) => ({ ...a, [key]: val }))

  const submit = async () => {
    setSubmitting(true); setError('')
    const dur = Math.round((Date.now() - startedAtRef.current) / 1000)
    const r = await surveySubmit(deployedBotId(), answers, sessionId, dur)
    setSubmitting(false)
    if (r?.success) setDone(true)
    else setError('제출에 실패했어요. 잠시 후 다시 시도해 주세요.')
  }

  // 설문 미작성 → 닫기만
  const noSurvey = !loading && questions.length === 0

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        {loading ? (
          <p className={styles.intro}>설문을 불러오는 중…</p>
        ) : done ? (
          <div className={styles.doneBox}>
            <h3>고맙습니다! 🎉</h3>
            <p>소중한 의견이 저장되었어요.</p>
            <button className={styles.primaryBtn} onClick={onClose}>닫기</button>
          </div>
        ) : noSurvey ? (
          <div className={styles.doneBox}>
            <p>아직 등록된 설문이 없어요.</p>
            <button className={styles.primaryBtn} onClick={onClose}>닫기</button>
          </div>
        ) : (
          <>
            <div className={styles.header}>
              <h3>{title || '설문'}</h3>
            </div>
            <p className={styles.intro}>봇을 사용해 주셔서 감사합니다. 잠깐 의견을 들려주세요.</p>

            <div className={styles.section}>
              {questions.map((q, i) => (
                <div key={q.key} className={styles.question}>
                  <div className={styles.qLabel}>
                    <span className={styles.qNum}>{i + 1}</span> {q.label}
                  </div>
                  <QuestionInput q={q} value={answers[q.key]} onChange={(v) => setAns(q.key, v)} styles={styles} />
                </div>
              ))}
            </div>

            {error && <div className={styles.error}>{error}</div>}
            <div className={styles.footer}>
              <button className={styles.skipBtn} onClick={onClose}>건너뛰기</button>
              <button className={styles.primaryBtn} onClick={submit} disabled={submitting}>
                {submitting ? '제출 중…' : '제출하기'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function QuestionInput({ q, value, onChange, styles }) {
  if (q.type === 'yesno') {
    return (
      <div className={styles.yesnoRow}>
        <button className={`${styles.yesnoBtn} ${value === 'yes' ? styles.yesActive : ''}`} onClick={() => onChange('yes')}>예</button>
        <button className={`${styles.yesnoBtn} ${value === 'no' ? styles.noActive : ''}`} onClick={() => onChange('no')}>아니오</button>
      </div>
    )
  }
  if (q.type === 'choice') {
    return (
      <div className={styles.chipRow}>
        {(q.options || []).map((opt) => (
          <button key={opt} className={`${styles.chip} ${value === opt ? styles.chipActive : ''}`} onClick={() => onChange(opt)}>{opt}</button>
        ))}
      </div>
    )
  }
  if (q.type === 'scale') {
    return (
      <div className={styles.chipRow}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} className={`${styles.chip} ${value === String(n) ? styles.chipActive : ''}`} onClick={() => onChange(String(n))}>{n}</button>
        ))}
      </div>
    )
  }
  return (
    <textarea className={styles.textarea} rows={2} value={value || ''} placeholder="자유롭게 적어주세요"
      onChange={(e) => onChange(e.target.value)} />
  )
}
