import type {
	Api,
	AssistantMessage,
	AssistantMessageEvent,
	AssistantMessageEventStream,
	ImageContent,
	JsonValue,
	Message,
	Model,
	SimpleStreamOptions,
	TextContent,
	Tool,
	ToolResultMessage,
	TranscriptContext,
	Usage,
} from "@earendil-works/pi-ai";
import type { Static } from "@earendil-works/pi-schema";

/**
 * 智能体循环使用的流函数类型，Models.streamSimple 满足该接口。
 * 循环传入规范化对话：系统提示词和工具声明由系统消息承载，不通过 context.systemPrompt 或 context.tools 传入。
 * 接口约定：请求、模型或运行时失败不能以抛异常或 Promise 拒绝报告；必须返回 AssistantMessageEventStream。失败应编码为流中的协议事件，并给出 stopReason 为 error 或 aborted、带 errorMessage 的最终 AssistantMessage。
 */
export type StreamFn = (
	model: Model<Api>,
	context: TranscriptContext,
	options?: SimpleStreamOptions,
) => AssistantMessageEventStream | Promise<AssistantMessageEventStream>;

/**
 * 控制一条助手消息中的工具调用如何执行。
 * sequential：逐项准备、执行和收尾后，才启动下一项。
 * parallel：依次准备所有调用，再并发执行允许的工具；每项收尾后按完成顺序发出 tool_execution_end，随后按助手原始调用顺序发出工具结果消息。
 */
export type ToolExecutionMode = "sequential" | "parallel";

/**
 * 控制循环到达队列取出点时注入的用户消息数。
 * all：一次取出并注入全部队列消息。
 * one-at-a-time：只取出最早一条，其余留待后续取出点。
 */
export type QueueMode = "all" | "one-at-a-time";

/**
 * 助手消息发出的一项工具调用内容块。
 */
export type AgentToolCall = Extract<AssistantMessage["content"][number], { type: "toolCall" }>;

/**
 * beforeToolCall 的返回结果。
 * 返回 { block: true } 可阻止执行，循环改为产生错误工具结果。reason 用作该错误结果的文本；省略时使用默认阻断提示。
 */
export interface BeforeToolCallResult {
	block?: boolean;
	reason?: string;
	/**
	 * 本次调用被阻断时，可提示在当前工具批次后停止。只有批次中所有已完成工具结果都设置 true，才提前结束。
	 */
	terminate?: boolean;
}

/**
 * afterToolCall 返回的部分覆盖结果。
 * 按字段覆盖：content 替换整个内容数组；details 替换整个详情值；isError 替换错误标记；usage 替换用量；terminate 替换提前结束提示。structuredContent 若提供则完整替换；若仅替换 content 而省略它，会删除可能失配的旧结构化内容。需要保留时应与 content 一起返回。
 * 其他省略字段保留原值。content、details 和 usage 均不进行深层合并。
 */
export interface AfterToolCallResult {
	content?: (TextContent | ImageContent)[];
	details?: unknown;
	structuredContent?: JsonValue;
	isError?: boolean;
	/**
	 * 工具本次最终执行的用量（若可用），不计入主模型的上下文用量。
	 */
	usage?: Usage;
	/**
	 * 提示在当前工具批次后停止；只有批次内所有已完成结果均设为 true 才提前结束。
	 */
	terminate?: boolean;
}

/**
 * 传给 beforeToolCall 的上下文。
 */
export interface BeforeToolCallContext {
	/**
	 * 请求本次工具调用的助手消息。
	 */
	assistantMessage: AssistantMessage;
	/**
	 * assistantMessage.content 中的原始工具调用块。
	 */
	toolCall: AgentToolCall;
	/**
	 * 已按目标工具 Schema 验证的参数。
	 */
	args: unknown;
	/**
	 * 准备本次工具调用时的智能体上下文。
	 */
	context: AgentContext;
}

/**
 * 传给 afterToolCall 的上下文。
 */
