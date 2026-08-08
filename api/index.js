/**
 * Vercel serverless entrypoint.
 *
 * Vercel only treats files inside the `api/` directory as Serverless
 * Functions, so this thin wrapper lives here and delegates to the compiled
 * NestJS handler in dist/.
 *
 * Loading dist/ (rather than letting Vercel transpile src/ itself) is what
 * makes the "@/..." TypeScript path aliases work: `nest build` rewrites them
 * to relative requires, whereas per-file transpilation leaves them unresolved
 * and Node throws "Cannot find module '@/auth/interfaces/Role.enum'".
 *
 * This file is intentionally plain CommonJS JavaScript so Vercel does not need
 * to compile it at all.
 */
const handler = require('../dist/serverless.js');

module.exports = handler.default || handler;
