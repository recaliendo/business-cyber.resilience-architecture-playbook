// Safe, bounded file IO. All ingested files are untrusted data.
import { readFileSync, statSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, extname } from 'node:path';
import { parse as parseYaml } from 'yaml';

export const MAX_INPUT_BYTES = 2 * 1024 * 1024;

export class InputError extends Error {
  constructor(message: string, readonly path?: string) {
    super(path ? `${path}: ${message}` : message);
    this.name = 'InputError';
  }
}

/** Read a text file, refusing anything larger than `maxBytes`. */
export function readTextBounded(path: string, maxBytes = MAX_INPUT_BYTES): string {
  let size: number;
  try {
    size = statSync(path).size;
  } catch {
    throw new InputError('file not found or unreadable', path);
  }
  if (size > maxBytes) throw new InputError(`file is ${size} bytes; limit is ${maxBytes}`, path);
  return readFileSync(path, 'utf8');
}

/**
 * Parse YAML or JSON safely: YAML 1.2 core schema, no custom tags, merge keys off,
 * alias expansion capped (billion-laughs protection).
 */
export function parseStructured(text: string, pathForErrors = '<input>'): unknown {
  const isJson = pathForErrors.endsWith('.json');
  try {
    if (isJson) return JSON.parse(text);
    return parseYaml(text, { schema: 'core', merge: false, maxAliasCount: 50, uniqueKeys: true, prettyErrors: false, logLevel: 'error' });
  } catch (err) {
    throw new InputError(`could not parse ${isJson ? 'JSON' : 'YAML'}: ${(err as Error).message.split('\n')[0]}`, pathForErrors);
  }
}

export function loadStructured(path: string): unknown {
  const ext = extname(path).toLowerCase();
  if (!['.yaml', '.yml', '.json'].includes(ext)) throw new InputError('expected a .yaml, .yml or .json file', path);
  return parseStructured(readTextBounded(path), path);
}

export function writeText(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, 'utf8');
}
