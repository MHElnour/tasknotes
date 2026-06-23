import type { TaskInfo } from "../types";
import type { TaskManager } from "../utils/TaskManager";

type TaskIdentifierCache = Pick<TaskManager, "getTaskInfo" | "getAllTasks">;

export async function resolveTaskIdentifier(
	cacheManager: TaskIdentifierCache,
	taskId: string
): Promise<TaskInfo | null> {
	const taskByPath = await cacheManager.getTaskInfo(taskId);
	if (taskByPath) {
		return taskByPath;
	}

	const allTasks = await cacheManager.getAllTasks();
	return allTasks.find((task) => task.id === taskId) ?? null;
}