export interface AfterToolCallContext {
	/**
	 * 请求本次工具调用的助手消息。
	 */
	assistantMessage: AssistantMessage;
	/**
	 * assistantMessage.content 中的原始工具调用块。
	 */
	toolCall: AgentToolCall;
	/**
	 * 已按目标工具 Schema 验证的参数。
	 */
	args: unknown;
	/**
	 * 应用 afterToolCall 覆盖前的工具执行结果。
	 */
	result: AgentToolResult<any>;
	/**
	 * 当前是否将该工具执行结果视为错误。
	 */
	isError: boolean;
	/**
	 * 本次工具调用收尾时的智能体上下文。
	 */
	context: AgentContext;
}

/**
 * 传给轮次完成回调的上下文。
 */
export interface AgentTurnContext {
	/**
	 * 完成当前轮次的助手消息。
	 */
	message: AssistantMessage;
	/**
	 * 本轮发出的工具结果消息。
	 */
	toolResults: ToolResultMessage[];
	/**
	 * 助手消息及工具结果追加后的当前上下文。
	 */
	context: AgentContext;
	/**
	 * 循环若在此刻退出将返回的消息。提示运行包含本次初始提示消息，继续运行不包含调用前已存在的上下文消息。
	 */
	newMessages: AgentMessage[];
}

/**
 * FinishTurn 的返回决策；返回 undefined 时保留正常调度。
 */
export type AgentTurnDecision = { action: "continue" } | { action: "end" };

/**
 * 在助手轮次及全部工具结果完成后、turn_end 发出前调用。正常轮次返回 { action: "continue" } 会确保再请求模型一次；工具结果、引导消息或后续消息已有的调度可满足该请求，不额外重复调用，否则以当前上下文继续一轮。错误与取消响应仍直接结束。
 */
export type FinishTurn = (
	turn: AgentTurnContext,
	signal?: AbortSignal,
) => AgentTurnDecision | void | Promise<AgentTurnDecision | undefined> | Promise<void>;

/**
 * 下一次模型请求开始前，用于替换循环运行状态的更新。
 */
export interface AgentLoopTurnUpdate {
	/**
	 * 下一次模型请求的上下文。
	 */
	context?: AgentContext;
	/**
	 * 下一次请求前追加的消息，按正常生命周期发出事件。
	 */
	messages?: AgentMessage[];
	/**
	 * 下一次模型请求使用的模型。
	 */
	model?: Model<any>;
	/**
	 * 下一次模型请求使用的推理级别。
	 */
	thinkingLevel?: ThinkingLevel;
}

/**
 * 对话模型请求即将发出时可用的运行状态。
 */
export interface PrepareRequestContext {
	context: AgentContext;
	model: Model<any>;
	thinkingLevel: ThinkingLevel;
}

/**
 * 用于替换正在准备的模型请求的运行状态。
 */
export type AgentRequestUpdate = Omit<AgentLoopTurnUpdate, "messages">;

/**
 * 每次对话模型请求前立即调用，包括首次请求；此时待处理消息已经追加并发出事件。
 */
export type PrepareRequest = (
	request: PrepareRequestContext,
	signal?: AbortSignal,
) => AgentRequestUpdate | void | Promise<AgentRequestUpdate | undefined> | Promise<void>;

export interface PrepareNextTurnContext extends AgentTurnContext {}

export interface AgentLoopConfig extends SimpleStreamOptions {
	model: Model<any>;

	/**
	 * 每次模型调用前，将 AgentMessage[] 转成模型兼容的 Message[]。
	 * 每条消息必须转为模型理解的 SystemMessage、UserMessage、AssistantMessage 或 ToolResultMessage；无法转换的界面通知或状态消息应过滤。
	 * 接口约定：不能抛异常或返回拒绝的 Promise，应返回安全回退值；抛异常会打断底层循环，使其无法产生正常事件序列。
	 *
	 * @example
	 * ```typescript
	 * convertToLlm: (messages) => messages.flatMap(m => {
	 *   if (m.role === "custom") {
	 *     // Convert custom message to user message
	 *     return [{ role: "user", content: m.content, timestamp: m.timestamp }];
	 *   }
	 *   if (m.role === "notification") {
	 *     // Filter out UI-only messages
	 *     return [];
	 *   }
	 *   // Pass through standard LLM messages
	 *   return [m];
	 * })
	 * ```
	 */
	convertToLlm: (messages: AgentMessage[]) => Message[] | Promise<Message[]>;

