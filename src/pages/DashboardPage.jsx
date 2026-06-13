import { useState, useEffect } from 'react'
import styles from './DashboardPage.module.css'
import { surveySummaryBot, deployedBotId } from '../lib/survey'

// 공개 대시보드 — 비번 없이 누구나 본다.
//   /dashboard            → 이 봇(VITE_BOT_ID)의 설문 결과
//   /dashboard?bot=닉네임 → 특정 봇의 결과
function ownerFromUrl() {
  const q = new URLSearchParams(window.location.search).get('bot')
  return (q || deployedBotId() || '').toLowerCase().replace(/[^a-z0-9_-]/g, '')
}

const PALETTE = ['#06b6d4', '#8b5cf6', '#d946ef', '#f59e0b', '#10b981', '#ef4444', '#3b82f6', '#ec4899']

export default function DashboardPage() {
  const [owner] = useState(ownerFromUrl())
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!owner) { setLoading(false); return }
    let alive = true
    surveySummaryBot(owner).then((r) => { if (alive) { setData(r); setLoading(false) } })
    return () => { alive = false }
  }, [owner])

  const questions = data?.questions ? Object.entries(data.questions) : []

  return (
    <div className={styles.wrap}>
      <header className={styles.head}>
        <div className={styles.thumb}>📊</div>
        <div className={styles.headText}>
          <h1 className={styles.h1}>{data?.title || '설문 대시보드'}</h1>
          <div className={styles.sub}>
            <b>@{owner || '—'}</b> · 응답 <b>{data?.total ?? 0}</b>건
          </div>
        </div>
        <a className={styles.home} href="/">← 봇으로</a>
      </header>

      {!owner ? (
        <p className={styles.empty}>봇을 지정하세요. (예: /dashboard?bot=닉네임)</p>
      ) : loading ? (
        <p className={styles.empty}>불러오는 중…</p>
      ) : !questions.length ? (
        <p className={styles.empty}>아직 설문 결과가 없어요.</p>
      ) : (
        <div className={styles.grid}>
          {questions.map(([key, q], qi) => (
            <section key={key} className={styles.qcard}>
              <h2 className={styles.qtitle}>{q.label || key}</h2>
              <div className={styles.qmeta}>{q.type} · 응답 {q.n}건</div>
              {q.type === 'text' ? (
                <ul className={styles.textList}>
                  {(q.texts || []).length === 0 && <li className={styles.dimText}>응답 없음</li>}
                  {(q.texts || []).map((t, i) => <li key={i}>{t}</li>)}
                </ul>
              ) : (
                <BarChart counts={q.counts || {}} total={q.n} colorBase={qi} />
              )}
            </section>
          ))}
        </div>
      )}

      <footer className={styles.foot}>비밀번호 없이 공개되는 페이지입니다.</footer>
    </div>
  )
}

function BarChart({ counts, total, colorBase }) {
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1])
  if (!entries.length) return <div className={styles.dimText}>응답 없음</div>
  const max = Math.max(...entries.map((e) => e[1]), 1)
  const labelMap = { yes: '예 👍', no: '아니오 👎' }
  return (
    <div className={styles.bars}>
      {entries.map(([val, n], i) => {
        const pct = total > 0 ? Math.round((n * 100) / total) : 0
        return (
          <div key={val} className={styles.barRow}>
            <div className={styles.barLabel}>{labelMap[val] || val}</div>
            <div className={styles.barTrack}>
              <div className={styles.barFill}
                style={{ width: `${(n / max) * 100}%`, background: PALETTE[(colorBase + i) % PALETTE.length] }} />
            </div>
            <div className={styles.barVal}>{n} <span className={styles.pct}>({pct}%)</span></div>
          </div>
        )
      })}
    </div>
  )
}
