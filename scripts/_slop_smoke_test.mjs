import { readFileSync } from 'node:fs';
const SRC = readFileSync(new URL('../modtools.js', import.meta.url),'utf8');
const i = SRC.indexOf('function scorePostQualityText(title){');
const j = SRC.indexOf('\n  function buildActionStrip(item){', i);
if (i<0||j<0){ console.error('FATAL: scorePostQualityText not found'); process.exit(2); }
const M = new Function(SRC.slice(i,j) + '\n return { scorePostQualityText };')();
let pass=0,fail=0;
function ck(title, want){ const r=M.scorePostQualityText(title); const ok=r.slop===want; if(ok)pass++;else fail++; console.log((ok?'  PASS':'  FAIL')+'  slop='+r.slop+' (want '+want+') score='+r.score+'  "'+title.slice(0,40)+'"'+(r.reasons.length?'  ['+r.reasons.join(', ')+']':'')); }
console.log('=== slop badge heuristic (precision-first) ===');
console.log('-- LEGIT content MUST NOT flag (zero false-positives is the bar) --');
ck('', false);
ck('Trump announces new economic plan for 2026', false);
ck('BREAKING NEWS: Major development in the case today', false);
ck('STOP THE STEAL -- WE WILL NOT COMPLY', false);
ck('ICYMI: the latest from the hearing', false);
ck('Wake up sheeple!!!', false);
ck('Is this real? Anyone have a source?', false);
ck('lol this is wild 🔥', false);
ck('Great find! 👏👏', false);
console.log('-- CLEAR slop SHOULD flag --');
ck('😡😡😡😡😡😡😡😡 wake up now', true);              // 8-emoji wall
ck('this 🔥🔥🔥🔥 is HUGE share now!!!!!!', true);     // 4 emoji + 6 marks
ck('share!!!!!! now!!!!!!', true);                    // 12 marks (extreme)
ck('WAAAAAAAAKE UP!!!!!!', true);                     // repeated-char + 6 marks
ck('🚨🚨🚨🚨🚨 ALERT 🚨🚨🚨', true);                   // 8-emoji wall
console.log('=== '+pass+' passed, '+fail+' failed ===');
process.exit(fail===0?0:1);
