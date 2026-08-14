import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import { decodePcm, pcmBase64, resample } from './audio.ts'
import css from './QwenVoice.module.css'

type VoiceProps = PropsRuntime<'shell.overlay'> & {
  openSession(sessionId: string): void
}
type VoiceState = 'idle' | 'listening' | 'thinking' | 'speaking'

const GATEWAY_ORIGIN = 'http://127.0.0.1:3101'
const INPUT_RATE = 16000

interface GatewayEvent {
  type?: string
  state?: VoiceState | string
  role?: string
  content?: string
  audio?: string
  sampleRate?: number
  inputSampleRate?: number
  message?: string
  responseId?: string
  task?: GatewayTask
}

interface GatewayTask {
  id?: string
  objective?: string
  status?: string
  elapsedMs?: number
  error?: string
  delegation?: {
    title?: string
    sessionId?: string
  }
}

interface TaskView {
  id: string
  title: string
  phase: string
  elapsedMs: number
  error?: string
  targetSessionId?: string
}

function socketUrl(sessionId: string): string {
  return `ws://127.0.0.1:3101/api/realtime?sessionId=${encodeURIComponent(sessionId)}`
}

function persistentVoiceSessionId(): string {
  const key = 'dsh-qwen-voice.session-id'
  // A browser tab is one independent DSH voice lane. sessionStorage survives
  // reloads and in-tab conversation switches, but does not merge multiple
  // DSH tabs into the same Realtime/ACP coordinator session.
  const existing = sessionStorage.getItem(key)
  if (existing) return existing
  const created = `dsh-voice-${crypto.randomUUID()}`
  sessionStorage.setItem(key, created)
  return created
}

function labelFor(state: VoiceState, enabled: boolean, connected: boolean): string {
  if (!connected) return '正在连接 Qwen Audio Agent'
  if (!enabled) return 'Qwen 语音待命'
  if (state === 'listening') return '正在听你说'
  if (state === 'thinking') return '正在理解'
  if (state === 'speaking') return '正在播报'
  return '语音已开启'
}

function taskPhaseLabel(phase: string): string {
  return ({
    accepted: '等待调度',
    queued: '排队中',
    running: '执行中',
    progress: '执行中',
    delegated: '已派发到 DSH 会话',
    finalizing: '整理结果',
    completed: '已完成',
    failed: '失败',
    cancelled: '已取消',
  } as Record<string, string>)[phase] || phase
}

