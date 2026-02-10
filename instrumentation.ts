/**
 * Next.js instrumentation hook
 * This file is automatically loaded by Next.js on startup
 */
export async function register() {
  // Only initialize tracing on the Node.js runtime (not Edge)
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { initTracing } = await import('./lib/tracing');
    initTracing();
    console.log('[Instrumentation] Tracing initialized for Node.js runtime');
  }
}
