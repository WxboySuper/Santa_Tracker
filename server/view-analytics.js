#!/usr/bin/env node
// Analytics log viewer — prints a summary of page views.
//
// Usage on VPS:  node /opt/gfc-analytics/view-analytics.js
// Usage locally: node server/view-analytics.js
//
// The default log path is logs/analytics.log relative to this script's directory.
'use strict';

const fs = require('fs');
const path = require('path');

const LOG_FILE =
  process.argv[2] ||
  path.join(__dirname, 'logs', 'analytics.log');

if (!fs.existsSync(LOG_FILE)) {
  console.error(`No log file found at: ${LOG_FILE}`);
  console.error('Pass the path as an argument: node view-analytics.js /path/to/analytics.log');
  process.exit(1);
}

const raw = fs.readFileSync(LOG_FILE, 'utf8').trim();
if (!raw) {
  console.log('Log file is empty — no views recorded yet.');
  process.exit(0);
}

const entries = raw
  .split('\n')
  .filter(Boolean)
  .map(l => { try { return JSON.parse(l); } catch { return null; } })
  .filter(Boolean);

if (entries.length === 0) {
  console.log('No valid entries found.');
  process.exit(0);
}

const today = new Date().toISOString().slice(0, 10);
const todayEntries = entries.filter(e => e.ts?.startsWith(today));
/** Groups analytics entries by a given key and returns the counts in descending order. */
const countBy = (arr, key) => {
  const map = {};
  arr.forEach(e => {
    const v = (e[key] || '(none)').toString().trim() || '(none)';
    map[v] = (map[v] || 0) + 1;
  });
  return Object.entries(map).sort((a, b) => b[1] - a[1]);
};

const hr = '─'.repeat(50);

console.log('═'.repeat(50));
console.log('  GFC Analytics Summary');
console.log('═'.repeat(50));
console.log(`  Total page views (all time) : ${entries.length}`);
console.log(`  Views today (${today})  : ${todayEntries.length}`);

console.log(`\n── Top Pages ${hr.slice(12)}`);
countBy(entries, 'page').slice(0, 10).forEach(([page, count]) => {
  console.log(`  ${String(count).padStart(5)}  ${page}`);
});

console.log(`\n── Top Referrers ${hr.slice(16)}`);
countBy(entries, 'ref').slice(0, 10).forEach(([ref, count]) => {
  console.log(`  ${String(count).padStart(5)}  ${ref}`);
});

console.log(`\n── Last 20 Views ${hr.slice(16)}`);
[...entries].slice(-20).reverse().forEach(e => {
  const ts = (e.ts || '').slice(0, 19);
  const page = (e.page || '/').padEnd(35);
  console.log(`  ${ts}  ${page}`);
});

console.log('═'.repeat(50));