	/**
	 * 在 convertToLlm 之前执行的可选上下文转换，适用于 AgentMessage 层的窗口管理（裁剪旧消息）或外部上下文注入。
	 * 接口约定：不能抛异常或返回拒绝的 Promise；失败时返回原消息或其他安全回退值。
	 *
	 * @example
	 * ```typescript
	 * transformContext: async (messages) => {
	 *   if (estimateTokens(messages) > MAX_TOKENS) {
	 *     return pruneOldMessages(messages);
	 *   }
	 *   return messages;
	 * }
	 * ```
	 */
	transformContext?: (messages: AgentMessage[], signal?: AbortSignal) => Promise<AgentMessage[]>;

	/**
	 * 每次模型调用时动态解析 API 密钥，适合可能在长时间工具执行期间过期的短效 OAuth 令牌，例如 GitHub Copilot 令牌。
	 * 接口约定：不能抛异常或返回拒绝的 Promise；无可用密钥时返回 undefined。
	 */
	getApiKey?: (provider: string) => Promise<string | undefined> | string | undefined;

	/**
	 * 助手消息及全部工具结果发出后、turn_end 之前调用。{ action: "end" } 直接结束，不再轮询队列或准备请求。正常轮次返回 { action: "continue" } 确保下一次模型请求；已有工具结果、引导消息或后续消息的调度可满足它，不重复调用，否则仅用当前上下文继续一轮。undefined 保留正常调度；错误及取消仍直接退出。
	 */
	finishTurn?: FinishTurn;

	/**
	 * 每次对话模型请求前立即调用，包括首次请求。此时待处理消息已追加；返回的上下文、模型和推理级别替换本次及后续请求使用的值。本钩子不轮询队列。
	 */
	prepareRequest?: PrepareRequest;

	/**
	 * 循环将继续时，在 turn_end 之后、下一轮开始前调用。可返回替换的上下文、模型、推理级别或待追加消息；undefined 表示沿用当前配置。
	 */
	prepareNextTurn?: (
		context: PrepareNextTurnContext,
	) => AgentLoopTurnUpdate | undefined | Promise<AgentLoopTurnUpdate | undefined>;

	/**
	 * 取得运行中应注入对话的引导消息。
	 * 当前助手轮次的工具全部执行后调用，除非 finishTurn 已结束运行。返回的消息在下一次模型调用前追加；不会跳过当前助手已请求的工具调用。用于在智能体工作中调整任务方向。
	 * 接口约定：不能抛异常或返回拒绝的 Promise；没有消息时返回 []。
	 */
	getSteeringMessages?: () => Promise<AgentMessage[]>;

	/**
	 * 取得智能体原本将结束时需要处理的后续消息。
	 * 没有工具调用且没有引导消息时调用；返回的消息加入上下文后，再继续一轮。适合必须等待当前任务结束后才处理的消息。
	 * 接口约定：不能抛异常或返回拒绝的 Promise；没有消息时返回 []。
	 */
	getFollowUpMessages?: () => Promise<AgentMessage[]>;

	/**
	 * 工具执行模式。
	 * sequential：依次执行。
	 * parallel：先依次预检，再并发执行获准工具；按完成顺序发出 tool_execution_end，随后按助手原始顺序发出工具结果消息。默认 parallel。
	 */
	toolExecution?: ToolExecutionMode;

	/**
	 * 参数校验通过后、工具执行前调用。
	 * 返回 { block: true } 可阻止执行并改为错误结果；阻断结果也可设 terminate: true，参与批次提前结束判断。钩子会收到智能体取消信号，必须自行响应取消。
	 */
	beforeToolCall?: (context: BeforeToolCallContext, signal?: AbortSignal) => Promise<BeforeToolCallResult | undefined>;

	/**
	 * 工具执行完成后、tool_execution_end 及工具结果消息发出前调用。
	 * 可返回 AfterToolCallResult，分别覆盖整个 content 数组、details、isError、usage 和 terminate；省略字段保留原值，不做深层合并。钩子收到取消信号，必须自行响应。
	 */
	afterToolCall?: (context: AfterToolCallContext, signal?: AbortSignal) => Promise<AfterToolCallResult | undefined>;
}

