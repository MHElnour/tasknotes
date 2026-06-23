import type { TFile } from "obsidian";
import type { TaskInfo } from "../types";
import { isValidTaskId } from "../services/task-service/taskIds";

interface PathLike {
	path: string;
}

type Nullable<T> = T | null;

export interface TaskCreationSubtaskAssignmentContext {
	currentTaskFile: Nullable<TFile>;
	parentTask?: TaskInfo;
	subtaskFiles: readonly PathLike[];
	getTaskInfo: (path: string) => Promise<TaskInfo | null | undefined>;
	buildProjectReference: (currentTaskFile: TFile, subtaskPath: string) => string;
	updateTaskProjects: (task: TaskInfo, projects: string[]) => Promise<unknown>;
	updateTask?: (task: TaskInfo, updates: Partial<TaskInfo>) => Promise<unknown>;
	resolveTaskId?: (task: TaskInfo) => Promise<string>;
	onError?: (error: unknown, subtaskFile: PathLike) => void;
}

export interface TaskCreationSubtaskAssignmentResult {
	updated: number;
	missing: number;
	skipped: number;
	failed: number;
}

export async function applyTaskCreationSubtaskAssignments(
	context: TaskCreationSubtaskAssignmentContext
): Promise<TaskCreationSubtaskAssignmentResult> {
	const result: TaskCreationSubtaskAssignmentResult = {
		updated: 0,
		missing: 0,
		skipped: 0,
		failed: 0,
	};

	if (!context.currentTaskFile) {
		return result;
	}

	for (const subtaskFile of context.subtaskFiles) {
		try {
			const subtaskInfo = await context.getTaskInfo(subtaskFile.path);
			if (!subtaskInfo) {
				result.missing += 1;
				continue;
			}

			const projectReference = context.buildProjectReference(
				context.currentTaskFile,
				subtaskFile.path
			);
			const nextProjects = getSubtaskProjectAssignmentUpdate(
				subtaskInfo.projects,
				projectReference,
				getLegacyProjectReference(context.currentTaskFile)
			);
			const parentId = isValidTaskId(context.parentTask?.id)
				? context.parentTask.id
				: undefined;
			const updates: Partial<TaskInfo> = {};

			if (nextProjects) {
				updates.projects = nextProjects;
			}
			if (parentId && context.resolveTaskId) {
				updates.id = await context.resolveTaskId(subtaskInfo);
				updates.parent_id = parentId;
			}

			if (Object.keys(updates).length === 0) {
				result.skipped += 1;
				continue;
			}

			if (context.updateTask) {
				await context.updateTask(subtaskInfo, updates);
			} else if (updates.projects) {
				await context.updateTaskProjects(subtaskInfo, updates.projects);
			}
			result.updated += 1;
		} catch (error) {
			result.failed += 1;
			context.onError?.(error, subtaskFile);
		}
	}

	return result;
}

export function getSubtaskProjectAssignmentUpdate(
	currentProjects: unknown,
	projectReference: string,
	legacyReference: string
): string[] | null {
	const projectList = Array.isArray(currentProjects) ? currentProjects : [];
	const stringProjects = projectList.filter(
		(project): project is string => typeof project === "string"
	);

	if (
		stringProjects.includes(projectReference) ||
		stringProjects.includes(legacyReference)
	) {
		return null;
	}

	return [...stringProjects, projectReference];
}

function getLegacyProjectReference(currentTaskFile: TFile): string {
	return `[[${currentTaskFile.basename}]]`;
}
