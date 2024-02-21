# Asyncier

A helper library for working with async iterables in JavaScipt

*Built with Typescript*

## Installation
```bash
npm install asyncier
```
## Functions

* [fetchNext](#fetchNext)

### fetchNext
Wraps an AsyncIterable so that when a record is fetched the next one is
immediately requested. This can be used to eliminate latency by waiting on the
next page of data while the previous one is being processed. This will only
request one record at a time and will never make multiple concurrent calls.

#### Arguments
`items`: `AsyncIterable<T>` Async list if items

*returns* `AsyncIterable<T>` Async list of items where 1 record is always pre-requested

#### Example

```typescript
import { fetchNext } from 'asyncier';

const pages: AsyncIterable<MyData> = loadFromServer(...);
const prefetched = fetchNext(pages);

for await (const page of prefetched) {
  await writeData(page);
}

// Without pre-fetching there is a lot of latency
// Load   1===     2===      3===      4===      5===
// Write       1===     2===      3===      4===      5===

// Pre-fetching removes latency
// Load 1=== 2=== 3=== 4=== 5=== 6=== 7=== 8=== 9===
// Save      1=== 2=== 3=== 4=== 5=== 6=== 7=== 8=== 9===
```

For most scenarios you will only need to pre-load one page. However if you'd
like to buffer mulitple pages you can do so by pipe-ing `fetchNext` to itself
multiple times. Calls will still be made sequentially so you will never have
multiple concurrent calls pending, but it will continue attempting to load
additional pages into memory until the minimum is met.

```typescript
import { fetchNext } from 'asyncier';
import { pipe } from 'ramda';

// Fetch up to 3 pages of data and hold in memory
const fetch3 = pipe(fetchNext, fetchNext, fetchNext);

const pages = loadFromServer(...);
const prefetched = fetch3(pages);

for await (const page of prefetched) {
  await writeData(page);
}

```

This is not an optimized approach so it should be limited to a few calls.
If you need to buffer many objects you are probably better off implementing
a custom [Stream](https://nodejs.org/api/stream.html).