/**
 * 支持推理模型的思考级别。xhigh 和 max 仅部分模型系列支持；应使用 @earendil-works/pi-ai 提供的推理级别元数据检查具体模型能力。
 */
export type ThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";

/**
 * 自定义应用消息的可扩展接口，可通过声明合并增加消息类型。
 *
 * @example
 * ```typescript
 * declare module "@mariozechner/agent" {
 *   interface CustomAgentMessages {
 *     artifact: ArtifactMessage;
 *     notification: NotificationMessage;
 *   }
 * }
 * ```
 */
export interface CustomAgentMessages {
	// Empty by default - apps extend via declaration merging
}

/**
 * AgentMessage 是模型消息与自定义消息的联合类型，让应用增加消息类型，同时保持类型安全和与基础模型消息兼容。
 */
export type AgentMessage = Message | CustomAgentMessages[keyof CustomAgentMessages];

/**
 * 公开的智能体状态。tools 与 messages 使用访问器属性，允许实现方在存储赋值数组前复制顶层数组。
 */
export interface AgentState {
	/**
	 * 由对话系统消息重放得到的当前系统提示词。
	 * 此属性只读；需要修改时，追加带 content 或 sections 的系统消息。在 initialState 中用作首条系统消息的初始提示。
	 */
	readonly systemPrompt: string;
	/**
	 * 后续轮次使用的当前模型。
	 */
	model: Model<any>;
	/**
	 * 后续轮次请求使用的推理级别。
	 */
	thinkingLevel: ThinkingLevel;
	/**
	 * 可执行工具集合；赋新数组时复制顶层数组。
	 * 与对话中已声明工具的差异，会在下次请求前通过系统消息告知模型。
	 */
	set tools(tools: AgentTool<any>[]);
	get tools(): AgentTool<any>[];
	/**
	 * 对话记录；赋新数组时复制顶层数组。
	 * 记录中的系统消息承载提示词和工具声明。
	 */
	set messages(messages: AgentMessage[]);
	get messages(): AgentMessage[];
	/**
	 * 处理提示或继续运行期间为 true；直到需等待的 agent_end 监听器完成才改为空闲。
	 */
	readonly isStreaming: boolean;
	/**
	 * 当前流式响应的部分助手消息；没有时为 undefined。
	 */
	readonly streamingMessage?: AgentMessage;
	/**
	 * 当前正在执行的工具调用标识集合。
	 */
	readonly pendingToolCalls: ReadonlySet<string>;
	/**
	 * 最近一次失败或取消的助手轮次所产生的错误信息。
	 */
	readonly errorMessage?: string;
}

/**
 * 工具产生的最终结果或部分结果。
 */
export interface AgentToolResult<T = JsonValue | undefined> {
	/**
	 * 返回给模型的文本或图片内容。
	 */
	content: (TextContent | ImageContent)[];
	/**
	 * 供日志或界面渲染使用的任意结构化详情。
	 */
	details: T;
	/**
	 * 与工具 outputSchema 匹配的机器可读结果，供程序调用方使用；不发送给模型，模型仍读取 content。
	 */
	structuredContent?: JsonValue;
	/**
	 * 工具最终执行本身的用量（若可用），不计入主模型上下文用量。
	 */
	usage?: Usage;
	/**
	 * 不抛异常地报告失败。模型把 content 作为错误结果处理，与抛异常类似；details 与 structuredContent 仍保留给界面及程序调用方。
	 */
	isError?: boolean;
	/**
	 * 提示当前工具批次后结束；只有批次内每个已完成结果都设为 true 才提前结束。
	 */
	terminate?: boolean;
}

/**
 * 经过钩子处理后，单项工具调用的最终结果。
 */
export interface AgentToolCallOutcome {
	toolCall: AgentToolCall;
	result: AgentToolResult<any>;
	isError: boolean;
	/**
	 * 用单调时钟测得的 execute() 执行毫秒数；工具未执行时省略。
	 */
	durationMs?: number;
}

