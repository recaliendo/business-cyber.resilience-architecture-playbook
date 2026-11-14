// Loads versioned knowledge files from <repo>/knowledge. Validated on every load.
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ControlCatalog, ObligationCatalog, SourceRegistry } from '../domain/schemas.js';
import { loadStructured, InputError } from '../lib/io.js';
import type { z } from 'zod';

let cachedRoot: string | undefined;

/** Locate the package root (the directory holding package.json and knowledge/). */
export function packageRoot(): string {
  if (cachedRoot) return cachedRoot;
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 6; i++) {
    if (existsSync(join(dir, 'package.json')) && existsSync(join(dir, 'knowledge'))) return (cachedRoot = dir);
    dir = resolve(dir, '..');
  }
  throw new Error('Could not locate package root containing knowledge/');
}

export function knowledgePath(...parts: string[]): string {
  return join(packageRoot(), 'knowledge', ...parts);
}

function loadValidated<S extends z.ZodType>(schema: S, path: string): z.infer<S> {
  const parsed = schema.safeParse(loadStructured(path));
  if (!parsed.success) {
    throw new InputError(`knowledge file invalid: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`, path);
  }
  return parsed.data;
}

export const loadControls = (path = knowledgePath('controls', 'controls.yaml')) => loadValidated(ControlCatalog, path);
export const loadObligations = (path = knowledgePath('compliance', 'obligations.yaml')) => loadValidated(ObligationCatalog, path);
export const loadSources = (path = knowledgePath('sources', 'registry.yaml')) => loadValidated(SourceRegistry, path);
