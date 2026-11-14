// Inventory and architecture mapping of a repository snapshot (static).
import { isText, ext, base, type RepoSnapshot } from './snapshot.js';

export interface RepoInventory {
  languages: Array<{ language: string; files: number }>;
  manifests: string[];
  frameworks: string[];
  integrations: string[];
  iac: string[];
  ci: string[];
  entryPoints: string[];
  migrations: string[];
  ios: { xcodeProjects: string[]; privacyManifests: string[] };
  lockfiles: string[];
}

const LANG: Record<string, string> = {
  '.ts': 'TypeScript', '.tsx': 'TypeScript', '.js': 'JavaScript', '.jsx': 'JavaScript', '.mjs': 'JavaScript', '.cjs': 'JavaScript',
  '.swift': 'Swift', '.m': 'Objective-C', '.kt': 'Kotlin', '.java': 'Java', '.py': 'Python', '.go': 'Go', '.rb': 'Ruby', '.rs': 'Rust',
  '.sql': 'SQL', '.tf': 'Terraform', '.php': 'PHP', '.cs': 'C#',
};
const DEP_SIGNALS: Array<[RegExp, string, 'framework' | 'integration']> = [
  [/^next$/, 'Next.js', 'framework'], [/^react$/, 'React', 'framework'], [/^vue$/, 'Vue', 'framework'], [/^astro$/, 'Astro', 'framework'],
  [/^express$/, 'Express', 'framework'], [/^fastify$/, 'Fastify', 'framework'], [/^@sveltejs\/kit$/, 'SvelteKit', 'framework'],
  [/^@supabase\/(supabase-js|ssr)$/, 'Supabase', 'integration'], [/^stripe$/, 'Stripe (server)', 'integration'], [/^@stripe\/stripe-js$/, 'Stripe (browser)', 'integration'],
  [/^@netlify\/functions$/, 'Netlify Functions', 'integration'], [/^@sentry\//, 'Sentry', 'integration'], [/^resend$/, 'Resend', 'integration'],
  [/^@anthropic-ai\/sdk$/, 'Anthropic API', 'integration'], [/^openai$/, 'OpenAI API', 'integration'], [/^twilio$/, 'Twilio', 'integration'],
  [/^@aws-sdk\//, 'AWS SDK', 'integration'], [/^firebase(-admin)?$/, 'Firebase', 'integration'], [/^prisma$|^@prisma\/client$/, 'Prisma', 'integration'],
];

export function buildInventory(s: RepoSnapshot): RepoInventory {
  const langCount = new Map<string, number>();
  const inv: RepoInventory = { languages: [], manifests: [], frameworks: [], integrations: [], iac: [], ci: [], entryPoints: [], migrations: [], ios: { xcodeProjects: [], privacyManifests: [] }, lockfiles: [] };
  const fw = new Set<string>();
  const integ = new Set<string>();
  const xcode = new Set<string>();
  for (const f of s.files) {
    const p = f.path;
    const l = LANG[ext(p)];
    if (l) langCount.set(l, (langCount.get(l) ?? 0) + 1);
    const b = base(p);
    if (['package.json', 'requirements.txt', 'pyproject.toml', 'go.mod', 'Gemfile', 'Cargo.toml', 'Package.swift', 'Podfile', 'build.gradle', 'pom.xml', 'composer.json'].includes(b)) inv.manifests.push(p);
    if (['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'Package.resolved', 'Podfile.lock', 'poetry.lock', 'go.sum', 'Cargo.lock'].includes(b)) inv.lockfiles.push(p);
    if (b === 'netlify.toml' || b === 'vercel.json' || b === 'Dockerfile' || b === 'docker-compose.yml' || ext(p) === '.tf' || b === 'serverless.yml' || p.endsWith('wrangler.toml') || p.startsWith('supabase/config')) inv.iac.push(p);
    if (/^\.github\/workflows\/.+\.ya?ml$/.test(p) || b === '.gitlab-ci.yml' || p.startsWith('.circleci/')) inv.ci.push(p);
    if (/(^|\/)netlify\/functions\/[^/]+\.(t|j)s$/.test(p) || /(^|\/)(pages|app)\/api\//.test(p) || /(^|\/)supabase\/functions\/[^/]+\/index\.ts$/.test(p)) inv.entryPoints.push(p);
    if (/(^|\/)(migrations|supabase\/migrations)\/.+\.sql$/.test(p)) inv.migrations.push(p);
    const xm = p.match(/^(.*?\.xcodeproj)\//);
    if (xm) xcode.add(xm[1]!);
    if (b === 'PrivacyInfo.xcprivacy') inv.ios.privacyManifests.push(p);
    if (b === 'package.json' && isText(f)) {
      try {
        const pkg = JSON.parse(f.text) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
        for (const dep of Object.keys({ ...pkg.dependencies, ...pkg.devDependencies })) {
          for (const [re, name, kind] of DEP_SIGNALS) if (re.test(dep)) (kind === 'framework' ? fw : integ).add(name);
        }
      } catch { /* malformed manifest: reported by checks if relevant */ }
    }
  }
  inv.languages = [...langCount].map(([language, files]) => ({ language, files })).sort((a, b) => b.files - a.files);
  inv.frameworks = [...fw].sort();
  inv.integrations = [...integ].sort();
  inv.ios.xcodeProjects = [...xcode].sort();
  return inv;
}
