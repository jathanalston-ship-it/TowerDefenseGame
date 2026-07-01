// Regenerates docs/DEPENDENCY_GRAPH.md from src/dev/systemRegistry.ts (npm run docs:graph).
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildDependencyGraphDoc } from '../src/dev/depGraphDoc';
import { REPO_ROOT } from '../src/dev/docSync';

writeFileSync(join(REPO_ROOT, 'docs/DEPENDENCY_GRAPH.md'), buildDependencyGraphDoc());
console.log('docs/DEPENDENCY_GRAPH.md regenerated from the system registry.');
