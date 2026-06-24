// One-time backfill: summarize any document whose extracted_text exceeds the
// 5000-char limit and has no summary yet. Run: npx tsx scripts/backfill-summaries.ts
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Minimal .env.local loader (avoids @next/env CJS quirks in tsx scripts).
function loadEnv(file: string) {
  let raw = '';
  try {
    raw = readFileSync(file, 'utf8');
  } catch {
    return;
  }
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let val = m[2];
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[m[1]] === undefined) process.env[m[1]] = val;
  }
}
loadEnv('E:\\Whatsapp_System_Building\\.env.local');

async function main() {
  const { summarizeToLimit, DOC_CHAR_LIMIT } = await import('../lib/chatbot');
  const { supabase } = await import('../lib/supabase');

  const { data, error } = await supabase
    .from('property_files')
    .select('id, file_name, extracted_text, summary')
    .eq('category', 'document');

  if (error) {
    console.error('query failed:', error.message);
    process.exit(1);
  }

  let done = 0;
  for (const f of data ?? []) {
    const len = (f.extracted_text ?? '').trim().length;
    if (len > DOC_CHAR_LIMIT && !(f.summary && f.summary.trim())) {
      process.stdout.write(`summarizing ${f.file_name} (${len} chars) ... `);
      const summary = await summarizeToLimit(f.extracted_text, DOC_CHAR_LIMIT);
      await supabase.from('property_files').update({ summary }).eq('id', f.id);
      console.log(`OK -> ${summary.length} chars`);
      done++;
    } else {
      console.log(`skip ${f.file_name} (len=${len}, hasSummary=${Boolean(f.summary)})`);
    }
  }
  console.log(`\nBackfill complete. Summarized ${done} document(s).`);
  process.exit(0);
}

main();
