const assert = require('node:assert/strict');
const {
  BETTER_HOME_CHECKLIST,
  enrichBetterHomeJob,
  splitContactName,
} = require('../services/servicem8-create-job');

(async () => {
  assert.deepEqual(splitContactName('Meng Zhang'), { first: 'Meng', last: 'Zhang' });
  assert.deepEqual(splitContactName('Ishori'), { first: 'Ishori', last: '' });

  const createdContacts = [];
  const createdChecklist = [];
  const client = {
    getJobContacts: async () => [],
    createJobContact: async (_jobUuid, value) => createdContacts.push(value),
    getJobChecklists: async () => [{ name: BETTER_HOME_CHECKLIST[0] }],
    createJobChecklist: async (_jobUuid, value) => createdChecklist.push(value),
  };
  const warnings = await enrichBetterHomeJob(client, 'job-1', {
    name: 'Meng Zhang',
    email: 'meng@example.com',
    phone: '0400000000',
  });

  assert.deepEqual(warnings, []);
  assert.deepEqual(createdContacts, [{
    first: 'Meng',
    last: 'Zhang',
    email: 'meng@example.com',
    mobile: '0400000000',
    type: 'Job Contact',
  }]);
  assert.equal(createdChecklist.length, BETTER_HOME_CHECKLIST.length - 1);
  assert.equal(createdChecklist[0].sort_order, 20);
  assert.ok(createdChecklist.every((item) => item.section_name === 'Better Home Installation'));

  const duplicateClient = {
    getJobContacts: async () => [{ email: 'MENG@EXAMPLE.COM' }],
    createJobContact: async () => assert.fail('duplicate contact created'),
    getJobChecklists: async () => BETTER_HOME_CHECKLIST.map((name) => ({ name })),
    createJobChecklist: async () => assert.fail('duplicate checklist created'),
  };
  assert.deepEqual(await enrichBetterHomeJob(duplicateClient, 'job-1', {
    name: 'Meng Zhang',
    email: 'meng@example.com',
  }), []);

  console.log('Better Home ServiceM8 enrichment tests passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
