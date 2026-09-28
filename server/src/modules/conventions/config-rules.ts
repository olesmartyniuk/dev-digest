import type { CandidateConvention, SampleFile } from './types.js';
import { PROJECT_FILE_PATTERN } from './constants.js';

/**
 * The deterministic pass: house rules the repo has already WRITTEN DOWN.
 *
 * eslint/tsconfig/prettier/package.json state conventions as fact, so reading
 * them needs no model and produces evidence that is exact by construction —
 * the cited line is the line the matcher found. These candidates still go
 * through the same evidence gate as the model's, so the two paths can never
 * diverge in what "verified" means.
 *
 * This is also the answer to "the scan found nothing useful": a repo with a
 * lint config always yields something, even when the model pass is skipped
 * for want of an API key.
 */

/** Confidence for a rule read straight out of a config file. */
const CONFIG_CONFIDENCE = 0.95;

/** Cap on eslint rules promoted to conventions, so one config can't flood the list. */
const MAX_ESLINT_RULES = 6;

/**
 * ESLint rules worth stating to a reviewer, with the prose to state them in.
 * An eslint config typically enables dozens; only rules a human reviewer can
 * meaningfully check by reading a diff earn a slot.
 */
const ESLINT_RULE_PROSE: Record<string, { rule: string; category: CandidateConvention['category'] }> = {
  'no-console': {
    rule: 'Do not call `console.*` in source — use the project logger.',
    category: 'logging',
  },
  'no-floating-promises': {
    rule: 'Every promise is awaited or explicitly handled — no floating promises.',
    category: 'async',
  },
  '@typescript-eslint/no-floating-promises': {
    rule: 'Every promise is awaited or explicitly handled — no floating promises.',
    category: 'async',
  },
  'no-explicit-any': {
    rule: 'Do not introduce `any` — give the value a real type or `unknown`.',
    category: 'typing',
  },
  '@typescript-eslint/no-explicit-any': {
    rule: 'Do not introduce `any` — give the value a real type or `unknown`.',
    category: 'typing',
  },
  'consistent-type-imports': {
    rule: 'Type-only imports use `import type`.',
    category: 'imports',
  },
  '@typescript-eslint/consistent-type-imports': {
    rule: 'Type-only imports use `import type`.',
    category: 'imports',
  },
  eqeqeq: {
    rule: 'Use strict equality (`===` / `!==`); loose comparison is not allowed.',
    category: 'structure',
  },
  'no-var': { rule: 'Declare bindings with `const`/`let`, never `var`.', category: 'structure' },
  'prefer-const': {
    rule: 'A binding that is never reassigned is declared `const`.',
    category: 'structure',
  },
  'import/order': { rule: 'Imports are grouped and ordered per `import/order`.', category: 'imports' },
  'no-restricted-imports': {
    rule: 'Respect the `no-restricted-imports` allowlist — do not import a banned path.',
    category: 'imports',
  },
  'react-hooks/exhaustive-deps': {
    rule: 'Hook dependency arrays are exhaustive.',
    category: 'structure',
  },
};

/** tsconfig compiler flags that describe how the code must be written. */
const TSCONFIG_FLAGS: Record<string, { rule: string; category: CandidateConvention['category'] }> = {
  strict: {
    rule: 'TypeScript runs in `strict` mode — no implicit `any`, no unchecked `null`/`undefined` access.',
    category: 'typing',
  },
  noUncheckedIndexedAccess: {
    rule: 'Indexed access yields `T | undefined` — narrow before using an element looked up by index or key.',
    category: 'typing',
  },
  exactOptionalPropertyTypes: {
    rule: 'An optional property is either absent or a real value — do not assign `undefined` explicitly.',
    category: 'typing',
  },
  noImplicitOverride: {
    rule: 'A method that overrides a base-class method is marked `override`.',
    category: 'typing',
  },
  verbatimModuleSyntax: {
    rule: 'Type-only imports and exports use `import type` / `export type`.',
    category: 'imports',
  },
  noUnusedLocals: {
    rule: 'No unused locals — remove dead bindings instead of leaving them.',
    category: 'structure',
  },
};

/**
 * MSBuild properties that describe how the C# must be written. The equivalent
 * of tsconfig's strictness flags — and the only config a .NET repo usually
 * has, since it ships no eslint/prettier/tsconfig for this pass to read.
 */
const MSBUILD_FLAGS: {
  pattern: RegExp;
  rule: string;
  category: CandidateConvention['category'];
}[] = [
  {
    pattern: /<Nullable>\s*enable\s*<\/Nullable>/i,
    rule: 'Nullable reference types are enabled — a reference type is non-nullable unless declared `?`, and a possibly-null value is narrowed before use.',
    category: 'typing',
  },
  {
    pattern: /<ImplicitUsings>\s*enable\s*<\/ImplicitUsings>/i,
    rule: 'Implicit usings are enabled — do not re-declare the default `using` directives at the top of a file.',
    category: 'imports',
  },
  {
    pattern: /<TreatWarningsAsErrors>\s*true\s*<\/TreatWarningsAsErrors>/i,
    rule: 'Warnings are errors — code must build warning-free, not merely compile.',
    category: 'structure',
  },
  {
    pattern: /<LangVersion>\s*(latest|preview|\d+(\.\d+)?)\s*<\/LangVersion>/i,
    rule: 'The project pins an explicit C# language version — do not use syntax outside it.',
    category: 'typing',
  },
];

