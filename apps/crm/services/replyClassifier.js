/**
 * Reply classifier: rule first, then AI fallback.
 */
const { ruleClassify } = require('./ruleReplyClassifier');

const VALID_INTENTS = ['interested', 'call_request', 'not_now', 'unsubscribe', 'wrong_number', 'unclear'];

async function classifyReply(message) {
  const ruleResult = ruleClassify(message);
  if (ruleResult) return { intent: ruleResult, confidence: 0.95, source: 'rule' };
  const ai = await aiClassify(message);
  return { intent: ai.intent || 'unclear', confidence: ai.confidence ?? 0.5, source: 'ai' };
}

async function aiClassify(message) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return { intent: 'unclear', confidence: 0 };
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: `Classify SMS intent. Message: "${(message||'').slice(0,400)}" Possible: interested,call_request,not_now,unsubscribe,wrong_number,unclear. Return JSON: {"intent":"","confidence":0.0}` }],
        temperature: 0.2,
      }),
    });
    if (!res.ok) return { intent: 'unclear', confidence: 0 };
    const d = await res.json();
    const t = (d.choices?.[0]?.message?.content || '').trim();
    const j = (t.match(/\{[\s\S]*\}/) || [])[0];
    let o;
    try { o = j ? JSON.parse(j) : null; } catch (_) { o = null; }
    if (!o || !VALID_INTENTS.includes(o.intent)) return { intent: 'unclear', confidence: 0.5 };
    return { intent: o.intent, confidence: Math.min(1, Math.max(0, +o.confidence || 0.5)) };
  } catch (e) {
    return { intent: 'unclear', confidence: 0 };
  }
}

module.exports = { classifyReply };
