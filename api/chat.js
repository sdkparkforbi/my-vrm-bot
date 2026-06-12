// 개인 봇 채팅 (batch JSON)
// ──────────────────────────────────────────────────────────────
// chat-stream.js 의 비스트리밍 버전. 같은 컨텍스트 조립을 거쳐
// 미들턴 무상태 엔드포인트에 1회 요청한다. 백엔드 미설정 시 목업 응답.

import { fetchContext, buildSystemPrompt } from './_lib/context.js'

const BOT_ID = process.env.BOT_ID || ''
const UPSTREAM = process.env.ONPREMISE_CHAT_URL || ''

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
    return res.status(204).end()
  }
  if (req.method !== 'POST') return res.status(405).end()

  const { message, history = [], images = [] } = req.body || {}
  if (!message) return res.status(400).json({ error: 'message required' })

  res.setHeader('Access-Control-Allow-Origin', '*')

  // 컨텍스트 조립
  const ctx = await fetchContext(BOT_ID, message)
  const systemPrompt = buildSystemPrompt(ctx)

  // 백엔드 미설정 → 목업
  if (!UPSTREAM) {
    const hits = ctx.chunks?.length || 0
    const reply =
      `[목업 응답] LLM 백엔드(ONPREMISE_CHAT_URL) 미연결 상태예요. ` +
      `"${message}" 에 대해 관련 지식 ${hits}개를 찾았습니다.`
    return res.status(200).json(sanitizeResponse({ reply, ttsReply: reply }))
  }

  try {
    const response = await fetch(UPSTREAM, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message,
        history,
        images,
        system: systemPrompt,
        context: ctx,
        bot_id: BOT_ID,
      }),
    })
    const data = await response.json()
    return res.status(200).json(sanitizeResponse(data))
  } catch (e) {
    return res.status(500).json({ error: e.message })
  }
}

function sanitizeResponse(data) {
  if (!data || typeof data !== 'object') return data

  const replaceSensitiveTerms = (text) => {
    if (typeof text !== 'string') return text
    return text.replace(/\s+/g, ' ').trim()
  }

  // TTS만 — 화면 표시(reply)는 URL/전화/이메일 그대로 두고,
  // 음성으로는 읽지 않도록 자연어 표현으로 치환한다.
  const stripContactsForTts = (text) => {
    if (typeof text !== 'string') return text
    return text
      .replace(/https?:\/\/[^\s)\]]+/gi, '홈페이지')
      .replace(/\bwww\.[^\s)\]]+/gi, '홈페이지')
      .replace(/\b0\d{1,2}[-\s]?\d{3,4}[-\s]?\d{4}\b/g, '전화번호')
      .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '이메일')
      .replace(/\(\s*[)]\s*\)/g, '')
      .replace(/\s{2,}/g, ' ')
      .trim()
  }

  return {
    ...data,
    reply: replaceSensitiveTerms(data.reply),
    ttsReply: stripContactsForTts(replaceSensitiveTerms(data.ttsReply)),
  }
}
