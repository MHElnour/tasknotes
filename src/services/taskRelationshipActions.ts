import { TFile } from "obsidian";
import type TaskNotesPlugin from "../main";
import type { TaskInfo } from "../types";
import { generateLink, parseLinkToPath } from "../utils/linkUtils";
import { filterTaskIdentificationTags } from "../utils/taskTagFiltering";
import { publishUserNotice } from "../core/userNotices";
import { collectTaskIds, isValidTaskId, resolveTaskId } from "./task-service/taskIds";

function translate(
	plugin: TaskNotesPlugin,
	key: string,
	params?: Record<string, string | number>
): string {
	return plugin.i18n.translate(key, params);
}

function uniqueNonEmptyStrings(values: string[]): string[] {
	const seen = new Set<string>();
	const uniqueValues: string[] = [];

	for (const value of values) {
		const trimmedValue = value.trim();
		if (!trimmedValue || seen.has(trimmedValue)) {
			continue;
		}

		seen.add(trimmedValue);
		uniqueValues.push(trimmedValue);
	}

	return uniqueValues;
}

function buildStableFileLink(
	plugin: TaskNotesPlugin,
	file: TFile,
	sourcePath: string
): string {
	return generateLink(
		plugin.app,
		file,
		sourcePath,
		"",
		"",
		plugin.settings.useFrontmatterMarkdownLinks
	);
}

function resolveProjectReference(
	plugin: TaskNotesPlugin,
	projectReference: string,
	sourcePath: string
): string {
	const trimmedReference = projectReference.trim();
	if (!trimmedReference) {
		return "";
	}

	const linkPath = parseLinkToPath(trimmedReference);
	const resolvedFile = plugin.app.metadataCache.getFirstLinkpathDest?.(linkPath, sourcePath);
	if (resolvedFile instanceof TFile) {
		return buildStableFileLink(plugin, resolvedFile, sourcePath);
	}

	return trimmedReference;
}

async function collectKnownTaskIds(plugin: TaskNotesPlugin): Promise<Set<string>> {
	const tasks = await plugin.cacheManager.getAllTasks?.();
	return collectTaskIds(tasks ?? []);
}

export async function ensureTaskHasGeneratedId(
	plugin: TaskNotesPlugin,
	task: TaskInfo
): Promise<TaskInfo> {
	if (isValidTaskId(task.id)) {
		return task;
	}

	const id = resolveTaskId(task.id, await collectKnownTaskIds(plugin));
	return plugin.taskService.updateTask(task, { id });
}

export async function resolveGeneratedTaskIdForUpdate(
	plugin: TaskNotesPlugin,
	task: TaskInfo
): Promise<string> {
	if (isValidTaskId(task.id)) {
		return task.id;
	}

	return resolveTaskId(task.id, await collectKnownTaskIds(plugin));
}

export async function addTaskToProject(
	plugin: TaskNotesPlugin,
	task: TaskInfo,
	projectFile: TFile
): Promise<TaskInfo | null> {
	const projectReference = generateLink(
		plugin.app,
		projectFile,
		task.path,
		"",
		"",
		plugin.settings.useFrontmatterMarkdownLinks
	);
	const legacyReference = `[[${projectFile.basename}]]`;
	const currentProjects = Array.isArray(task.projects) ? task.projects : [];

	if (currentProjects.includes(projectReference) || currentProjects.includes(legacyReference)) {
		publishUserNotice(
			plugin.emitter,
			translate(plugin, "contextMenus.task.organization.notices.alreadyInProject")
		);
		return null;
	}

	const sanitizedProjects = currentProjects.filter((entry) => entry !== legacyReference);
	const updatedProjects = [...sanitizedProjects, projectReference];
	const updatedTask = await plugin.updateTaskProperty(task, "projects", updatedProjects);

	publishUserNotice(
		plugin.emitter,
		translate(plugin, "contextMenus.task.organization.notices.addedToProject", {
			project: projectFile.basename,
		})
	);
	return updatedTask;
}

