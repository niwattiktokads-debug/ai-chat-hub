import { createServer } from 'node:http'
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const PORT = Number(process.env.PORT || 8788)
const HOST = process.env.HOST || '127.0.0.1'
const DATA_PATH = process.env.CHAT_HUB_DATA_PATH || fileURLToPath(new URL('../data/runtime-state.json', import.meta.url))
const MAX_BODY_BYTES = Number(process.env.CHAT_HUB_MAX_BODY_BYTES || 512 * 1024)
const MAX_FLOW_RUNS = Number(process.env.CHAT_HUB_MAX_FLOW_RUNS || 200)
const API_KEY = process.env.CHAT_HUB_API_KEY || ''
const ENABLE_MOCK_WEBHOOKS = process.env.CHAT_HUB_ENABLE_MOCK_WEBHOOKS !== 'false'
const ALLOWED_ORIGINS = new Set(
  String(process.env.CHAT_HUB_ALLOWED_ORIGINS || 'http://127.0.0.1:5173,http://127.0.0.1:5174,http://localhost:5173,http://localhost:5174')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
)

const conversations = [
  {
    id: 'conv_1024',
    customer: 'Nicha R.',
    channel: 'facebook',
    page: 'MAN KYND',
    status: 'draft_ready',
    risk: 'low',
    reviewScore: 9,
    lastMessage: 'มีไซซ์ M สีดำไหมคะ',
    latencyMs: 820,
    draft: 'มีค่ะ เดี๋ยวแอดมินเช็กสต็อกสีดำไซซ์ M ให้ก่อนนะคะ ถ้าพร้อมส่งจะแจ้งยืนยันอีกครั้งค่ะ',
    review: {
      score: 9,
      risk: 'low',
      reasoning: 'คำตอบสุภาพและไม่ยืนยันข้อมูลสต็อกเกินกว่าที่ระบบรู้',
      suggestion: 'ส่งได้หลังเช็กสต็อกจาก source จริง',
    },
    messages: [
      { id: 'm1', author: 'Nicha R.', direction: 'customer', text: 'มีไซซ์ M สีดำไหมคะ', at: '10:42' },
      { id: 'm2', author: 'Responder AI', direction: 'ai', text: 'มีค่ะ เดี๋ยวแอดมินเช็กสต็อกสีดำไซซ์ M ให้ก่อนนะคะ ถ้าพร้อมส่งจะแจ้งยืนยันอีกครั้งค่ะ', at: '10:42' },
      { id: 'm3', author: 'Reviewer AI', direction: 'reviewer', text: 'Score 9, risk low. ไม่เดาราคา ไม่ยืนยันเกินข้อมูล', at: '10:43' },
    ],
  },
  {
    id: 'conv_1025',
    customer: 'May S.',
    channel: 'facebook',
    page: 'Anna Lynn',
    status: 'needs_human',
    risk: 'medium',
    reviewScore: 6,
    lastMessage: 'ลดได้อีกไหม โอนเลยวันนี้',
    latencyMs: 1440,
    draft: 'ขอบคุณค่ะ เดี๋ยวให้พนักงานเช็กโปรและส่วนลดที่ใช้ได้ให้ก่อนนะคะ',
    review: {
      score: 6,
      risk: 'medium',
      reasoning: 'มีความเสี่ยงเรื่องส่วนลดและโปรโมชัน ต้องใช้ข้อมูลจากพนักงานก่อน',
      suggestion: 'handoff ให้คนตรวจโปรก่อนตอบจริง',
    },
    messages: [
      { id: 'm4', author: 'May S.', direction: 'customer', text: 'ลดได้อีกไหม โอนเลยวันนี้', at: '10:39' },
      { id: 'm5', author: 'Responder AI', direction: 'ai', text: 'ขอบคุณค่ะ เดี๋ยวให้พนักงานเช็กโปรและส่วนลดที่ใช้ได้ให้ก่อนนะคะ', at: '10:40' },
      { id: 'm6', author: 'Reviewer AI', direction: 'reviewer', text: 'Score 6, risk medium. ห้ามแต่งโปรเอง', at: '10:40' },
    ],
  },
  {
    id: 'conv_1026',
    customer: 'Ploy Line',
    channel: 'line',
    page: 'LINE OA Main',
    status: 'reviewing',
    risk: 'high',
    reviewScore: 4,
    lastMessage: 'ขอยกเลิกแล้วคืนเงินค่ะ',
    latencyMs: 2310,
    draft: 'รับทราบค่ะ เรื่องยกเลิกและคืนเงินจะส่งให้พนักงานตรวจสอบรายละเอียดก่อนนะคะ',
    review: {
      score: 4,
      risk: 'high',
      reasoning: 'refund เป็นเคสเสี่ยงสูง ต้องตรวจ order, policy และยอดเงินก่อน',
      suggestion: 'mark needs_human และห้าม auto-send',
    },
    messages: [
      { id: 'm7', author: 'Ploy Line', direction: 'customer', text: 'ขอยกเลิกแล้วคืนเงินค่ะ', at: '10:37' },
      { id: 'm8', author: 'Responder AI', direction: 'ai', text: 'รับทราบค่ะ เรื่องยกเลิกและคืนเงินจะส่งให้พนักงานตรวจสอบรายละเอียดก่อนนะคะ', at: '10:37' },
    ],
  },
]

