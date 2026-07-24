function text(value) {
  return String(value || '').trim();
}

function money(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) throw new Error('Valid non-negative price required');
  return Math.round(amount * 100) / 100;
}

function normalizeSellableItems(items) {
  const seen = new Set();
  return (items || []).map((item, index) => {
    const code = text(item.productCode || item.product_code || item.item_number).toUpperCase();
    const name = text(item.productName || item.canonical_name || item.name);
    const quantity = Number(item.quantity ?? 1);
    const unitPrice = money(item.unitPrice ?? item.amount ?? item.price);
    if (!/^(F|C|E|AO)-\d{2,3}$/.test(code)) throw new Error(`Invalid Better Home product code: ${code}`);
    if (!name) throw new Error(`Product name required: ${code}`);
    if (!Number.isFinite(quantity) || quantity <= 0) throw new Error(`Positive quantity required: ${code}`);
    if (seen.has(code)) throw new Error(`Duplicate Better Home product code: ${code}`);
    seen.add(code);
    return { code, name, quantity, unitPrice, sortOrder: (index + 1) * 10 };
  });
}

function findGstRate(taxRates) {
  const rate = (taxRates || []).find((item) =>
    text(item.name).toLowerCase() === 'gst on income'
    && Number(item.active ?? 1) === 1
    && Number(item.amount) === 10);
  if (!rate?.uuid) throw new Error('Active 10% GST on Income tax rate not found');
  return rate;
}

async function syncBetterHomeCatalog(client, items) {
  const normalized = normalizeSellableItems(items);
  const [existing, taxRates] = await Promise.all([client.getMaterials(), client.getTaxRates()]);
  const gst = findGstRate(taxRates);
  const byCode = new Map(existing.map((item) => [text(item.item_number).toUpperCase(), item]));
  const result = { created: [], updated: [], unchanged: [], products: new Map(), gstRateUuid: gst.uuid };

  for (const item of normalized) {
    const current = byCode.get(item.code);
    const desired = {
      item_number: item.code,
      name: item.name,
      price: item.unitPrice.toFixed(2),
      price_includes_taxes: 1,
      item_is_inventoried: 0,
      tax_rate_uuid: gst.uuid,
    };
    if (!current) {
      const created = await client.createMaterial(desired);
      if (!created.uuid) throw new Error(`ServiceM8 did not return material UUID: ${item.code}`);
      result.created.push(item.code);
      result.products.set(item.code, { ...item, uuid: created.uuid });
      continue;
    }
    const changed = text(current.name) !== item.name
      || money(current.price) !== item.unitPrice
      || Number(current.price_includes_taxes) !== 1
      || Number(current.item_is_inventoried) !== 0
      || text(current.tax_rate_uuid) !== gst.uuid;
    if (changed) {
      await client.updateMaterial(current.uuid, desired);
      result.updated.push(item.code);
    } else {
      result.unchanged.push(item.code);
    }
    result.products.set(item.code, { ...item, uuid: current.uuid });
  }
  return result;
}

async function syncBetterHomeJobMaterials(client, jobUuid, items) {
  const catalog = await syncBetterHomeCatalog(client, items);
  const existing = await client.getJobMaterials(`job_uuid eq '${jobUuid}'`);
  const existingMaterialUuids = new Set(existing.map((item) => text(item.material_uuid)));
  const created = [];
  for (const product of catalog.products.values()) {
    if (existingMaterialUuids.has(product.uuid)) continue;
    const exGst = product.unitPrice / 1.1;
    await client.createJobMaterial(jobUuid, {
      material_uuid: product.uuid,
      name: product.name,
      quantity: String(product.quantity),
      price: exGst.toFixed(4),
      displayed_amount: product.unitPrice.toFixed(2),
      displayed_amount_is_tax_inclusive: '1',
      tax_rate_uuid: catalog.gstRateUuid,
      sort_order: String(product.sortOrder),
    });
    created.push(product.code);
  }
  return {
    catalog: {
      created: catalog.created,
      updated: catalog.updated,
      unchanged: catalog.unchanged,
    },
    jobMaterialsCreated: created,
    jobMaterialsUnchanged: catalog.products.size - created.length,
  };
}

module.exports = {
  normalizeSellableItems,
  findGstRate,
  syncBetterHomeCatalog,
  syncBetterHomeJobMaterials,
};