export async function assignTaskAsSubtask(
	plugin: TaskNotesPlugin,
	parentFile: TFile,
	subtask: TaskInfo
): Promise<TaskInfo | null> {
	const projectReference = generateLink(
		plugin.app,
		parentFile,
		subtask.path,
		"",
		"",
		plugin.settings.useFrontmatterMarkdownLinks
	);
	const legacyReference = `[[${parentFile.basename}]]`;
	const subtaskProjects = Array.isArray(subtask.projects) ? subtask.projects : [];
	const alreadyLinked =
		subtaskProjects.includes(projectReference) || subtaskProjects.includes(legacyReference);
	const parentTask = await plugin.cacheManager.getTaskInfo(parentFile.path);
	const parentWithId = parentTask ? await ensureTaskHasGeneratedId(plugin, parentTask) : null;
	const parentId = isValidTaskId(parentWithId?.id) ? parentWithId.id : undefined;
	const needsParentId = Boolean(parentId && subtask.parent_id !== parentId);
	const needsChildId = Boolean(parentId && !isValidTaskId(subtask.id));

	if (alreadyLinked && !needsParentId && !needsChildId) {
		publishUserNotice(
			plugin.emitter,
			translate(plugin, "contextMenus.task.organization.notices.alreadySubtask")
		);
		return null;
	}

	const sanitizedProjects = subtaskProjects.filter((entry) => entry !== legacyReference);
	const updatedProjects = alreadyLinked
		? sanitizedProjects.length > 0
			? sanitizedProjects
			: subtaskProjects
		: [...sanitizedProjects, projectReference];
	const updates: Partial<TaskInfo> = {};
	if (!alreadyLinked || sanitizedProjects.length !== subtaskProjects.length) {
		updates.projects = updatedProjects;
	}
	if (parentId) {
		updates.id = await resolveGeneratedTaskIdForUpdate(plugin, subtask);
		updates.parent_id = parentId;
	}

	const updatedSubtask = await plugin.taskService.updateTask(subtask, updates);

	publishUserNotice(
		plugin.emitter,
		translate(plugin, "contextMenus.task.organization.notices.addedAsSubtask", {
			subtask: subtask.title,
			parent: parentFile.basename,
		})
	);
	return updatedSubtask;
}

export function buildSubtaskCreationPrePopulatedValues(
	plugin: TaskNotesPlugin,
	parentTask: TaskInfo,
	parentFile: TFile
): Partial<TaskInfo> {
	const shouldInheritParentProperties = Boolean(
		plugin.settings.taskCreationDefaults?.inheritParentTaskProperties
	);
	const projectReference = buildStableFileLink(plugin, parentFile, parentTask.path);
	const parentTags = Array.isArray(parentTask.tags) ? parentTask.tags : [];
	const parentProjects = shouldInheritParentProperties
		? Array.isArray(parentTask.projects)
			? parentTask.projects.map((project) =>
					resolveProjectReference(plugin, project, parentTask.path)
				)
			: []
		: [];
	const inheritedTags =
		shouldInheritParentProperties
			? plugin.settings.taskIdentificationMethod === "tag"
				? filterTaskIdentificationTags(
						parentTags,
						plugin.settings.taskTag,
						plugin.settings.hideIdentifyingTagsMode
					)
				: [...parentTags]
			: [];
	const values: Partial<TaskInfo> = {
		projects: uniqueNonEmptyStrings([...parentProjects, projectReference]),
	};

	if (isValidTaskId(parentTask.id)) {
		values.parent_id = parentTask.id;
	}
	if (inheritedTags.length > 0) {
		values.tags = inheritedTags;
	}
	if (
		shouldInheritParentProperties &&
		Array.isArray(parentTask.contexts) &&
		parentTask.contexts.length > 0
	) {
		values.contexts = [...parentTask.contexts];
	}
	if (shouldInheritParentProperties && parentTask.priority) {
		values.priority = parentTask.priority;
	}

	return values;
}
