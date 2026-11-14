import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { packageRoot } from '../src/knowledge/load.js';
import { loadIntakeFile } from '../src/intake/intake.js';
import { BusinessProfile, type Intake, type IntakeInput } from '../src/domain/schemas.js';
import { Intake as IntakeSchema } from '../src/domain/schemas.js';

export const root = packageRoot();
export const example = (...p: string[]) => join(root, 'examples', ...p);
export const tmp = (prefix = 'bcr-test-') => mkdtempSync(join(tmpdir(), prefix));
export const intakeFile = (name: string): Intake => loadIntakeFile(example('intake', name)).intake;
export const NOW = new Date('2026-11-14T12:00:00Z');

/** Build a business profile from a minimal object, applying schema defaults. */
export function biz(over: Partial<IntakeInput['business']> = {}) {
  return BusinessProfile.parse({ name: 'Test Co', stage: 'launch', team: { size: 1 }, ...over });
}
export function intake(over: Partial<IntakeInput> = {}): Intake {
  return IntakeSchema.parse({ business: { name: 'Test Co', stage: 'launch', team: { size: 1 } }, ...over });
}
