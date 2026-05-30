export type Listener<T> = (state: T) => void;
export type Updater<T> = T | ((previous: T) => T);

export interface Store<T> {
  getState(): T;
  setState(update: Updater<T>): T;
  subscribe(listener: Listener<T>): () => void;
}

export function createStore<T>(initialState: T): Store<T> {
  let state = initialState;
  const listeners = new Set<Listener<T>>();

  return {
    getState() {
      return state;
    },
    setState(update) {
      state = typeof update === "function" ? (update as (previous: T) => T)(state) : update;
      for (const listener of listeners) listener(state);
      return state;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
