import type { TaskInfo } from "../../types";

export const TASK_ID_PATTERN = /^TSK-[A-Za-z0-9]{8}$/;

const TASK_ID_PREFIX = "TSK-";
const TASK_ID_LENGTH = 8;
const TASK_ID_CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const MAX_TASK_ID_ATTEMPTS = 100;

export type RandomBytesProvider = (length: number) => Uint8Array;

export function isValidTaskId(value: unknown): value is string {
	return typeof value === "string" && TASK_ID_PATTERN.test(value);
}

export function generateTaskId(randomBytesProvider: RandomBytesProvider = getRandomBytes): string {
	const bytes = randomBytesProvider(TASK_ID_LENGTH);
	let suffix = "";

	for (let index = 0; index < TASK_ID_LENGTH; index++) {
		suffix += TASK_ID_CHARS[bytes[index] % TASK_ID_CHARS.length];
	}

	return `${TASK_ID_PREFIX}${suffix}`;
}

export function resolveTaskId(
	candidate: unknown,
	existingIds: ReadonlySet<string>,
	generator: () => string = generateTaskId
): string {
	if (isValidTaskId(candidate)) {
		return candidate;
	}

	for (let attempt = 0; attempt < MAX_TASK_ID_ATTEMPTS; attempt++) {
		const generatedId = generator();
		if (!existingIds.has(generatedId)) {
			return generatedId;
		}
	}

	throw new Error("Unable to generate a unique task ID");
}

export function collectTaskIds(tasks: Iterable<Pick<TaskInfo, "id">>): Set<string> {
	const ids = new Set<string>();
	for (const task of tasks) {
		if (isValidTaskId(task.id)) {
			ids.add(task.id);
		}
	}
	return ids;
}

function getRandomBytes(length: number): Uint8Array {
	const bytes = new Uint8Array(length);
	const cryptoApi = window.crypto;

	if (cryptoApi?.getRandomValues) {
		cryptoApi.getRandomValues(bytes);
		return bytes;
	}

	for (let index = 0; index < length; index++) {
		bytes[index] = Math.floor(Math.random() * 256);
	}
	return bytes;
}
