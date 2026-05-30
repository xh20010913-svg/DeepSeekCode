export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export interface ResultOk<T> {
  ok: true;
  value: T;
}

export interface ResultErr {
  ok: false;
  error: string;
}

export type Result<T> = ResultOk<T> | ResultErr;
