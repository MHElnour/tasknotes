import {
	collectTaskIds,
	generateTaskId,
	isValidTaskId,
	resolveTaskId,
} from "../../../src/services/task-service/taskIds";

describe("taskIds", () => {
	it("validates TaskNotes generated IDs", () => {
		expect(isValidTaskId("TSK-8cA562sd")).toBe(true);
		expect(isValidTaskId("TSK-12345678")).toBe(true);
		expect(isValidTaskId("tsk-8cA562sd")).toBe(false);
		expect(isValidTaskId("TSK-1234567")).toBe(false);
		expect(isValidTaskId("TSK-123456789")).toBe(false);
		expect(isValidTaskId("Tasks/My Task.md")).toBe(false);
		expect(isValidTaskId(undefined)).toBe(false);
	});

	it("generates IDs in TSK-xxxxxxxx format", () => {
		const id = generateTaskId(() => new Uint8Array([0, 1, 2, 61, 62, 63, 124, 125]));

		expect(id).toBe("TSK-012z0101");
	});

	it("preserves valid caller IDs", () => {
		expect(resolveTaskId("TSK-AbC123xY", new Set(["TSK-ZZZZZZZZ"]))).toBe(
			"TSK-AbC123xY"
		);
	});

	it("replaces invalid caller IDs", () => {
		const id = resolveTaskId("Tasks/Old Path.md", new Set(), () => "TSK-New12345");

		expect(id).toBe("TSK-New12345");
	});

	it("retries generated IDs that collide with known tasks", () => {
		const generated = ["TSK-Collide1", "TSK-Collide1", "TSK-Unique12"];
		const id = resolveTaskId(undefined, new Set(["TSK-Collide1"]), () => generated.shift()!);

		expect(id).toBe("TSK-Unique12");
	});

	it("collects only valid task IDs", () => {
		expect(
			collectTaskIds([
				{ id: "TSK-AbC123xY" },
				{ id: "Tasks/Path.md" },
				{ id: "TSK-12345678" },
				{},
			])
		).toEqual(new Set(["TSK-AbC123xY", "TSK-12345678"]));
	});
});
