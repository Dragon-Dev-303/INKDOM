// Runs the Next.js app (port 3000) and the game server (port 3001, guests allowed) together.
import { spawn } from 'node:child_process';

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const procs = [
  spawn(npm, ['run', 'dev'], { stdio: 'inherit', shell: true }),
  spawn(npm, ['run', 'dev:server'], { stdio: 'inherit', shell: true, env: { ...process.env, ALLOW_GUESTS: process.env.ALLOW_GUESTS ?? 'true' } }),
];
const stop = () => { for (const p of procs) p.kill(); process.exit(0); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
for (const p of procs) p.on('exit', (code) => { if (code) stop(); });
