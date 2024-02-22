import {pipe} from 'ramda';
import {fetchNext} from './fetch-next';

describe('fetchNext', () => {
  const count = 10;
  const fastDelay = 10;
  const slowDelay = 20;

  // Test with different delays
  const delays = [0, 1, 10, 100];

  // Test with different counts
  const counts = [0, 1, 2, 3, 10, 25];

  // Event pattern when producer is faster
  const fastProducer = (i: number) => [
    `R${i}`, `C${i - 1}`, `P${i}`, `F${i - 1}`,
  ];

  // Event pattern when consumer is faster
  const fastConsumer = (i: number) => [
    `R${i}`, `C${i - 1}`, `F${i - 1}`, `P${i}`,
  ];

  /**
   * When producer takes more time than consumer, the next item
   * should be requested BEFORE the previous is consumed,
   * should be produced AFTER the previous it's finished
   * [R1, C0, F0, P1]
   */
  describe('when consumer is faster than producer', () => {
    test.each(delays)('should handle different delays', d =>
      expect(load(count, (d + 1) * 3, d)).resolves.toEqual(
        pattern(count, fastConsumer)
      )
    );

    test.each(counts)('should handle different counts', c =>
      expect(load(c, slowDelay, fastDelay)).resolves.toEqual(
        pattern(c, fastConsumer)
      )
    );
  });

  /**
   * When producer is faster than the consumer
   * should be requested BEFORE the previous is consumed,
   * should be produced AFTER the previous is consumed,
   * should be produced BEFORE the previous is finished
   * [R1, C0, P1, F0]
   */
  describe('when producer is faster than consumer', () => {
    test.each(delays)('should handle different delays', d =>
      expect(load(count, d, (d + 1) * 3)).resolves.toEqual(
        pattern(count, fastProducer)
      )
    );

    test.each(counts)('should handle different counts', c =>
      expect(load(c, fastDelay, slowDelay)).resolves.toEqual(
        pattern(c, fastProducer)
      )
    );
  });

  /**
   * When producer and consumer process at the same rate
   * should be requested BEFORE the previous is consumed,
   * should be produced AFTER the previous it's finished
   * [R1, C0, F0, P1]
   */
  describe('when producer and consumer take same time', () => {
    test.each(delays)('should handle different delays', d =>
      expect(load(count, d, d)).resolves.toEqual(pattern(count, fastProducer))
    );

    test.each(counts)('should handle different counts', c =>
      expect(load(c, fastDelay, fastDelay)).resolves.toEqual(
        pattern(c, fastProducer)
      )
    );
  });

  /**
   * Producer is initially slow and the consumer is pulling
   * rows faster than the producer can produce. Then
   * it speeds up and gets ahead of the consumer. Produce
   * event will start showing up before previous finish event.
   */
  it('should handle slow then fast producer', async () => {
    const producerDelay = [100, 100, 100, 100, 100, 5, 5, 5];
    const consumerDelay = 20;

    await expect(
      load(8, producerDelay, consumerDelay).then(r => r)
    ).resolves.toEqual([
      'R0', 'P0',
      'R1', 'C0', 'F0', 'P1',
      'R2', 'C1', 'F1', 'P2',
      'R3', 'C2', 'F2', 'P3',
      'R4', 'C3', 'F3', 'P4',
      'R5', 'C4', 'P5', 'F4', // <= Producer speeds up here
      'R6', 'C5', 'P6', 'F5',
      'R7', 'C6', 'P7', 'F6',
      'C7', 'F7',
    ]);
  });

  /**
   * Produce items fast then slow down at the end.
   * Initially producer will have an item fetched but
   * when it slows down the previous finish event will
   * happen before the produce event
   */
  it('should handle fast then slow producer', async () => {
    const producerDelay = [5, 5, 5, 5, 5, 100, 100, 100];
    const consumerDelay = 20;

    await expect(
      load(8, producerDelay, consumerDelay).then(r => r)
    ).resolves.toEqual([
      'R0', 'P0',
      'R1', 'C0', 'P1', 'F0',
      'R2', 'C1', 'P2', 'F1',
      'R3', 'C2', 'P3', 'F2',
      'R4', 'C3', 'P4', 'F3',
      'R5', 'C4', 'F4', 'P5', // <= Producer slows here
      'R6', 'C5', 'F5', 'P6',
      'R7', 'C6', 'F6', 'P7',
      'C7', 'F7',
    ]);
  });

  /**
   * Produce items faster than the consumer can take them
   * then slow down so that the consumer is waiting
   * then speed up again. Should see finish event of previous
   * item complete before the next produce event only when
   * producer is in slow mode
   */
  it('should handle fast producer, then slow, then fast again', async () => {
    const producerDelay = [5, 5, 5, 5, 100, 100, 100, 5, 5, 5];
    const consumerDelay = 20;

    await expect(
      load(10, producerDelay, consumerDelay).then(r => r)
    ).resolves.toEqual([
      'R0', 'P0',
      'R1', 'C0', 'P1', 'F0',
      'R2', 'C1', 'P2', 'F1',
      'R3', 'C2', 'P3', 'F2',
      'R4', 'C3', 'F3', 'P4',
      'R5', 'C4', 'F4', 'P5', // <= Producer slows here
      'R6', 'C5', 'F5', 'P6',
      'R7', 'C6', 'P7', 'F6',
      'R8', 'C7', 'P8', 'F7',
      'R9', 'C8', 'P9', 'F8',
      'C9', 'F9',
    ]);
  });

  it('should fetch multiple', async () => {
    const fetch4 = pipe(fetchNext, fetchNext, fetchNext, fetchNext);
    const iterable = produce(count, fastDelay);
    const fetched = fetch4(iterable);
    const results = await consume(fastDelay * 10, fetched);
    expect(toEvents(results)).toEqual([
      'R0', 'P0',              // Request and Produce the first item (item 0)
      'R1',                    // Immediately request the next item (item 1)
      'C0',                    // Consume item 0 and wait on processing
      'P1',
      'R2', 'P2',              // Request additional items until 4 are loaded
      'R3', 'P3',              // Only request a new item after prev is produced
      'R4', 'P4',              // 4 items are now queued up
      'F0', 'C1', 'R5', 'P5',  // Wait for an item to finish then
      'F1', 'C2', 'R6', 'P6',  // consume the next one and request a new item
      'F2', 'C3', 'R7', 'P7',
      'F3', 'C4', 'R8', 'P8',
      'F4', 'C5', 'R9', 'P9',  // Last item has been requested
      'F5',
      'C6', 'F6',              // No more items to produce so
      'C7', 'F7',              // just consume and finish the remaining
      'C8', 'F8',
      'C9', 'F9',
    ]);
  });

  it('should handle long lists', async () => {
    await expect(load(1000, 2, 2))
      .resolves.toEqual(pattern(1000, fastProducer));
  }, 30000);

  it('should handle errors', async () => {
    const testError = pipe(throwOn, toAsyncIterable, fetchNext, toArray);

    await expect(testError([false, false, false, true, false]))
      .rejects.toThrow('ERROR3');
    await expect(testError([false, false, true, false, false]))
      .rejects.toThrow('ERROR2');
    await expect(testError([true, false, false, false, false]))
      .rejects.toThrow('ERROR0');
    await expect(testError([true, true, false, false, false]))
      .rejects.toThrow('ERROR0');
    await expect(testError([true, true, true, true, true]))
      .rejects.toThrow('ERROR0');
    await expect(testError([false, true, true, true, true]))
      .rejects.toThrow('ERROR1');
  });


  it('should error when fetching multiple', async () => {
    const fetch4 = pipe(fetchNext, fetchNext, fetchNext, fetchNext);
    const testError = pipe(throwOn, toAsyncIterable, fetch4, toArray);

    await expect(testError([false, false, false, true, false]))
      .rejects.toThrow('ERROR3');
    await expect(testError([false, false, true, false, false]))
      .rejects.toThrow('ERROR2');
    await expect(testError([true, false, false, false, false]))
      .rejects.toThrow('ERROR0');
    await expect(testError([true, true, false, false, false]))
      .rejects.toThrow('ERROR0');
    await expect(testError([true, true, true, true, true]))
      .rejects.toThrow('ERROR0');
    await expect(testError([false, true, true, true, true]))
      .rejects.toThrow('ERROR1');
  });

});

