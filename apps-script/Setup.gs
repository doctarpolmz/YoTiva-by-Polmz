/**
 * Setup.gs
 * Run runInitialSetup() ONCE from the Apps Script editor after pasting all
 * files in. It creates every sheet with correct headers, freezes header
 * rows, sets base Settings, and creates your first OWNER login.
 *
 * Edit OWNER_EMAIL / OWNER_PASSWORD below before running, then change the
 * password after your first login.
 */
const OWNER_EMAIL = 'biz.muzaalepaul@gmail.com';
const OWNER_NAME = 'Muzaale Paul';
const OWNER_PASSWORD = '29407';

function runInitialSetup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  PropertiesService.getScriptProperties().setProperty('SHEET_ID', ss.getId());

  Object.keys(SCHEMA).forEach(function (name) {
    let sh = ss.getSheetByName(name);
    if (!sh) sh = ss.insertSheet(name);
    sh.clear();
    const headers = SCHEMA[name];
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#1B2A4A').setFontColor('#FFFFFF');
  });

  // remove default "Sheet1" if it still exists and is empty/unused
  const def = ss.getSheetByName('Sheet1');
  if (def && ss.getSheets().length > 1) ss.deleteSheet(def);

  seedSettings_();
  seedOwner_();

  SpreadsheetApp.getUi().alert('Setup complete. All sheets created. Owner login: ' + OWNER_EMAIL +
    ' / ' + OWNER_PASSWORD + '\nChange this password after first login.');
}

function seedSettings_() {
  const sh = ss_sheet_('Settings');
  const defaults = [
    ['TAX_RATE_PERCENT', '0'],
    ['MAX_DISCOUNT_PERCENT', '20'],
    ['LARGE_ADJUSTMENT_QTY', '20'],
    ['SIGNIFICANT_VARIANCE_QTY', '10'],
    ['BUSINESS_NAME', 'Your Business Name'],
    ['BUSINESS_PHONE', '+256 700 000000'],
    ['BUSINESS_ADDRESS', 'Kampala, Uganda'],
    ['CURRENCY_SYMBOL', 'UGX']
  ];
  defaults.forEach(function (row) { sh.appendRow(row); });
}

function seedOwner_() {
  const sh = ss_sheet_('Users');
  const salt = Utilities.getUuid();
  const hash = hashPassword_(OWNER_PASSWORD, salt);
  sh.appendRow(['USER-000001', OWNER_NAME, OWNER_EMAIL, hash, salt, 'OWNER', 'ACTIVE', new Date().toISOString()]);
  PropertiesService.getScriptProperties().setProperty('SEQ_USER', '1');
}

function ss_sheet_(name) {
  return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
}
