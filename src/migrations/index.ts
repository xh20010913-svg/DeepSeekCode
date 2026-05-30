export interface Migration {
  id: string;
  description: string;
}

export const migrations: Migration[] = [
  {
    id: "0001_state_v1",
    description: "Initial SQLite runtime state schema.",
  },
];
