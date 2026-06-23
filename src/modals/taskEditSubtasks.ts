import type { TaskInfo } from "../types";
import { isValidTaskId } from "../services/task-service/taskIds";
import { getSubtaskProjectAssignmentUpdate } from "./taskCreationSubtasks";

export interface TaskEditSubtaskPathLike {
	path: string;
}

export interface TaskEditSubtaskParentLike {
	basename: string;
}

export interface TaskEditSubtaskChangePlan<T extends TaskEditSubtaskPathLike> {
	toAdd: T[];
	toRemove: T[];
}

export interface ApplyTaskEditSubtaskChangesContext<
	TSubtask extends TaskEditSubtaskPathLike,
	TParent extends TaskEditSubtaskParentLike,
> {
	parentTaskFile: TParent;
	parentTask?: TaskInfo;
	selectedSubtaskFiles: readonly TSubtask[];
	initialSubtaskFiles: readonly TSubtask[];
	getTaskInfo: (path: string) => Promise<TaskInfo | null | undefined>;
	buildProjectReference: (parentTaskFile: TParent, subtaskPath: string) => string;
	updateTaskProjects: (task: TaskInfo, projects: string[]) => Promise<unknown>;
	updateTask?: (task: TaskInfo, updates: Partial<TaskInfo>) => Promise<unknown>;
	resolveTaskId?: (task: TaskInfo) => Promise<string>;
	onAddError?: (error: unknown, file: TSubtask) => void;
	onRemoveError?: (error: unknown, file: TSubtask) => void;
}

export interface TaskEditSubtaskChangeResult<T extends TaskEditSubtaskPathLike> {
	nextInitialSubtaskFiles: T[];
	added: number;
	removed: number;
	skippedMissing: number;
	skippedExisting: number;
	errors: number;
}

export function hasTaskEditSubtaskChanges(
	initialSubtaskFiles: readonly TaskEditSubtaskPathLike[],
	selectedSubtaskFiles: readonly TaskEditSubtaskPathLike[]
): boolean {
	const current = selectedSubtaskFiles.map((file) => file.path).sort();
	const initial = initialSubtaskFiles.map((file) => file.path).sort();

	return (
		current.length !== initial.length ||
		current.some((path, index) => path !== initial[index])
	);
}

export function buildTaskEditSubtaskChangePlan<T extends TaskEditSubtaskPathLike>(
	initialSubtaskFiles: readonly T[],
	selectedSubtaskFiles: readonly T[]
): TaskEditSubtaskChangePlan<T> {
	const currentPaths = new Set(selectedSubtaskFiles.map((file) => file.path));
	const initialPaths = new Set(initialSubtaskFiles.map((file) => file.path));

	return {
		toRemove: initialSubtaskFiles.filter((file) => !currentPaths.has(file.path)),
		toAdd: selectedSubtaskFiles.filter((file) => !initialPaths.has(file.path)),
	};
}

export async function applyTaskEditSubtaskChanges<
	TSubtask extends TaskEditSubtaskPathLike,
	TParent extends TaskEditSubtaskParentLike,
>(
	context: ApplyTaskEditSubtaskChangesContext<TSubtask, TParent>
): Promise<TaskEditSubtaskChangeResult<TSubtask>> {
	const plan = buildTaskEditSubtaskChangePlan(
		context.initialSubtaskFiles,
		context.selectedSubtaskFiles
	);
	const result: TaskEditSubtaskChangeResult<TSubtask> = {
		nextInitialSubtaskFiles: [...context.selectedSubtaskFiles],
		added: 0,
		removed: 0,
		skippedMissing: 0,
		skippedExisting: 0,
		errors: 0,
	};

	for (const file of plan.toRemove) {
		try {
			const removed = await removeTaskEditSubtaskRelation(context, file);
			if (removed) {
				result.removed += 1;
			} else {
				result.skippedMissing += 1;
			}
		} catch (error) {
			result.errors += 1;
			context.onRemoveError?.(error, file);
		}
	}

	for (const file of plan.toAdd) {
		try {
			const added = await addTaskEditSubtaskRelation(context, file);
			if (added) {
				result.added += 1;
			} else {
				result.skippedExisting += 1;
			}
		} catch (error) {
			result.errors += 1;
			context.onAddError?.(error, file);
		}
	}

	return result;
}

export function getTaskEditSubtaskProjectRemovalUpdate(
	currentProjects: unknown,
	projectReference: string,
	legacyReference: string
): string[] {
	const projects = Array.isArray(currentProjects) ? currentProjects : [];
	return projects.filter(
		(project): project is string =>
			typeof project === "string" &&
			project !== projectReference &&
			project !== legacyReference
	);
}

async function addTaskEditSubtaskRelation<
	TSubtask extends TaskEditSubtaskPathLike,
	TParent extends TaskEditSubtaskParentLike,
>(
	context: ApplyTaskEditSubtaskChangesContext<TSubtask, TParent>,
	subtaskFile: TSubtask
): Promise<boolean> {
	const subtaskInfo = await context.getTaskInfo(subtaskFile.path);
	if (!subtaskInfo) {
		return false;
	}

	const projectReference = context.buildProjectReference(
		context.parentTaskFile,
		subtaskFile.path
	);
	const legacyReference = `[[${context.parentTaskFile.basename}]]`;
	const updatedProjects = getSubtaskProjectAssignmentUpdate(
		subtaskInfo.projects,
		projectReference,
		legacyReference
	);
	const parentId = isValidTaskId(context.parentTask?.id) ? context.parentTask.id : undefined;
	const updates: Partial<TaskInfo> = {};

	if (updatedProjects) {
		updates.projects = updatedProjects;
	}
	if (parentId && context.resolveTaskId) {
		updates.id = await context.resolveTaskId(subtaskInfo);
		updates.parent_id = parentId;
	}

	if (Object.keys(updates).length === 0) {
		return false;
	}

	if (context.updateTask) {
		await context.updateTask(subtaskInfo, updates);
	} else if (updates.projects) {
		await context.updateTaskProjects(subtaskInfo, updates.projects);
	} else {
		return false;
	}
	return true;
}

async function removeTaskEditSubtaskRelation<
	TSubtask extends TaskEditSubtaskPathLike,
	TParent extends TaskEditSubtaskParentLike,
>(
	context: ApplyTaskEditSubtaskChangesContext<TSubtask, TParent>,
	subtaskFile: TSubtask
): Promise<boolean> {
	const subtaskInfo = await context.getTaskInfo(subtaskFile.path);
	if (!subtaskInfo) {
		return false;
	}

	const projectReference = context.buildProjectReference(
		context.parentTaskFile,
		subtaskFile.path
	);
	const legacyReference = `[[${context.parentTaskFile.basename}]]`;
	const updatedProjects = getTaskEditSubtaskProjectRemovalUpdate(
		subtaskInfo.projects,
		projectReference,
		legacyReference
	);
	const parentId = isValidTaskId(context.parentTask?.id) ? context.parentTask.id : undefined;
	const updates: Partial<TaskInfo> = {
		projects: updatedProjects,
	};
	if (parentId && subtaskInfo.parent_id === parentId) {
		updates.parent_id = undefined;
	}

	if (context.updateTask) {
		await context.updateTask(subtaskInfo, updates);
	} else {
		await context.updateTaskProjects(subtaskInfo, updatedProjects);
	}
	return true;
}
