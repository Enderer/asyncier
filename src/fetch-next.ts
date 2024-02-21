/**
 * Wraps an async iterable so that when a record is fetched, the next one is
 * immediately requested. Helps to eliminate latency by waiting on
 * the next page of data while the previous one is being processed.
 * Requests are made sequentially so there are never multiple concurrent calls.
 */
export function fetchNext<T>(items: AsyncIterable<T>): AsyncIterable<T> {
  return {
    [Symbol.asyncIterator]: () => {
      const iterator = items[Symbol.asyncIterator]();
      let pending: Promise<IteratorResult<T>>;

      return {
        next: (): Promise<IteratorResult<T>> => {
          // Get the pending request. If its the first call, pending
          // will be null so call iterator.next to get the next record
          const next = pending ?? iterator.next();

          // Create a new promise that returns the value from iterator.next
          // Call iterator.next only after the previous promise has resolved
          // to ensure that all requests are made sequentially.
          pending = new Promise(resolve =>
            next
              .then(() => resolve(iterator.next()))
              .catch(() =>
                resolve(Promise.resolve({done: true, value: undefined}))
              )
          );

          return next;
        },
      };
    },
  };
}
