// Formats the file Claude just wrote with this repo's Biome. Silent no-op for other files or
// when dependencies aren't installed yet.
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, relative } from 'node:path';

let input = '';
for await (const chunk of process.stdin) input += chunk;

try {
  const { tool_input: toolInput = {}, tool_response: toolResponse = {} } = JSON.parse(input);
  const file = toolResponse.filePath ?? toolInput.file_path;
  const root = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
  const biome = join(root, 'node_modules', '@biomejs', 'biome', 'bin', 'biome');
  const inside = file && !relative(root, file).startsWith('..');
  if (inside && /\.(m|c)?(j|t)sx?$|\.jsonc?$|\.css$|\.md$/.test(file) && existsSync(biome)) {
    execFileSync(process.execPath, [biome, 'format', '--write', file], {
      cwd: root,
      stdio: 'ignore',
    });
  }
} catch {
  // Never block an edit because formatting failed.
}
