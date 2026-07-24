const assert = require('node:assert/strict');
const {
  normalizeSellableItems,
  syncBetterHomeCatalog,
  syncBetterHomeJobMaterials,
} = require('../services/better-home-servicem8-products');

(async () => {
  const source = [
    { productCode: 'F-01', productName: 'Foundation', quantity: 1, unitPrice: 4999 },
    { productCode: 'E-06', productName: 'Smart Toilet', quantity: 2, unitPrice: 3299 },
  ];
  assert.equal(normalizeSellableItems(source).length, 2);
  assert.throws(() => normalizeSellableItems([...source, source[0]]), /Duplicate/);

  const createdCatalog = [];
  const updatedCatalog = [];
  const createdJobMaterials = [];
  const client = {
    getMaterials: async () => [{
      uuid: 'material-f',
      item_number: 'F-01',
      name: 'Old Foundation',
      price: '4999.00',
      price_includes_taxes: 1,
      item_is_inventoried: 0,
      tax_rate_uuid: 'gst-1',
    }],
    getTaxRates: async () => [{ uuid: 'gst-1', name: 'GST on Income', amount: '10.0000', active: 1 }],
    createMaterial: async (body) => {
      createdCatalog.push(body);
      return { uuid: `material-${body.item_number}` };
    },
    updateMaterial: async (uuid, body) => updatedCatalog.push({ uuid, body }),
    getJobMaterials: async () => [{ material_uuid: 'material-f' }],
    createJobMaterial: async (_jobUuid, body) => createdJobMaterials.push(body),
  };

  const catalog = await syncBetterHomeCatalog(client, source);
  assert.deepEqual(catalog.created, ['E-06']);
  assert.deepEqual(catalog.updated, ['F-01']);
  assert.equal(createdCatalog[0].price_includes_taxes, 1);
  assert.equal(createdCatalog[0].item_is_inventoried, 0);

  const job = await syncBetterHomeJobMaterials(client, 'job-1', source);
  assert.deepEqual(job.jobMaterialsCreated, ['E-06']);
  assert.equal(createdJobMaterials[0].quantity, '2');
  assert.equal(createdJobMaterials[0].displayed_amount, '3299.00');
  assert.equal(createdJobMaterials[0].displayed_amount_is_tax_inclusive, '1');
  assert.equal(createdJobMaterials[0].price, (3299 / 1.1).toFixed(4));

  console.log('Better Home ServiceM8 product sync tests passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
