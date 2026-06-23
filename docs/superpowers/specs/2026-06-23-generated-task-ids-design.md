# Generated Task IDs and Parent Links Design

## Context

TaskNotes currently models subtasks through the existing project relationship: a child task includes the parent task as a wikilink in its `projects` frontmatter. This keeps subtasks compatible with Obsidian links, backlinks, and existing TaskNotes project/subtask views. The requested change is to add a generated identifier layer so tasks and subtasks can also be linked through stable IDs.

## Goals

- Give every newly created task a generated, persisted ID.
- Use `id` as the task ID frontmatter property.
- Use `parent_id` as the child-to-parent ID frontmatter property.
- Generate IDs in the format `TSK-xxxxxxxx`, where `xxxxxxxx` is 8 random alphanumeric characters such as `TSK-8cA562sd`.
- Preserve the current `projects` wikilink relationship for compatibility with existing TaskNotes views and Obsidian link behavior.
- Avoid a vault-wide migration. Existing tasks get an ID lazily when TaskNotes needs one to create or assign a subtask relationship.

## Non-Goals

- This does not replace `projects` as the current subtask discovery mechanism.
- This does not migrate all existing task files on plugin startup.
- This does not introduce configurable ID prefixes or ID lengths.
- This does not change recurring-task `recurrence_parent` behavior.

## Data Model

New and lazily updated task notes use fixed frontmatter keys:

```yaml
id: TSK-8cA562sd
parent_id: TSK-A19zQ2mB
projects:
  - "[[Parent Task]]"
```

`id` is present on every new task created after this feature lands. `parent_id` is present only on tasks that have a task parent. A task can still have multiple `projects`, but `parent_id` represents one direct task parent for the subtask relationship created by TaskNotes.

The TypeScript task model should expose:

```ts
id?: string;
parent_id?: string;
```

The frontmatter keys are intentionally not user-configurable field-mapping entries. They are stable relationship metadata, similar to internal recurrence and dependency metadata.

## ID Generation

TaskNotes generates task IDs with the fixed pattern `TSK-` plus 8 random alphanumeric characters. The generator should use browser/runtime cryptographic randomness when available, with a narrow fallback for test environments.

Before writing a generated ID, TaskNotes checks known cached tasks to avoid collisions. If a collision is found, it retries with a new generated value. Collisions should be rare, but retrying makes the behavior deterministic and testable.

## Creation Flow

`TaskCreationService.createTask` is the central creation path and should assign an ID before frontmatter is stringified. If `taskData.id` is already present and matches `TSK-[A-Za-z0-9]{8}`, creation preserves it; otherwise it generates a new ID.

The generated ID must be included in:

- the written YAML frontmatter,
- the returned `TaskInfo`,
- cache update payloads,
- webhook payloads and API-visible task objects through the existing task object flow.

## Subtask Creation Flow

When the user chooses **Create subtask** from a parent task:

1. TaskNotes ensures the parent task has an `id`. If the parent is an existing task without one, TaskNotes writes a generated `id` to the parent first.
2. The subtask creation modal receives the parent's ID as `parent_id`.
3. The child task is created with its own generated `id`, `parent_id` set to the parent's ID, and the existing parent wikilink in `projects`.

This keeps current views working while adding stable ID linkage.

## Existing Subtask Assignment Flow

When the user assigns an existing task as a subtask of another task:

1. TaskNotes ensures the parent has an `id`.
2. TaskNotes ensures the child has an `id`.
3. TaskNotes writes `parent_id` to the child.
4. TaskNotes also preserves or adds the current parent project wikilink in the child's `projects` field.

If the child already has the same `parent_id`, the operation should behave as an idempotent no-op for the ID field while still keeping the project wikilink consistent.

## Error Handling

If parent ID persistence fails, TaskNotes should not create a child with a missing or incorrect `parent_id`. The existing user-facing failure path for task creation or subtask assignment should surface the error. If adding the legacy project wikilink succeeds but writing `parent_id` fails for an existing child assignment, the operation should report failure rather than silently leaving a partially upgraded relationship.

## Testing

Unit tests should cover:

- new tasks receive `id` frontmatter in the `TSK-xxxxxxxx` format,
- valid caller-provided IDs are preserved,
- invalid caller-provided IDs are replaced with generated IDs,
- generated IDs retry on collision,
- subtask creation pre-population includes `parent_id` and preserves the existing `projects` wikilink,
- assigning an existing task as a subtask writes `parent_id` and keeps the existing project relationship behavior,
- existing parent tasks without IDs receive a lazily generated ID before the child receives `parent_id`.

Integration or workflow tests should cover the modal-level flow where practical, but the core behavior should live in service/helper tests so it is fast and deterministic.

## Documentation and Release Notes

The user-facing docs should describe the new `id` and `parent_id` frontmatter fields in the task properties or task management documentation. The unreleased notes should mention that newly created tasks now receive stable generated IDs and subtasks store their parent ID while preserving existing project links.
