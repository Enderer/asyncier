/**
 * Wraps an async iterable so that when a record is fetched, the next one is
 * immediately requested. Helps to eliminate latency by waiting on
 * the next page of data while the previous one is being processed.
 * Requests are made sequentially so there are never multiple concurrent calls.
 */
export function fetchNext<T>(items: AsyncIterable<T>): AsyncIterable<T> {
  return {
    async *[Symbol.asyncIterator]() {
      const iterator = items[Symbol.asyncIterator]();
      let pending = await iterator.next();
      while (!pending.done) {
        const next = iterator.next();
        yield pending.value;
        pending = await next;
      }
    },
  };
}
