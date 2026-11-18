/**
 * 供应用通过服务器转发模型调用的代理流函数；服务器负责认证及向模型提供方转发请求。
 */

import {
	type AssistantMessage,
	type AssistantMessageEvent,
	type AssistantMessageEventStream,
	createAssistantMessageEventStream,
	type Model,
	type SimpleStreamOptions,
	type StopReason,
	type ToolCall,
	ToolCallArgumentsStream,
	type TranscriptContext,
} from "@earendil-works/pi-ai";

/**
 * 代理事件类型：服务器省略 partial 字段，以减少传输带宽。
 */
export type ProxyAssistantMessageEvent =
	| { type: "start" }
	| { type: "text_start"; contentIndex: number }
	| { type: "text_delta"; contentIndex: number; delta: string }
	| { type: "text_end"; contentIndex: number; contentSignature?: string }
	| { type: "thinking_start"; contentIndex: number }
	| { type: "thinking_delta"; contentIndex: number; delta: string }
	| { type: "thinking_end"; contentIndex: number; contentSignature?: string }
	| { type: "toolcall_start"; contentIndex: number; id: string; toolName: string }
	| { type: "toolcall_delta"; contentIndex: number; delta: string }
	| { type: "toolcall_end"; contentIndex: number; toolCall: ToolCall }
	| {
			type: "done";
			reason: Extract<StopReason, "stop" | "length" | "toolUse">;
			usage: AssistantMessage["usage"];
			providerThinkingLevel?: string;
	  }
	| {
			type: "error";
			reason: Extract<StopReason, "aborted" | "error">;
			errorMessage?: string;
			usage: AssistantMessage["usage"];
			providerThinkingLevel?: string;
	  };

type ProxySerializableStreamOptions = Pick<
	SimpleStreamOptions,
	| "temperature"
	| "samplingParams"
	| "maxTokens"
	| "reasoning"
	| "cacheRetention"
	| "sessionId"
	| "disableContinuation"
	| "headers"
	| "metadata"
	| "transport"
	| "thinkingBudgets"
	| "maxRetryDelayMs"
>;

export interface ProxyStreamOptions extends ProxySerializableStreamOptions {
	/**
	 * 代理请求的本地取消信号。
	 */
	signal?: AbortSignal;
	/**
	 * 代理服务器使用的认证令牌。
	 */
	authToken: string;
	/**
	 * 代理服务器地址，例如 https://genai.example.com。
	 */
	proxyUrl: string;
}

/**
 * 通过服务器代理模型请求的流函数。服务器从增量事件中移除 partial 字段以节省带宽，客户端据事件重建部分消息。
 * 需要通过代理访问模型时，可将此函数用作 Agent 的 streamFn。
 *
 * @example
 * ```typescript
 * const agent = new Agent({
 *   streamFn: (model, context, options) =>
 *     streamProxy(model, context, {
 *       ...options,
 *       authToken: await getAuthToken(),
 *       proxyUrl: "https://genai.example.com",
 *     }),
 * });
 * ```
 */
function buildProxyRequestOptions(options: ProxyStreamOptions): ProxySerializableStreamOptions {
	return {
		temperature: options.temperature,
		samplingParams: options.samplingParams,
		maxTokens: options.maxTokens,
		reasoning: options.reasoning,
		cacheRetention: options.cacheRetention,
		sessionId: options.sessionId,
		disableContinuation: options.disableContinuation,
		headers: options.headers,
		metadata: options.metadata,
		transport: options.transport,
		thinkingBudgets: options.thinkingBudgets,
		maxRetryDelayMs: options.maxRetryDelayMs,
	};
}

