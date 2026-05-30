import { TodoService, type TodoItem } from "../services/todos/todoService.js";

export function useTodos(projectPath: string): TodoItem[] {
  return new TodoService(projectPath).list();
}
