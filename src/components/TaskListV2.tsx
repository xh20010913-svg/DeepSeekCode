import React from "react";
import type { TodoItem } from "../services/todos/todoService.js";
import { TodoPanel, todoPanelModel } from "./TodoPanel.js";

export { todoPanelModel as taskListV2Model };

export function TaskListV2(props: {
  todos: TodoItem[];
  limit?: number;
  width?: number;
}): React.ReactElement {
  return <TodoPanel todos={props.todos} limit={props.limit} width={props.width} />;
}
