const { foundationRequiredForSelection } = require("./product-read-model");

function calculateSelectionQuote(lines,{foundationSelected=false}={}) {
  const errors=[]; let total=0;
  for(const line of lines){
    const quantity=Number(line.quantity||1);
    if(!Number.isInteger(quantity)||quantity<1) errors.push({productCode:line.product.productCode,code:"INVALID_QUANTITY"});
    if(foundationRequiredForSelection(line.product)&&!foundationSelected&&line.product.productKind!=="FOUNDATION") errors.push({productCode:line.product.productCode,code:"FOUNDATION_REQUIRED"});
    if(!line.product.activePrice) errors.push({productCode:line.product.productCode,code:"ACTIVE_PRICE_REQUIRED"}); else total+=Number(line.product.activePrice.amount)*quantity;
  }
  return {valid:errors.length===0,errors,currencyCode:"AUD",taxBasis:"GST_INCLUSIVE",total,lines:lines.map(x=>({productCode:x.product.productCode,quantity:Number(x.quantity||1),unitPrice:x.product.activePrice?.amount??null,lineTotal:x.product.activePrice?Number(x.product.activePrice.amount)*Number(x.quantity||1):null}))};
}

module.exports={calculateSelectionQuote};