/**
 * Simulate long running tasks for both a producer and consumer
 * Producer is an async process that returns data a record at a time after a delay
 * Consumer reads records and runs another async task that finishes after a delay
 * Four events fire for each item. (R, P, C, F)
 * Request - Item is first requested (producer)
 * Produce - Item has finished loading (producer)
 * Consume - Item has been received (consumer)
 * Finish - Consumer has completed its task (consumer)
 * @param count Number of items to produce and consume
 * @param delayProduce Time (millisecond) to take for each item to be produced
 * @param delayConsume Time (millisecond) the consuming task should take to complete
 */
const load = async (
  count: number,
  delayProduce: number | number[],
  delayConsume: number | number[]
) => {
  const iterable = produce(count, delayProduce);
  const loaded = fetchNext(iterable);
  const results = await consume(delayConsume, loaded);
  return toEvents(results);
};

/**
 * Build an expected event list based on the provided repeating pattern
 * First 2 events will always be request and produce for the 0th item
 * Last 2 events will always be the consume and finish for the nth item
 * Events in the middle will follow a repeating pattern based on which
 * of the producer and consumer completes it's task faster.
 * @param count Number of times to repeat the pattern
 * @param p Pattern that should be repeated
 */
const pattern = (count: number, p: (n: number) => string[]) => {
  if (count === 0) {
    return [];
  }

  // Always start with request, produce for first item
  const last = count - 1;
  const vals = ['R0', 'P0'];

  // Repeat the expected pattern
  for (let i = 1; i < count; i++) {
    vals.push(...p(i));
  }

  // Always end with consume, finish for last item
  vals.push(`C${last}`, `F${last}`);
  return vals;
};

