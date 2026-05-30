export interface Timestamp {
  seconds: number;
  nanos?: number;
}

export function timestampFromDate(date: Date): Timestamp {
  const millis = date.getTime();
  return {
    seconds: Math.floor(millis / 1000),
    nanos: (millis % 1000) * 1_000_000,
  };
}
