window.__ModuleLoader__.load({
	id: "dsh-qwen-voice",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react_jsx_runtime = require("react/jsx-runtime");
		let react = require("react");
		let react_dom = require("react-dom");
		//#region lib/client/audio.js
		/** Resample browser microphone PCM for the Qwen realtime gateway. */
		function resample(input, from, to) {
			if (from === to) return input;
			const ratio = from / to;
			const output = new Float32Array(Math.max(1, Math.round(input.length / ratio)));
			for (let index = 0; index < output.length; index += 1) {
				const position = index * ratio;
				const before = Math.floor(position);
				const after = Math.min(input.length - 1, before + 1);
				output[index] = input[before] * (1 - position + before) + input[after] * (position - before);
			}
			return output;
		}
		/** Encode signed 16-bit little-endian PCM as base64. */
		function pcmBase64(samples) {
			const bytes = new Uint8Array(samples.length * 2);
			const view = new DataView(bytes.buffer);
			samples.forEach((sample, index) => view.setInt16(index * 2, Math.max(-1, Math.min(1, sample)) * 32767, true));
			let binary = "";
			for (let index = 0; index < bytes.length; index += 32768) binary += String.fromCharCode(...bytes.subarray(index, index + 32768));
			return btoa(binary);
		}
		/** Decode gateway PCM playback audio to browser floats. */
		function decodePcm(base64) {
			const binary = atob(base64);
			const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
			const view = new DataView(bytes.buffer);
			const output = new Float32Array(bytes.length / 2);
			for (let index = 0; index < output.length; index += 1) output[index] = view.getInt16(index * 2, true) / 32768;
			return output;
		}
		//#endregion
		//#region lib/client/message-order.js
		function turnTimestamp(turnId) {
			const match = String(turnId || "").match(/^voice-(\d+)-/);
			return match ? Number(match[1]) : Number.POSITIVE_INFINITY;
		}
		function insertByTurn(items, message) {
			if (message.origin === "announcement") {
				const sequence = Number(message.deliverySequence);
				const insertAt = Number.isFinite(sequence) ? items.findIndex((item) => item.origin === "announcement" && Number(item.deliverySequence) > sequence) : -1;
				if (insertAt < 0) return [...items, message];
				const next = [...items];
				next.splice(insertAt, 0, message);
				return next;
			}
			if (!message.turnId) return [...items, message];
			const matching = items.map((item, index) => item.turnId === message.turnId ? index : -1).filter((index) => index >= 0);
			let insertAt;
			if (matching.length) insertAt = message.role === "user" ? matching[0] : matching[matching.length - 1] + 1;
			else {
				const timestamp = turnTimestamp(message.turnId);
				insertAt = items.findIndex((item) => turnTimestamp(item.turnId) > timestamp);
				if (insertAt < 0) insertAt = items.length;
			}
			const next = [...items];
			next.splice(insertAt, 0, message);
			return next;
		}
		function upsertUserTranscript(items, input) {
			const content = String(input.content || "").replace(/\s+/g, " ").trim();
			if (!content) return items;
			const message = {
				id: input.id,
				role: "user",
				content,
				turnId: input.turnId,
				final: Boolean(input.final),
				live: !input.final
			};
			const index = items.findIndex((item) => item.id === input.id);
			if (index < 0) return insertByTurn(items, message);
			const next = [...items];
			next[index] = {
				...next[index],
				...message
			};
			return next;
		}
		function discardUserTranscript(items, turnId) {
			if (!turnId) return items;
			const id = `user:${turnId}`;
			return items.filter((item) => item.id !== id || item.final);
		}
		function settleUserTranscript(items, turnId) {
			if (!turnId) return items;
			const id = `user:${turnId}`;
			const index = items.findIndex((item) => item.id === id);
			if (index < 0) return items;
			const next = [...items];
			next[index] = {
				...next[index],
				final: true,
				live: false
			};
			return next;
		}
		function upsertAssistantTranscript(items, message, replace = false) {
			const index = items.findIndex((item) => item.id === message.id);
			if (index < 0) return insertByTurn(items, message);
			const current = items[index];
			const next = [...items];
			next[index] = {
				...current,
				...message,
				content: replace ? message.content : current.content + message.content
			};
			return next;
		}
		//#endregion
		//#region \0dsh-css:<project>/src\client\QwenVoice.module.css.mjs
		const css = ".EFC6jW_root{z-index:1200;pointer-events:auto;position:fixed;bottom:18px;right:18px}.EFC6jW_root[data-open=true]{width:min(388px,100vw);top:0;bottom:0;right:0}.EFC6jW_button{z-index:3;color:#fff;cursor:pointer;background:linear-gradient(145deg,#282b34,#111318);border:1px solid #ffffff47;border-radius:999px;place-items:center;width:56px;height:56px;transition:color .16s,background .16s,transform .16s;display:grid;position:absolute;bottom:0;right:0;box-shadow:0 12px 34px #00000047}.EFC6jW_root[data-open=true]>.EFC6jW_button{bottom:18px;right:18px}.EFC6jW_button:hover{color:#fff;background:linear-gradient(145deg,#353945,#17191f);transform:translateY(-2px)}.EFC6jW_button:focus-visible{outline-offset:2px;outline:2px solid #6d5dfc}.EFC6jW_button[data-active=true]{color:#fff;background:linear-gradient(135deg,#7357ff,#2e9bff);box-shadow:0 0 0 4px #655bff24}.EFC6jW_button[data-state=speaking]{background:linear-gradient(135deg,#16a085,#2ecc71)}.EFC6jW_button[data-error=true]{color:#fff;background:#d14343}.EFC6jW_sidebarHandle{z-index:4;border:1px solid color-mix(in srgb, CanvasText 14%, transparent);color:canvastext;background:color-mix(in srgb, Canvas 96%, transparent);cursor:pointer;backdrop-filter:blur(14px);border-right:0;border-radius:12px 0 0 12px;place-items:center;width:28px;height:58px;padding:0;display:grid;position:fixed;top:50%;right:0;transform:translateY(-50%);box-shadow:-6px 0 18px #0000001f}.EFC6jW_sidebarHandle:hover{background:color-mix(in srgb, CanvasText 7%, Canvas);width:32px}.EFC6jW_sidebarHandle:focus-visible{outline-offset:2px;outline:2px solid #6d5dfc}.EFC6jW_pulse{z-index:2;pointer-events:none;border:1px solid #655bff73;border-radius:999px;width:62px;height:62px;animation:1.5s ease-out infinite EFC6jW_pulse;position:absolute;bottom:-3px;right:-3px}.EFC6jW_root[data-open=true] .EFC6jW_pulse{bottom:15px;right:15px}.EFC6jW_panel{box-sizing:border-box;border:0;border-left:1px solid color-mix(in srgb, CanvasText 12%, transparent);background:color-mix(in srgb, Canvas 97%, transparent);color:canvastext;backdrop-filter:blur(18px);border-radius:0;padding:16px 16px 92px;position:absolute;inset:0;overflow:auto;box-shadow:-12px 0 34px #0000001f}.EFC6jW_head{z-index:2;border-bottom:1px solid color-mix(in srgb, CanvasText 8%, transparent);background:color-mix(in srgb, Canvas 96%, transparent);backdrop-filter:blur(18px);justify-content:space-between;align-items:center;gap:10px;margin:-16px -16px 0;padding:16px;font-size:12px;display:flex;position:sticky;top:-16px}.EFC6jW_status{align-items:center;gap:7px;display:inline-flex}.EFC6jW_status>span{gap:1px;display:grid}.EFC6jW_status b{font-size:12px}.EFC6jW_status small{opacity:.65;font-size:10px;font-weight:500}.EFC6jW_dot{background:#a0a7b2;border-radius:50%;width:7px;height:7px}.EFC6jW_dot[data-connected=true]{background:#20b26b;box-shadow:0 0 0 3px #20b26b26}.EFC6jW_closeButton{color:canvastext;cursor:pointer;background:0 0;border:0;border-radius:10px;flex:none;place-items:center;width:44px;height:44px;display:grid}.EFC6jW_closeButton:hover{background:color-mix(in srgb, CanvasText 7%, transparent)}.EFC6jW_closeButton:focus-visible{outline-offset:2px;outline:2px solid #6d5dfc}.EFC6jW_transcript{min-height:38px;color:color-mix(in srgb, CanvasText 84%, transparent);margin:10px 0 0;font-size:13px;line-height:1.55}.EFC6jW_timeline{overscroll-behavior:contain;border:1px solid color-mix(in srgb, CanvasText 9%, transparent);background:color-mix(in srgb, CanvasText 2.5%, transparent);scrollbar-width:thin;border-radius:12px;min-height:112px;max-height:min(34vh,290px);margin-top:10px;padding:8px;overflow:hidden auto}.EFC6jW_timeline .EFC6jW_transcript{margin:0;padding:4px}.EFC6jW_message{background:color-mix(in srgb, CanvasText 7%, Canvas);overflow-wrap:anywhere;border-radius:11px;gap:3px;width:fit-content;max-width:88%;margin:0 0 8px;padding:8px 10px;font-size:12px;line-height:1.5;display:grid}.EFC6jW_message:last-child{margin-bottom:0}.EFC6jW_message[data-role=user]{background:color-mix(in srgb, #6657ee 18%, Canvas);margin-left:auto}.EFC6jW_message small{opacity:.55;font-size:9px;font-weight:600}.EFC6jW_message b{font-size:11px}.EFC6jW_message p{white-space:pre-wrap;margin:0}.EFC6jW_message em{opacity:.5;font-size:9px;font-style:normal}.EFC6jW_message[data-live=true]:after{content:\"\";background:#6d5dfc;border-radius:50%;width:5px;height:5px;animation:1.2s ease-out infinite EFC6jW_pulse}.EFC6jW_coordinator{border:1px solid color-mix(in srgb, CanvasText 10%, transparent);border-radius:10px;justify-content:space-between;align-items:center;gap:10px;margin-top:8px;padding:9px 10px;display:flex}.EFC6jW_coordinator>span{gap:2px;min-width:0;display:grid}.EFC6jW_coordinator b{font-size:12px}.EFC6jW_coordinator small{opacity:.65;text-overflow:ellipsis;white-space:nowrap;font-size:10px;overflow:hidden}.EFC6jW_coordinator button{border:1px solid color-mix(in srgb, CanvasText 15%, transparent);color:canvastext;cursor:pointer;background:0 0;border-radius:7px;flex:none;padding:5px 8px;font-size:10px}.EFC6jW_coordinator button:hover:not(:disabled){background:color-mix(in srgb, CanvasText 7%, transparent)}.EFC6jW_coordinator button:disabled{cursor:default;opacity:.45}.EFC6jW_commands{background:color-mix(in srgb, CanvasText 5%, transparent);border-radius:10px;gap:4px;margin-top:8px;padding:9px 10px;font-size:11px;display:grid}.EFC6jW_commands b{font-size:12px}.EFC6jW_commands span{opacity:.7}.EFC6jW_tasks{gap:6px;margin-top:9px;display:grid}.EFC6jW_task{border:1px solid color-mix(in srgb, CanvasText 10%, transparent);border-radius:10px;align-items:center;gap:8px;padding:8px 9px;display:flex}.EFC6jW_task>i{background:#6d5dfc;border-radius:50%;flex:none;width:8px;height:8px;box-shadow:0 0 0 3px #6d5dfc1f}.EFC6jW_task>span{gap:2px;min-width:0;display:grid}.EFC6jW_task b{text-overflow:ellipsis;white-space:nowrap;font-size:12px;overflow:hidden}.EFC6jW_task small{opacity:.62;align-items:center;gap:4px;font-size:10px;display:inline-flex}.EFC6jW_task small em{text-overflow:ellipsis;white-space:nowrap;max-width:120px;font-style:normal;overflow:hidden}.EFC6jW_taskActions{flex:none;gap:4px;margin-left:auto;display:flex}.EFC6jW_taskActions button{border:1px solid color-mix(in srgb, CanvasText 14%, transparent);color:canvastext;cursor:pointer;background:0 0;border-radius:7px;padding:4px 7px;font-size:10px}.EFC6jW_taskActions button:hover{background:color-mix(in srgb, CanvasText 7%, transparent)}.EFC6jW_taskActions button[data-danger]{color:#d14343}.EFC6jW_task[data-phase=completed]>i{background:#20b26b;box-shadow:0 0 0 3px #20b26b1f}.EFC6jW_task[data-phase=failed]>i,.EFC6jW_task[data-phase=cancelled]>i{background:#d14343;box-shadow:0 0 0 3px #d143431f}.EFC6jW_hint{opacity:.62;margin-top:8px;font-size:11px}.EFC6jW_error{color:#d14343;margin-top:8px;font-size:11px}@keyframes EFC6jW_pulse{0%{opacity:.9;transform:scale(.92)}to{opacity:0;transform:scale(1.35)}}@media (prefers-reduced-motion:reduce){.EFC6jW_button,.EFC6jW_pulse{transition:none;animation:none}}@media (width<=720px){.EFC6jW_root{bottom:14px;right:14px}.EFC6jW_root[data-open=true]{width:100vw}.EFC6jW_panel{padding-inline:14px}}";
		const tagId = "dsh-qwen-voice/QwenVoice.module.css";
		if (typeof document !== "undefined" && !document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]")) {
			const tag = document.createElement("style");
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		var QwenVoice_module_css_default = {
			"coordinator": "EFC6jW_coordinator",
			"button": "EFC6jW_button",
			"transcript": "EFC6jW_transcript",
			"error": "EFC6jW_error",
			"pulse": "EFC6jW_pulse",
			"timeline": "EFC6jW_timeline",
			"dot": "EFC6jW_dot",
			"tasks": "EFC6jW_tasks",
			"message": "EFC6jW_message",
			"taskActions": "EFC6jW_taskActions",
			"panel": "EFC6jW_panel",
			"head": "EFC6jW_head",
			"sidebarHandle": "EFC6jW_sidebarHandle",
			"root": "EFC6jW_root",
			"task": "EFC6jW_task",
			"closeButton": "EFC6jW_closeButton",
			"hint": "EFC6jW_hint",
			"status": "EFC6jW_status",
			"commands": "EFC6jW_commands"
		};
		//#endregion
		//#region lib/client/QwenVoice.js
		const GATEWAY_ORIGIN = "http://127.0.0.1:3101";
		const DSH_API_TOKEN = "dsh-local-3cf6f8d1a4e74279b5377ad91804e945";
		const INPUT_RATE = 16e3;
		function socketUrl(sessionId) {
			return `ws://127.0.0.1:3101/api/realtime?sessionId=${encodeURIComponent(sessionId)}`;
		}
		function persistentVoiceSessionId() {
			const key = "dsh-qwen-voice.session-id";
			const existing = sessionStorage.getItem(key);
			if (existing) return existing;
			const created = `dsh-voice-${crypto.randomUUID()}`;
			sessionStorage.setItem(key, created);
			return created;
		}
		function persistentSidebarOpen() {
			return localStorage.getItem("dsh-qwen-voice.sidebar-open") !== "false";
		}
		function labelFor(state, enabled, connected) {
			if (!connected) return "正在连接 Qwen Audio Agent";
			if (!enabled) return "Qwen 语音待命";
			if (state === "listening") return "正在听你说";
			if (state === "thinking") return "正在理解";
			if (state === "speaking") return "正在播报";
			return "语音已开启";
		}
		function taskPhaseLabel(phase) {
			return {
				accepted: "等待调度",
				queued: "排队中",
				running: "执行中",
				progress: "执行中",
				delegated: "已派发到 DSH 会话",
				finalizing: "整理结果",
				completed: "已完成",
				failed: "失败",
				cancelled: "已取消"
			}[phase] || phase;
		}
		/** Qwen Audio Agent control mounted beside the DSH send action. */
		function QwenVoice(props) {
			const currentSessionId = props.useSessions((value) => value.current);
			const [sessionId] = (0, react.useState)(persistentVoiceSessionId);
			const [enabled, setEnabled] = (0, react.useState)(false);
			const [open, setOpen] = (0, react.useState)(persistentSidebarOpen);
			const [connected, setConnected] = (0, react.useState)(false);
			const [state, setState] = (0, react.useState)("idle");
			const [transcript, setTranscript] = (0, react.useState)("点击麦克风，然后直接说出任务。");
			const [messages, setMessages] = (0, react.useState)([]);
			const [error, setError] = (0, react.useState)("");
			const [tasks, setTasks] = (0, react.useState)([]);
			const [coordinatorBinding, setCoordinatorBinding] = (0, react.useState)(null);
			const [bindingBusy, setBindingBusy] = (0, react.useState)(false);
			const socketRef = (0, react.useRef)(null);
			const audioContextRef = (0, react.useRef)(null);
			const playbackCursorRef = (0, react.useRef)(0);
			const playbackStartedRef = (0, react.useRef)(/* @__PURE__ */ new Set());
			const playbackEndTimersRef = (0, react.useRef)(/* @__PURE__ */ new Map());
			const playbackSourcesRef = (0, react.useRef)(/* @__PURE__ */ new Set());
			const activeResponseIdRef = (0, react.useRef)("");
			const messagesRef = (0, react.useRef)(null);
			const stickToBottomRef = (0, react.useRef)(true);
			const buttonRef = (0, react.useRef)(null);
			const toggle = (0, react.useCallback)(() => {
				setError("");
				setEnabled((value) => !value);
			}, []);
			(0, react.useEffect)(() => {
				localStorage.setItem("dsh-qwen-voice.sidebar-open", String(open));
			}, [open]);
			(0, react.useLayoutEffect)(() => {
				const container = messagesRef.current;
				if (container && stickToBottomRef.current) container.scrollTop = container.scrollHeight;
			}, [messages]);
			(0, react.useEffect)(() => {
				const button = buttonRef.current;
				if (button === null) return void 0;
				button.addEventListener("click", toggle);
				return () => button.removeEventListener("click", toggle);
			}, [toggle]);
			const send = (0, react.useCallback)((event) => {
				const socket = socketRef.current;
				if (socket?.readyState !== WebSocket.OPEN) return false;
				socket.send(JSON.stringify(event));
				return true;
			}, []);
			const stopPlayback = (0, react.useCallback)(() => {
				for (const source of playbackSourcesRef.current) {
					try {
						source.stop();
					} catch {}
					try {
						source.disconnect();
					} catch {}
				}
				playbackSourcesRef.current.clear();
				const cancelled = /* @__PURE__ */ new Set([...playbackStartedRef.current, ...playbackEndTimersRef.current.keys()]);
				for (const timer of playbackEndTimersRef.current.values()) window.clearTimeout(timer);
				for (const responseId of cancelled) send({
					type: "playback.cancelled",
					responseId
				});
				playbackEndTimersRef.current.clear();
				playbackStartedRef.current.clear();
				playbackCursorRef.current = audioContextRef.current?.currentTime || 0;
			}, [send]);
			const updateTask = (0, react.useCallback)((event) => {
				const task = event.task;
				if (!task?.id || !event.type?.startsWith("task.")) return;
				const phase = task.status || event.type.slice(5);
				const title = task.delegation?.title || task.objective || "DSH 会话任务";
				setTasks((current) => {
					const next = {
						id: task.id,
						title,
						phase,
						elapsedMs: task.elapsedMs || 0,
						error: task.error,
						targetSessionId: task.delegation?.sessionId
					};
					return (current.findIndex((item) => item.id === next.id) < 0 ? [next, ...current] : current.map((item) => item.id === next.id ? {
						...item,
						...next
					} : item)).slice(0, 6);
				});
			}, []);
			const cancelTask = (0, react.useCallback)(async (taskId) => {
				setError("");
				setTasks((current) => current.map((task) => task.id === taskId ? {
					...task,
					phase: "cancelling"
				} : task));
				try {
					const response = await fetch(`${GATEWAY_ORIGIN}/api/tasks/${encodeURIComponent(taskId)}`, { method: "DELETE" });
					if (!response.ok) throw new Error(`HTTP ${response.status}`);
					const body = await response.json();
					const phase = body.task?.status || body.status || "cancelled";
					setTasks((current) => current.map((task) => task.id === taskId ? {
						...task,
						phase
					} : task));
				} catch (reason) {
					setTasks((current) => current.map((task) => task.id === taskId ? {
						...task,
						phase: "failed"
					} : task));
					setError(`中断失败：${reason instanceof Error ? reason.message : String(reason)}`);
				}
			}, []);
			const openTaskSession = (0, react.useCallback)(async (sessionId) => {
				setError("");
				try {
					await props.openSession(sessionId);
					setOpen(false);
				} catch (reason) {
					setError(`打开目标会话失败：${reason instanceof Error ? reason.message : String(reason)}`);
				}
			}, [props.openSession]);
			const refreshCoordinatorBinding = (0, react.useCallback)(async () => {
				try {
					const response = await fetch(`${GATEWAY_ORIGIN}/api/dsh/coordinator-binding`, { headers: { "x-dsh-qwen-token": DSH_API_TOKEN } });
					if (!response.ok) throw new Error(`HTTP ${response.status}`);
					const body = await response.json();
					setCoordinatorBinding(body.binding || null);
				} catch (reason) {
					setError(`无法读取协调会话绑定：${reason instanceof Error ? reason.message : String(reason)}`);
				}
			}, []);
			const bindCurrentSession = (0, react.useCallback)(async () => {
				const selectedSessionId = String(currentSessionId || "");
				if (!selectedSessionId) {
					setError("请先在左侧打开一个 DSH 会话。");
					return;
				}
				if (Boolean(coordinatorBinding?.sessionId && coordinatorBinding.sessionId !== selectedSessionId) && !window.confirm(`当前协调会话是 ${coordinatorBinding?.sessionId}。\n\n确定由当前会话接管吗？正在运行的后台任务不会被取消。`)) return;
				setBindingBusy(true);
				setError("");
				try {
					const response = await fetch(`${GATEWAY_ORIGIN}/api/dsh/coordinator-binding`, {
						method: "POST",
						headers: {
							"content-type": "application/json",
							"x-dsh-qwen-token": DSH_API_TOKEN
						},
						body: JSON.stringify({ session_id: selectedSessionId })
					});
					const body = await response.json();
					if (!response.ok) throw new Error(body.message || body.error || `HTTP ${response.status}`);
					setCoordinatorBinding({
						sessionId: body.sessionId,
						cwd: body.cwd
					});
				} catch (reason) {
					setError(`协调会话绑定失败：${reason instanceof Error ? reason.message : String(reason)}`);
				} finally {
					setBindingBusy(false);
				}
			}, [coordinatorBinding, currentSessionId]);
			(0, react.useEffect)(() => {
				if (open) refreshCoordinatorBinding();
			}, [open, refreshCoordinatorBinding]);
			(0, react.useEffect)(() => {
				let disposed = false;
				let reconnectTimer;
				let delay = 500;
				const connect = () => {
					if (disposed) return;
					const socket = new WebSocket(socketUrl(sessionId));
					socketRef.current = socket;
					socket.onopen = () => {
						delay = 500;
						setConnected(true);
						setError("");
						socket.send(JSON.stringify({
							type: "connect",
							timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
							locale: navigator.language,
							voiceEnabled: enabled,
							inputEnabled: enabled,
							outputEnabled: enabled,
							wakeWordOnly: false,
							clientType: "web",
							clientLabel: "DSH Qwen Voice plugin",
							clientStates: [],
							clientInstanceId: crypto.randomUUID(),
							takeover: false
						}));
						if (enabled) socket.send(JSON.stringify({
							type: "unmute",
							takeover: false
						}));
					};
					socket.onmessage = (message) => {
						let event;
						try {
							event = JSON.parse(String(message.data));
						} catch {
							return;
						}
						if (event.type === "voice.ready" && event.inputSampleRate) setConnected(true);
						if (event.type === "voice.state" && [
							"idle",
							"listening",
							"thinking",
							"speaking"
						].includes(String(event.state))) setState(event.state);
						if ((event.type === "transcript.delta" || event.type === "transcript.final") && event.role === "user") {
							const id = event.turnId ? `user:${event.turnId}` : crypto.randomUUID();
							setMessages((items) => upsertUserTranscript(items, {
								id,
								content: event.content || "",
								turnId: event.turnId,
								final: event.type === "transcript.final"
							}));
							setTranscript(event.content || "");
						}
						if ((event.type === "transcript.delta" || event.type === "transcript.final") && event.role === "assistant") {
							const responseId = event.responseId || activeResponseIdRef.current;
							if (responseId) {
								const final = event.type === "transcript.final";
								const message = {
									id: `voice:${responseId}`,
									role: "assistant",
									content: event.content || "",
									responseId,
									turnId: event.turnId,
									taskId: event.taskId,
									taskIds: event.taskIds,
									origin: event.origin,
									deliverySequence: event.deliverySequence,
									final,
									live: !final
								};
								setMessages((items) => upsertAssistantTranscript(items, message, final || Boolean(event.replace)));
								setTranscript(event.content || "");
							}
						}
						if (event.type === "transcript.discard" && event.role === "user") setMessages((items) => event.reason === "turn_invalid" ? discardUserTranscript(items, event.turnId) : settleUserTranscript(items, event.turnId));
						if (event.type === "timeline.inline" && event.item?.content) {
							const item = event.item;
							setMessages((items) => upsertAssistantTranscript(items, {
								id: `inline:${item.id || item.taskId || crypto.randomUUID()}`,
								role: "assistant",
								content: item.content || "",
								title: item.title,
								turnId: item.turnId,
								taskId: item.taskId,
								final: true,
								live: false
							}, true));
						}
						updateTask(event);
						if (event.type === "error") setError(event.message || "Qwen 语音服务返回错误");
						if (event.type === "response.started") {
							stopPlayback();
							activeResponseIdRef.current = event.responseId || "";
						}
						if (event.type === "audio.delta" && event.audio && enabled) {
							if (event.responseId && activeResponseIdRef.current && event.responseId !== activeResponseIdRef.current) return;
							if (event.responseId && !activeResponseIdRef.current) activeResponseIdRef.current = event.responseId;
							const context = audioContextRef.current;
							if (!context) return;
							const samples = decodePcm(event.audio);
							const rate = event.sampleRate || 24e3;
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
								} catch {}
							};
							const start = Math.max(context.currentTime + .02, playbackCursorRef.current);
							playbackCursorRef.current = start + buffer.duration;
							if (event.responseId && !playbackStartedRef.current.has(event.responseId)) {
								playbackStartedRef.current.add(event.responseId);
								send({
									type: "playback.started",
									responseId: event.responseId
								});
							}
							source.start(start);
						}
						if (event.type === "audio.done" && event.responseId) {
							if (activeResponseIdRef.current && event.responseId !== activeResponseIdRef.current) return;
							const responseId = event.responseId;
							const context = audioContextRef.current;
							const delayMs = context ? Math.max(0, (playbackCursorRef.current - context.currentTime) * 1e3) + 40 : 0;
							const previous = playbackEndTimersRef.current.get(responseId);
							if (previous !== void 0) window.clearTimeout(previous);
							const timer = window.setTimeout(() => {
								playbackEndTimersRef.current.delete(responseId);
								playbackStartedRef.current.delete(responseId);
								send({
									type: "playback.ended",
									responseId
								});
							}, delayMs);
							playbackEndTimersRef.current.set(responseId, timer);
						}
						if (event.type === "response.interrupted" || event.type === "playback.clear") {
							if (event.type === "response.interrupted" && event.responseId) {
								const id = `voice:${event.responseId}`;
								setMessages((items) => items.map((item) => item.id === id ? {
									...item,
									interrupted: true,
									live: false
								} : item));
							}
							stopPlayback();
							activeResponseIdRef.current = "";
						}
					};
					socket.onerror = () => {
						setError(`无法连接 ${GATEWAY_ORIGIN}`);
					};
					socket.onclose = () => {
						stopPlayback();
						activeResponseIdRef.current = "";
						if (socketRef.current === socket) socketRef.current = null;
						setConnected(false);
						if (!disposed) {
							reconnectTimer = window.setTimeout(connect, delay);
							delay = Math.min(5e3, delay * 2);
						}
					};
				};
				connect();
				return () => {
					disposed = true;
					if (reconnectTimer !== void 0) window.clearTimeout(reconnectTimer);
					socketRef.current?.close();
					socketRef.current = null;
				};
			}, [
				enabled,
				sessionId,
				stopPlayback,
				updateTask
			]);
			(0, react.useEffect)(() => {
				if (!enabled) {
					stopPlayback();
					activeResponseIdRef.current = "";
					send({ type: "mute" });
					return;
				}
				let disposed = false;
				let stream;
				let source;
				let processor;
				const start = async () => {
					try {
						const AudioContextCtor = window.AudioContext;
						const context = audioContextRef.current?.state === "closed" ? new AudioContextCtor() : audioContextRef.current ?? new AudioContextCtor();
						audioContextRef.current = context;
						await context.resume();
						stream = await navigator.mediaDevices.getUserMedia({ audio: {
							echoCancellation: true,
							noiseSuppression: true,
							autoGainControl: true
						} });
						if (disposed) {
							stream.getTracks().forEach((track) => track.stop());
							return;
						}
						source = context.createMediaStreamSource(stream);
						processor = context.createScriptProcessor(2048, 1, 1);
						processor.onaudioprocess = (event) => {
							const samples = resample(event.inputBuffer.getChannelData(0), context.sampleRate, INPUT_RATE);
							send({
								type: "audio.append",
								audio: pcmBase64(samples)
							});
						};
						source.connect(processor);
						processor.connect(context.destination);
						send({
							type: "unmute",
							takeover: false
						});
					} catch (reason) {
						setEnabled(false);
						setError(reason instanceof Error ? reason.message : "无法打开麦克风");
					}
				};
				start();
				return () => {
					disposed = true;
					stream?.getTracks().forEach((track) => track.stop());
					processor?.disconnect();
					source?.disconnect();
				};
			}, [
				enabled,
				send,
				stopPlayback
			]);
			(0, react.useEffect)(() => () => {
				stopPlayback();
				activeResponseIdRef.current = "";
				audioContextRef.current?.close();
				audioContextRef.current = null;
			}, [stopPlayback]);
			const status = labelFor(state, enabled, connected);
			const activeCount = tasks.filter((task) => ![
				"completed",
				"failed",
				"cancelled"
			].includes(task.phase)).length;
			return (0, react_dom.createPortal)((0, react_jsx_runtime.jsxs)("div", {
				className: QwenVoice_module_css_default.root,
				"data-open": open,
				children: [
					enabled && (0, react_jsx_runtime.jsx)("span", {
						className: QwenVoice_module_css_default.pulse,
						"aria-hidden": true
					}),
					(0, react_jsx_runtime.jsx)("button", {
						ref: buttonRef,
						type: "button",
						className: QwenVoice_module_css_default.button,
						"data-active": enabled,
						"data-state": state,
						"data-error": Boolean(error),
						"aria-label": enabled ? "关闭 Qwen 语音" : "开启 Qwen 语音",
						"aria-pressed": enabled,
						title: status,
						onMouseDown: (event) => event.preventDefault(),
						children: (0, react_jsx_runtime.jsx)("svg", {
							viewBox: "0 0 24 24",
							width: "17",
							height: "17",
							"aria-hidden": true,
							children: (0, react_jsx_runtime.jsx)("path", {
								fill: "currentColor",
								d: "M12 15.5a3.5 3.5 0 0 0 3.5-3.5V6a3.5 3.5 0 1 0-7 0v6a3.5 3.5 0 0 0 3.5 3.5Zm-1.8-9.5a1.8 1.8 0 1 1 3.6 0v6a1.8 1.8 0 1 1-3.6 0V6Zm7.8 5.4a.85.85 0 0 1 .85.85 6.85 6.85 0 0 1-6 6.8v2.1h2.4a.85.85 0 1 1 0 1.7h-6.5a.85.85 0 1 1 0-1.7h2.4v-2.1a6.85 6.85 0 0 1-6-6.8.85.85 0 1 1 1.7 0 5.15 5.15 0 0 0 10.3 0 .85.85 0 0 1 .85-.85Z"
							})
						})
					}),
					!open && (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: QwenVoice_module_css_default.sidebarHandle,
						"aria-label": "展开 Qwen 语音侧边栏",
						title: "展开语音侧边栏",
						onClick: () => setOpen(true),
						children: (0, react_jsx_runtime.jsx)("svg", {
							viewBox: "0 0 24 24",
							width: "18",
							height: "18",
							"aria-hidden": true,
							children: (0, react_jsx_runtime.jsx)("path", {
								fill: "currentColor",
								d: "m9.3 6.3 5 5a1 1 0 0 1 0 1.4l-5 5-1.4-1.4 4.3-4.3-4.3-4.3 1.4-1.4Z"
							})
						})
					}),
					open && (0, react_jsx_runtime.jsxs)("section", {
						className: QwenVoice_module_css_default.panel,
						"aria-live": "polite",
						children: [
							(0, react_jsx_runtime.jsxs)("div", {
								className: QwenVoice_module_css_default.head,
								children: [(0, react_jsx_runtime.jsxs)("span", {
									className: QwenVoice_module_css_default.status,
									children: [(0, react_jsx_runtime.jsx)("i", {
										className: QwenVoice_module_css_default.dot,
										"data-connected": connected
									}), (0, react_jsx_runtime.jsxs)("span", { children: [(0, react_jsx_runtime.jsx)("b", { children: "Qwen 语音协调中心" }), (0, react_jsx_runtime.jsxs)("small", { children: [status, activeCount > 0 ? ` · ${activeCount} 项活跃` : ""] })] })]
								}), (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: QwenVoice_module_css_default.closeButton,
									"aria-label": "收起语音侧边栏",
									title: "收起侧边栏",
									onClick: () => setOpen(false),
									children: (0, react_jsx_runtime.jsx)("svg", {
										viewBox: "0 0 24 24",
										width: "18",
										height: "18",
										"aria-hidden": true,
										children: (0, react_jsx_runtime.jsx)("path", {
											fill: "currentColor",
											d: "m14.7 6.3-5 5a1 1 0 0 0 0 1.4l5 5 1.4-1.4-4.3-4.3 4.3-4.3-1.4-1.4Z"
										})
									})
								})]
							}),
							(0, react_jsx_runtime.jsx)("div", {
								ref: messagesRef,
								className: QwenVoice_module_css_default.timeline,
								"aria-label": "语音对话记录",
								onScroll: (event) => {
									const container = event.currentTarget;
									stickToBottomRef.current = container.scrollHeight - container.scrollTop - container.clientHeight < 36;
								},
								children: messages.length === 0 ? (0, react_jsx_runtime.jsx)("p", {
									className: QwenVoice_module_css_default.transcript,
									children: transcript
								}) : messages.map((message) => (0, react_jsx_runtime.jsxs)("article", {
									className: QwenVoice_module_css_default.message,
									"data-role": message.role,
									"data-live": message.live || void 0,
									children: [
										(0, react_jsx_runtime.jsx)("small", { children: message.role === "user" ? "你" : message.origin === "announcement" ? "任务播报" : "Qwen" }),
										message.title && (0, react_jsx_runtime.jsx)("b", { children: message.title }),
										(0, react_jsx_runtime.jsx)("p", { children: message.content || (message.live ? "…" : "") }),
										message.interrupted && (0, react_jsx_runtime.jsx)("em", { children: "已中断" })
									]
								}, message.id))
							}),
							(0, react_jsx_runtime.jsxs)("div", {
								className: QwenVoice_module_css_default.coordinator,
								children: [(0, react_jsx_runtime.jsxs)("span", { children: [(0, react_jsx_runtime.jsx)("b", { children: "协调会话" }), (0, react_jsx_runtime.jsx)("small", { children: coordinatorBinding ? String(currentSessionId || "") === coordinatorBinding.sessionId ? "当前会话正在担任 Coordinator" : `已绑定 ${coordinatorBinding.sessionId.slice(0, 20)}…` : "尚未绑定，请选择当前会话" })] }), (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									disabled: bindingBusy || !currentSessionId,
									onClick: () => {
										bindCurrentSession();
									},
									children: bindingBusy ? "验证中…" : coordinatorBinding?.sessionId === String(currentSessionId || "") ? "重新验证" : coordinatorBinding ? "由当前会话接管" : "设为协调会话"
								})]
							}),
							(0, react_jsx_runtime.jsxs)("div", {
								className: QwenVoice_module_css_default.commands,
								children: [
									(0, react_jsx_runtime.jsx)("b", { children: "单页多会话指令" }),
									(0, react_jsx_runtime.jsx)("span", { children: "“新建前端开发会话，让它做登录页”" }),
									(0, react_jsx_runtime.jsx)("span", { children: "“给前端开发追加：改成深色主题”" }),
									(0, react_jsx_runtime.jsx)("span", { children: "“代码审查会话进展如何？”" })
								]
							}),
							tasks.length > 0 && (0, react_jsx_runtime.jsx)("div", {
								className: QwenVoice_module_css_default.tasks,
								"aria-label": "DSH 多会话任务",
								children: tasks.map((task) => (0, react_jsx_runtime.jsxs)("div", {
									className: QwenVoice_module_css_default.task,
									"data-phase": task.phase,
									children: [
										(0, react_jsx_runtime.jsx)("i", { "aria-hidden": true }),
										(0, react_jsx_runtime.jsxs)("span", { children: [
											(0, react_jsx_runtime.jsx)("b", { children: task.title }),
											(0, react_jsx_runtime.jsxs)("small", { children: [
												(0, react_jsx_runtime.jsx)("em", { children: "协调 Agent" }),
												(0, react_jsx_runtime.jsx)("i", {
													"aria-hidden": true,
													children: "→"
												}),
												(0, react_jsx_runtime.jsx)("em", { children: task.targetSessionId ? "目标 DSH 会话" : "正在路由" })
											] }),
											(0, react_jsx_runtime.jsxs)("small", { children: [taskPhaseLabel(task.phase), task.elapsedMs > 0 ? ` · ${Math.round(task.elapsedMs / 1e3)}s` : ""] })
										] }),
										(0, react_jsx_runtime.jsxs)("span", {
											className: QwenVoice_module_css_default.taskActions,
											children: [task.targetSessionId && (0, react_jsx_runtime.jsx)("button", {
												type: "button",
												onClick: () => {
													openTaskSession(task.targetSessionId);
												},
												children: "打开"
											}), ![
												"completed",
												"failed",
												"cancelled"
											].includes(task.phase) && (0, react_jsx_runtime.jsx)("button", {
												type: "button",
												"data-danger": true,
												disabled: task.phase === "cancelling",
												onClick: () => {
													cancelTask(task.id);
												},
												children: task.phase === "cancelling" ? "中断中…" : "中断"
											})]
										})
									]
								}, task.id))
							}),
							(0, react_jsx_runtime.jsxs)("div", {
								className: QwenVoice_module_css_default.hint,
								children: [
									"当前页面会话：",
									currentSessionId ? "已选择" : "未选择",
									"。不同 DSH 会话可并行；同一会话内按顺序执行。"
								]
							}),
							error && (0, react_jsx_runtime.jsx)("div", {
								className: QwenVoice_module_css_default.error,
								children: error
							})
						]
					})
				]
			}), document.body);
		}
		//#endregion
		//#region lib/client/index.js
		const inject = ["slots", "sessions"];
		async function openSession(ctx, sessionId) {
			const sessions = ctx.sessions;
			const id = sessionId;
			if (!sessions.list.getSnapshot().ids.includes(id)) await sessions.refresh();
			sessions.open(id);
		}
		/** Register one root-scoped voice orb that survives conversation switches. */
		function apply(ctx) {
			ctx.slots.inject("shell.overlay", () => ctx.slots.register({
				name: "shell.overlay",
				id: "qwen-voice",
				order: 900,
				label: "Qwen Voice"
			}, (props) => (0, react_jsx_runtime.jsx)(QwenVoice, {
				...props,
				openSession: (sessionId) => openSession(ctx, sessionId)
			})));
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map