/** Qwen Audio Agent control mounted beside the DSH send action. */
export function QwenVoice(props: VoiceProps): React.JSX.Element {
  const currentSessionId = props.useSessions(value => value.current)
  const [sessionId] = useState(persistentVoiceSessionId)
  const [enabled, setEnabled] = useState(false)
  const [open, setOpen] = useState(false)
  const [connected, setConnected] = useState(false)
  const [state, setState] = useState<VoiceState>('idle')
  const [transcript, setTranscript] = useState('点击麦克风，然后直接说出任务。')
  const [error, setError] = useState('')
  const [tasks, setTasks] = useState<TaskView[]>([])
  const socketRef = useRef<WebSocket | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const playbackCursorRef = useRef(0)
  const playbackStartedRef = useRef(new Set<string>())
  const playbackEndTimersRef = useRef(new Map<string, number>())
  const playbackSourcesRef = useRef(new Set<AudioBufferSourceNode>())
  const activeResponseIdRef = useRef('')
  const buttonRef = useRef<HTMLButtonElement | null>(null)

  const toggle = useCallback((): void => {
    setOpen(true)
    setError('')
    setEnabled(value => !value)
  }, [])

  useEffect(() => {
    const button = buttonRef.current
    if (button === null) return undefined
    button.addEventListener('click', toggle)
    return () => button.removeEventListener('click', toggle)
  }, [toggle])

  const send = useCallback((event: object): boolean => {
    const socket = socketRef.current
    if (socket?.readyState !== WebSocket.OPEN) return false
    socket.send(JSON.stringify(event))
    return true
  }, [])

  const stopPlayback = useCallback((): void => {
    for (const source of playbackSourcesRef.current) {
      try { source.stop() } catch { /* already ended */ }
      try { source.disconnect() } catch { /* already disconnected */ }
    }
    playbackSourcesRef.current.clear()
    const cancelled = new Set([...playbackStartedRef.current, ...playbackEndTimersRef.current.keys()])
    for (const timer of playbackEndTimersRef.current.values()) window.clearTimeout(timer)
    for (const responseId of cancelled) send({ type: 'playback.cancelled', responseId })
    playbackEndTimersRef.current.clear()
    playbackStartedRef.current.clear()
    playbackCursorRef.current = audioContextRef.current?.currentTime || 0
  }, [send])

  const updateTask = useCallback((event: GatewayEvent): void => {
    const task = event.task
    if (!task?.id || !event.type?.startsWith('task.')) return
    // Delivery/notification events still carry the authoritative task status.
    // Prefer it so a terminal task never regresses to "notification.delivered".
    const phase = task.status || event.type.slice('task.'.length)
    const title = task.delegation?.title || task.objective || 'DSH 会话任务'
    setTasks(current => {
      const next: TaskView = {
        id: task.id as string,
        title,
        phase,
        elapsedMs: task.elapsedMs || 0,
        error: task.error,
        targetSessionId: task.delegation?.sessionId,
      }
      const existing = current.findIndex(item => item.id === next.id)
      const updated = existing < 0
        ? [next, ...current]
        : current.map(item => item.id === next.id ? { ...item, ...next } : item)
      return updated.slice(0, 6)
    })
  }, [])

  const cancelTask = useCallback(async (taskId: string): Promise<void> => {
    setError('')
    setTasks(current => current.map(task => (
      task.id === taskId ? { ...task, phase: 'cancelling' } : task
    )))
    try {
      const response = await fetch(
        `${GATEWAY_ORIGIN}/api/tasks/${encodeURIComponent(taskId)}`,
        { method: 'DELETE' },
      )
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const body = await response.json() as { task?: { status?: string }; status?: string }
      const phase = body.task?.status || body.status || 'cancelled'
      setTasks(current => current.map(task => (
        task.id === taskId ? { ...task, phase } : task
      )))
    } catch (reason) {
      setTasks(current => current.map(task => (
        task.id === taskId ? { ...task, phase: 'failed' } : task
      )))
      setError(`中断失败：${reason instanceof Error ? reason.message : String(reason)}`)
    }
  }, [])

  useEffect(() => {
    let disposed = false
    let reconnectTimer: number | undefined
    let delay = 500
    const connect = (): void => {
      if (disposed) return
      const socket = new WebSocket(socketUrl(sessionId))
      socketRef.current = socket
      socket.onopen = () => {
        delay = 500
        setConnected(true)
        setError('')
        socket.send(JSON.stringify({
          type: 'connect',
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          locale: navigator.language,
          voiceEnabled: enabled,
          inputEnabled: enabled,
          outputEnabled: enabled,
          wakeWordOnly: false,
          clientType: 'web',
          clientLabel: 'DSH Qwen Voice plugin',
          clientStates: [],
          clientInstanceId: crypto.randomUUID(),
          takeover: false,
        }))
        if (enabled) socket.send(JSON.stringify({ type: 'unmute', takeover: false }))
      }
      socket.onmessage = (message) => {
        let event: GatewayEvent
        try { event = JSON.parse(String(message.data)) as GatewayEvent } catch { return }
        if (event.type === 'voice.ready' && event.inputSampleRate) {
          // Current Qwen releases advertise 16 kHz. The capture callback uses
          // the fixed compatible rate until a later protocol exposes it earlier.
          setConnected(true)
        }
        if (event.type === 'voice.state' && ['idle', 'listening', 'thinking', 'speaking'].includes(String(event.state))) {
          setState(event.state as VoiceState)
        }
        if ((event.type === 'transcript.delta' || event.type === 'transcript.final') && event.role === 'user') {
          setTranscript(event.content || '')
        }
        updateTask(event)
        if (event.type === 'error') setError(event.message || 'Qwen 语音服务返回错误')
        if (event.type === 'response.started') {
          stopPlayback()
          activeResponseIdRef.current = event.responseId || ''
        }
        if (event.type === 'audio.delta' && event.audio && enabled) {
          if (event.responseId && activeResponseIdRef.current && event.responseId !== activeResponseIdRef.current) return
          if (event.responseId && !activeResponseIdRef.current) activeResponseIdRef.current = event.responseId
          const context = audioContextRef.current
          if (!context) return
          const samples = decodePcm(event.audio)
          const rate = event.sampleRate || 24000
          const buffer = context.createBuffer(1, samples.length, rate)
          buffer.copyToChannel(Float32Array.from(samples), 0)
          const source = context.createBufferSource()
          source.buffer = buffer
          source.connect(context.destination)
          playbackSourcesRef.current.add(source)
          source.onended = () => {
            playbackSourcesRef.current.delete(source)
            try { source.disconnect() } catch { /* already disconnected */ }
          }
          const start = Math.max(context.currentTime + 0.02, playbackCursorRef.current)
          playbackCursorRef.current = start + buffer.duration
          if (event.responseId && !playbackStartedRef.current.has(event.responseId)) {
            playbackStartedRef.current.add(event.responseId)
            send({ type: 'playback.started', responseId: event.responseId })
          }
          source.start(start)
        }
        if (event.type === 'audio.done' && event.responseId) {
          if (activeResponseIdRef.current && event.responseId !== activeResponseIdRef.current) return
          const responseId = event.responseId
          const context = audioContextRef.current
          const delayMs = context
            ? Math.max(0, (playbackCursorRef.current - context.currentTime) * 1000) + 40
            : 0
          const previous = playbackEndTimersRef.current.get(responseId)
          if (previous !== undefined) window.clearTimeout(previous)
          const timer = window.setTimeout(() => {
            playbackEndTimersRef.current.delete(responseId)
            playbackStartedRef.current.delete(responseId)
            send({ type: 'playback.ended', responseId })
          }, delayMs)
          playbackEndTimersRef.current.set(responseId, timer)
        }
        if (event.type === 'response.interrupted' || event.type === 'playback.clear') {
          stopPlayback()
          activeResponseIdRef.current = ''
        }
      }
      socket.onerror = () => { setError(`无法连接 ${GATEWAY_ORIGIN}`) }
      socket.onclose = () => {
        stopPlayback()
        activeResponseIdRef.current = ''
        if (socketRef.current === socket) socketRef.current = null
        setConnected(false)
        if (!disposed) {
          reconnectTimer = window.setTimeout(connect, delay)
          delay = Math.min(5000, delay * 2)
        }
      }
    }
    connect()
    return () => {
      disposed = true
      if (reconnectTimer !== undefined) window.clearTimeout(reconnectTimer)
      socketRef.current?.close()
      socketRef.current = null
    }
  }, [enabled, sessionId, stopPlayback, updateTask])

  useEffect(() => {
    if (!enabled) {
      stopPlayback()
      activeResponseIdRef.current = ''
      send({ type: 'mute' })
      return undefined
    }
    let disposed = false
    let stream: MediaStream | undefined
    let source: MediaStreamAudioSourceNode | undefined
    let processor: ScriptProcessorNode | undefined
    const start = async (): Promise<void> => {
      try {
        const AudioContextCtor = window.AudioContext
        const context = audioContextRef.current?.state === 'closed'
          ? new AudioContextCtor()
          : audioContextRef.current ?? new AudioContextCtor()
        audioContextRef.current = context
        await context.resume()
        stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        })
        if (disposed) { stream.getTracks().forEach(track => track.stop()); return }
        source = context.createMediaStreamSource(stream)
        processor = context.createScriptProcessor(2048, 1, 1)
        processor.onaudioprocess = event => {
          const samples = resample(event.inputBuffer.getChannelData(0), context.sampleRate, INPUT_RATE)
          send({ type: 'audio.append', audio: pcmBase64(samples) })
        }
        source.connect(processor)
        processor.connect(context.destination)
        send({ type: 'unmute', takeover: false })
      } catch (reason) {
        setEnabled(false)
        setError(reason instanceof Error ? reason.message : '无法打开麦克风')
      }
    }
    void start()
    return () => {
      disposed = true
      stream?.getTracks().forEach(track => track.stop())
      processor?.disconnect()
      source?.disconnect()
    }
  }, [enabled, send, stopPlayback])

  useEffect(() => () => {
    stopPlayback()
    activeResponseIdRef.current = ''
    void audioContextRef.current?.close()
    audioContextRef.current = null
  }, [stopPlayback])

  const status = labelFor(state, enabled, connected)
  const activeCount = tasks.filter(task => !['completed', 'failed', 'cancelled'].includes(task.phase)).length
  return createPortal((
    <div className={css.root}>
      {enabled && <span className={css.pulse} aria-hidden />}
      <button
        ref={buttonRef}
        type="button"
        className={css.button}
        data-active={enabled}
        data-state={state}
        data-error={Boolean(error)}
        aria-label={enabled ? '关闭 Qwen 语音' : '开启 Qwen 语音'}
        aria-pressed={enabled}
        title={status}
        onMouseDown={event => event.preventDefault()}
      >
        <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden>
          <path fill="currentColor" d="M12 15.5a3.5 3.5 0 0 0 3.5-3.5V6a3.5 3.5 0 1 0-7 0v6a3.5 3.5 0 0 0 3.5 3.5Zm-1.8-9.5a1.8 1.8 0 1 1 3.6 0v6a1.8 1.8 0 1 1-3.6 0V6Zm7.8 5.4a.85.85 0 0 1 .85.85 6.85 6.85 0 0 1-6 6.8v2.1h2.4a.85.85 0 1 1 0 1.7h-6.5a.85.85 0 1 1 0-1.7h2.4v-2.1a6.85 6.85 0 0 1-6-6.8.85.85 0 1 1 1.7 0 5.15 5.15 0 0 0 10.3 0 .85.85 0 0 1 .85-.85Z" />
        </svg>
      </button>
      {open && (
        <section className={css.panel} aria-live="polite">
          <div className={css.head}>
            <span className={css.status}><i className={css.dot} data-connected={connected} /><span><b>Qwen 语音协调中心</b><small>{status}{activeCount > 0 ? ` · ${activeCount} 项活跃` : ''}</small></span></span>
            <button type="button" className={css.button} aria-label="关闭语音面板" onClick={() => setOpen(false)}>×</button>
          </div>
          <p className={css.transcript}>{transcript}</p>
          <div className={css.commands}>
            <b>单页多会话指令</b>
            <span>“新建前端开发会话，让它做登录页”</span>
            <span>“给前端开发追加：改成深色主题”</span>
            <span>“代码审查会话进展如何？”</span>
          </div>
          {tasks.length > 0 && (
            <div className={css.tasks} aria-label="DSH 多会话任务">
              {tasks.map(task => (
                <div className={css.task} data-phase={task.phase} key={task.id}>
                  <i aria-hidden />
                  <span>
                    <b>{task.title}</b>
                    <small><em>协调 Agent</em><i aria-hidden>→</i><em>{task.targetSessionId ? '目标 DSH 会话' : '正在路由'}</em></small>
                    <small>{taskPhaseLabel(task.phase)}{task.elapsedMs > 0 ? ` · ${Math.round(task.elapsedMs / 1000)}s` : ''}</small>
                  </span>
                  <span className={css.taskActions}>
                    {task.targetSessionId && <button type="button" onClick={() => props.openSession(task.targetSessionId as string)}>打开</button>}
                    {!['completed', 'failed', 'cancelled'].includes(task.phase) && (
                      <button
                        type="button"
                        data-danger
                        disabled={task.phase === 'cancelling'}
                        onClick={() => { void cancelTask(task.id) }}
                      >
                        {task.phase === 'cancelling' ? '中断中…' : '中断'}
                      </button>
                    )}
                  </span>
                </div>
              ))}
            </div>
          )}
          <div className={css.hint}>当前页面会话：{currentSessionId ? '已选择' : '未选择'}。不同 DSH 会话可并行；同一会话内按顺序执行。</div>
          {error && <div className={css.error}>{error}</div>}
        </section>
      )}
    </div>
  ), document.body)
}
