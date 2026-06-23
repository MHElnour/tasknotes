import { TFile } from "obsidian";
import { createTaskNotesCommandDefinitions } from "../../../src/commands/taskNotesCommands";
import {
	addTaskToProject,
	assignTaskAsSubtask,
} from "../../../src/services/taskRelationshipActions";
import { EVENT_USER_NOTICE } from "../../../src/core/userNotices";
import type { TaskInfo } from "../../../src/types";

function makePlugin() {
	return {
		app: {
			metadataCache: {
				fileToLinktext: (file: TFile) => file.path.replace(/\.md$/i, ""),
			},
		},
		settings: {
			useFrontmatterMarkdownLinks: false,
		},
		i18n: {
			translate: (key: string, params?: Record<string, string | number>) =>
				params ? `${key}:${Object.values(params).join(",")}` : key,
		},
		emitter: {
			trigger: jest.fn(),
		},
		cacheManager: {
			getTaskInfo: jest.fn().mockResolvedValue(null),
			getAllTasks: jest.fn().mockResolvedValue([]),
		},
		taskService: {
			updateTask: jest.fn(async (task: TaskInfo, updates: Partial<TaskInfo>) => ({
				...task,
				...updates,
			})),
		},
		updateTaskProperty: jest.fn(
			async (task: TaskInfo, property: keyof TaskInfo, value: unknown) => ({
				...task,
				[property]: value,
			})
		),
	};
}

describe("Issue #1835: current note relationship commands", () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	it("registers hotkeyable commands for current-note project and subtask actions", async () => {
		const definitions = createTaskNotesCommandDefinitions({} as any);
		const addProject = definitions.find(
			(definition) => definition.id === "add-project-to-current-task"
		);
		const addSubtask = definitions.find(
			(definition) => definition.id === "add-subtask-to-current-note"
		);
		const ctx = {
			addProjectToCurrentTask: jest.fn(),
			addSubtaskToCurrentNote: jest.fn(),
		};

		expect(addProject?.nameKey).toBe("commands.addProjectToCurrentTask");
		expect(addSubtask?.nameKey).toBe("commands.addSubtaskToCurrentNote");

		await addProject?.callback?.(ctx as any);
		await addSubtask?.callback?.(ctx as any);

		expect(ctx.addProjectToCurrentTask).toHaveBeenCalledTimes(1);
		expect(ctx.addSubtaskToCurrentNote).toHaveBeenCalledTimes(1);
	});

	it("adds a selected project to a task using the same relationship update path", async () => {
		const plugin = makePlugin();
		const task = {
			title: "Task",
			path: "Tasks/task.md",
			projects: [],
		} as TaskInfo;
		const projectFile = new TFile("Projects/Alpha.md");

		const updatedTask = await addTaskToProject(plugin as any, task, projectFile);

		expect(plugin.updateTaskProperty).toHaveBeenCalledWith(task, "projects", [
			"[[Projects/Alpha]]",
		]);
		expect(updatedTask?.projects).toEqual(["[[Projects/Alpha]]"]);
		expect(plugin.emitter.trigger).toHaveBeenCalledWith(
			EVENT_USER_NOTICE,
			expect.objectContaining({
				message: "contextMenus.task.organization.notices.addedToProject:Alpha",
			})
		);
	});

	it("adds the current note as the selected task's project when assigning a subtask", async () => {
		const plugin = makePlugin();
		const parentFile = new TFile("Projects/Alpha.md");
		const subtask = {
			title: "Subtask",
			path: "Tasks/subtask.md",
			projects: [],
		} as TaskInfo;

		const updatedTask = await assignTaskAsSubtask(plugin as any, parentFile, subtask);

		expect(plugin.taskService.updateTask).toHaveBeenCalledWith(subtask, {
			projects: ["[[Projects/Alpha]]"],
		});
		expect(updatedTask?.projects).toEqual(["[[Projects/Alpha]]"]);
		expect(plugin.emitter.trigger).toHaveBeenCalledWith(
			EVENT_USER_NOTICE,
			expect.objectContaining({
				message: "contextMenus.task.organization.notices.addedAsSubtask:Subtask,Alpha",
			})
		);
	});

	it("does not rewrite an existing subtask link when the parent note is not a task", async () => {
		const plugin = makePlugin();
		const parentFile = new TFile("Projects/Alpha.md");
		const subtask = {
			title: "Subtask",
			path: "Tasks/subtask.md",
			projects: ["[[Projects/Alpha]]"],
		} as TaskInfo;

		const updatedTask = await assignTaskAsSubtask(plugin as any, parentFile, subtask);

		expect(updatedTask).toBeNull();
		expect(plugin.taskService.updateTask).not.toHaveBeenCalled();
		expect(plugin.emitter.trigger).toHaveBeenCalledWith(
			EVENT_USER_NOTICE,
			expect.objectContaining({
				message: "contextMenus.task.organization.notices.alreadySubtask",
			})
		);
	});

	it("writes parent_id when assigning an existing task as a subtask of a task note", async () => {
		const plugin = makePlugin();
		const parentFile = new TFile("Projects/Alpha.md");
		const parentTask = {
			id: "TSK-Parent12",
			title: "Alpha",
			path: parentFile.path,
			status: "open",
			priority: "normal",
			archived: false,
		} as TaskInfo;
		const subtask = {
			title: "Subtask",
			path: "Tasks/subtask.md",
			projects: [],
		} as TaskInfo;
		plugin.cacheManager.getTaskInfo.mockResolvedValue(parentTask);
		plugin.cacheManager.getAllTasks.mockResolvedValue([parentTask]);

		const updatedTask = await assignTaskAsSubtask(plugin as any, parentFile, subtask);

		expect(plugin.taskService.updateTask).toHaveBeenCalledWith(
			subtask,
			expect.objectContaining({
				id: expect.stringMatching(/^TSK-[A-Za-z0-9]{8}$/),
				parent_id: "TSK-Parent12",
				projects: ["[[Projects/Alpha]]"],
			})
		);
		expect(updatedTask?.parent_id).toBe("TSK-Parent12");
	});

	it("does not rewrite a task that is already linked to the selected project", async () => {
		const plugin = makePlugin();
		const task = {
			title: "Task",
			path: "Tasks/task.md",
			projects: ["[[Alpha]]"],
		} as TaskInfo;
		const projectFile = new TFile("Projects/Alpha.md");

		const updatedTask = await addTaskToProject(plugin as any, task, projectFile);

		expect(updatedTask).toBeNull();
		expect(plugin.updateTaskProperty).not.toHaveBeenCalled();
		expect(plugin.emitter.trigger).toHaveBeenCalledWith(
			EVENT_USER_NOTICE,
			expect.objectContaining({
				message: "contextMenus.task.organization.notices.alreadyInProject",
			})
		);
	});
});
