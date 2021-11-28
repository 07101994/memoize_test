import { ReadonlyDeep } from 'type-fest';

// We don't allow null. undefined is required instead.
export type SimpleArgs = (string | number | boolean | undefined)[];

export type BasicAsyncFunc<U extends SimpleArgs, R> = (...args: U) => Promise<ReadonlyDeep<R>>;

interface Memoized<U extends SimpleArgs, R> extends BasicAsyncFunc<U, R> {
  cache_size: () => number;
  clear_cache: () => void;
}

const createCacheKeyFromArgs = (args: SimpleArgs) =>
  // eslint-disable-next-line no-param-reassign
  args.reduce((cacheKey, arg) => (cacheKey += `_${typeof arg === 'object' ? JSON.stringify(args) : `${arg}`}_`), '');

/**
 * Memoizes async functions.
 * The function signature that can be memoized are deliberately restricted
 * to primitive datatypes, to make sure they can be correctly cached.
 *
 * This `rightly` puts the burden on the user to correctly build a function to be memoized
 * rather than a library which has little knowledge of the function.
 *
 * Multiple parallel calls with the same key require only a single call to the wrapped async function.
 *
 * Example:
 * const get_user = memoize_async({ ttl: 60, size: 100 }, async (user_id: number) => {
 *  user = await database.get_user(user_id);
 *  return user;
 * });
 * const u1 = await get_user(2); // Calls database.get_user
 * const u2 = await get_user(2); // Returns from cache
 *
 * @param options Options:
 *  ttl: Seconds till the cache expires
 *  size: The maximum number of items allowed in the cache.
 *        Oldest items are removed first when limit is reached.
 * @param f The async function to be memoized
 */
const memoize_async = <R, U extends SimpleArgs>(
  options: { ttl: number; size: number },
  f: BasicAsyncFunc<U, R>,
): Memoized<U, R> => {
  const cache = new Map<string | number | boolean | undefined, Promise<ReadonlyDeep<R>>>();

  return Object.assign(
    (...args: U) => {
      // Create a cache key from the arguments
      const cacheKey = createCacheKeyFromArgs(args);

      // Check if the cache has the key
      const cached = cache.get(cacheKey);
      // If it does, return the cached value
      if (cached) {
        return cached;
      }

      // If it doesn't, create a promise that will be resolved when the value is ready
      const result = f(...args);
      // Add the promise to the cache
      cache.set(cacheKey, result);
      // Expire the cache after the ttl
      setTimeout(() => cache.delete(cacheKey), options.ttl * 1000);
      // Delete the oldest item when the cache is full
      if (cache.size > options.size) {
        const oldest = cache.keys().next().value;
        cache.delete(oldest);
      }
      return result;
    },
    {
      cache_size: () => cache.size,
      clear_cache: () => cache.clear(),
    },
  );
};

export default memoize_async;
