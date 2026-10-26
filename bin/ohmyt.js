#!/usr/bin/env node
import {main} from '../cli/main.js';
import {safeText} from '../cli/terminal.js';
import {parseArguments} from '../cli/args.js';

process.stdout.on('error', error => {if (error.code === 'EPIPE') process.exitCode = 4; else throw error;});

try {process.exitCode = await main();}
catch (error) {
  process.stderr.write(`ohmyt: ${safeText(error.message)}\n`);
  try {if (parseArguments(process.argv.slice(2)).json && !process.stdout.destroyed) process.stdout.write(JSON.stringify({v: 1, type: 'error', code: error.exitCode || 1, message: safeText(error.message)}) + '\n');} catch {}
  process.exitCode = error.exitCode || 1;
}
