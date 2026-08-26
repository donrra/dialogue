/**
 * Small id helper. We avoid extra dependencies and the unavailable
 * crypto.randomUUID in some RN runtimes by composing a time + random id.
 */
export function makeId(prefix = ''): string {
  const time = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 10);
  return `${prefix}${time}${rand}`;
}