const flowRuns = [
  {
    id: 'run_9001',
    conversationId: 'conv_1024',
    status: 'passed',
    durationMs: 840,
    createdAt: '10:43',
    steps: [
      { id: 's1', label: 'Customer message', status: 'ok', detail: 'Facebook message ingested' },
      { id: 's2', label: 'Responder draft', status: 'ok', detail: 'Thai guarded reply generated' },
      { id: 's3', label: 'Reviewer score', status: 'ok', detail: 'score 9, risk low' },
      { id: 's4', label: 'Send/Handoff', status: 'ok', detail: 'ready for approval' },
    ],
  },
]

const channels = [
  { id: 'ch_fb_mankynd', name: 'MAN KYND Messenger', channel: 'facebook', status: 'connected', token: 'secret_ref:facebook_page_token', url: 'https://chat.o-agent.local/webhook/facebook' },
  { id: 'ch_line_main', name: 'LINE OA Main', channel: 'line', status: 'pending', token: 'secret_ref:line_channel_token', url: 'https://chat.o-agent.local/webhook/line' },
]

const knowledge = [
  { id: 'ks_refund', title: 'Policy: refund handoff', status: 'needs_review', type: 'policy', content: 'Refund/cancel cases must be reviewed by a human before sending a customer reply.' },
  { id: 'ks_sizing', title: 'Product: sizing answer', status: 'ready', type: 'faq', content: 'Ask for color and size before confirming stock or availability.' },
  { id: 'ks_shipping', title: 'Shipping: tracking rules', status: 'ready', type: 'faq', content: 'Tracking and order status must be checked against the order source before replying.' },
]

const defaultGraph = {
  nodes: [
    { id: 'trigger', type: 'TriggerNode', config: { source: 'facebook' } },
    { id: 'responder', type: 'ResponderNode', config: { model: 'o-agent-default', temperature: 0.2, use_knowledge: true } },
    { id: 'reviewer', type: 'ReviewerNode', config: { score_threshold: 8 } },
    { id: 'condition', type: 'ConditionNode', config: { logic: 'score >= threshold && risk == low' } },
    { id: 'send', type: 'SendReplyNode', config: { test_mode_blocks_send: true } },
    { id: 'handoff', type: 'HandoffNode', config: { status: 'needs_human' } },
  ],
  edges: [
    ['trigger', 'responder'],
    ['responder', 'reviewer'],
    ['reviewer', 'condition'],
    ['condition', 'send'],
    ['condition', 'handoff'],
  ],
}

const flows = [
  {
    id: 'flow_default_review',
    name: 'Default Responder + Reviewer',
    status: 'active',
    channel: 'facebook',
    version: 1,
    graph: defaultGraph,
    config: {
      responderPrompt: 'คุณคือผู้ช่วยตอบลูกค้าของร้าน ตอบสุภาพ กระชับ ภาษาไทย ถ้าไม่รู้ให้บอกว่าจะให้พนักงานตรวจสอบ ห้ามแต่งราคา โปร หรือข้อมูลสินค้าเอง',
      reviewerPrompt: 'คุณคือ QA ตรวจคำตอบ AI ก่อนส่งให้ลูกค้าจริง ให้คะแนน 1-10 ระบุ risk low/medium/high พร้อมเหตุผลและคำแนะนำ ถ้าเสี่ยงให้ handoff',
      scoreThreshold: 8,
    },
    updatedAt: new Date().toISOString(),
  },
]

