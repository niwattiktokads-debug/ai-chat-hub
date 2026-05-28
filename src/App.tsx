import { useEffect, useMemo, useRef, useState } from 'react'
import {
  addEdge,
  Background,
  type Connection,
  Controls,
  MarkerType,
  ReactFlow,
  type Edge,
  type Node,
  useEdgesState,
  useNodesState,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import {
  Activity,
  AlertTriangle,
  BadgeCheck,
  Bot,
  Brain,
  ChevronRight,
  CircleDashed,
  Copy,
  Database,
  FileText,
  GitBranch,
  Inbox,
  LayoutDashboard,
  Loader2,
  MessageSquareText,
  Moon,
  Plus,
  Radio,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Workflow,
} from 'lucide-react'

type Channel = 'facebook' | 'line'
type Risk = 'low' | 'medium' | 'high'
type Status = 'draft_ready' | 'needs_human' | 'reviewing' | 'sent'

type Message = {
  id: string
  author: string
  direction: 'customer' | 'ai' | 'reviewer' | 'system'
  text: string
  at: string
}

type Review = {
  score: number
  risk: Risk
  reasoning: string
  suggestion: string
}

type FlowStep = {
  id: string
  label: string
  status: 'ok' | 'blocked'
  detail: string
}

type FlowRun = {
  id: string
  conversationId: string
  status: 'passed' | 'blocked'
  durationMs: number
  steps: FlowStep[]
  createdAt: string
}

type Conversation = {
  id: string
  customer: string
  channel: Channel
  page: string
  status: Status
  risk: Risk
  reviewScore: number
  lastMessage: string
  latencyMs: number
  messages: Message[]
  draft: string
  review: Review
}

type ChannelRow = {
  id: string
  name: string
  channel: Channel
  status: 'connected' | 'pending' | 'error' | 'disabled'
  token: string
  url: string
}

type KnowledgeItem = {
  id: string
  title: string
  status: 'ready' | 'needs_review'
  type: string
  content: string
}

type FlowConfig = {
  responderPrompt: string
  reviewerPrompt: string
  scoreThreshold: number
}

type FlowGraphNode = {
  id: string
  type: string
  config: Record<string, string | number | boolean>
  position?: { x: number; y: number }
}

type FlowGraph = {
  nodes: FlowGraphNode[]
  edges: Array<[string, string] | { id?: string; source: string; target: string; label?: string }>
}

type FlowDefinition = {
  id: string
  name: string
  status: 'active' | 'inactive' | 'draft'
  channel: Channel | 'manual'
  version: number
  graph: FlowGraph | Record<string, never>
  config: FlowConfig
  updatedAt: string
}

type PromptHistoryItem = {
  id: string
  flowId: string
  version: number
  field: string
  changedBy: string
  createdAt: string
}

const initialConversations: Conversation[] = [
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

const seedRuns: FlowRun[] = [
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
  {
    id: 'run_9002',
    conversationId: 'conv_1025',
    status: 'blocked',
    durationMs: 1180,
    createdAt: '10:40',
    steps: [
      { id: 's5', label: 'Customer message', status: 'ok', detail: 'Facebook message ingested' },
      { id: 's6', label: 'Responder draft', status: 'ok', detail: 'Discount-safe reply generated' },
      { id: 's7', label: 'Reviewer score', status: 'blocked', detail: 'score 6, risk medium' },
      { id: 's8', label: 'Handoff', status: 'blocked', detail: 'needs human review' },
    ],
  },
]

const initialChannels: ChannelRow[] = [
  { id: 'ch_fb_mankynd', name: 'MAN KYND Messenger', channel: 'facebook', status: 'connected', token: 'secret_ref:facebook_page_token', url: 'https://chat.o-agent.local/webhook/facebook' },
  { id: 'ch_line_main', name: 'LINE OA Main', channel: 'line', status: 'pending', token: 'secret_ref:line_channel_token', url: 'https://chat.o-agent.local/webhook/line' },
]

const initialKnowledge: KnowledgeItem[] = [
  { id: 'ks_refund', title: 'Policy: refund handoff', status: 'needs_review', type: 'policy', content: 'Refund/cancel cases must be reviewed by a human before sending a customer reply.' },
  { id: 'ks_sizing', title: 'Product: sizing answer', status: 'ready', type: 'faq', content: 'Ask for color and size before confirming stock or availability.' },
  { id: 'ks_shipping', title: 'Shipping: tracking rules', status: 'ready', type: 'faq', content: 'Tracking and order status must be checked against the order source before replying.' },
]

const initialFlows: FlowDefinition[] = [
  {
    id: 'flow_default_review',
    name: 'Default Responder + Reviewer',
    status: 'active',
    channel: 'facebook',
    version: 1,
    graph: {},
    config: {
      responderPrompt: 'คุณคือผู้ช่วยตอบลูกค้าของร้าน ตอบสุภาพ กระชับ ภาษาไทย ถ้าไม่รู้ให้บอกว่าจะให้พนักงานตรวจสอบ ห้ามแต่งราคา โปร หรือข้อมูลสินค้าเอง',
      reviewerPrompt: 'คุณคือ QA ตรวจคำตอบ AI ก่อนส่งให้ลูกค้าจริง ให้คะแนน 1-10 ระบุ risk low/medium/high พร้อมเหตุผลและคำแนะนำ ถ้าเสี่ยงให้ handoff',
      scoreThreshold: 8,
    },
    updatedAt: new Date().toISOString(),
  },
]

const API_BASE = import.meta.env.VITE_CHAT_HUB_API_BASE || 'http://127.0.0.1:8788'
const API_KEY = import.meta.env.VITE_CHAT_HUB_API_KEY || ''

function jsonHeaders() {
  return {
    'content-type': 'application/json',
    ...(API_KEY ? { 'x-chat-hub-api-key': API_KEY } : {}),
  }
}

async function getRuntimeState(): Promise<{ conversations: Conversation[]; runs: FlowRun[]; channels: ChannelRow[]; knowledge: KnowledgeItem[]; flows: FlowDefinition[]; promptHistory: PromptHistoryItem[] }> {
  const response = await fetch(`${API_BASE}/api/chat-hub/state`)
  const body = await response.json()
  if (!response.ok || !body.ok) throw new Error(body.error || 'runtime_state_failed')
  return { conversations: body.conversations, runs: body.runs, channels: body.channels, knowledge: body.knowledge, flows: body.flows, promptHistory: body.promptHistory }
}

async function postRunFlow(conversationId: string, text: string): Promise<{ conversations: Conversation[]; runs: FlowRun[]; conversation: Conversation; run: FlowRun }> {
  const response = await fetch(`${API_BASE}/api/chat-hub/conversations/${encodeURIComponent(conversationId)}/run-flow`, {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({ text }),
  })
  const body = await response.json()
  if (!response.ok || !body.ok) throw new Error(body.error || 'run_flow_failed')
  return body
}

async function postApplySuggestion(conversationId: string): Promise<{ conversations: Conversation[]; conversation: Conversation }> {
  const response = await fetch(`${API_BASE}/api/chat-hub/conversations/${encodeURIComponent(conversationId)}/apply-suggestion`, { method: 'POST', headers: API_KEY ? { 'x-chat-hub-api-key': API_KEY } : undefined })
  const body = await response.json()
  if (!response.ok || !body.ok) throw new Error(body.error || 'apply_suggestion_failed')
  return body
}

async function postFlowConfig(flowId: string, config: FlowConfig & { graph?: FlowGraph }): Promise<{ flows: FlowDefinition[]; flow: FlowDefinition; promptHistory: PromptHistoryItem[] }> {
  const response = await fetch(`${API_BASE}/api/chat-hub/flows/${encodeURIComponent(flowId)}`, {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({ ...config, changedBy: 'boss' }),
  })
  const body = await response.json()
  if (!response.ok || !body.ok) throw new Error(body.error || 'flow_save_failed')
  return body
}

async function postChannel(input: { name: string; channel: Channel }): Promise<{ channels: ChannelRow[] }> {
  const response = await fetch(`${API_BASE}/api/chat-hub/channels`, {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify(input),
  })
  const body = await response.json()
  if (!response.ok || !body.ok) throw new Error(body.error || 'channel_add_failed')
  return body
}

async function postKnowledge(input: { title: string; content: string; type: string; status?: 'ready' | 'needs_review' }): Promise<{ knowledge: KnowledgeItem[] }> {
  const response = await fetch(`${API_BASE}/api/chat-hub/knowledge`, {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify(input),
  })
  const body = await response.json()
  if (!response.ok || !body.ok) throw new Error(body.error || 'knowledge_add_failed')
  return body
}

async function postWebhookMock(channel: Channel, text: string): Promise<{ conversations: Conversation[]; conversation: Conversation }> {
  const response = await fetch(`${API_BASE}/webhook/${channel}/mock`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ customer: channel === 'line' ? 'LINE Test' : 'Facebook Test', text }),
  })
  const body = await response.json()
  if (!response.ok || !body.ok) throw new Error(body.error || 'webhook_mock_failed')
  return body
}

