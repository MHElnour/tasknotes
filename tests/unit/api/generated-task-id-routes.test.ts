import { TasksController } from "../../../src/api/TasksController";
import type { HTTPRequestLike, HTTPResponseLike } from "../../../src/api/httpTypes";
import { PluginFactory, TaskFactory } from "../../helpers/mock-factories";

function createRequest(): HTTPRequestLike {
	return {
		headers: {},
		on: jest.fn(),
	};
}

function createResponse(): HTTPResponseLike & { body?: string } {
	return {
		statusCode: 0,
		setHeader: jest.fn(),
		writeHead: jest.fn(),
		end: jest.fn(function (this: { body?: string }, data?: string) {
			this.body = data;
		}),
	};
}

function createController(cacheManager: {
	getTaskInfo: jest.Mock;
	getAllTasks: jest.Mock;
}) {
	const plugin = PluginFactory.createMockPlugin();
	plugin.app.vault.getAbstractFileByPath = jest.fn().mockReturnValue(null);

	return new TasksController(
		plugin,
		{} as never,
		{} as never,
		cacheManager as never,
		{} as never
	);
}

describe("HTTP task routes with generated task IDs", () => {
	it("returns a task from GET /api/tasks/:id when the route id matches frontmatter id", async () => {
		const generatedId = "TSK-JIbFXAWp";
		const task = TaskFactory.createTask({
			id: generatedId,
			path: "TaskNotes/Tasks/build-docs.md",
			title: "Build the documentation folder",
		});
		const cacheManager = {
			getTaskInfo: jest.fn(async () => null),
			getAllTasks: jest.fn(async () => [task]),
		};
		const controller = createController(cacheManager);
		const res = createResponse();

		await controller.getTask(createRequest(), res, { id: generatedId });

		expect(cacheManager.getTaskInfo).toHaveBeenCalledWith(generatedId);
		expect(cacheManager.getAllTasks).toHaveBeenCalled();
		expect(res.statusCode).toBe(200);

		const responseBody = JSON.parse(res.body ?? "{}");
		expect(responseBody.success).toBe(true);
		expect(responseBody.data).toMatchObject({
			id: generatedId,
			path: task.path,
			title: task.title,
		});
	});
});