const promptHistory = [
  { id: 'ph_seed_1', flowId: 'flow_default_review', version: 1, field: 'responderPrompt', changedBy: 'seed', createdAt: nowLabel() },
]

function saveState() {
  mkdirSync(dirname(DATA_PATH), { recursive: true })
  if (flowRuns.length > MAX_FLOW_RUNS) flowRuns.splice(MAX_FLOW_RUNS)
  const tmpPath = `${DATA_PATH}.${process.pid}.${Date.now()}.tmp`
  writeFileSync(tmpPath, JSON.stringify({ conversations, flowRuns, channels, knowledge, flows, promptHistory }, null, 2))
  renameSync(tmpPath, DATA_PATH)
}

function sanitizeChannel(channel) {
  const normalized = { ...channel }
  if (!String(normalized.token || '').startsWith('secret_ref:')) {
    normalized.token = `secret_ref:${normalized.channel || 'channel'}_token`
  }
  return normalized
}

function loadState() {
  if (!existsSync(DATA_PATH)) return saveState()
  try {
    const saved = JSON.parse(readFileSync(DATA_PATH, 'utf8'))
    if (Array.isArray(saved.conversations)) conversations.splice(0, conversations.length, ...saved.conversations)
    if (Array.isArray(saved.flowRuns)) flowRuns.splice(0, flowRuns.length, ...saved.flowRuns.slice(0, MAX_FLOW_RUNS))
    if (Array.isArray(saved.channels)) channels.splice(0, channels.length, ...saved.channels.map(sanitizeChannel))
    if (Array.isArray(saved.knowledge)) knowledge.splice(0, knowledge.length, ...saved.knowledge)
    if (Array.isArray(saved.flows)) flows.splice(0, flows.length, ...saved.flows)
    if (Array.isArray(saved.promptHistory)) promptHistory.splice(0, promptHistory.length, ...saved.promptHistory)
  } catch (error) {
    console.error(`State file could not be loaded, using seed state: ${error.message}`)
    return saveState()
  }
}

function nowLabel() {
  return new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })
}

function reviewText(text) {
  const risky = /คืนเงิน|ยกเลิก|ลด|โปร|ราคา/i.test(text)
  const high = /คืนเงิน|ยกเลิก/i.test(text)
  return {
    score: high ? 4 : risky ? 6 : 9,
    risk: high ? 'high' : risky ? 'medium' : 'low',
    reasoning: high
      ? 'Refund/cancel ต้องตรวจข้อมูล order และนโยบายก่อนตอบจริง'
      : risky
        ? 'มีความเสี่ยงเรื่องราคา โปร หรือส่วนลด ต้องให้คนตรวจ'
        : 'คำตอบอยู่ในกรอบ ปลอดภัย และไม่เดาข้อมูลสินค้า',
    suggestion: high || risky ? 'handoff ให้พนักงานตรวจสอบก่อนส่ง' : 'ส่งได้หลังตรวจ source สั้น ๆ',
  }
}

function runFlow(conversationId, text) {
  const conversation = conversations.find((item) => item.id === conversationId)
  if (!conversation) return null
  const targetText = String(text || conversation.lastMessage || '')
  const review = reviewText(targetText)
  const passed = review.score >= 8 && review.risk === 'low'
  const nextStatus = passed ? 'draft_ready' : 'needs_human'
  conversation.review = review
  conversation.reviewScore = review.score
  conversation.risk = review.risk
  conversation.status = nextStatus
  conversation.messages = [
    ...conversation.messages,
    { id: `review_${Date.now()}`, author: 'Reviewer AI', direction: 'reviewer', text: `Score ${review.score}, risk ${review.risk}. ${review.reasoning}`, at: nowLabel() },
  ]
  const run = {
    id: `run_${Date.now()}`,
    conversationId,
    status: passed ? 'passed' : 'blocked',
    durationMs: passed ? 780 : review.risk === 'high' ? 1640 : 1190,
    createdAt: nowLabel(),
    steps: [
      { id: 'customer', label: 'Customer message', status: 'ok', detail: targetText },
      { id: 'responder', label: 'Responder draft', status: 'ok', detail: conversation.draft },
      { id: 'reviewer', label: 'Reviewer score', status: passed ? 'ok' : 'blocked', detail: `score ${review.score}, risk ${review.risk}` },
      { id: 'handoff', label: 'Send/Handoff', status: passed ? 'ok' : 'blocked', detail: passed ? 'ready for approval' : 'needs human review' },
    ],
  }
  flowRuns.unshift(run)
  saveState()
  return { conversation, run }
}