/**
 * 工具用于流式发送部分执行结果的回调。
 * 回调仅在当前 execute() 调用期间有效，工具 Promise 完成后再调用会被忽略。
 */
export type AgentToolUpdateCallback<T = any> = (partialResult: AgentToolResult<T>) => void;

/**
 * 参数 Schema 为 TParameters 时的工具参数类型：使用 pi-schema 的 Static<TParameters>；构建器采用自身类型，常见 TypeBox 类型采用 TypeBox 推导，其余为 unknown。AgentTool<any> 的参数类型为 any。
 */
export type AgentToolParams<TParameters> = IsAny<TParameters> extends true ? any : Static<TParameters>;

// T 受 object 约束时，0 extends 1 & T 会过早求值；当前写法延迟到参数类型确定后再判断。
type IsAny<T> = boolean extends (T extends never ? true : false) ? true : false;

/**
 * 智能体运行时使用的工具定义。parameters 可以是任意 JSON Schema 对象，execute 接收的参数类型见 {@link AgentToolParams}。
 */
export interface AgentTool<TParameters extends object = object, TDetails = any> extends Tool<TParameters> {
	/**
	 * 供界面显示的人类可读名称。
	 */
	label: string;
	/**
	 * Schema 校验前处理原始参数的可选兼容适配；必须返回符合 TParameters 的对象。
	 */
	prepareArguments?: (args: unknown) => AgentToolParams<TParameters>;
	/**
	 * 成功结果中 structuredContent 的 JSON Schema；声明该字段的工具应始终设置 structuredContent。
	 */
	outputSchema?: object;
	/**
	 * 执行工具调用。失败时抛异常或返回 isError: true；不能只在 content 文本中描述失败。
	 */
	execute: (
		toolCallId: string,
		params: AgentToolParams<TParameters>,
		signal?: AbortSignal,
		onUpdate?: AgentToolUpdateCallback<TDetails>,
	) => Promise<AgentToolResult<TDetails>>;
	/**
	 * 持久化执行意图已保存、但结果未知的副作用恢复策略。
	 */
	replay?: "never" | "safe";
	/**
	 * 单个工具的执行模式覆盖。
	 * sequential：与其他工具逐个执行。
	 * parallel：允许与其他工具并发。省略时使用全局默认执行模式。
	 */
	executionMode?: ToolExecutionMode;
}

/**
 * 传给底层智能体循环的上下文快照。
 */
export interface AgentContext {
	/**
	 * 对模型可见的对话记录。
	 */
	messages: AgentMessage[];
	/**
	 * 本次运行允许执行的工具集合。
	 */
	tools?: AgentTool<any>[];
}

/**
 * Agent 为界面更新发出的事件。
 * agent_end 是最后一个循环事件，但 Agent.subscribe() 中该事件的异步监听器仍属于本次运行的完成条件；它们全部结束后，智能体才空闲。
 */
export type AgentEvent =
	// 智能体生命周期。
	| { type: "agent_start" }
	| { type: "agent_end"; messages: AgentMessage[] }
	// 轮次生命周期：一轮包含一条助手响应及其全部工具调用和结果。
	| { type: "turn_start" }
	| { type: "turn_end"; message: AgentMessage; toolResults: ToolResultMessage[] }
	// 消息生命周期：适用于 system、user、assistant 和 toolResult 消息。
	| { type: "message_start"; message: AgentMessage }
	// 仅在助手消息流式生成期间发出。
	| { type: "message_update"; message: AgentMessage; assistantMessageEvent: AssistantMessageEvent }
	| { type: "message_end"; message: AgentMessage }
	// 工具执行生命周期。
	| { type: "tool_execution_start"; toolCallId: string; toolName: string; args: any }
	| { type: "tool_execution_update"; toolCallId: string; toolName: string; args: any; partialResult: any }
	| {
			type: "tool_execution_end";
			toolCallId: string;
			toolName: string;
			result: any;
			isError: boolean;
			/**
			 * 用单调时钟测得的 execute() 执行毫秒数；工具未执行时省略。
			 */
			durationMs?: number;
	  };
