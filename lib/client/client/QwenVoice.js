import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useCallback, useEffect, useRef, useState } from 'react';
import { decodePcm, pcmBase64, resample } from "./audio.js";
import css from './QwenVoice.module.css';
const GATEWAY_ORIGIN = 'http://127.0.0.1:3101';
const INPUT_RATE = 16000;
function socketUrl(sessionId) {
    return `ws://127.0.0.1:3101/api/realtime?sessionId=${encodeURIComponent(sessionId)}`;
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
/** Qwen Audio Agent control mounted beside the DSH send action. */
export function QwenVoice(props) {
    const sessionId = String(props.sessionId);
    const [enabled, setEnabled] = useState(false);
    const [open, setOpen] = useState(false);
    const [connected, setConnected] = useState(false);
    const [state, setState] = useState('idle');
    const [transcript, setTranscript] = useState('点击麦克风，然后直接说出任务。');
    const [error, setError] = useState('');
    const socketRef = useRef(null);
    const audioContextRef = useRef(null);
    const playbackCursorRef = useRef(0);
    const send = useCallback((event) => {
        const socket = socketRef.current;
        if (socket?.readyState !== WebSocket.OPEN)
            return false;
        socket.send(JSON.stringify(event));
        return true;
    }, []);
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
                    inputEnabled: false,
                    outputEnabled: enabled,
                    wakeWordOnly: false,
                    clientType: 'web',
                    clientLabel: 'DSH Qwen Voice plugin',
                    clientStates: [],
                    clientInstanceId: crypto.randomUUID(),
                    takeover: false,
                }));
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
                    setTranscript(event.content || '');
                }
                if (event.type === 'error')
                    setError(event.message || 'Qwen 语音服务返回错误');
                if (event.type === 'audio.delta' && event.audio && enabled) {
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
                    const start = Math.max(context.currentTime + 0.02, playbackCursorRef.current);
                    playbackCursorRef.current = start + buffer.duration;
                    source.start(start);
                }
            };
            socket.onerror = () => { setError(`无法连接 ${GATEWAY_ORIGIN}`); };
            socket.onclose = () => {
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
    }, [enabled, sessionId]);
    useEffect(() => {
        if (!enabled) {
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
    }, [enabled, send]);
    useEffect(() => () => {
        void audioContextRef.current?.close();
        audioContextRef.current = null;
    }, []);
    const toggle = () => {
        setOpen(true);
        setError('');
        setEnabled(value => !value);
    };
    const status = labelFor(state, enabled, connected);
    return (_jsxs("div", { className: css.root, children: [enabled && _jsx("span", { className: css.pulse, "aria-hidden": true }), _jsx("button", { type: "button", className: css.button, "data-active": enabled, "data-state": state, "data-error": Boolean(error), "aria-label": enabled ? '关闭 Qwen 语音' : '开启 Qwen 语音', "aria-pressed": enabled, title: status, onMouseDown: event => event.preventDefault(), onClick: toggle, children: _jsx("svg", { viewBox: "0 0 24 24", width: "17", height: "17", "aria-hidden": true, children: _jsx("path", { fill: "currentColor", d: "M12 15.5a3.5 3.5 0 0 0 3.5-3.5V6a3.5 3.5 0 1 0-7 0v6a3.5 3.5 0 0 0 3.5 3.5Zm-1.8-9.5a1.8 1.8 0 1 1 3.6 0v6a1.8 1.8 0 1 1-3.6 0V6Zm7.8 5.4a.85.85 0 0 1 .85.85 6.85 6.85 0 0 1-6 6.8v2.1h2.4a.85.85 0 1 1 0 1.7h-6.5a.85.85 0 1 1 0-1.7h2.4v-2.1a6.85 6.85 0 0 1-6-6.8.85.85 0 1 1 1.7 0 5.15 5.15 0 0 0 10.3 0 .85.85 0 0 1 .85-.85Z" }) }) }), open && (_jsxs("section", { className: css.panel, "aria-live": "polite", children: [_jsxs("div", { className: css.head, children: [_jsxs("span", { className: css.status, children: [_jsx("i", { className: css.dot, "data-connected": connected }), status] }), _jsx("button", { type: "button", className: css.button, "aria-label": "\u5173\u95ED\u8BED\u97F3\u9762\u677F", onClick: () => setOpen(false), children: "\u00D7" })] }), _jsx("p", { className: css.transcript, children: transcript }), _jsx("div", { className: css.hint, children: "\u4EFB\u52A1\u7531 Qwen Audio Agent \u8F6C\u4EA4\u7ED9 DSH\uFF1B\u7ED3\u679C\u4F1A\u8FDB\u5165 DSH \u4F1A\u8BDD\u5E76\u7531\u8BED\u97F3\u64AD\u62A5\u3002" }), error && _jsx("div", { className: css.error, children: error })] }))] }));
}