export function streamProxy(
	model: Model<any>,
	context: TranscriptContext,
	options: ProxyStreamOptions,
): AssistantMessageEventStream {
	const stream = createAssistantMessageEventStream();

	(async () => {
		// 初始化部分消息，随后根据流事件逐步填充。
		const partial: AssistantMessage = {
			role: "assistant",
			stopReason: "pending",
			content: [],
			api: model.api,
			provider: model.provider,
			model: model.id,
			usage: {
				input: 0,
				output: 0,
				cacheRead: 0,
				cacheWrite: 0,
				totalTokens: 0,
				cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
			},
			timestamp: Date.now(),
		};

		let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;

		const abortHandler = () => {
			if (reader) {
				reader.cancel("Request aborted by user").catch(() => {});
			}
		};

		if (options.signal) {
			options.signal.addEventListener("abort", abortHandler);
		}

		try {
			const response = await fetch(`${options.proxyUrl}/api/stream`, {
				method: "POST",
				headers: {
					Authorization: `Bearer ${options.authToken}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					model,
					context,
					options: buildProxyRequestOptions(options),
				}),
				signal: options.signal,
			});

			if (!response.ok) {
				let errorMessage = `Proxy error: ${response.status} ${response.statusText}`;
				try {
					const errorData = (await response.json()) as { error?: string };
					if (errorData.error) {
						errorMessage = `Proxy error: ${errorData.error}`;
					}
				} catch {
					// Couldn't parse error response
				}
				throw new Error(errorMessage);
			}

			reader = response.body!.getReader();
			const decoder = new TextDecoder();
			let buffer = "";
			let sawTerminalEvent = false;
			// 按内容索引保存尚未结束的工具参数流，避免把解析状态放进内容块。
			const toolArguments = new Map<number, ToolCallArgumentsStream>();

			const processLine = (line: string): void => {
				if (!line.startsWith("data: ")) return;
				const data = line.slice(6).trim();
				if (!data) return;
				const proxyEvent = JSON.parse(data) as ProxyAssistantMessageEvent;
				const event = processProxyEvent(proxyEvent, partial, toolArguments);
				if (event) {
					if (event.type === "done" || event.type === "error") sawTerminalEvent = true;
					stream.push(event);
				}
			};

			while (true) {
				const { done, value } = await reader.read();
				if (done) break;

				if (options.signal?.aborted) {
					throw new Error("Request aborted by user");
				}

				buffer += decoder.decode(value, { stream: true });
				const lines = buffer.split("\n");
				buffer = lines.pop() || "";

				for (const line of lines) {
					processLine(line);
				}
			}

			if (options.signal?.aborted) {
				throw new Error("Request aborted by user");
			}

			// 最后一条事件可能没有换行结尾；刷新解码器，
			// 并处理缓冲区中剩余的内容。
			buffer += decoder.decode();
			if (buffer) {
				processLine(buffer);
			}

			if (!sawTerminalEvent) {
				// 流正常到达 EOF 却未收到 done/error，说明服务器中途断开响应；
				// 应显式报告错误，
				// 避免调用方一直等待永远不会到来的最终结果。
				partial.stopReason = "error";
				partial.errorMessage = "Connection closed by proxy server before the response completed";
				stream.push({
					type: "error",
					reason: "error",
					error: partial,
				});
			}

			stream.end();
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			const reason = options.signal?.aborted ? "aborted" : "error";
			partial.stopReason = reason;
			partial.errorMessage = errorMessage;
			stream.push({
				type: "error",
				reason,
				error: partial,
			});
			stream.end();
		} finally {
			if (options.signal) {
				options.signal.removeEventListener("abort", abortHandler);
			}
		}
	})();

	return stream;
}

/**
 * 处理代理事件并更新部分消息。
 */
function processProxyEvent(
	proxyEvent: ProxyAssistantMessageEvent,
	partial: AssistantMessage,
	toolArguments: Map<number, ToolCallArgumentsStream>,
): AssistantMessageEvent | undefined {
	switch (proxyEvent.type) {
		case "start":
			return { type: "start", partial };

		case "text_start":
			partial.content[proxyEvent.contentIndex] = { type: "text", text: "" };
			return { type: "text_start", contentIndex: proxyEvent.contentIndex, partial };

		case "text_delta": {
			const content = partial.content[proxyEvent.contentIndex];
			if (content?.type === "text") {
				content.text += proxyEvent.delta;
				return {
					type: "text_delta",
					contentIndex: proxyEvent.contentIndex,
					delta: proxyEvent.delta,
					partial,
				};
			}
			throw new Error("Received text_delta for non-text content");
		}

		case "text_end": {
			const content = partial.content[proxyEvent.contentIndex];
			if (content?.type === "text") {
				content.textSignature = proxyEvent.contentSignature;
				return {
					type: "text_end",
					contentIndex: proxyEvent.contentIndex,
					content: content.text,
					partial,
				};
			}
			throw new Error("Received text_end for non-text content");
		}

		case "thinking_start":
			partial.content[proxyEvent.contentIndex] = { type: "thinking", thinking: "" };
			return { type: "thinking_start", contentIndex: proxyEvent.contentIndex, partial };

		case "thinking_delta": {
			const content = partial.content[proxyEvent.contentIndex];
			if (content?.type === "thinking") {
				content.thinking += proxyEvent.delta;
				return {
					type: "thinking_delta",
					contentIndex: proxyEvent.contentIndex,
					delta: proxyEvent.delta,
					partial,
				};
			}
			throw new Error("Received thinking_delta for non-thinking content");
		}

		case "thinking_end": {
			const content = partial.content[proxyEvent.contentIndex];
			if (content?.type === "thinking") {
				content.thinkingSignature = proxyEvent.contentSignature;
				return {
					type: "thinking_end",
					contentIndex: proxyEvent.contentIndex,
					content: content.thinking,
					partial,
				};
			}
			throw new Error("Received thinking_end for non-thinking content");
		}

		case "toolcall_start":
			partial.content[proxyEvent.contentIndex] = {
				type: "toolCall",
				id: proxyEvent.id,
				name: proxyEvent.toolName,
				arguments: {},
			};
			toolArguments.set(proxyEvent.contentIndex, new ToolCallArgumentsStream());
			return { type: "toolcall_start", contentIndex: proxyEvent.contentIndex, partial };

		case "toolcall_delta": {
			const content = partial.content[proxyEvent.contentIndex];
			const args = toolArguments.get(proxyEvent.contentIndex);
			if (content?.type === "toolCall" && args !== undefined) {
				// 创建新的内容块对象，让响应式调用方能观察到变化。
				partial.content[proxyEvent.contentIndex] = { ...content, arguments: args.append(proxyEvent.delta) };
				return {
					type: "toolcall_delta",
					contentIndex: proxyEvent.contentIndex,
					delta: proxyEvent.delta,
					partial,
				};
			}
			throw new Error("Received toolcall_delta for non-toolCall content");
		}

		case "toolcall_end": {
			const content = partial.content[proxyEvent.contentIndex];
			if (content?.type === "toolCall") {
				Object.assign(content, proxyEvent.toolCall);
				toolArguments.delete(proxyEvent.contentIndex);
				return {
					type: "toolcall_end",
					contentIndex: proxyEvent.contentIndex,
					toolCall: content,
					partial,
				};
			}
			return undefined;
		}

		case "done":
			partial.stopReason = proxyEvent.reason;
			partial.usage = proxyEvent.usage;
			if (proxyEvent.providerThinkingLevel !== undefined) {
				partial.providerThinkingLevel = proxyEvent.providerThinkingLevel;
			}
			return { type: "done", reason: proxyEvent.reason, message: partial };

		case "error":
			partial.stopReason = proxyEvent.reason;
			partial.errorMessage = proxyEvent.errorMessage;
			partial.usage = proxyEvent.usage;
			if (proxyEvent.providerThinkingLevel !== undefined) {
				partial.providerThinkingLevel = proxyEvent.providerThinkingLevel;
			}
			return { type: "error", reason: proxyEvent.reason, error: partial };

		default: {
			const _exhaustiveCheck: never = proxyEvent;
			console.warn(`Unhandled proxy event type: ${(proxyEvent as any).type}`);
			return undefined;
		}
	}
}
