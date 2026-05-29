/**
 * Creates an Error carrying an HTTP statusCode, matching the app-wide error
 * convention consumed by the Fastify error handler in src/app.ts.
 */
export function httpError(statusCode: number, message: string): Error {
  return Object.assign(new Error(message), { statusCode });
}