interface LineHit {
  line: number;
  text: string;
}

/** First line matching `pattern`, 1-based, with its raw text. */
export function findLine(content: string, pattern: RegExp): LineHit | null {
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    if (pattern.test(lines[i]!)) return { line: i + 1, text: lines[i]!.trim() };
  }
  return null;
}

function candidate(
  file: SampleFile,
  hit: LineHit,
  rule: string,
  category: CandidateConvention['category'],
  rationale: string,
): CandidateConvention {
  return {
    category,
    rule,
    rationale,
    evidencePath: file.path,
    evidenceLine: hit.line,
    evidenceSnippet: hit.text,
    confidence: CONFIG_CONFIDENCE,
    origin: 'config',
  };
}

/** Read every recognised config file and emit the rules it states. */
export function detectConfigConventions(configs: SampleFile[]): CandidateConvention[] {
  const out: CandidateConvention[] = [];
  for (const file of configs) {
    const name = file.path.toLowerCase();
    if (name === 'tsconfig.json') out.push(...fromTsconfig(file));
    else if (name === 'package.json') out.push(...fromPackageJson(file));
    else if (name.includes('prettier')) out.push(...fromPrettier(file));
    else if (name.includes('eslint')) out.push(...fromEslint(file));
    else if (name === '.editorconfig') out.push(...fromEditorConfig(file));
    else if (PROJECT_FILE_PATTERN.test(file.path)) out.push(...fromMsbuild(file));
  }
  return out;
}

function fromTsconfig(file: SampleFile): CandidateConvention[] {
  const out: CandidateConvention[] = [];
  for (const [flag, prose] of Object.entries(TSCONFIG_FLAGS)) {
    const hit = findLine(file.content, new RegExp(`"${flag}"\\s*:\\s*true`));
    if (hit) out.push(candidate(file, hit, prose.rule, prose.category, `Enabled in ${file.path}.`));
  }
  return out;
}

function fromPackageJson(file: SampleFile): CandidateConvention[] {
  const out: CandidateConvention[] = [];
  const esm = findLine(file.content, /"type"\s*:\s*"module"/);
  if (esm) {
    out.push(
      candidate(
        file,
        esm,
        'The package is ESM — use `import`/`export`, not `require`, and keep relative import specifiers extension-qualified where the runtime needs it.',
        'imports',
        'Declared in package.json.',
      ),
    );
  }
  return out;
}

function fromPrettier(file: SampleFile): CandidateConvention[] {
  const out: CandidateConvention[] = [];
  const checks: [RegExp, string, CandidateConvention['category']][] = [
    [/"?semi"?\s*:\s*false/, 'Statements are written without trailing semicolons.', 'formatting'],
    [/"?singleQuote"?\s*:\s*true/, 'String literals use single quotes.', 'formatting'],
    [/"?trailingComma"?\s*:\s*"(all|es5)"/, 'Multi-line literals carry a trailing comma.', 'formatting'],
  ];
  for (const [pattern, rule, category] of checks) {
    const hit = findLine(file.content, pattern);
    if (hit) out.push(candidate(file, hit, rule, category, `Configured in ${file.path}.`));
  }
  const width = findLine(file.content, /"?printWidth"?\s*:\s*\d+/);
  if (width) {
    const value = /(\d+)/.exec(width.text)?.[1];
    out.push(
      candidate(
        file,
        width,
        `Lines wrap at ${value} characters.`,
        'formatting',
        `Configured in ${file.path}.`,
      ),
    );
  }
  return out;
}

function fromEslint(file: SampleFile): CandidateConvention[] {
  const out: CandidateConvention[] = [];
  for (const [ruleId, prose] of Object.entries(ESLINT_RULE_PROSE)) {
    if (out.length >= MAX_ESLINT_RULES) break;
    // Matches  'rule': 'error'  |  "rule": ["error", …]  |  rule: 2
    const escaped = ruleId.replace(/[/@-]/g, '\\$&');
    const hit = findLine(
      file.content,
      new RegExp(`['"]?${escaped}['"]?\\s*:\\s*\\[?\\s*['"]?(error|2)['"]?`),
    );
    if (hit) {
      out.push(candidate(file, hit, prose.rule, prose.category, `Enforced as an ESLint error in ${file.path}.`));
    }
  }
  return out;
}

function fromMsbuild(file: SampleFile): CandidateConvention[] {
  const out: CandidateConvention[] = [];
  for (const flag of MSBUILD_FLAGS) {
    const hit = findLine(file.content, flag.pattern);
    if (hit) out.push(candidate(file, hit, flag.rule, flag.category, `Set in ${file.path}.`));
  }
  return out;
}

function fromEditorConfig(file: SampleFile): CandidateConvention[] {
  const hit = findLine(file.content, /^\s*indent_style\s*=/);
  if (!hit) return [];
  const style = /=\s*(\w+)/.exec(hit.text)?.[1] ?? 'space';
  return [
    candidate(
      file,
      hit,
      `Indentation uses ${style === 'tab' ? 'tabs' : 'spaces'}.`,
      'formatting',
      'Declared in .editorconfig.',
    ),
  ];
}
