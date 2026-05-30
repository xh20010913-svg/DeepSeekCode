export class CircularBuffer<T> {
  private readonly values: T[] = [];

  constructor(private readonly capacity: number) {
    if (!Number.isInteger(capacity) || capacity <= 0) {
      throw new Error("CircularBuffer capacity must be a positive integer");
    }
  }

  push(value: T): void {
    this.values.push(value);
    if (this.values.length > this.capacity) this.values.shift();
  }

  toArray(): T[] {
    return [...this.values];
  }

  clear(): void {
    this.values.length = 0;
  }

  get length(): number {
    return this.values.length;
  }
}