const nav = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'conversations', label: 'Conversations', icon: Inbox },
  { id: 'flows', label: 'Flows', icon: Workflow },
  { id: 'channels', label: 'Channels', icon: Radio },
  { id: 'knowledge', label: 'Knowledge', icon: FileText },
] as const

type Route = (typeof nav)[number]['id']

const nodeCatalog: FlowGraphNode[] = [
  { id: 'trigger', type: 'TriggerNode', position: { x: 0, y: 88 }, config: { source: 'facebook' } },
  { id: 'responder', type: 'ResponderNode', position: { x: 230, y: 48 }, config: { model: 'o-agent-default', temperature: 0.2, use_knowledge: true } },
  { id: 'reviewer', type: 'ReviewerNode', position: { x: 470, y: 48 }, config: { score_threshold: 8 } },
  { id: 'condition', type: 'ConditionNode', position: { x: 710, y: 88 }, config: { logic: 'score >= threshold && risk == low' } },
  { id: 'send', type: 'SendReplyNode', position: { x: 950, y: 10 }, config: { test_mode_blocks_send: true } },
  { id: 'handoff', type: 'HandoffNode', position: { x: 950, y: 165 }, config: { status: 'needs_human' } },
]

const defaultGraph: FlowGraph = {
  nodes: nodeCatalog,
  edges: [
    ['trigger', 'responder'],
    ['responder', 'reviewer'],
    ['reviewer', 'condition'],
    { source: 'condition', target: 'send', label: 'pass' },
    { source: 'condition', target: 'handoff', label: 'fail' },
  ],
}

function isFlowGraph(graph: FlowDefinition['graph']): graph is FlowGraph {
  return Boolean(graph && Array.isArray((graph as FlowGraph).nodes) && Array.isArray((graph as FlowGraph).edges))
}

function nodeTitle(type: string) {
  return type.replace('Node', '').replace(/([a-z])([A-Z])/g, '$1 $2')
}

function nodeSubtitle(node: FlowGraphNode) {
  if (node.type === 'TriggerNode') return String(node.config.source || 'manual')
  if (node.type === 'ResponderNode') return `${node.config.model || 'model'} · temp ${node.config.temperature ?? 0.2}`
  if (node.type === 'ReviewerNode') return `threshold ${node.config.score_threshold ?? 8}`
  if (node.type === 'ConditionNode') return String(node.config.logic || 'pass/fail')
  if (node.type === 'SendReplyNode') return 'guarded send'
  return String(node.config.status || 'needs_human')
}

function graphToNodes(graph: FlowDefinition['graph']): Node[] {
  const source = isFlowGraph(graph) ? graph : defaultGraph
  return source.nodes.map((node, index) => ({
    id: node.id,
    type: node.type === 'TriggerNode' ? 'input' : node.type === 'SendReplyNode' || node.type === 'HandoffNode' ? 'output' : 'default',
    position: node.position || { x: 160 * index, y: 120 },
    data: {
      graphType: node.type,
      config: node.config,
      label: (
        <div className="min-w-36">
          <div className="text-sm font-black text-slate-950">{nodeTitle(node.type)}</div>
          <div className="mt-1 text-[11px] font-bold text-slate-500">{nodeSubtitle(node)}</div>
        </div>
      ),
    },
    className: 'rounded-xl border border-slate-300 bg-white px-3 py-2 shadow-sm',
  }))
}