function applySuggestion(conversationId) {
  const conversation = conversations.find((item) => item.id === conversationId)
  if (!conversation) return null
  const suggestion = conversation.review?.suggestion || 'ส่งให้พนักงานตรวจสอบก่อนตอบจริง'
  conversation.draft = `${conversation.draft}\n\nหมายเหตุภายใน: ${suggestion}`
  conversation.status = 'needs_human'
  conversation.messages = [
    ...conversation.messages,
    { id: `apply_${Date.now()}`, author: 'System', direction: 'system', text: `Applied reviewer suggestion: ${suggestion}`, at: nowLabel() },
  ]
  saveState()
  return conversation
}

function saveFlowConfig(flowId, input = {}) {
  const flow = flows.find((item) => item.id === flowId)
  if (!flow) return null
  const before = JSON.stringify(flow.config)
  flow.config = {
    ...flow.config,
    responderPrompt: String(input.responderPrompt || flow.config.responderPrompt),
    reviewerPrompt: String(input.reviewerPrompt || flow.config.reviewerPrompt),
    scoreThreshold: Number(input.scoreThreshold || flow.config.scoreThreshold || 8),
  }
  if (input.graph && typeof input.graph === 'object') flow.graph = input.graph
  flow.version = Number(flow.version || 1) + 1
  flow.updatedAt = new Date().toISOString()
  if (JSON.stringify(flow.config) !== before) {
    promptHistory.unshift({
      id: `ph_${Date.now()}`,
      flowId,
      version: flow.version,
      field: 'flowConfig',
      changedBy: String(input.changedBy || 'boss'),
      createdAt: nowLabel(),
    })
  }
  saveState()
  return flow
}

function addChannel(input = {}) {
  const channel = {
    id: `ch_${randomUUID().slice(0, 8)}`,
    name: String(input.name || 'New Channel'),
    channel: input.channel === 'line' ? 'line' : 'facebook',
    status: 'pending',
    token: 'masked...new',
    url: String(input.url || (input.channel === 'line' ? 'https://chat.o-agent.local/webhook/line' : 'https://chat.o-agent.local/webhook/meta')),
  }
  channels.unshift(channel)
  saveState()
  return channel
}

function ingestWebhook({ channel, body }) {
  const id = `conv_${randomUUID().slice(0, 8)}`
  const text = String(body.text || (channel === 'line' ? 'ลูกค้าทดสอบจาก LINE webhook' : 'ลูกค้าทดสอบจาก Facebook webhook'))
  const conversation = {
    id,
    customer: String(body.customer || (channel === 'line' ? 'LINE Customer' : 'Facebook Customer')),
    channel,
    page: String(body.page || (channel === 'line' ? 'LINE OA Main' : 'MAN KYND')),
    status: 'reviewing',
    risk: 'medium',
    reviewScore: 0,
    lastMessage: text,
    latencyMs: 0,
    draft: 'รับทราบค่ะ เดี๋ยวให้พนักงานตรวจสอบรายละเอียดก่อนตอบกลับนะคะ',
    review: { score: 0, risk: 'medium', reasoning: 'pending reviewer', suggestion: 'run AI review' },
    messages: [{ id: `msg_${Date.now()}`, author: String(body.customer || 'Customer'), direction: 'customer', text, at: nowLabel() }],
  }
  conversations.unshift(conversation)
  saveState()
  return conversation
}

function dashboard() {
  const count = conversations.length
  const blocked = conversations.filter((item) => item.status === 'needs_human' || item.risk !== 'low').length
  return {
    today: count,
    channels: new Set(conversations.map((item) => item.channel)).size,
    avgScore: count ? Math.round(conversations.reduce((sum, item) => sum + item.reviewScore, 0) / count) : 0,
    blocked,
    avgLatency: count ? Math.round(conversations.reduce((sum, item) => sum + item.latencyMs, 0) / count) : 0,
  }
}

async function readJson(req) {
  const chunks = []
  let totalBytes = 0
  for await (const chunk of req) {
    totalBytes += chunk.length
    if (totalBytes > MAX_BODY_BYTES) {
      const error = new Error('request_body_too_large')
      error.status = 413
      throw error
    }
    chunks.push(chunk)
  }
  const text = Buffer.concat(chunks).toString('utf8')
  if (!text) return {}
  return JSON.parse(text)
}

