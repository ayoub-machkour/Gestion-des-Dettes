import { pathToFileURL } from 'node:url';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const stubs = path.resolve('tests/stubs');
export async function resolve(spec, ctx, next) {
  if (spec === 'expo-crypto') return { url: pathToFileURL(path.join(stubs, 'expo-crypto.mjs')).href, shortCircuit: true };
  if ((spec.startsWith('./') || spec.startsWith('../')) && ctx.parentURL && !path.extname(spec)) {
    const base = path.resolve(path.dirname(fileURLToPath(ctx.parentURL)), spec);
    for (const ext of ['.ts', '.tsx']) if (existsSync(base + ext)) return { url: pathToFileURL(base + ext).href, shortCircuit: true };
  }
  return next(spec, ctx);
}
