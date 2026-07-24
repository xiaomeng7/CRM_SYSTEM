import importPlan from '../../../../packages/product-os/generated/import-plan-v2.07.json';

type PriceRow = {
  productCode: string;
  customerPriceInclGst: number;
  currency: string;
  displayMode: 'EXACT' | 'FROM' | 'CONTACT';
  fulfillmentMode: 'INSTALLED' | 'SUPPLY_ONLY';
  installationIncluded: boolean;
  taxBasis: 'GST_INCLUSIVE' | 'GST_EXCLUSIVE';
  customerVisible: boolean;
};

export type CustomerPrice = {
  productCode: string;
  amount: number;
  amountLabel: string;
  displayMode: PriceRow['displayMode'];
  fulfilmentLabel: string;
  taxLabel: string;
};

const priceRows = (importPlan.prices as PriceRow[]).filter((price) => price.customerVisible);

const currency = new Intl.NumberFormat('en-AU', {
  style: 'currency',
  currency: 'AUD',
  maximumFractionDigits: 0,
});

export function getCustomerPrice(productCode: string): CustomerPrice {
  const price = priceRows.find((candidate) => candidate.productCode === productCode);

  if (!price) {
    throw new Error(`No customer-visible Product OS price found for ${productCode}`);
  }

  return {
    productCode,
    amount: price.customerPriceInclGst,
    amountLabel: `${price.displayMode === 'FROM' ? 'From ' : ''}${currency.format(price.customerPriceInclGst)}`,
    displayMode: price.displayMode,
    fulfilmentLabel: price.fulfillmentMode === 'SUPPLY_ONLY' ? 'Supply only' : 'Installed',
    taxLabel: price.taxBasis === 'GST_INCLUSIVE' ? 'GST included' : 'Excluding GST',
  };
}