function corsOrigin(req) {
  const origin = req?.headers?.origin
  if (!origin) return [...ALLOWED_ORIGINS][0] || 'http://127.0.0.1:5174'
  return ALLOWED_ORIGINS.has(origin) ? origin : ''
}

function send(res, status, body, req) {
  const origin = corsOrigin(req)
  const headers = {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'content-type,x-chat-hub-api-key,x-hub-signature-256,x-line-signature',
    vary: 'origin',
  }
  if (origin) headers['access-control-allow-origin'] = origin
  res.writeHead(status, {
    ...headers,
  })
  res.end(JSON.stringify(body))
}

function hasWriteAccess(req) {
  if (!API_KEY) return true
  return req.headers['x-chat-hub-api-key'] === API_KEY
}

function verifyHmacSignature({ algorithm, secret, signatureHeader, payload, prefix = '' }) {
  if (!secret) return { ok: false, error: 'missing_webhook_secret' }
  if (!signatureHeader) return { ok: false, error: 'missing_signature' }
  const expected = `${prefix}${createHmac(algorithm, secret).update(payload).digest('hex')}`
  const expectedBuffer = Buffer.from(expected)
  const actualBuffer = Buffer.from(String(signatureHeader))
  if (expectedBuffer.length !== actualBuffer.length) return { ok: false, error: 'invalid_signature' }
  return timingSafeEqual(expectedBuffer, actualBuffer) ? { ok: true } : { ok: false, error: 'invalid_signature' }
}

async function readRawBody(req) {
  const chunks = []
  let totalBytes = 0
  for await (const chunk of req) {
    totalBytes += chunk.length
    if (totalBytes > MAX_BODY_BYTES) {
      const error = new Error('request_body_too_large')
      error.status = 413
      throw error
    }
    chunks.push(chunk)
  }
  return Buffer.concat(chunks)
}

loadState()

