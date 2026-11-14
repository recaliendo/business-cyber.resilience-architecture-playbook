// Generate JSON Schema files from the zod models (single source of truth: src/domain/schemas.ts).
import { join } from 'node:path';
import { z } from 'zod';
import { Intake, ControlCatalog, ObligationCatalog, SourceRegistry, GeoPolicy, ApprovalRecord, ThreatSignal, Finding } from '../src/domain/schemas.js';
import { packageRoot } from '../src/knowledge/load.js';
import { writeText } from '../src/lib/io.js';

const out = join(packageRoot(), 'schemas');
const all: Record<string, z.ZodType> = {
  'intake.schema.json': Intake,
  'control-catalog.schema.json': ControlCatalog,
  'obligation-catalog.schema.json': ObligationCatalog,
  'source-registry.schema.json': SourceRegistry,
  'geo-policy.schema.json': GeoPolicy,
  'approvals.schema.json': z.object({ approvals: z.array(ApprovalRecord) }),
  'threat-signals.schema.json': z.object({ signals: z.array(ThreatSignal) }),
  'finding.schema.json': Finding,
};
for (const [file, schema] of Object.entries(all)) {
  const json = z.toJSONSchema(schema, { io: 'input', unrepresentable: 'any' });
  writeText(join(out, file), JSON.stringify(json, null, 2) + '\n');
  console.log(`wrote schemas/${file}`);
}
