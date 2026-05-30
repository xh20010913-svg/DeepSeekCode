import type { Command } from "../../types/command.js";
import { TodoService, formatTodoList } from "../../services/todos/todoService.js";

export const todosCommand: Command = {
  name: "todos",
  description: "Manage the Claude-style structured todo list for the current DeepSeekCode project.",
  usage: "[list|add <content>|start <id|#>|done <id|#>|clear|write-json <json>|path]",
  execute(args, context) {
    const trimmed = args.trim();
    const service = new TodoService(context.config.projectPath);
    if (!trimmed || trimmed === "list") {
      const todos = service.list();
      return { message: formatTodoList(todos) };
    }
    if (trimmed.startsWith("add ")) {
      const [content, activeForm] = splitContentAndActiveForm(trimmed.slice("add ".length));
      if (!content) return { message: "Usage: /todos add <content> [:: active form]" };
      const result = service.add(content, activeForm);
      return { message: formatTodoList(result.storedTodos) };
    }
    if (trimmed.startsWith("start ")) {
      try {
        const result = service.start(trimmed.slice("start ".length).trim());
        return { message: formatTodoList(result.storedTodos) };
      } catch (error) {
        return { message: error instanceof Error ? error.message : String(error) };
      }
    }
    if (trimmed.startsWith("done ")) {
      try {
        const result = service.complete(trimmed.slice("done ".length).trim());
        return { message: result.cleared ? "All todos completed; todo list cleared." : formatTodoList(result.storedTodos) };
      } catch (error) {
        return { message: error instanceof Error ? error.message : String(error) };
      }
    }
    if (trimmed === "clear") {
      service.clear();
      return { message: "Todo list cleared." };
    }
    if (trimmed.startsWith("write-json ")) {
      try {
        const parsed = JSON.parse(trimmed.slice("write-json ".length)) as unknown;
        if (!Array.isArray(parsed)) return { message: "write-json expects an array of todos." };
        const result = service.writeTodos(parsed);
        return { message: result.cleared ? "All todos completed; todo list cleared." : formatTodoList(result.storedTodos) };
      } catch (error) {
        return { message: error instanceof Error ? error.message : String(error) };
      }
    }
    if (trimmed === "path") {
      return { message: service.path() };
    }
    return { message: "Usage: /todos list|add|start|done|clear|write-json|path" };
  },
};

export const todoCommand: Command = {
  ...todosCommand,
  name: "todo",
};

function splitContentAndActiveForm(input: string): [string, string | undefined] {
  const [content, activeForm] = input.split(/\s+::\s+/, 2);
  return [content?.trim() ?? "", activeForm?.trim() || undefined];
}