const server = createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host}`)
  try {
    if (req.method === 'OPTIONS') return send(res, 204, {}, req)
    if (req.method === 'GET' && url.pathname === '/api/health') return send(res, 200, { ok: true }, req)
    if (req.method === 'GET' && url.pathname === '/api/chat-hub/state') return send(res, 200, { ok: true, conversations, runs: flowRuns, channels, knowledge, flows, promptHistory, dashboard: dashboard() }, req)
    if (req.method === 'GET' && url.pathname === '/api/chat-hub/dashboard') return send(res, 200, { ok: true, dashboard: dashboard() }, req)
    if (req.method === 'GET' && url.pathname === '/api/chat-hub/conversations') return send(res, 200, { ok: true, conversations }, req)
    if (req.method === 'GET' && url.pathname === '/api/chat-hub/flow-runs') return send(res, 200, { ok: true, runs: flowRuns }, req)
    if (req.method === 'GET' && url.pathname === '/api/chat-hub/channels') return send(res, 200, { ok: true, channels }, req)
    if (req.method === 'GET' && url.pathname === '/api/chat-hub/knowledge') return send(res, 200, { ok: true, knowledge }, req)
    if (req.method === 'GET' && url.pathname === '/api/chat-hub/flows') return send(res, 200, { ok: true, flows, promptHistory }, req)

    if (req.method === 'POST' && url.pathname.startsWith('/api/chat-hub/') && !hasWriteAccess(req)) {
      return send(res, 401, { ok: false, error: 'unauthorized' }, req)
    }

    if (req.method === 'POST' && url.pathname === '/api/chat-hub/channels') {
      const body = await readJson(req)
      const channel = addChannel(body)
      return send(res, 200, { ok: true, channel, channels }, req)
    }

    if (req.method === 'POST' && url.pathname === '/api/chat-hub/knowledge') {
      const body = await readJson(req)
      const item = {
        id: `ks_${randomUUID().slice(0, 8)}`,
        title: String(body.title || 'Untitled knowledge'),
        status: body.status === 'ready' ? 'ready' : 'needs_review',
        type: String(body.type || 'manual'),
        content: String(body.content || ''),
      }
      knowledge.unshift(item)
      saveState()
      return send(res, 200, { ok: true, item, knowledge }, req)
    }

    const flowSaveMatch = url.pathname.match(/^\/api\/chat-hub\/flows\/([^/]+)$/)
    if (req.method === 'POST' && flowSaveMatch) {
      const body = await readJson(req)
      const flow = saveFlowConfig(flowSaveMatch[1], body)
      if (!flow) return send(res, 404, { ok: false, error: 'flow_not_found' }, req)
      return send(res, 200, { ok: true, flow, flows, promptHistory }, req)
    }

    const runMatch = url.pathname.match(/^\/api\/chat-hub\/conversations\/([^/]+)\/run-flow$/)
    if (req.method === 'POST' && runMatch) {
      const body = await readJson(req)
      const result = runFlow(runMatch[1], body.text)
      if (!result) return send(res, 404, { ok: false, error: 'conversation_not_found' }, req)
      return send(res, 200, { ok: true, ...result, conversations, runs: flowRuns, dashboard: dashboard() }, req)
    }

    const applyMatch = url.pathname.match(/^\/api\/chat-hub\/conversations\/([^/]+)\/apply-suggestion$/)
    if (req.method === 'POST' && applyMatch) {
      const conversation = applySuggestion(applyMatch[1])
      if (!conversation) return send(res, 404, { ok: false, error: 'conversation_not_found' }, req)
      return send(res, 200, { ok: true, conversation, conversations }, req)
    }

    if (req.method === 'POST' && url.pathname === '/webhook/facebook') {
      const rawBody = await readRawBody(req)
      const verification = verifyHmacSignature({
        algorithm: 'sha256',
        secret: process.env.FACEBOOK_APP_SECRET || '',
        signatureHeader: req.headers['x-hub-signature-256'],
        payload: rawBody,
        prefix: 'sha256=',
      })
      if (!verification.ok) return send(res, 401, { ok: false, error: verification.error }, req)
      const conversation = ingestWebhook({ channel: 'facebook', body: JSON.parse(rawBody.toString('utf8') || '{}') })
      return send(res, 200, { ok: true, conversation, conversations, runs: flowRuns, dashboard: dashboard(), signatureVerified: true, testMode: false }, req)
    }

    if (req.method === 'POST' && url.pathname === '/webhook/line') {
      const rawBody = await readRawBody(req)
      const verification = verifyHmacSignature({
        algorithm: 'sha256',
        secret: process.env.LINE_CHANNEL_SECRET || '',
        signatureHeader: req.headers['x-line-signature'],
        payload: rawBody,
        prefix: '',
      })
      if (!verification.ok) return send(res, 401, { ok: false, error: verification.error }, req)
      const conversation = ingestWebhook({ channel: 'line', body: JSON.parse(rawBody.toString('utf8') || '{}') })
      return send(res, 200, { ok: true, conversation, conversations, runs: flowRuns, dashboard: dashboard(), signatureVerified: true, testMode: false }, req)
    }

    if (req.method === 'POST' && url.pathname === '/webhook/facebook/mock') {
      if (!ENABLE_MOCK_WEBHOOKS) return send(res, 404, { ok: false, error: 'mock_webhooks_disabled' }, req)
      const body = await readJson(req)
      const conversation = ingestWebhook({ channel: 'facebook', body })
      return send(res, 200, { ok: true, conversation, conversations, runs: flowRuns, dashboard: dashboard(), signatureVerified: false, testMode: true }, req)
    }

    if (req.method === 'POST' && url.pathname === '/webhook/line/mock') {
      if (!ENABLE_MOCK_WEBHOOKS) return send(res, 404, { ok: false, error: 'mock_webhooks_disabled' }, req)
      const body = await readJson(req)
      const conversation = ingestWebhook({ channel: 'line', body })
      return send(res, 200, { ok: true, conversation, conversations, runs: flowRuns, dashboard: dashboard(), signatureVerified: false, testMode: true }, req)
    }

    send(res, 404, { ok: false, error: 'not_found' }, req)
  } catch (error) {
    send(res, error.status || 400, { ok: false, error: error.message || 'bad_request' }, req)
  }
})

if (process.env.CHAT_HUB_DISABLE_LISTEN !== '1') {
  server.listen(PORT, HOST, () => {
    console.log(`AI Chat Hub API listening on http://${HOST}:${PORT}`)
    console.log(`State file: ${DATA_PATH}`)
    if (!API_KEY) console.warn('CHAT_HUB_API_KEY is not set; local write endpoints are not API-key protected.')
  })
}

export { dashboard, reviewText, runFlow, server, verifyHmacSignature }
