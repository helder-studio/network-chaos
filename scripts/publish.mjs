// Publishes the current version with the npm CLI (trusted publishing + provenance) unless it is
// already on npm, then pushes the vX.Y.Z tag and creates the GitHub release. Runs in release.yml
// once no changesets are pending, i.e. after the Version Packages PR is merged.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const { name, version } = JSON.parse(readFileSync('package.json', 'utf8'));
const run = (cmd, args) => execFileSync(cmd, args, { stdio: 'inherit' });

let published = '';
try {
  published = execFileSync('npm', ['view', `${name}@${version}`, 'version'], {
    encoding: 'utf8',
  }).trim();
} catch {
  // E404: the package has never been published
}
if (published === version) {
  console.log(`${name}@${version} is already on npm, nothing to publish`);
  process.exit(0);
}

run('pnpm', ['build']);
run('npm', ['publish', '--provenance', '--access', 'public']);

const tag = `v${version}`;
run('git', ['tag', tag]);
run('git', ['push', 'origin', tag]);

const changelog = readFileSync('CHANGELOG.md', 'utf8');
const section = changelog.split(`## ${version}\n`)[1]?.split('\n## ')[0]?.trim();
run('gh', ['release', 'create', tag, '--title', tag, '--notes', section || `${name}@${version}`]);
