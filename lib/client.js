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
		//#region \0dsh-css:<project>/src\client\QwenVoice.module.css.mjs
		const css = ".EFC6jW_root{z-index:1200;pointer-events:auto;align-items:center;display:inline-flex;position:fixed;bottom:22px;right:22px}.EFC6jW_button{color:#fff;cursor:pointer;background:linear-gradient(145deg,#282b34,#111318);border:1px solid #ffffff47;border-radius:999px;place-items:center;width:54px;height:54px;transition:color .16s,background .16s,transform .16s;display:grid;box-shadow:0 12px 34px #00000047}.EFC6jW_button:hover{color:#fff;background:linear-gradient(145deg,#353945,#17191f);transform:translateY(-2px)}.EFC6jW_button:focus-visible{outline-offset:2px;outline:2px solid #6d5dfc}.EFC6jW_button[data-active=true]{color:#fff;background:linear-gradient(135deg,#7357ff,#2e9bff);box-shadow:0 0 0 4px #655bff24}.EFC6jW_button[data-state=speaking]{background:linear-gradient(135deg,#16a085,#2ecc71)}.EFC6jW_button[data-error=true]{color:#fff;background:#d14343}.EFC6jW_pulse{pointer-events:none;border:1px solid #655bff73;border-radius:999px;animation:1.5s ease-out infinite EFC6jW_pulse;position:absolute;inset:-3px}.EFC6jW_panel{background:color-mix(in srgb, Canvas 94%, transparent);color:canvastext;backdrop-filter:blur(18px);z-index:50;border:1px solid #7f7f7f38;border-radius:16px;width:min(380px,100vw - 32px);max-height:min(620px,100vh - 110px);padding:12px;position:absolute;bottom:66px;right:0;overflow:auto;box-shadow:0 16px 46px #00000038}.EFC6jW_head{justify-content:space-between;align-items:center;gap:10px;font-size:12px;display:flex}.EFC6jW_status{align-items:center;gap:7px;display:inline-flex}.EFC6jW_status>span{gap:1px;display:grid}.EFC6jW_status b{font-size:12px}.EFC6jW_status small{opacity:.65;font-size:10px;font-weight:500}.EFC6jW_dot{background:#a0a7b2;border-radius:50%;width:7px;height:7px}.EFC6jW_dot[data-connected=true]{background:#20b26b;box-shadow:0 0 0 3px #20b26b26}.EFC6jW_transcript{min-height:38px;color:color-mix(in srgb, CanvasText 84%, transparent);margin:10px 0 0;font-size:13px;line-height:1.55}.EFC6jW_commands{background:color-mix(in srgb, CanvasText 5%, transparent);border-radius:10px;gap:4px;margin-top:8px;padding:9px 10px;font-size:11px;display:grid}.EFC6jW_commands b{font-size:12px}.EFC6jW_commands span{opacity:.7}.EFC6jW_tasks{gap:6px;margin-top:9px;display:grid}.EFC6jW_task{border:1px solid color-mix(in srgb, CanvasText 10%, transparent);border-radius:10px;align-items:center;gap:8px;padding:8px 9px;display:flex}.EFC6jW_task>i{background:#6d5dfc;border-radius:50%;flex:none;width:8px;height:8px;box-shadow:0 0 0 3px #6d5dfc1f}.EFC6jW_task>span{gap:2px;min-width:0;display:grid}.EFC6jW_task b{text-overflow:ellipsis;white-space:nowrap;font-size:12px;overflow:hidden}.EFC6jW_task small{opacity:.62;align-items:center;gap:4px;font-size:10px;display:inline-flex}.EFC6jW_task small em{text-overflow:ellipsis;white-space:nowrap;max-width:120px;font-style:normal;overflow:hidden}.EFC6jW_taskActions{flex:none;gap:4px;margin-left:auto;display:flex}.EFC6jW_taskActions button{border:1px solid color-mix(in srgb, CanvasText 14%, transparent);color:canvastext;cursor:pointer;background:0 0;border-radius:7px;padding:4px 7px;font-size:10px}.EFC6jW_taskActions button:hover{background:color-mix(in srgb, CanvasText 7%, transparent)}.EFC6jW_taskActions button[data-danger]{color:#d14343}.EFC6jW_task[data-phase=completed]>i{background:#20b26b;box-shadow:0 0 0 3px #20b26b1f}.EFC6jW_task[data-phase=failed]>i,.EFC6jW_task[data-phase=cancelled]>i{background:#d14343;box-shadow:0 0 0 3px #d143431f}.EFC6jW_hint{opacity:.62;margin-top:8px;font-size:11px}.EFC6jW_error{color:#d14343;margin-top:8px;font-size:11px}.EFC6jW_panel .EFC6jW_button{color:canvastext;width:26px;height:26px;box-shadow:none;background:0 0;border:0}@keyframes EFC6jW_pulse{0%{opacity:.9;transform:scale(.92)}to{opacity:0;transform:scale(1.35)}}@media (prefers-reduced-motion:reduce){.EFC6jW_button,.EFC6jW_pulse{transition:none;animation:none}}@media (width<=720px){.EFC6jW_root{bottom:14px;right:14px}}";
		const tagId = "dsh-qwen-voice/QwenVoice.module.css";
		if (typeof document !== "undefined" && !document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]")) {
			const tag = document.createElement("style");
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		var QwenVoice_module_css_default = {
			"head": "EFC6jW_head",
			"dot": "EFC6jW_dot",
			"transcript": "EFC6jW_transcript",
			"panel": "EFC6jW_panel",
			"button": "EFC6jW_button",
			"hint": "EFC6jW_hint",
			"error": "EFC6jW_error",
			"pulse": "EFC6jW_pulse",
			"task": "EFC6jW_task",
			"taskActions": "EFC6jW_taskActions",
			"tasks": "EFC6jW_tasks",
			"commands": "EFC6jW_commands",
			"root": "EFC6jW_root",
			"status": "EFC6jW_status"
		};
		//#endregion
		//#region lib/client/QwenVoice.js
		const GATEWAY_ORIGIN = "http://127.0.0.1:3101";
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
			const [open, setOpen] = (0, react.useState)(false);
			const [connected, setConnected] = (0, react.useState)(false);
			const [state, setState] = (0, react.useState)("idle");
			const [transcript, setTranscript] = (0, react.useState)("点击麦克风，然后直接说出任务。");
			const [error, setError] = (0, react.useState)("");
			const [tasks, setTasks] = (0, react.useState)([]);
			const socketRef = (0, react.useRef)(null);
			const audioContextRef = (0, react.useRef)(null);
			const playbackCursorRef = (0, react.useRef)(0);
			const playbackStartedRef = (0, react.useRef)(/* @__PURE__ */ new Set());
			const playbackEndTimersRef = (0, react.useRef)(/* @__PURE__ */ new Map());
			const playbackSourcesRef = (0, react.useRef)(/* @__PURE__ */ new Set());
			const activeResponseIdRef = (0, react.useRef)("");
			const buttonRef = (0, react.useRef)(null);
			const toggle = (0, react.useCallback)(() => {
				setOpen(true);
				setError("");
				setEnabled((value) => !value);
			}, []);
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
						if ((event.type === "transcript.delta" || event.type === "transcript.final") && event.role === "user") setTranscript(event.content || "");
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
									className: QwenVoice_module_css_default.button,
									"aria-label": "关闭语音面板",
									onClick: () => setOpen(false),
									children: "×"
								})]
							}),
							(0, react_jsx_runtime.jsx)("p", {
								className: QwenVoice_module_css_default.transcript,
								children: transcript
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
												onClick: () => props.openSession(task.targetSessionId),
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
		const inject = ["slots"];
		/** Register one root-scoped voice orb that survives conversation switches. */
		function apply(ctx) {
			ctx.slots.inject("shell.overlay", () => ctx.slots.register({
				name: "shell.overlay",
				id: "qwen-voice",
				order: 900,
				label: "Qwen Voice"
			}, (props) => (0, react_jsx_runtime.jsx)(QwenVoice, {
				...props,
				openSession: (sessionId) => ctx.sessions.open(sessionId)
			})));
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map