function graphToEdges(graph: FlowDefinition['graph']): Edge[] {
  const source = isFlowGraph(graph) ? graph : defaultGraph
  return source.edges.map((edge) => {
    const sourceId = Array.isArray(edge) ? edge[0] : edge.source
    const targetId = Array.isArray(edge) ? edge[1] : edge.target
    return {
      id: Array.isArray(edge) ? `edge_${sourceId}_${targetId}` : edge.id || `edge_${sourceId}_${targetId}`,
      source: sourceId,
      target: targetId,
      label: Array.isArray(edge) ? undefined : edge.label,
      markerEnd: { type: MarkerType.ArrowClosed },
      style: { stroke: '#0b63f6', strokeWidth: 2 },
    } satisfies Edge
  })
}

function nodesToGraph(nodes: Node[], edges: Edge[]): FlowGraph {
  return {
    nodes: nodes.map((node) => ({
      id: node.id,
      type: String(node.data.graphType || 'ResponderNode'),
      position: node.position,
      config: (node.data.config || {}) as Record<string, string | number | boolean>,
    })),
    edges: edges.map((edge) => ({ id: edge.id, source: edge.source, target: edge.target, label: typeof edge.label === 'string' ? edge.label : undefined })),
  }
}

function App() {
  const [route, setRoute] = useState<Route>('dashboard')
  const [conversations, setConversations] = useState(initialConversations)
  const [selectedId, setSelectedId] = useState(initialConversations[0].id)
  const [runs, setRuns] = useState(seedRuns)
  const [query, setQuery] = useState('')
  const [riskFilter, setRiskFilter] = useState<'all' | Risk>('all')
  const [toast, setToast] = useState('')
  const [testOpen, setTestOpen] = useState(false)
  const [loadingRun, setLoadingRun] = useState(false)
  const [runtimeSource, setRuntimeSource] = useState<'api' | 'demo'>('demo')
  const [channels, setChannels] = useState(initialChannels)
  const [knowledge, setKnowledge] = useState(initialKnowledge)
  const [flows, setFlows] = useState(initialFlows)
  const [promptHistory, setPromptHistory] = useState<PromptHistoryItem[]>([])
  const [testResult, setTestResult] = useState<FlowRun | null>(null)

  const selected = conversations.find((item) => item.id === selectedId) || conversations[0]
  const filteredConversations = conversations.filter((item) => {
    const matchesQuery = [item.customer, item.lastMessage, item.page].join(' ').toLowerCase().includes(query.toLowerCase())
    const matchesRisk = riskFilter === 'all' || item.risk === riskFilter
    return matchesQuery && matchesRisk
  })

  const stats = useMemo(() => {
    const count = conversations.length
    const blocked = conversations.filter((item) => item.status === 'needs_human' || item.risk !== 'low').length
    const avgScore = count ? Math.round(conversations.reduce((sum, item) => sum + item.reviewScore, 0) / count) : 0
    const avgLatency = count ? Math.round(conversations.reduce((sum, item) => sum + item.latencyMs, 0) / count) : 0
    return {
      today: count,
      channels: new Set(conversations.map((item) => item.channel)).size,
      avgScore,
      blocked,
      avgLatency,
    }
  }, [conversations])

  useEffect(() => {
    getRuntimeState()
      .then((data) => {
        setConversations(data.conversations)
        setRuns(data.runs)
        setChannels(data.channels)
        setKnowledge(data.knowledge)
        setFlows(data.flows)
        setPromptHistory(data.promptHistory)
        setSelectedId((current) => data.conversations.some((item) => item.id === current) ? current : data.conversations[0]?.id || current)
        setRuntimeSource('api')
      })
      .catch(() => {
        setRuntimeSource('demo')
      })
  }, [])

  function runReviewFlow(text?: string, keepTestOpen = false) {
    setLoadingRun(true)
    const targetText = text || selected.lastMessage
    postRunFlow(selected.id, targetText)
      .then((data) => {
        setConversations(data.conversations)
        setRuns(data.runs)
        setSelectedId(data.conversation.id)
        setTestResult(data.run)
        setRuntimeSource('api')
        setToast(data.run.status === 'passed' ? 'Reviewer passed. Reply is ready for approval.' : 'Reviewer blocked this reply. Handoff required.')
        setLoadingRun(false)
        if (!keepTestOpen) setTestOpen(false)
      })
      .catch(() => window.setTimeout(() => {
      const risky = /คืนเงิน|ยกเลิก|ลด|โปร|ราคา/i.test(targetText)
      const high = /คืนเงิน|ยกเลิก/i.test(targetText)
      const review: Review = {
        score: high ? 4 : risky ? 6 : 9,
        risk: high ? 'high' : risky ? 'medium' : 'low',
        reasoning: high
          ? 'Refund/cancel ต้องตรวจข้อมูล order และนโยบายก่อนตอบจริง'
          : risky
            ? 'มีความเสี่ยงเรื่องราคา โปร หรือส่วนลด ต้องให้คนตรวจ'
            : 'คำตอบอยู่ในกรอบ ปลอดภัย และไม่เดาข้อมูลสินค้า',
        suggestion: high || risky ? 'handoff ให้พนักงานตรวจสอบก่อนส่ง' : 'ส่งได้หลังตรวจ source สั้น ๆ',
      }
      const nextStatus: Status = review.score >= 8 && review.risk === 'low' ? 'draft_ready' : 'needs_human'
      const run: FlowRun = {
        id: `run_${Date.now()}`,
        conversationId: selected.id,
        status: nextStatus === 'draft_ready' ? 'passed' : 'blocked',
        durationMs: high ? 1640 : risky ? 1190 : 780,
        createdAt: new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }),
        steps: [
          { id: 'customer', label: 'Customer message', status: 'ok', detail: targetText },
          { id: 'responder', label: 'Responder draft', status: 'ok', detail: selected.draft },
          { id: 'reviewer', label: 'Reviewer score', status: nextStatus === 'draft_ready' ? 'ok' : 'blocked', detail: `score ${review.score}, risk ${review.risk}` },
          { id: 'handoff', label: 'Send/Handoff', status: nextStatus === 'draft_ready' ? 'ok' : 'blocked', detail: nextStatus === 'draft_ready' ? 'ready for approval' : 'needs human review' },
        ],
      }
      setConversations((current) => current.map((item) => (
        item.id === selected.id ? { ...item, review, reviewScore: review.score, risk: review.risk, status: nextStatus } : item
      )))
      setRuns((current) => [run, ...current])
      setTestResult(run)
      setToast(nextStatus === 'draft_ready' ? 'Reviewer passed. Reply is ready for approval.' : 'Reviewer blocked this reply. Handoff required.')
      setLoadingRun(false)
      if (!keepTestOpen) setTestOpen(false)
      setRuntimeSource('demo')
    }, 650))
  }

  function applySuggestion() {
    postApplySuggestion(selected.id)
      .then((data) => {
        setConversations(data.conversations)
        setSelectedId(data.conversation.id)
        setRuntimeSource('api')
        setToast('Reviewer suggestion applied to the draft. Handoff remains required.')
      })
      .catch(() => setToast('Apply suggestion needs the local API server.'))
  }

  function saveFlow(config: FlowConfig & { graph?: FlowGraph }) {
    const flow = flows[0]
    if (!flow) return
    postFlowConfig(flow.id, config)
      .then((data) => {
        setFlows(data.flows)
        setPromptHistory(data.promptHistory)
        setRuntimeSource('api')
        setToast(`Flow saved as version ${data.flow.version}.`)
      })
      .catch(() => setToast('Flow save needs the local API server.'))
  }

  function addChannel(channel: Channel) {
    postChannel({ name: channel === 'line' ? 'LINE OA Test Channel' : 'Facebook Test Page', channel })
      .then((data) => {
        setChannels(data.channels)
        setRuntimeSource('api')
        setToast(`${channel.toUpperCase()} channel added with masked token.`)
      })
      .catch(() => setToast('Add channel needs the local API server.'))
  }

  function addKnowledge() {
    postKnowledge({
      title: 'New guarded answer rule',
      type: 'manual',
      status: 'needs_review',
      content: 'AI must handoff any customer question about price, discount, cancellation, refund, or missing order facts.',
    })
      .then((data) => {
        setKnowledge(data.knowledge)
        setRuntimeSource('api')
        setToast('Knowledge item added and marked needs review.')
      })
      .catch(() => setToast('Add knowledge needs the local API server.'))
  }

  function ingestMock(channel: Channel) {
    postWebhookMock(channel, channel === 'line' ? 'ขอยกเลิกแล้วคืนเงินค่ะ' : 'ลดราคาได้ไหมคะ')
      .then((data) => {
        setConversations(data.conversations)
        setSelectedId(data.conversation.id)
        setRoute('conversations')
        setRuntimeSource('api')
        setToast(`${channel.toUpperCase()} webhook mock ingested into review queue.`)
      })
      .catch(() => setToast('Webhook mock needs the local API server.'))
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="grid min-h-screen grid-cols-[280px_minmax(0,1fr)] max-lg:grid-cols-1">
        <aside className="border-r border-slate-800/80 bg-white text-slate-950 max-lg:hidden">
          <div className="flex h-16 items-center gap-3 border-b border-slate-200 px-5">
            <div className="grid h-9 w-9 place-items-center rounded-lg bg-[#0b1220] text-sky-300">
              <Bot size={20} />
            </div>
            <div>
              <div className="text-sm font-black tracking-tight">AI Chat Hub</div>
              <div className="text-[11px] font-semibold uppercase text-slate-500">O-Agent Runtime</div>
            </div>
          </div>
          <nav className="space-y-1 p-3">
            {nav.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setRoute(item.id)}
                className={`flex h-11 w-full items-center gap-3 rounded-lg px-3 text-sm font-bold transition ${
                  route === item.id ? 'bg-[#0b1220] text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950'
                }`}
              >
                <item.icon size={18} />
                {item.label}
              </button>
            ))}
          </nav>
          <div className="mx-3 mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div className="flex items-center gap-2 text-xs font-black uppercase text-slate-500">
              <ShieldCheck size={14} /> Guardrail
            </div>
            <p className="mt-2 text-sm font-semibold leading-5 text-slate-700">Auto-send is blocked unless Reviewer score passes and risk is low.</p>
          </div>
        </aside>

        <main className="min-w-0 overflow-x-hidden bg-[linear-gradient(180deg,#f8fafc_0%,#eef4ff_48%,#f8fafc_100%)] text-slate-950">
          <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-3 border-b border-slate-200/80 bg-white/90 px-5 backdrop-blur">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-sky-700">
                <Sparkles size={14} /> Premium AI Operations Command Center
              </div>
              <h1 className="truncate text-xl font-black tracking-tight">{titleForRoute(route)}</h1>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <div className="hidden items-center gap-2 sm:flex">
                <Badge tone={runtimeSource === 'api' ? 'green' : 'yellow'}>{runtimeSource === 'api' ? 'API live' : 'Demo data'}</Badge>
                <Badge tone="green">Webhook live</Badge>
                <Badge tone="blue">Reviewer on</Badge>
              </div>
              <IconButton label="Toggle dark mode preview"><Moon size={17} /></IconButton>
            </div>
          </header>

          <nav className="sticky top-16 z-10 flex gap-2 overflow-x-auto border-b border-slate-200 bg-white px-3 py-2 lg:hidden" aria-label="Mobile navigation">
            {nav.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setRoute(item.id)}
                className={`inline-flex h-10 shrink-0 items-center gap-2 rounded-lg px-3 text-xs font-black transition ${
                  route === item.id ? 'bg-[#0b1220] text-white' : 'bg-slate-100 text-slate-600'
                }`}
              >
                <item.icon size={15} />
                {item.label}
              </button>
            ))}
          </nav>

          <div className="p-5">
            {route === 'dashboard' && <Dashboard stats={stats} conversations={conversations} runs={runs} onOpenConversation={(id) => { setSelectedId(id); setRoute('conversations') }} />}
            {route === 'conversations' && (
              <Conversations
                conversations={filteredConversations}
                selected={selected}
                query={query}
                riskFilter={riskFilter}
                runs={runs.filter((run) => run.conversationId === selected.id)}
                loadingRun={loadingRun}
                onQuery={setQuery}
                onRiskFilter={setRiskFilter}
                onSelect={setSelectedId}
                onRun={() => runReviewFlow()}
                onApplySuggestion={applySuggestion}
              />
            )}
            {route === 'flows' && <Flows key={`${(flows[0] || initialFlows[0]).id}-${(flows[0] || initialFlows[0]).version}`} flow={flows[0] || initialFlows[0]} history={promptHistory} onSave={saveFlow} onTest={() => { setTestResult(null); setTestOpen(true) }} />}
            {route === 'channels' && <Channels rows={channels} onAdd={addChannel} onMock={ingestMock} onCopy={() => setToast('Webhook URL copied. Token remains masked.')} />}
            {route === 'knowledge' && <Knowledge items={knowledge} onAdd={addKnowledge} />}
          </div>
        </main>
      </div>

      {testOpen && <TestDialog loading={loadingRun} result={testResult} onClose={() => setTestOpen(false)} onRun={(text) => runReviewFlow(text, true)} />}
      {toast && <Toast message={toast} onClose={() => setToast('')} />}
    </div>
  )
}

