import { mkdir, writeFile } from 'node:fs/promises';

const supabaseUrl = process.env.SUPABASE_URL;
const supabasePublishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabasePublishableKey) {
  throw new Error('Configura SUPABASE_URL y SUPABASE_PUBLISHABLE_KEY en Netlify.');
}

await writeFile(
  'supabase-config.js',
  `window.SCRAPPY_CONFIG = ${JSON.stringify({ supabaseUrl, supabasePublishableKey })};\n`,
  'utf8'
);
