/**
 * Generate deterministic suggested actions for an operational event (PR7D).
 * Replaces pending generator actions only; never executes side effects.
 */

const { pool } = require('../../lib/db');
const { getOperationalEventById } = require('./eventService');
const {
  deletePendingGeneratedActions,
  insertAction,
  listActionsForEvent,
} = require('./actionService');
const { generateCollectionsActions } = require('./actionGenerators/collectionsActionGenerator');
const { generateCashflowActions } = require('./actionGenerators/cashflowActionGenerator');
const { generateBuilderFollowupActions } = require('./actionGenerators/builderFollowupActionGenerator');
const { generateBuilderTargetActions } = require('./actionGenerators/builderTargetActionGenerator');
const { generateBuilderPriorityActions } = require('./actionGenerators/builderPriorityActionGenerator');
const { generateBuilderPartnerActions } = require('./actionGenerators/builderPartnerActionGenerator');

const GENERATORS = {
  collections_risk: generateCollectionsActions,
  cashflow_risk: generateCashflowActions,
  builder_followup: generateBuilderFollowupActions,
  builder_target: generateBuilderTargetActions,
  builder_priority: generateBuilderPriorityActions,
  builder_partner: generateBuilderPartnerActions,
};

/**
 * @param {object|string} eventOrId — full event row or UUID
 * @param {object} [options] — { db, skipDelete }
 */
async function generateEventActions(eventOrId, options = {}) {
  const db = options.db || pool;
  const event =
    typeof eventOrId === 'string'
      ? await getOperationalEventById(eventOrId, { db })
      : eventOrId;

  if (!event || !event.id) {
    const err = new Error('Event not found');
    err.code = 'NOT_FOUND';
    throw err;
  }

  const generator = GENERATORS[event.event_type];
  if (!generator) {
    return { event_id: event.id, generated: 0, actions: await listActionsForEvent(event.id, { db }) };
  }

  if (!options.skipDelete) {
    await deletePendingGeneratedActions(event.id, { db });
  }

  const suggestions = generator(event);
  const inserted = [];
  for (const s of suggestions) {
    const row = await insertAction(
      {
        event_id: event.id,
        action_type: s.action_type,
        title: s.title,
        description: s.description,
        priority: s.priority,
        payload: s.payload,
      },
      { db }
    );
    inserted.push(row);
  }

  const all = await listActionsForEvent(event.id, { db });
  return {
    event_id: event.id,
    event_type: event.event_type,
    generated: inserted.length,
    actions: all,
  };
}

module.exports = {
  generateEventActions,
  GENERATORS,
};
