import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { decodePcm, pcmBase64, resample } from "./audio.js";
import { discardUserTranscript, settleUserTranscript, upsertAssistantTranscript, upsertUserTranscript, } from "./message-order.js";
import css from './QwenVoice.module.css';
const GATEWAY_ORIGIN = 'http://127.0.0.1:3101';
const DSH_API_TOKEN = 'dsh-local-3cf6f8d1a4e74279b5377ad91804e945';
const INPUT_RATE = 16000;
function socketUrl(sessionId) {
    return `ws://127.0.0.1:3101/api/realtime?sessionId=${encodeURIComponent(sessionId)}`;
}
function persistentVoiceSessionId() {
    const key = 'dsh-qwen-voice.session-id';
    // A browser tab is one independent DSH voice lane. sessionStorage survives
    // reloads and in-tab conversation switches, but does not merge multiple
    // DSH tabs into the same Realtime/ACP coordinator session.
    const existing = sessionStorage.getItem(key);
    if (existing)
        return existing;
    const created = `dsh-voice-${crypto.randomUUID()}`;
    sessionStorage.setItem(key, created);
    return created;
}
function persistentSidebarOpen() {
    return localStorage.getItem('dsh-qwen-voice.sidebar-open') !== 'false';
}
function labelFor(state, enabled, connected) {
    if (!connected)
        return '正在连接 Qwen Audio Agent';
    if (!enabled)
        return 'Qwen 语音待命';
    if (state === 'listening')
        return '正在听你说';
    if (state === 'thinking')
        return '正在理解';
    if (state === 'speaking')
        return '正在播报';
    return '语音已开启';
}
function taskPhaseLabel(phase) {
    return {
        accepted: '等待调度',
        queued: '排队中',
        running: '执行中',
        progress: '执行中',
        delegated: '已派发到 DSH 会话',
        finalizing: '整理结果',
        completed: '已完成',
        failed: '失败',
        cancelled: '已取消',
    }[phase] || phase;
}
/** Qwen Audio Agent control mounted beside the DSH send action. */
export function QwenVoice(props) {
    const currentSessionId = props.useSessions(value => value.current);
    const [sessionId] = useState(persistentVoiceSessionId);
    const [enabled, setEnabled] = useState(false);
    const [open, setOpen] = useState(persistentSidebarOpen);
    const [connected, setConnected] = useState(false);
    const [state, setState] = useState('idle');
    const [transcript, setTranscript] = useState('点击麦克风，然后直接说出任务。');
    const [messages, setMessages] = useState([]);
    const [error, setError] = useState('');
    const [tasks, setTasks] = useState([]);
    const [coordinatorBinding, setCoordinatorBinding] = useState(null);
    const [bindingBusy, setBindingBusy] = useState(false);
    const socketRef = useRef(null);
    const audioContextRef = useRef(null);
    const playbackCursorRef = useRef(0);
    const playbackStartedRef = useRef(new Set());
    const playbackEndTimersRef = useRef(new Map());
    const playbackSourcesRef = useRef(new Set());
    const activeResponseIdRef = useRef('');
    const messagesRef = useRef(null);
    const stickToBottomRef = useRef(true);
    const buttonRef = useRef(null);
    const toggle = useCallback(() => {
        setError('');
        setEnabled(value => !value);
    }, []);
    useEffect(() => {
        localStorage.setItem('dsh-qwen-voice.sidebar-open', String(open));
    }, [open]);
    useLayoutEffect(() => {
        const container = messagesRef.current;
        if (container && stickToBottomRef.current)
            container.scrollTop = container.scrollHeight;
    }, [messages]);
    useEffect(() => {
        const button = buttonRef.current;
        if (button === null)
            return undefined;
        button.addEventListener('click', toggle);
        return () => button.removeEventListener('click', toggle);
    }, [toggle]);
    const send = useCallback((event) => {
        const socket = socketRef.current;
        if (socket?.readyState !== WebSocket.OPEN)
            return false;
        socket.send(JSON.stringify(event));
        return true;
    }, []);
    const stopPlayback = useCallback(() => {
        for (const source of playbackSourcesRef.current) {
            try {
                source.stop();
            }
            catch { /* already ended */ }
            try {
                source.disconnect();
            }
            catch { /* already disconnected */ }
        }
        playbackSourcesRef.current.clear();
        const cancelled = new Set([...playbackStartedRef.current, ...playbackEndTimersRef.current.keys()]);
        for (const timer of playbackEndTimersRef.current.values())
            window.clearTimeout(timer);
        for (const responseId of cancelled)
            send({ type: 'playback.cancelled', responseId });
        playbackEndTimersRef.current.clear();
        playbackStartedRef.current.clear();
        playbackCursorRef.current = audioContextRef.current?.currentTime || 0;
    }, [send]);
    const updateTask = useCallback((event) => {
        const task = event.task;
        if (!task?.id || !event.type?.startsWith('task.'))
            return;
        // Delivery/notification events still carry the authoritative task status.
        // Prefer it so a terminal task never regresses to "notification.delivered".
        const phase = task.status || event.type.slice('task.'.length);
        const title = task.delegation?.title || task.objective || 'DSH 会话任务';
        setTasks(current => {
            const next = {
                id: task.id,
                title,
                phase,
                elapsedMs: task.elapsedMs || 0,
                error: task.error,
                targetSessionId: task.delegation?.sessionId,
            };
            const existing = current.findIndex(item => item.id === next.id);
            const updated = existing < 0
                ? [next, ...current]
                : current.map(item => item.id === next.id ? { ...item, ...next } : item);
            return updated.slice(0, 6);
        });
    }, []);
    const cancelTask = useCallback(async (taskId) => {
        setError('');
        setTasks(current => current.map(task => (task.id === taskId ? { ...task, phase: 'cancelling' } : task)));
        try {
            const response = await fetch(`${GATEWAY_ORIGIN}/api/tasks/${encodeURIComponent(taskId)}`, { method: 'DELETE' });
            if (!response.ok)
                throw new Error(`HTTP ${response.status}`);
            const body = await response.json();
            const phase = body.task?.status || body.status || 'cancelled';
            setTasks(current => current.map(task => (task.id === taskId ? { ...task, phase } : task)));
        }
        catch (reason) {
            setTasks(current => current.map(task => (task.id === taskId ? { ...task, phase: 'failed' } : task)));
            setError(`中断失败：${reason instanceof Error ? reason.message : String(reason)}`);
        }
    }, []);
    const openTaskSession = useCallback(async (sessionId) => {
        setError('');
        try {
            await props.openSession(sessionId);
            setOpen(false);
        }
        catch (reason) {
            setError(`打开目标会话失败：${reason instanceof Error ? reason.message : String(reason)}`);
        }
    }, [props.openSession]);
    const refreshCoordinatorBinding = useCallback(async () => {
        try {
            const response = await fetch(`${GATEWAY_ORIGIN}/api/dsh/coordinator-binding`, {
                headers: { 'x-dsh-qwen-token': DSH_API_TOKEN },
            });
            if (!response.ok)
                throw new Error(`HTTP ${response.status}`);
            const body = await response.json();
            setCoordinatorBinding(body.binding || null);
        }
        catch (reason) {
            setError(`无法读取协调会话绑定：${reason instanceof Error ? reason.message : String(reason)}`);
        }
    }, []);
    const bindCurrentSession = useCallback(async () => {
        const selectedSessionId = String(currentSessionId || '');
        if (!selectedSessionId) {
            setError('请先在左侧打开一个 DSH 会话。');
            return;
        }
        const takeover = Boolean(coordinatorBinding?.sessionId
            && coordinatorBinding.sessionId !== selectedSessionId);
        if (takeover && !window.confirm(`当前协调会话是 ${coordinatorBinding?.sessionId}。\n\n确定由当前会话接管吗？正在运行的后台任务不会被取消。`))
            return;
        setBindingBusy(true);
        setError('');
        try {
            const response = await fetch(`${GATEWAY_ORIGIN}/api/dsh/coordinator-binding`, {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                    'x-dsh-qwen-token': DSH_API_TOKEN,
                },
                body: JSON.stringify({ session_id: selectedSessionId }),
            });
            const body = await response.json();
            if (!response.ok)
                throw new Error(body.message || body.error || `HTTP ${response.status}`);
            setCoordinatorBinding({ sessionId: body.sessionId, cwd: body.cwd });
        }
        catch (reason) {
            setError(`协调会话绑定失败：${reason instanceof Error ? reason.message : String(reason)}`);
        }
        finally {
            setBindingBusy(false);
        }
    }, [coordinatorBinding, currentSessionId]);
    useEffect(() => {
        if (open)
            void refreshCoordinatorBinding();
    }, [open, refreshCoordinatorBinding]);
    useEffect(() => {
        let disposed = false;
        let reconnectTimer;
        let delay = 500;
        const connect = () => {
            if (disposed)
                return;
            const socket = new WebSocket(socketUrl(sessionId));
            socketRef.current = socket;
            socket.onopen = () => {
                delay = 500;
                setConnected(true);
                setError('');
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
                }));
                if (enabled)
                    socket.send(JSON.stringify({ type: 'unmute', takeover: false }));
            };
            socket.onmessage = (message) => {
                let event;
                try {
                    event = JSON.parse(String(message.data));
                }
                catch {
                    return;
                }
                if (event.type === 'voice.ready' && event.inputSampleRate) {
                    // Current Qwen releases advertise 16 kHz. The capture callback uses
                    // the fixed compatible rate until a later protocol exposes it earlier.
                    setConnected(true);
                }
                if (event.type === 'voice.state' && ['idle', 'listening', 'thinking', 'speaking'].includes(String(event.state))) {
                    setState(event.state);
                }
                if ((event.type === 'transcript.delta' || event.type === 'transcript.final') && event.role === 'user') {
                    const id = event.turnId ? `user:${event.turnId}` : crypto.randomUUID();
                    setMessages(items => upsertUserTranscript(items, {
                        id,
                        content: event.content || '',
                        turnId: event.turnId,
                        final: event.type === 'transcript.final',
                    }));
                    setTranscript(event.content || '');
                }
                if ((event.type === 'transcript.delta' || event.type === 'transcript.final') && event.role === 'assistant') {
                    const responseId = event.responseId || activeResponseIdRef.current;
                    if (responseId) {
                        const final = event.type === 'transcript.final';
                        const message = {
                            id: `voice:${responseId}`,
                            role: 'assistant',
                            content: event.content || '',
                            responseId,
                            turnId: event.turnId,
                            taskId: event.taskId,
                            taskIds: event.taskIds,
                            origin: event.origin,
                            deliverySequence: event.deliverySequence,
                            final,
                            live: !final,
                        };
                        setMessages(items => upsertAssistantTranscript(items, message, final || Boolean(event.replace)));
                        setTranscript(event.content || '');
                    }
                }
                if (event.type === 'transcript.discard' && event.role === 'user') {
                    setMessages(items => event.reason === 'turn_invalid'
                        ? discardUserTranscript(items, event.turnId)
                        : settleUserTranscript(items, event.turnId));
                }
                if (event.type === 'timeline.inline' && event.item?.content) {
                    const item = event.item;
                    setMessages(items => upsertAssistantTranscript(items, {
                        id: `inline:${item.id || item.taskId || crypto.randomUUID()}`,
                        role: 'assistant',
                        content: item.content || '',
                        title: item.title,
                        turnId: item.turnId,
                        taskId: item.taskId,
                        final: true,
                        live: false,
                    }, true));
                }
                updateTask(event);
                if (event.type === 'error')
                    setError(event.message || 'Qwen 语音服务返回错误');
                if (event.type === 'response.started') {
                    stopPlayback();
                    activeResponseIdRef.current = event.responseId || '';
                }
                if (event.type === 'audio.delta' && event.audio && enabled) {
                    if (event.responseId && activeResponseIdRef.current && event.responseId !== activeResponseIdRef.current)
                        return;
                    if (event.responseId && !activeResponseIdRef.current)
                        activeResponseIdRef.current = event.responseId;
                    const context = audioContextRef.current;
                    if (!context)
                        return;
                    const samples = decodePcm(event.audio);
                    const rate = event.sampleRate || 24000;
                    const buffer = context.createBuffer(1, samples.length, rate);
                    buffer.copyToChannel(Float32Array.from(samples), 0);
                    const source = context.createBufferSource();
                    source.buffer = buffer;
                    source.connect(context.destination);
                    playbackSourcesRef.current.add(source);
                    source.onended = () => {
                        playbackSourcesRef.current.delete(source);
                        try {
                            source.disconnect();
                        }
                        catch { /* already disconnected */ }
                    };
                    const start = Math.max(context.currentTime + 0.02, playbackCursorRef.current);
                    playbackCursorRef.current = start + buffer.duration;
                    if (event.responseId && !playbackStartedRef.current.has(event.responseId)) {
                        playbackStartedRef.current.add(event.responseId);
                        send({ type: 'playback.started', responseId: event.responseId });
                    }
                    source.start(start);
                }
                if (event.type === 'audio.done' && event.responseId) {
                    if (activeResponseIdRef.current && event.responseId !== activeResponseIdRef.current)
                        return;
                    const responseId = event.responseId;
                    const context = audioContextRef.current;
                    const delayMs = context
                        ? Math.max(0, (playbackCursorRef.current - context.currentTime) * 1000) + 40
                        : 0;
                    const previous = playbackEndTimersRef.current.get(responseId);
                    if (previous !== undefined)
                        window.clearTimeout(previous);
                    const timer = window.setTimeout(() => {
                        playbackEndTimersRef.current.delete(responseId);
                        playbackStartedRef.current.delete(responseId);
                        send({ type: 'playback.ended', responseId });
                    }, delayMs);
                    playbackEndTimersRef.current.set(responseId, timer);
                }
                if (event.type === 'response.interrupted' || event.type === 'playback.clear') {
                    if (event.type === 'response.interrupted' && event.responseId) {
                        const id = `voice:${event.responseId}`;
                        setMessages(items => items.map(item => (item.id === id ? { ...item, interrupted: true, live: false } : item)));
                    }
                    stopPlayback();
                    activeResponseIdRef.current = '';
                }
            };
            socket.onerror = () => { setError(`无法连接 ${GATEWAY_ORIGIN}`); };
            socket.onclose = () => {
                stopPlayback();
                activeResponseIdRef.current = '';
                if (socketRef.current === socket)
                    socketRef.current = null;
                setConnected(false);
                if (!disposed) {
                    reconnectTimer = window.setTimeout(connect, delay);
                    delay = Math.min(5000, delay * 2);
                }
            };
        };
        connect();
        return () => {
            disposed = true;
            if (reconnectTimer !== undefined)
                window.clearTimeout(reconnectTimer);
            socketRef.current?.close();
            socketRef.current = null;
        };
    }, [enabled, sessionId, stopPlayback, updateTask]);
    useEffect(() => {
        if (!enabled) {
            stopPlayback();
            activeResponseIdRef.current = '';
            send({ type: 'mute' });
            return undefined;
        }
        let disposed = false;
        let stream;
        let source;
        let processor;
        const start = async () => {
            try {
                const AudioContextCtor = window.AudioContext;
                const context = audioContextRef.current?.state === 'closed'
                    ? new AudioContextCtor()
                    : audioContextRef.current ?? new AudioContextCtor();
                audioContextRef.current = context;
                await context.resume();
                stream = await navigator.mediaDevices.getUserMedia({
                    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
                });
                if (disposed) {
                    stream.getTracks().forEach(track => track.stop());
                    return;
                }
                source = context.createMediaStreamSource(stream);
                processor = context.createScriptProcessor(2048, 1, 1);
                processor.onaudioprocess = event => {
                    const samples = resample(event.inputBuffer.getChannelData(0), context.sampleRate, INPUT_RATE);
                    send({ type: 'audio.append', audio: pcmBase64(samples) });
                };
                source.connect(processor);
                processor.connect(context.destination);
                send({ type: 'unmute', takeover: false });
            }
            catch (reason) {
                setEnabled(false);
                setError(reason instanceof Error ? reason.message : '无法打开麦克风');
            }
        };
        void start();
        return () => {
            disposed = true;
            stream?.getTracks().forEach(track => track.stop());
            processor?.disconnect();
            source?.disconnect();
        };
    }, [enabled, send, stopPlayback]);
    useEffect(() => () => {
        stopPlayback();
        activeResponseIdRef.current = '';
        void audioContextRef.current?.close();
        audioContextRef.current = null;
    }, [stopPlayback]);
    const status = labelFor(state, enabled, connected);
    const activeCount = tasks.filter(task => !['completed', 'failed', 'cancelled'].includes(task.phase)).length;
    return createPortal((_jsxs("div", { className: css.root, "data-open": open, children: [enabled && _jsx("span", { className: css.pulse, "aria-hidden": true }), _jsx("button", { ref: buttonRef, type: "button", className: css.button, "data-active": enabled, "data-state": state, "data-error": Boolean(error), "aria-label": enabled ? '关闭 Qwen 语音' : '开启 Qwen 语音', "aria-pressed": enabled, title: status, onMouseDown: event => event.preventDefault(), children: _jsx("svg", { viewBox: "0 0 24 24", width: "17", height: "17", "aria-hidden": true, children: _jsx("path", { fill: "currentColor", d: "M12 15.5a3.5 3.5 0 0 0 3.5-3.5V6a3.5 3.5 0 1 0-7 0v6a3.5 3.5 0 0 0 3.5 3.5Zm-1.8-9.5a1.8 1.8 0 1 1 3.6 0v6a1.8 1.8 0 1 1-3.6 0V6Zm7.8 5.4a.85.85 0 0 1 .85.85 6.85 6.85 0 0 1-6 6.8v2.1h2.4a.85.85 0 1 1 0 1.7h-6.5a.85.85 0 1 1 0-1.7h2.4v-2.1a6.85 6.85 0 0 1-6-6.8.85.85 0 1 1 1.7 0 5.15 5.15 0 0 0 10.3 0 .85.85 0 0 1 .85-.85Z" }) }) }), !open && (_jsx("button", { type: "button", className: css.sidebarHandle, "aria-label": "\u5C55\u5F00 Qwen \u8BED\u97F3\u4FA7\u8FB9\u680F", title: "\u5C55\u5F00\u8BED\u97F3\u4FA7\u8FB9\u680F", onClick: () => setOpen(true), children: _jsx("svg", { viewBox: "0 0 24 24", width: "18", height: "18", "aria-hidden": true, children: _jsx("path", { fill: "currentColor", d: "m9.3 6.3 5 5a1 1 0 0 1 0 1.4l-5 5-1.4-1.4 4.3-4.3-4.3-4.3 1.4-1.4Z" }) }) })), open && (_jsxs("section", { className: css.panel, "aria-live": "polite", children: [_jsxs("div", { className: css.head, children: [_jsxs("span", { className: css.status, children: [_jsx("i", { className: css.dot, "data-connected": connected }), _jsxs("span", { children: [_jsx("b", { children: "Qwen \u8BED\u97F3\u534F\u8C03\u4E2D\u5FC3" }), _jsxs("small", { children: [status, activeCount > 0 ? ` · ${activeCount} 项活跃` : ''] })] })] }), _jsx("button", { type: "button", className: css.closeButton, "aria-label": "\u6536\u8D77\u8BED\u97F3\u4FA7\u8FB9\u680F", title: "\u6536\u8D77\u4FA7\u8FB9\u680F", onClick: () => setOpen(false), children: _jsx("svg", { viewBox: "0 0 24 24", width: "18", height: "18", "aria-hidden": true, children: _jsx("path", { fill: "currentColor", d: "m14.7 6.3-5 5a1 1 0 0 0 0 1.4l5 5 1.4-1.4-4.3-4.3 4.3-4.3-1.4-1.4Z" }) }) })] }), _jsx("div", { ref: messagesRef, className: css.timeline, "aria-label": "\u8BED\u97F3\u5BF9\u8BDD\u8BB0\u5F55", onScroll: event => {
                            const container = event.currentTarget;
                            stickToBottomRef.current = (container.scrollHeight - container.scrollTop - container.clientHeight < 36);
                        }, children: messages.length === 0
                            ? _jsx("p", { className: css.transcript, children: transcript })
                            : messages.map(message => (_jsxs("article", { className: css.message, "data-role": message.role, "data-live": message.live || undefined, children: [_jsx("small", { children: message.role === 'user' ? '你' : message.origin === 'announcement' ? '任务播报' : 'Qwen' }), message.title && _jsx("b", { children: message.title }), _jsx("p", { children: message.content || (message.live ? '…' : '') }), message.interrupted && _jsx("em", { children: "\u5DF2\u4E2D\u65AD" })] }, message.id))) }), _jsxs("div", { className: css.coordinator, children: [_jsxs("span", { children: [_jsx("b", { children: "\u534F\u8C03\u4F1A\u8BDD" }), _jsx("small", { children: coordinatorBinding
                                            ? (String(currentSessionId || '') === coordinatorBinding.sessionId
                                                ? '当前会话正在担任 Coordinator'
                                                : `已绑定 ${coordinatorBinding.sessionId.slice(0, 20)}…`)
                                            : '尚未绑定，请选择当前会话' })] }), _jsx("button", { type: "button", disabled: bindingBusy || !currentSessionId, onClick: () => { void bindCurrentSession(); }, children: bindingBusy
                                    ? '验证中…'
                                    : coordinatorBinding?.sessionId === String(currentSessionId || '')
                                        ? '重新验证'
                                        : coordinatorBinding
                                            ? '由当前会话接管'
                                            : '设为协调会话' })] }), _jsxs("div", { className: css.commands, children: [_jsx("b", { children: "\u5355\u9875\u591A\u4F1A\u8BDD\u6307\u4EE4" }), _jsx("span", { children: "\u201C\u65B0\u5EFA\u524D\u7AEF\u5F00\u53D1\u4F1A\u8BDD\uFF0C\u8BA9\u5B83\u505A\u767B\u5F55\u9875\u201D" }), _jsx("span", { children: "\u201C\u7ED9\u524D\u7AEF\u5F00\u53D1\u8FFD\u52A0\uFF1A\u6539\u6210\u6DF1\u8272\u4E3B\u9898\u201D" }), _jsx("span", { children: "\u201C\u4EE3\u7801\u5BA1\u67E5\u4F1A\u8BDD\u8FDB\u5C55\u5982\u4F55\uFF1F\u201D" })] }), tasks.length > 0 && (_jsx("div", { className: css.tasks, "aria-label": "DSH \u591A\u4F1A\u8BDD\u4EFB\u52A1", children: tasks.map(task => (_jsxs("div", { className: css.task, "data-phase": task.phase, children: [_jsx("i", { "aria-hidden": true }), _jsxs("span", { children: [_jsx("b", { children: task.title }), _jsxs("small", { children: [_jsx("em", { children: "\u534F\u8C03 Agent" }), _jsx("i", { "aria-hidden": true, children: "\u2192" }), _jsx("em", { children: task.targetSessionId ? '目标 DSH 会话' : '正在路由' })] }), _jsxs("small", { children: [taskPhaseLabel(task.phase), task.elapsedMs > 0 ? ` · ${Math.round(task.elapsedMs / 1000)}s` : ''] })] }), _jsxs("span", { className: css.taskActions, children: [task.targetSessionId && (_jsx("button", { type: "button", onClick: () => { void openTaskSession(task.targetSessionId); }, children: "\u6253\u5F00" })), !['completed', 'failed', 'cancelled'].includes(task.phase) && (_jsx("button", { type: "button", "data-danger": true, disabled: task.phase === 'cancelling', onClick: () => { void cancelTask(task.id); }, children: task.phase === 'cancelling' ? '中断中…' : '中断' }))] })] }, task.id))) })), _jsxs("div", { className: css.hint, children: ["\u5F53\u524D\u9875\u9762\u4F1A\u8BDD\uFF1A", currentSessionId ? '已选择' : '未选择', "\u3002\u4E0D\u540C DSH \u4F1A\u8BDD\u53EF\u5E76\u884C\uFF1B\u540C\u4E00\u4F1A\u8BDD\u5185\u6309\u987A\u5E8F\u6267\u884C\u3002"] }), error && _jsx("div", { className: css.error, children: error })] }))] })), document.body);
}
