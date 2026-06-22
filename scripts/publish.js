/*
 * publish.js — push your latest content live.
 * Commits any changes (edited text + uploaded photos/videos) and pushes to GitHub,
 * which auto-rebuilds and republishes the site (~1 minute).
 */
const { execSync } = require('child_process');
const run = (c) => execSync(c, { stdio: 'inherit' });

try {
  execSync('git add -A');
  const changed = execSync('git status --porcelain').toString().trim();
  if (!changed) {
    console.log('\nNothing new to publish — the live site already matches your local content.');
    process.exit(0);
  }
  const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
  run(`git commit -m "Update site content (${stamp})"`);
  run('git push');
  console.log('\n========================================================');
  console.log(' Published! GitHub is rebuilding your site now.');
  console.log(' Your changes go live in about 1 minute at:');
  console.log('   https://venoxperformance.my');
  console.log('========================================================\n');
} catch (e) {
  console.error('\nPublish failed:', e.message);
  console.error('If it mentions sign-in, run it again or tell your developer.');
  process.exit(1);
}
