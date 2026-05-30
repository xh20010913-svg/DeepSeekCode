import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

export type TodoStatus = "pending" | "in_progress" | "completed";

export interface TodoItem {
  id: string;
  content: string;
  activeForm: string;
  status: TodoStatus;
}

export interface TodoWriteResult {
  scope: string;
  oldTodos: TodoItem[];
  newTodos: TodoItem[];
  storedTodos: TodoItem[];
  cleared: boolean;
  summary: TodoSummary;
}

export interface TodoSummary {
  total: number;
  pending: number;
  inProgress: number;
  completed: number;
}

interface TodoFile {
  scopes: Record<string, TodoItem[]>;
}

export class TodoService {
  private readonly filePath: string;

  constructor(private readonly projectPath: string) {
    this.filePath = path.join(projectPath, ".deepseekcode", "todos.json");
  }

  list(scope = "project"): TodoItem[] {
    return this.read().scopes[normalizeScope(scope)] ?? [];
  }

  writeTodos(
    todos: Array<Partial<TodoItem> & Pick<TodoItem, "content" | "status">>,
    scope = "project",
  ): TodoWriteResult {
    const normalizedScope = normalizeScope(scope);
    const file = this.read();
    const oldTodos = file.scopes[normalizedScope] ?? [];
    const newTodos = normalizeTodos(todos, oldTodos);
    const cleared = newTodos.length > 0 && newTodos.every((todo) => todo.status === "completed");
    const storedTodos = cleared ? [] : newTodos;
    file.scopes[normalizedScope] = storedTodos;
    this.write(file);
    return {
      scope: normalizedScope,
      oldTodos,
      newTodos,
      storedTodos,
      cleared,
      summary: summarizeTodos(storedTodos),
    };
  }

  add(content: string, activeForm?: string, scope = "project"): TodoWriteResult {
    const current = this.list(scope);
    return this.writeTodos([
      ...current,
      {
        id: `todo_${randomUUID()}`,
        content,
        activeForm: activeForm?.trim() || activeFormFromContent(content),
        status: "pending",
      },
    ], scope);
  }

  start(selector: string, scope = "project"): TodoWriteResult {
    const current = this.list(scope);
    const index = resolveTodoIndex(current, selector);
    if (index < 0) throw new Error(`todo not found: ${selector}`);
    return this.writeTodos(current.map((todo, todoIndex) => ({
      ...todo,
      status: todoIndex === index ? "in_progress" : todo.status === "in_progress" ? "pending" : todo.status,
    })), scope);
  }

  complete(selector: string, scope = "project"): TodoWriteResult {
    const current = this.list(scope);
    const index = resolveTodoIndex(current, selector);
    if (index < 0) throw new Error(`todo not found: ${selector}`);
    return this.writeTodos(current.map((todo, todoIndex) => ({
      ...todo,
      status: todoIndex === index ? "completed" : todo.status,
    })), scope);
  }

  clear(scope = "project"): TodoWriteResult {
    return this.writeTodos([], scope);
  }

  path(): string {
    return this.filePath;
  }

  private read(): TodoFile {
    if (!fs.existsSync(this.filePath)) return { scopes: {} };
    try {
      const parsed = JSON.parse(fs.readFileSync(this.filePath, "utf8")) as Partial<TodoFile>;
      const scopes: Record<string, TodoItem[]> = {};
      if (parsed.scopes && typeof parsed.scopes === "object") {
        for (const [scope, todos] of Object.entries(parsed.scopes)) {
          if (Array.isArray(todos)) {
            scopes[normalizeScope(scope)] = normalizeTodos(todos as Array<Partial<TodoItem> & Pick<TodoItem, "content" | "status">>, []);
          }
        }
      }
      return { scopes };
    } catch {
      return { scopes: {} };
    }
  }

  private write(file: TodoFile): void {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.writeFileSync(this.filePath, `${JSON.stringify(file, null, 2)}\n`, "utf8");
  }
}

export function summarizeTodos(todos: TodoItem[]): TodoSummary {
  return {
    total: todos.length,
    pending: todos.filter((todo) => todo.status === "pending").length,
    inProgress: todos.filter((todo) => todo.status === "in_progress").length,
    completed: todos.filter((todo) => todo.status === "completed").length,
  };
}

export function formatTodoList(todos: TodoItem[]): string {
  if (todos.length === 0) return "No todos.";
  return todos
    .map((todo, index) => `${index + 1}. ${statusMarker(todo.status)} ${todo.content}${todo.status === "in_progress" ? ` (${todo.activeForm})` : ""} [${todo.id}]`)
    .join("\n");
}

function normalizeTodos(
  todos: Array<Partial<TodoItem> & Pick<TodoItem, "content" | "status">>,
  previous: TodoItem[],
): TodoItem[] {
  const previousByContent = new Map(previous.map((todo) => [todo.content, todo]));
  const normalized = todos.map((todo, index) => {
    const content = String(todo.content ?? "").trim();
    if (!content) throw new Error(`todo ${index + 1} content is empty`);
    const status = normalizeStatus(todo.status);
    const previousTodo = todo.id ? previous.find((candidate) => candidate.id === todo.id) : previousByContent.get(content);
    return {
      id: todo.id?.trim() || previousTodo?.id || `todo_${randomUUID()}`,
      content,
      activeForm: todo.activeForm?.trim() || previousTodo?.activeForm || activeFormFromContent(content),
      status,
    };
  });
  const active = normalized.filter((todo) => todo.status === "in_progress");
  if (active.length > 1) {
    throw new Error("todo list can have at most one in_progress item");
  }
  return normalized;
}

function normalizeStatus(status: unknown): TodoStatus {
  if (status === "pending" || status === "in_progress" || status === "completed") return status;
  throw new Error(`invalid todo status: ${String(status)}`);
}

function normalizeScope(scope: string): string {
  const normalized = scope.trim().toLowerCase().replace(/[^a-z0-9._-]/g, "-");
  return normalized || "project";
}

function resolveTodoIndex(todos: TodoItem[], selector: string): number {
  const trimmed = selector.trim();
  const ordinal = Number.parseInt(trimmed.replace(/^#/, ""), 10);
  if (Number.isInteger(ordinal) && String(ordinal) === trimmed.replace(/^#/, "")) {
    const index = ordinal - 1;
    return index >= 0 && index < todos.length ? index : -1;
  }
  return todos.findIndex((todo) => todo.id === trimmed || todo.content === trimmed);
}

function activeFormFromContent(content: string): string {
  return `Working on ${content.charAt(0).toLowerCase()}${content.slice(1)}`;
}

function statusMarker(status: TodoStatus): string {
  if (status === "completed") return "[x]";
  if (status === "in_progress") return "[>]";
  return "[ ]";
}
