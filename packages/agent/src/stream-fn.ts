import type { StreamFn } from "./types.ts";

let defaultStreamFn: StreamFn | undefined;

/**
 * 配置调用方省略 streamFn 时，Agent 与底层循环采用的回退流函数。
 * 自带默认模型运行时的宿主可在这里注册流函数，无需让 pi-agent-core 依赖提供方目录或兼容层。
 */
export function setDefaultStreamFn(streamFn: StreamFn | undefined): void {
	defaultStreamFn = streamFn;
}

export function getDefaultStreamFn(): StreamFn {
	if (!defaultStreamFn) {
		throw new Error("No default stream function configured. Pass streamFn explicitly or call setDefaultStreamFn().");
	}
	return defaultStreamFn;
}
