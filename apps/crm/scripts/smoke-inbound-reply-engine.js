#!/usr/bin/env node
/**
 * Smoke test: 5 类真实入站短信 — OpenAI 分类 + question 样例的生成预览。
 *
 * 不连 DB、不发 Twilio；用于快速看 label 是否符合预期，以及 question 回复是否可落地。
 *
 * 行为路径（代码层，非本脚本实测）：
 * - interested / urgent / not_interested：无自动 SMS（仅 task 或 DNC）
 * - question / unclear：受 1h 最多 2 条 + 同文去重约束，不会无限聊
 *
 * Usage (from apps/crm):
 *   node scripts/smoke-inbound-reply-engine.js           # classify + question 回复预览
 *   node scripts/smoke-inbound-reply-engine.js classify
 *   node scripts/smoke-inbound-reply-engine.js replies
 */

require('../lib/load-env');
const { classifyMessage, generateSmsText } = require('../services/inboundReplyEngine');

const SAMPLES = [
  { group: 'interested', expect: 'interested', text: 'yes' },
  { group: 'interested', expect: 'interested', text: 'call me' },
  { group: 'interested', expect: 'interested', text: 'sounds good' },
  { group: 'urgent', expect: 'urgent', text: 'asap' },
  { group: 'urgent', expect: 'urgent', text: 'today please' },
  { group: 'urgent', expect: 'urgent', text: 'no power now' },
  { group: 'question', expect: 'question', text: 'how much' },
  { group: 'question', expect: 'question', text: 'when can you come' },
  { group: 'question', expect: 'question', text: 'what does it include' },
  { group: 'not_interested', expect: 'not_interested', text: 'no thanks' },
  { group: 'not_interested', expect: 'not_interested', text: 'not interested' },
  { group: 'unclear', expect: 'unclear', text: 'ok' },
  { group: 'unclear', expect: 'unclear', text: 'hello?' },
  { group: 'unclear', expect: 'unclear', text: 'what' },
];

function flag(label, expect) {
  return label === expect ? 'OK' : 'DIFF';
}

async function runClassify() {
  if (!process.env.OPENAI_API_KEY) {
    console.error('OPENAI_API_KEY missing — load monorepo .env or export the key.');
    process.exit(1);
  }
  console.log('\n=== classifyMessage (model:', process.env.OPENAI_MODEL || 'gpt-4o-mini', ') ===\n');
  console.log('group'.padEnd(16), 'expect'.padEnd(16), 'got'.padEnd(16), 'flag', '  text');
  const byGroup = {};
  for (const row of SAMPLES) {
    const label = await classifyMessage(row.text);
    const f = flag(label, row.expect);
    if (!byGroup[row.group]) byGroup[row.group] = { ok: 0, diff: 0 };
    if (f === 'OK') byGroup[row.group].ok += 1;
    else byGroup[row.group].diff += 1;
    console.log(
      row.group.padEnd(16),
      row.expect.padEnd(16),
      label.padEnd(16),
      f.padEnd(4),
      ' ',
      JSON.stringify(row.text)
    );
  }
  console.log('\n--- per-group vs expected label ---');
  for (const [g, c] of Object.entries(byGroup)) {
    console.log(`  ${g}: OK=${c.ok} DIFF=${c.diff}`);
  }
}

async function runReplies() {
  if (!process.env.OPENAI_API_KEY) {
    console.error('OPENAI_API_KEY missing.');
    process.exit(1);
  }
  const questions = SAMPLES.filter((s) => s.group === 'question');
  console.log('\n=== generateSmsText("question", …) — 人工看是否自然、是否有下一步 ===\n');
  for (const row of questions) {
    const reply = await generateSmsText('question', row.text, 'Alex');
    console.log('Q:', JSON.stringify(row.text));
    console.log('A:', reply);
    console.log('');
  }
  const unclearSamples = SAMPLES.filter((s) => s.group === 'unclear');
  console.log('=== generateSmsText("unclear", …) — 应短、勿长篇 ===\n');
  for (const row of unclearSamples) {
    const reply = await generateSmsText('unclear', row.text, 'Alex');
    console.log('In:', JSON.stringify(row.text));
    console.log('Out:', reply);
    console.log('');
  }
}

const cmd = process.argv[2] || 'all';
(async () => {
  try {
    if (cmd === 'classify') await runClassify();
    else if (cmd === 'replies') await runReplies();
    else if (cmd === 'all') {
      await runClassify();
      await runReplies();
    } else {
      console.log('Usage: node scripts/smoke-inbound-reply-engine.js [classify|replies|all]');
      process.exit(1);
    }
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
  process.exit(0);
})();