function titleForRoute(route: Route) {
  if (route === 'dashboard') return 'Dashboard'
  if (route === 'conversations') return 'Conversations & Review Queue'
  if (route === 'flows') return 'Flow Runtime'
  if (route === 'channels') return 'Channel Control'
  return 'Knowledge Base'
}

function Dashboard({ stats, conversations, runs, onOpenConversation }: {
  stats: { today: number; channels: number; avgScore: number; blocked: number; avgLatency: number }
  conversations: Conversation[]
  runs: FlowRun[]
  onOpenConversation: (id: string) => void
}) {
  return (
    <div className="space-y-5">
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <Metric icon={MessageSquareText} label="Messages today" value={stats.today} />
        <Metric icon={Radio} label="Active channels" value={stats.channels} />
        <Metric icon={BadgeCheck} label="Avg review score" value={stats.avgScore} />
        <Metric icon={AlertTriangle} label="Blocked replies" value={stats.blocked} tone="red" />
        <Metric icon={Activity} label="Avg latency" value={`${stats.avgLatency}ms`} />
      </section>
      <section className="grid gap-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(360px,.7fr)]">
        <Panel title="Recent flow runs" action={<Badge tone="blue">{runs.length} runs</Badge>}>
          <div className="overflow-hidden rounded-lg border border-slate-200">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr><th className="px-4 py-3">Run</th><th>Conversation</th><th>Status</th><th>Latency</th><th>Created</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white">
                {runs.map((run) => (
                  <tr key={run.id} className="font-semibold">
                    <td className="px-4 py-3 text-slate-600">{run.id}</td>
                    <td>{run.conversationId}</td>
                    <td><Badge tone={run.status === 'passed' ? 'green' : 'red'}>{run.status}</Badge></td>
                    <td>{run.durationMs}ms</td>
                    <td className="text-slate-500">{run.createdAt}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
        <Panel title="Review queue">
          <div className="space-y-3">
            {conversations.filter((item) => item.status === 'needs_human' || item.risk !== 'low').map((item) => (
              <button key={item.id} type="button" onClick={() => onOpenConversation(item.id)} className="flex w-full items-center justify-between rounded-lg border border-slate-200 bg-white p-3 text-left transition hover:border-sky-300">
                <div>
                  <div className="font-black">{item.customer}</div>
                  <div className="mt-1 line-clamp-1 text-sm text-slate-500">{item.lastMessage}</div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={item.risk === 'high' ? 'red' : 'yellow'}>{item.risk}</Badge>
                  <ChevronRight size={16} />
                </div>
              </button>
            ))}
          </div>
        </Panel>
      </section>
    </div>
  )
}

function Conversations(props: {
  conversations: Conversation[]
  selected: Conversation
  query: string
  riskFilter: 'all' | Risk
  runs: FlowRun[]
  loadingRun: boolean
  onQuery: (value: string) => void
  onRiskFilter: (value: 'all' | Risk) => void
  onSelect: (id: string) => void
  onRun: () => void
  onApplySuggestion: () => void
}) {
  return (
    <div className="grid min-h-[calc(100vh-112px)] gap-5 xl:grid-cols-[410px_minmax(0,1fr)]">
      <Panel title="All conversations" action={<Badge tone="blue">{props.conversations.length} rows</Badge>}>
        <div className="mb-3 grid grid-cols-[1fr_130px] gap-2">
          <label className="flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-500">
            <Search size={16} />
            <input value={props.query} onChange={(event) => props.onQuery(event.target.value)} className="min-w-0 flex-1 bg-transparent font-semibold outline-none" placeholder="Search customer, page, message" />
          </label>
          <select value={props.riskFilter} onChange={(event) => props.onRiskFilter(event.target.value as 'all' | Risk)} className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold">
            <option value="all">All risk</option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </div>
        <div className="space-y-2">
          {props.conversations.map((item) => (
            <button key={item.id} type="button" onClick={() => props.onSelect(item.id)} className={`w-full rounded-lg border p-3 text-left transition ${props.selected.id === item.id ? 'border-sky-400 bg-sky-50' : 'border-slate-200 bg-white hover:border-slate-300'}`}>
              <div className="flex items-center justify-between gap-2">
                <div className="font-black">{item.customer}</div>
                <Badge tone={item.channel === 'facebook' ? 'blue' : 'green'}>{item.channel}</Badge>
              </div>
              <div className="mt-1 line-clamp-1 text-sm font-semibold text-slate-600">{item.lastMessage}</div>
              <div className="mt-3 flex items-center justify-between text-xs font-black uppercase text-slate-500">
                <span>{item.page}</span>
                <span>score {item.reviewScore} · {item.risk}</span>
              </div>
            </button>
          ))}
        </div>
      </Panel>
      <Panel
        title={props.selected.customer}
        action={<button type="button" onClick={props.onRun} className="inline-flex h-9 items-center gap-2 rounded-lg bg-[#0b63f6] px-3 text-sm font-black text-white disabled:opacity-60" disabled={props.loadingRun}>{props.loadingRun ? <Loader2 className="animate-spin" size={16} /> : <Brain size={16} />} Run AI review</button>}
      >
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="space-y-3">
            {props.selected.messages.map((message) => (
              <div key={message.id} className={`max-w-[82%] rounded-xl border p-3 ${message.direction === 'customer' ? 'border-slate-200 bg-white' : 'ml-auto border-sky-200 bg-sky-50'}`}>
                <div className="flex items-center justify-between gap-3 text-xs font-black uppercase text-slate-500">
                  <span>{message.author}</span><span>{message.at}</span>
                </div>
                <p className="mt-2 text-sm font-semibold leading-6">{message.text}</p>
              </div>
            ))}
          </div>
          <div className="space-y-4">
            <CardTitle icon={ShieldCheck} title="Reviewer output" />
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <div className="flex items-center justify-between">
                <div className="text-3xl font-black">{props.selected.review.score}/10</div>
                <Badge tone={props.selected.review.risk === 'low' ? 'green' : props.selected.review.risk === 'medium' ? 'yellow' : 'red'}>{props.selected.review.risk}</Badge>
              </div>
              <p className="mt-4 text-sm font-semibold leading-6 text-slate-700">{props.selected.review.reasoning}</p>
              <div className="mt-4 rounded-lg bg-slate-50 p-3 text-sm font-semibold text-slate-600">{props.selected.review.suggestion}</div>
              <button type="button" onClick={props.onApplySuggestion} className="mt-4 inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-black text-slate-800">
                <ShieldCheck size={16} /> Apply suggestion
              </button>
            </div>
            <CardTitle icon={GitBranch} title="Timeline" />
            <div className="space-y-2">
              {(props.runs[0]?.steps || []).map((step) => (
                <div key={step.id} className="flex gap-3 rounded-lg border border-slate-200 bg-white p-3">
                  <div className={`mt-0.5 h-3 w-3 rounded-full ${step.status === 'ok' ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                  <div>
                    <div className="text-sm font-black">{step.label}</div>
                    <div className="mt-1 text-xs font-semibold text-slate-500">{step.detail}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Panel>
    </div>
  )
}

function Flows({ flow, history, onSave, onTest }: { flow: FlowDefinition; history: PromptHistoryItem[]; onSave: (config: FlowConfig & { graph?: FlowGraph }) => void; onTest: () => void }) {
  const [responderPrompt, setResponderPrompt] = useState(flow.config.responderPrompt)
  const [reviewerPrompt, setReviewerPrompt] = useState(flow.config.reviewerPrompt)
  const [scoreThreshold, setScoreThreshold] = useState(flow.config.scoreThreshold)
  const [nodes, setNodes, onNodesChange] = useNodesState(graphToNodes(flow.graph))
  const [edges, setEdges, onEdgesChange] = useEdgesState(graphToEdges(flow.graph))
  const [selectedNodeId, setSelectedNodeId] = useState(nodes[0]?.id || '')
  const nodeIdCounter = useRef(nodes.length)
  const selectedNode = nodes.find((node) => node.id === selectedNodeId) || nodes[0]

  function addNode(template: FlowGraphNode) {
    nodeIdCounter.current += 1
    const id = `${template.type.replace('Node', '').toLowerCase()}_${nodeIdCounter.current}`
    const node = graphToNodes({
      nodes: [{ ...template, id, position: { x: 120 + nodes.length * 36, y: 120 + nodes.length * 24 } }],
      edges: [],
    })[0]
    setNodes((current) => [...current, node])
    setSelectedNodeId(id)
  }

  function updateSelectedConfig(key: string, value: string | number | boolean) {
    if (!selectedNode) return
    setNodes((current) => current.map((node) => {
      if (node.id !== selectedNode.id) return node
      const config = { ...((node.data.config || {}) as Record<string, string | number | boolean>), [key]: value }
      const graphNode: FlowGraphNode = { id: node.id, type: String(node.data.graphType), position: node.position, config }
      return graphToNodes({ nodes: [graphNode], edges: [] })[0]
    }))
  }

  function removeSelectedNode() {
    if (!selectedNode || selectedNode.id === 'trigger') return
    setNodes((current) => current.filter((node) => node.id !== selectedNode.id))
    setEdges((current) => current.filter((edge) => edge.source !== selectedNode.id && edge.target !== selectedNode.id))
    setSelectedNodeId('trigger')
  }

  function saveGraph() {
    onSave({ responderPrompt, reviewerPrompt, scoreThreshold, graph: nodesToGraph(nodes, edges) })
  }

  return (
    <div className="grid min-h-[calc(100vh-112px)] gap-5 xl:grid-cols-[220px_minmax(0,1fr)_390px]">
      <Panel title="Node palette" action={<Badge tone="blue">{nodes.length} nodes</Badge>}>
        <div className="space-y-2">
          {nodeCatalog.map((node) => (
            <button key={node.type} type="button" onClick={() => addNode(node)} className="flex w-full items-center justify-between rounded-lg border border-slate-200 bg-white p-3 text-left transition hover:border-sky-300 hover:bg-sky-50">
              <div>
                <div className="text-sm font-black">{nodeTitle(node.type)}</div>
                <div className="mt-1 text-xs font-semibold text-slate-500">{nodeSubtitle(node)}</div>
              </div>
              <Plus size={16} className="text-sky-600" />
            </button>
          ))}
        </div>
        <div className="mt-4 rounded-lg bg-slate-50 p-3 text-xs font-bold leading-5 text-slate-500">
          Click a node to inspect. Drag nodes on the canvas. Connect handles to change execution order.
        </div>
      </Panel>
      <Panel
        title={`${flow.name} · v${flow.version}`}
        action={(
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={onTest} className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-black text-slate-800"><Send size={16} /> Test</button>
            <button type="button" onClick={saveGraph} className="inline-flex h-9 items-center gap-2 rounded-lg bg-[#0b63f6] px-3 text-sm font-black text-white"><GitBranch size={16} /> Save graph</button>
          </div>
        )}
      >
        <div className="h-[640px] overflow-hidden rounded-xl border border-slate-200 bg-white bg-[radial-gradient(#cbd5e1_1px,transparent_1px)] [background-size:18px_18px]">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            fitView
            nodesDraggable
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={(connection: Connection) => setEdges((current) => addEdge({ ...connection, markerEnd: { type: MarkerType.ArrowClosed }, style: { stroke: '#0b63f6', strokeWidth: 2 } }, current))}
            onNodeClick={(_, node) => setSelectedNodeId(node.id)}
          >
            <Background />
            <Controls />
          </ReactFlow>
        </div>
      </Panel>
      <div className="space-y-5">
        <Panel title={selectedNode ? `Inspector · ${nodeTitle(String(selectedNode.data.graphType))}` : 'Inspector'}>
          <div className="space-y-4">
            {selectedNode && (
              <div className="rounded-lg border border-slate-200 bg-white p-3">
                <div className="text-xs font-black uppercase text-slate-400">Selected node</div>
                <div className="mt-1 font-black">{selectedNode.id}</div>
                <div className="mt-1 text-sm font-semibold text-slate-500">{nodeSubtitle({ id: selectedNode.id, type: String(selectedNode.data.graphType), config: (selectedNode.data.config || {}) as Record<string, string | number | boolean> })}</div>
              </div>
            )}
            {selectedNode?.data.graphType === 'TriggerNode' && (
              <label className="grid gap-2 text-sm font-black text-slate-700">
                Source
                <select value={String(((selectedNode.data.config || {}) as Record<string, string>).source || 'facebook')} onChange={(event) => updateSelectedConfig('source', event.target.value)} className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold">
                  <option value="facebook">facebook</option>
                  <option value="line">line</option>
                  <option value="manual">manual</option>
                </select>
              </label>
            )}
            {selectedNode?.data.graphType === 'ResponderNode' && (
              <>
                <label className="grid gap-2 text-sm font-black text-slate-700">
                  Model
                  <input value={String(((selectedNode.data.config || {}) as Record<string, string>).model || '')} onChange={(event) => updateSelectedConfig('model', event.target.value)} className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold outline-none focus:border-sky-400" />
                </label>
                <label className="grid gap-2 text-sm font-black text-slate-700">
                  Temperature
                  <input type="number" step="0.1" min={0} max={1} value={Number(((selectedNode.data.config || {}) as Record<string, number>).temperature ?? 0.2)} onChange={(event) => updateSelectedConfig('temperature', Number(event.target.value))} className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold outline-none focus:border-sky-400" />
                </label>
              </>
            )}
            {selectedNode?.data.graphType === 'ReviewerNode' && (
              <label className="grid gap-2 text-sm font-black text-slate-700">
                Node score threshold
                <input type="number" min={1} max={10} value={Number(((selectedNode.data.config || {}) as Record<string, number>).score_threshold ?? scoreThreshold)} onChange={(event) => updateSelectedConfig('score_threshold', Number(event.target.value))} className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold outline-none focus:border-sky-400" />
              </label>
            )}
            {selectedNode?.data.graphType === 'ConditionNode' && (
              <label className="grid gap-2 text-sm font-black text-slate-700">
                Logic
                <input value={String(((selectedNode.data.config || {}) as Record<string, string>).logic || '')} onChange={(event) => updateSelectedConfig('logic', event.target.value)} className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold outline-none focus:border-sky-400" />
              </label>
            )}
            <label className="grid gap-2 text-sm font-black text-slate-700">
              Responder prompt
              <textarea value={responderPrompt} onChange={(event) => setResponderPrompt(event.target.value)} className="min-h-32 rounded-lg border border-slate-200 bg-white p-3 text-sm font-semibold leading-6 outline-none focus:border-sky-400" />
            </label>
            <label className="grid gap-2 text-sm font-black text-slate-700">
              Reviewer prompt
              <textarea value={reviewerPrompt} onChange={(event) => setReviewerPrompt(event.target.value)} className="min-h-32 rounded-lg border border-slate-200 bg-white p-3 text-sm font-semibold leading-6 outline-none focus:border-sky-400" />
            </label>
            <label className="grid gap-2 text-sm font-black text-slate-700">
              Score threshold
              <input type="number" min={1} max={10} value={scoreThreshold} onChange={(event) => setScoreThreshold(Number(event.target.value))} className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold outline-none focus:border-sky-400" />
            </label>
            <button type="button" onClick={saveGraph} className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-[#0b63f6] px-4 text-sm font-black text-white">
              <GitBranch size={16} /> Save graph version
            </button>
            <button type="button" onClick={removeSelectedNode} disabled={!selectedNode || selectedNode.id === 'trigger'} className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-rose-200 bg-white px-4 text-sm font-black text-rose-700 disabled:cursor-not-allowed disabled:opacity-40">
              <AlertTriangle size={16} /> Remove selected node
            </button>
          </div>
        </Panel>
        <Panel title="Prompt history">
          <div className="space-y-2">
            {history.slice(0, 5).map((item) => (
              <div key={item.id} className="rounded-lg border border-slate-200 bg-white p-3">
                <div className="text-sm font-black">Version {item.version}</div>
                <div className="mt-1 text-xs font-semibold text-slate-500">{item.field} · {item.changedBy} · {item.createdAt}</div>
              </div>
            ))}
            {!history.length && <div className="rounded-lg border border-dashed border-slate-300 p-4 text-sm font-semibold text-slate-500">No prompt changes yet.</div>}
          </div>
        </Panel>
      </div>
    </div>
  )
}

function Channels({ rows, onAdd, onMock, onCopy }: { rows: ChannelRow[]; onAdd: (channel: Channel) => void; onMock: (channel: Channel) => void; onCopy: () => void }) {
  return (
    <Panel
      title="Channel management"
      action={(
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => onAdd('facebook')} className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-black"><Plus size={16} /> Facebook</button>
          <button type="button" onClick={() => onAdd('line')} className="inline-flex h-9 items-center gap-2 rounded-lg bg-[#0b63f6] px-3 text-sm font-black text-white"><Plus size={16} /> LINE</button>
        </div>
      )}
    >
      <div className="grid gap-3">
        {rows.map((row) => (
          <div key={row.name} className="grid gap-4 rounded-xl border border-slate-200 bg-white p-4 lg:grid-cols-[1fr_160px_170px_1fr_120px] lg:items-center">
            <div><div className="font-black">{row.name}</div><div className="mt-1 text-sm font-semibold text-slate-500">{row.channel}</div></div>
            <Badge tone={row.status === 'connected' ? 'green' : row.status === 'error' ? 'red' : 'yellow'}>{row.status}</Badge>
            <div className="font-mono text-sm font-black text-slate-600">{row.token}</div>
            <div className="truncate rounded-lg bg-slate-50 px-3 py-2 font-mono text-xs font-bold text-slate-500">{row.url}</div>
            <div className="flex gap-2">
              <button type="button" onClick={onCopy} className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-black"><Copy size={15} /> Copy</button>
              <button type="button" onClick={() => onMock(row.channel)} className="inline-flex h-9 items-center justify-center rounded-lg bg-slate-950 px-3 text-sm font-black text-white">Mock</button>
            </div>
          </div>
        ))}
      </div>
    </Panel>
  )
}

function Knowledge({ items, onAdd }: { items: KnowledgeItem[]; onAdd: () => void }) {
  return (
    <Panel title="FAQ and product knowledge" action={<button type="button" onClick={onAdd} className="inline-flex h-9 items-center gap-2 rounded-lg bg-[#0b63f6] px-3 text-sm font-black text-white"><Plus size={16} /> New item</button>}>
      <div className="grid gap-3 md:grid-cols-3">
        {items.map((item) => (
          <div key={item.id} className="rounded-xl border border-slate-200 bg-white p-4">
            <Badge tone={item.status === 'ready' ? 'green' : 'yellow'}>{item.status === 'ready' ? 'ready' : 'needs review'}</Badge>
            <h3 className="mt-3 text-base font-black">{item.title}</h3>
            <p className="mt-1 text-xs font-black uppercase text-slate-400">{item.type}</p>
            <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">{item.content}</p>
          </div>
        ))}
      </div>
    </Panel>
  )
}

function TestDialog({ loading, result, onClose, onRun }: { loading: boolean; result: FlowRun | null; onClose: () => void; onRun: (text: string) => void }) {
  const [text, setText] = useState('มีสีดำพร้อมส่งไหมคะ')
  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-slate-950/55 p-4">
      <div className="w-full max-w-3xl rounded-2xl bg-white p-5 shadow-2xl">
        <div className="flex items-center justify-between">
          <div><h2 className="text-lg font-black">Test flow</h2><p className="mt-1 text-sm font-semibold text-slate-500">Test mode never sends a real customer reply.</p></div>
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-black">Close</button>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(280px,.8fr)]">
          <div>
            <textarea value={text} onChange={(event) => setText(event.target.value)} className="min-h-36 w-full rounded-xl border border-slate-200 p-3 text-sm font-semibold outline-none focus:border-sky-400" />
            <button type="button" onClick={() => onRun(text)} disabled={loading} className="mt-4 inline-flex h-10 items-center gap-2 rounded-lg bg-[#0b63f6] px-4 text-sm font-black text-white disabled:opacity-60">
              {loading ? <Loader2 className="animate-spin" size={16} /> : <Workflow size={16} />} Run test
            </button>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div className="flex items-center justify-between">
              <div className="text-sm font-black uppercase text-slate-500">Step output</div>
              {result && <Badge tone={result.status === 'passed' ? 'green' : 'red'}>{result.status}</Badge>}
            </div>
            <div className="mt-3 space-y-2">
              {(result?.steps || []).map((step) => (
                <div key={step.id} className="rounded-lg border border-slate-200 bg-white p-3">
                  <div className="flex items-center gap-2">
                    <div className={`h-2.5 w-2.5 rounded-full ${step.status === 'ok' ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                    <div className="text-sm font-black">{step.label}</div>
                  </div>
                  <div className="mt-1 text-xs font-semibold leading-5 text-slate-500">{step.detail}</div>
                </div>
              ))}
              {!result && <div className="rounded-lg border border-dashed border-slate-300 p-4 text-sm font-semibold text-slate-500">Run a simulated message to inspect customer message, responder draft, reviewer score, and send/handoff gate.</div>}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function Metric({ icon: Icon, label, value, tone = 'blue' }: { icon: typeof Activity; label: string; value: string | number; tone?: 'blue' | 'red' }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className={`grid h-10 w-10 place-items-center rounded-lg ${tone === 'red' ? 'bg-rose-50 text-rose-600' : 'bg-sky-50 text-sky-700'}`}><Icon size={20} /></div>
      <div className="mt-5 text-3xl font-black tracking-tight">{value}</div>
      <div className="mt-1 text-xs font-black uppercase text-slate-500">{label}</div>
    </div>
  )
}

function Panel({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white/70 p-4 shadow-sm backdrop-blur">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-base font-black tracking-tight">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}

function Badge({ children, tone }: { children: React.ReactNode; tone: 'green' | 'blue' | 'yellow' | 'red' }) {
  const styles = {
    green: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    blue: 'bg-sky-50 text-sky-700 ring-sky-200',
    yellow: 'bg-amber-50 text-amber-700 ring-amber-200',
    red: 'bg-rose-50 text-rose-700 ring-rose-200',
  }
  return <span className={`inline-flex h-7 items-center rounded-full px-2.5 text-xs font-black uppercase ring-1 ${styles[tone]}`}>{children}</span>
}

function IconButton({ label, children }: { label: string; children: React.ReactNode }) {
  return <button type="button" aria-label={label} title={label} className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 bg-white text-slate-700">{children}</button>
}

function CardTitle({ icon: Icon, title }: { icon: typeof CircleDashed; title: string }) {
  return <div className="flex items-center gap-2 text-sm font-black uppercase text-slate-500"><Icon size={16} /> {title}</div>
}

function Toast({ message, onClose }: { message: string; onClose: () => void }) {
  return (
    <button type="button" onClick={onClose} className="fixed bottom-5 right-5 z-50 flex max-w-sm items-center gap-3 rounded-xl bg-slate-950 px-4 py-3 text-left text-sm font-bold text-white shadow-2xl">
      <Database size={18} className="text-sky-300" />
      {message}
    </button>
  )
}

export default App
