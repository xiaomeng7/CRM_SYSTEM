/** NAB parser — PR6A skeleton (unsupported). */
function parseNabCsv() {
  return {
    transactions: [],
    errors: [{ line: 0, message: 'NAB parser not implemented in PR6A' }],
    unsupported: true,
  };
}
module.exports = { parseNabCsv };
