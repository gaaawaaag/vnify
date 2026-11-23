// Compares two style-snapshot results written by browser-run.mjs.
// Usage: node scripts/browser/compare-snapshots.mjs before.json after.json [limit]
import {readFile} from 'node:fs/promises';
const [beforeFile, afterFile, limit = '60'] = process.argv.slice(2);
const [a, b] = await Promise.all([beforeFile, afterFile].map(async f => JSON.parse(await readFile(f, 'utf8'))));
// Build-versioned URLs (/v/<build>/…) change with every source edit; they are not a difference in looks.
const unversion = value => value?.replace(/\/v\/[\w-]+\//g, '/v/~/');
const props = b.props, lines = [];
for (const state of new Set([...Object.keys(a.snapshot), ...Object.keys(b.snapshot)])) {
  const left = a.snapshot[state] ?? {}, right = b.snapshot[state] ?? {};
  for (const key of new Set([...Object.keys(left), ...Object.keys(right)])) {
    if (unversion(left[key]) === unversion(right[key])) continue;
    const l = unversion(left[key])?.split('|') ?? [], r = unversion(right[key])?.split('|') ?? [];
    const changed = props.flatMap((p, i) => l[i] === r[i] ? [] : [`${p}: ${l[i] ?? '∅'} → ${r[i] ?? '∅'}`]);
    lines.push(`${state} ${key}: ${changed.join('; ')}`);
  }
}
console.log(`${Object.keys(b.snapshot).length} states, ${lines.length} differences`);
for (const line of lines.slice(0, Number(limit))) console.log(line);
process.exitCode = lines.length ? 1 : 0;
