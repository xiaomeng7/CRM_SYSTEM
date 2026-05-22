/**
 * Bank CSV parser registry.
 */

const { parseAnzCsv } = require('./anz');
const { parseCommBankCsv } = require('./commbank');
const { parseNabCsv } = require('./nab');
const { parseWestpacCsv } = require('./westpac');

const SUPPORTED = new Set(['anz', 'commbank']);

function parseBankCsv(bankProfile, csvText) {
  const profile = String(bankProfile || '').trim().toLowerCase();
  switch (profile) {
    case 'anz':
      return { ...parseAnzCsv(csvText), bank_profile: 'anz' };
    case 'commbank':
    case 'cba':
      return { ...parseCommBankCsv(csvText), bank_profile: 'commbank' };
    case 'nab':
      return { ...parseNabCsv(csvText), bank_profile: 'nab', unsupported: true };
    case 'westpac':
      return { ...parseWestpacCsv(csvText), bank_profile: 'westpac', unsupported: true };
    default:
      return {
        transactions: [],
        errors: [{ line: 0, message: `Unsupported bank_profile: ${profile}` }],
        unsupported: true,
        bank_profile: profile,
      };
  }
}

function isSupported(bankProfile) {
  return SUPPORTED.has(String(bankProfile || '').trim().toLowerCase());
}

module.exports = {
  parseBankCsv,
  isSupported,
  SUPPORTED,
};