/**
 * Convert timestamp results to a list of individual events
 * ordered by the time they occurred
 * { i: 0, r: 1, p: 2, c: 4, f: 4}
 * { i: 1, r: 3, p: 2, c: 3, f: 4}
 * =>
 * ['R0', 'P0', 'R1', 'C0', 'P1', 'F0', 'C1' 'F1']
 */
const toEvents = (consume: Consume[]): string[] => {
  return consume
    .reduce((a: {i: number; e: string; v: number}[], c) => {
      const i = c.i;
      const item = {R: c.r, P: c.p, C: c.c, F: c.f};
      const entries = Object.entries(item).map(e => ({i, e: e[0], v: e[1]}));
      return [...a, ...entries];
    }, [])
    .sort((a, b) => a.v - b.v)
    .map(e => `${e.e}${e.i}`);
};

/**
 * Produce a series of items with a delay after each. Simulates loading data from an async source
 * @param count Number of items to produce
 * @param duration Time (milliseconds) each item should take to produce
 * @param log Logs sequence of events
 */
async function* produce(
  count: number,
  duration: number | number[]
): AsyncIterable<Produce> {
  for (let i = 0; i < count; i++) {
    const d = Array.isArray(duration)
      ? duration[i % duration.length]
      : duration;
    const r = performance.now();
    await delay(d);
    yield {i, r, p: performance.now()};
  }
}

/**
 * Loads objects from an async producer and runs a subsequent async task on them
 * Simulates a workflow like loading records from a server and then saving them to disk
 */
const consume = async (
  duration: number | number[],
  producer: AsyncIterable<Produce>
): Promise<Consume[]> => {
  const results: Consume[] = [];
  for await (const result of producer) {
    const d = Array.isArray(duration)
      ? duration[results.length % duration.length]
      : duration;
    const c = performance.now();
    await delay(d);
    results.push({...result, c, f: performance.now()});
  }
  return results;
};

/**
 * Delay async execution
 * @param duration Time (milliseconds) to delay the next statement
 */
const delay = (duration: number) => new Promise(r => setTimeout(r, duration));

/**
 * Data item returned by the producer
 */
interface Produce {
  /* Sequence the item was produced */
  i: number;

  /* Timestamp when the item was first requested */
  r: number;

  /* Timestamp when the item was sent to the caller */
  p: number;
}

/**
 * Data item returned by the consumer
 */
interface Consume extends Produce {
  /** Timestamp when the consumer received the produced item */
  c: number;

  /** Timestamp when the consumer completed it's task on the item */
  f: number;
}

/** Convert an array of functions into an async iterable */
async function* toAsyncIterable<T>(items: {(): T}[]): AsyncIterable<T> {
  for (const item of items) {
    yield item();
  }
}

/** Convert an async iterable to a promise that yields all items */
const toArray = async <T>(items: AsyncIterable<T>): Promise<T[]> => {
  const results: T[] = [];
  for await (const item of items) {
    results.push(item);
  }
  return results;
};

/**
 * Create an array of functions. If input is true function
 * for that index will throw an error
 */
const throwOn = (errors: boolean[]): {(): number}[] => {
  return errors.map((e, i) => {
    return e
      ? () => {
          throw new Error(`ERROR${i}`);
        }
      : () => i;
  });
};
