import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
export async function resolve(spec, ctx, next) {
  if ((spec.startsWith('.') || spec.startsWith('/')) && !/\.[cm]?[jt]sx?$/.test(spec)) {
    const base = new URL(spec, ctx.parentURL);
    for (const ext of ['.ts', '.tsx']) {
      if (existsSync(fileURLToPath(base) + ext)) return next(base.href + ext, ctx);
    }
  }
  return next(spec, ctx);
}
