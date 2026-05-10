#!/usr/bin/env node
// scripts/create-persona.js
//
// Plan 14-02 Task 1 — create a persona md+json pair under
// `_testatlas/agents/personas/<type>/<slug>.{md,json}`, AJV-validated against
// `.testatlas/schemas/persona.schema.json`, and update
// `_testatlas/brain/personas.json` index.
//
// CLI:
//   node scripts/create-persona.js --name <s> --type <system|generated|project> \
//     --mission <s> [--domains a,b,c] [--cwd <dir>] [--suite-cwd <dir>]
//
// Programmatic:
//   import { createPersona } from './create-persona.js';
//   const r = await createPersona({ cwd, name, type, mission, domains });

import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { atomicWrite } from './lib/atomic-write.js';
import { isMainModule } from './lib/is-main.js';
import { loadAllSchemas } from './lib/schema-loader.js';

const PERSONA_SCHEMA_ID = 'https://testatlas.dev/schemas/v2/persona.schema.json';

function err(code, msg) {
  const e = new Error(msg);
  e.code = code;
  return e;
}

function slugify(name) {
  return String(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

/**
 * @param {{
 *   cwd?: string,
 *   suiteCwd?: string,
 *   name: string,
 *   type: 'system'|'generated'|'project',
 *   mission: string,
 *   domains?: string[],
 *   version?: string,
 * }} args
 */
export async function createPersona(args = {}) {
  if (!args.name) throw err('TESTATLAS_INVALID_ARGS', 'create-persona: --name is required');
  if (!args.type) throw err('TESTATLAS_INVALID_ARGS', 'create-persona: --type is required');
  if (!args.mission) throw err('TESTATLAS_INVALID_ARGS', 'create-persona: --mission is required');

  const cwd = args.cwd ?? process.cwd();
  const suiteCwd = args.suiteCwd ?? cwd;
  const wsDir = path.join(cwd, '_testatlas');
  const id = slugify(args.name);
  const record = {
    $schema: PERSONA_SCHEMA_ID,
    id,
    name: args.name,
    type: args.type,
    version: args.version ?? '2.0.0',
    mission: args.mission,
    domains: Array.isArray(args.domains) ? args.domains : [],
  };

  // Validate against persona.schema.json BEFORE writing.
  const ajv = await loadAllSchemas({ cwd: suiteCwd });
  const validate = ajv.getSchema(PERSONA_SCHEMA_ID);
  if (!validate) {
    throw err('TESTATLAS_SCHEMA_MISSING', `persona schema not registered: ${PERSONA_SCHEMA_ID}`);
  }
  if (!validate(record)) {
    const e = err(
      'TESTATLAS_INVALID_PERSONA',
      `persona record fails schema: ${validate.errors.map((x) => x.message).join('; ')}`,
    );
    e.validationErrors = validate.errors;
    throw e;
  }

  // Write md + json.
  const personaDir = path.join(wsDir, 'agents', 'personas', args.type);
  await mkdir(personaDir, { recursive: true });
  const mdPath = path.join(personaDir, `${id}.md`);
  const jsonPath = path.join(personaDir, `${id}.json`);

  // Render minimal markdown — uses the V2 persona/<type>.md template if
  // present; otherwise inline a default.
  let mdBody = '';
  try {
    const tmplPath = path.join(suiteCwd, '.testatlas', 'templates', 'persona', `${args.type}.md`);
    mdBody = await readFile(tmplPath, 'utf8');
  } catch {
    mdBody = `---\nid: ${id}\nname: ${args.name}\ntype: ${args.type}\nversion: ${record.version}\n---\n\n# Persona: ${args.name}\n\n## Mission\n\n${args.mission}\n`;
  }
  // Substitute key tokens.
  mdBody = mdBody
    .replace(/<!--\s*kebab-id\s*-->/g, id)
    .replace(/<!--\s*Human Name\s*-->/g, args.name)
    .replace(/<!--\s*Generated Name\s*-->/g, args.name)
    .replace(/<!--\s*Project Persona Name\s*-->/g, args.name)
    .replace(/<!--\s*Name\s*-->/g, args.name);

  await atomicWrite(mdPath, mdBody);
  await atomicWrite(jsonPath, `${JSON.stringify(record, null, 2)}\n`);

  // Update brain/personas.json
  const brainDir = path.join(wsDir, 'brain');
  const indexPath = path.join(brainDir, 'personas.json');
  let index;
  try {
    index = JSON.parse(await readFile(indexPath, 'utf8'));
  } catch {
    index = { schema_version: '2.0.0', last_updated: '', personas: [] };
  }
  if (!Array.isArray(index.personas)) index.personas = [];
  // Replace existing entry by id, else push.
  const existingIdx = index.personas.findIndex((p) => p.id === id);
  const indexEntry = { id, name: args.name, type: args.type, mission: args.mission };
  if (existingIdx >= 0) index.personas[existingIdx] = indexEntry;
  else index.personas.push(indexEntry);
  index.last_updated = new Date().toISOString();
  await mkdir(brainDir, { recursive: true });
  await atomicWrite(indexPath, `${JSON.stringify(index, null, 2)}\n`);

  return { ok: true, id, mdPath, jsonPath };
}

const isMain = isMainModule(import.meta.url);
if (isMain) {
  const argv = process.argv.slice(2);
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case '--name':
        opts.name = argv[++i];
        break;
      case '--type':
        opts.type = argv[++i];
        break;
      case '--mission':
        opts.mission = argv[++i];
        break;
      case '--domains':
        opts.domains = String(argv[++i])
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
        break;
      case '--version':
        opts.version = argv[++i];
        break;
      case '--cwd':
        opts.cwd = path.resolve(argv[++i]);
        break;
      case '--suite-cwd':
        opts.suiteCwd = path.resolve(argv[++i]);
        break;
      case '--help':
      case '-h':
        console.log(
          'Usage: node scripts/create-persona.js --name <s> --type <system|generated|project> --mission <s> ' +
            '[--domains a,b,c] [--version 2.0.0] [--cwd <dir>] [--suite-cwd <dir>]',
        );
        process.exit(0);
        break;
      default:
        console.error(`create-persona: unknown argument "${a}"`);
        process.exit(2);
    }
  }
  try {
    const r = await createPersona(opts);
    console.log(`create-persona: wrote ${r.mdPath} + ${r.jsonPath}`);
  } catch (e) {
    console.error(`create-persona: ${e.code ?? 'ERROR'} — ${e.message}`);
    process.exit(1);
  }
}
