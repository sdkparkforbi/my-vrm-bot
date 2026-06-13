// 개인 봇 채팅 (streaming SSE)
// ──────────────────────────────────────────────────────────────
// 흐름:
//   1) aiforalab 에서 이 봇(BOT_ID)의 페르소나 + 질문 관련 RAG 청크 수집
//   2) 시스템 프롬프트 조립
//   3) 미들턴 무상태 LLM 엔드포인트에 SSE 스트림 요청
// 백엔드 미설정 시(ONPREMISE_CHAT_STREAM_URL 비어있음) → 목업 응답 스트림.
//
// 응답 형식 (SSE):
//   data: {"token":"안녕"}\n\n
//   ...
//   data: {"done": true, "fullText": "..."}\n\n
//   data: [DONE]\n\n

import { fetchContext, buildSystemPrompt } from './_lib/context.js'

const BOT_ID = process.env.BOT_ID || ''
// 미들턴 무상태 채팅 엔드포인트. env로 덮어쓸 수 있고, 없으면 기본값(aiforalab 중계) 사용.
const UPSTREAM = process.env.ONPREMISE_CHAT_STREAM_URL || 'https://aiforalab.com/liveavatar-api/api.php?action=chat_stream'

export const config = {
  api: { bodyParser: true, responseLimit: false },
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' })

  const { message, history = [], images = [] } = req.body || {}
  if (!message) return res.status(400).json({ error: 'message required' })

  // SSE 응답 헤더
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders?.()

  // 1) + 2) 컨텍스트 수집 & 프롬프트 조립 (실패해도 빈 컨텍스트로 진행)
  const ctx = await fetchContext(BOT_ID, message)
  const systemPrompt = buildSystemPrompt(ctx)

  // 백엔드 미설정 → 목업 스트림으로 동작 확인
  if (!UPSTREAM) {
    return mockStream(res, { message, ctx })
  }

  // 3) 미들턴 무상태 엔드포인트로 프록시
  let upstream
  try {
    upstream = await fetch(UPSTREAM, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message,
        history,
        images,
        system: systemPrompt,   // 조립된 페르소나+지식
        context: ctx,           // 원본 청크/페르소나
        bot_id: BOT_ID,
      }),
    })
  } catch (e) {
    res.write(`data: ${JSON.stringify({ error: 'upstream connect failed: ' + e.message })}\n\n`)
    return res.end()
  }

  if (!upstream.ok || !upstream.body) {
    res.write(`data: ${JSON.stringify({ error: 'upstream status ' + upstream.status })}\n\n`)
    return res.end()
  }

  const reader = upstream.body.getReader()
  const decoder = new TextDecoder()
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      res.write(decoder.decode(value, { stream: true }))  // upstream 이 이미 SSE
    }
  } catch (e) {
    try { res.write(`data: ${JSON.stringify({ error: 'stream broken: ' + e.message })}\n\n`) } catch {}
  } finally {
    try { res.end() } catch {}
  }
}

// ─── 목업 스트림 ──────────────────────────────────────────────
// 백엔드 연결 전에도 화면이 도는지 확인하기 위한 더미 응답.
// 어절 단위로 SSE 토큰을 흘려, 프론트의 문장 단위 TTS 로직까지 동작시킨다.
async function mockStream(res, { message, ctx }) {
  const hits = ctx.chunks?.length || 0
  const reply =
    `[목업 응답] 아직 LLM 백엔드(ONPREMISE_CHAT_STREAM_URL)가 연결되지 않았어요. ` +
    `방금 "${message}" 질문을 받았고, 관련 지식 청크 ${hits}개를 찾았어요. ` +
    `백엔드를 연결하면 진짜 답변이 나옵니다.`

  for (const word of reply.split(' ')) {
    res.write(`data: ${JSON.stringify({ token: word + ' ' })}\n\n`)
    await new Promise((r) => setTimeout(r, 30))
  }
  res.write(`data: ${JSON.stringify({ done: true, fullText: reply })}\n\n`)
  res.write('data: [DONE]\n\n')
  res.end()
}
