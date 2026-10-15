/**
 * Bill-to-Savings — Core Savings Calculation & Recommendation Engine
 * Pure, framework-agnostic business logic module (works in Node.js and Browser).
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.BillToSavingsEngine = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const ALLOWED_FILE_TYPES = ['image/jpeg', 'image/png', 'application/pdf'];
  const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.pdf'];
  const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

  /**
   * Validate uploaded bill file metadata on client or server
   */
  function validateBillUpload(fileMeta) {
    if (!fileMeta || typeof fileMeta !== 'object') {
      return { valid: false, error: 'No file metadata provided.' };
    }
    const { name = '', type = '', size = 0 } = fileMeta;
    const lowerName = String(name).toLowerCase();
    const hasValidExt = ALLOWED_EXTENSIONS.some((ext) => lowerName.endsWith(ext));
    const hasValidMime = ALLOWED_FILE_TYPES.includes(type);

    if (!hasValidMime && !hasValidExt) {
      return {
        valid: false,
        error: 'Unsupported file type. Please upload a JPG, PNG, or PDF file.'
      };
    }
    if (typeof size !== 'number' || size <= 0) {
      return { valid: false, error: 'File is empty or size could not be determined.' };
    }
    if (size > MAX_FILE_SIZE_BYTES) {
      return {
        valid: false,
        error: `File exceeds the maximum allowed size of 5 MB (${(size / (1024 * 1024)).toFixed(2)} MB uploaded).`
      };
    }
    return { valid: true, error: null };
  }

  /**
   * Sanitize a string or value against CSV formula injection (CSV Injection / DDE protection)
   */
  function sanitizeCsvCell(value) {
    if (value === null || value === undefined) return '""';
    let str = String(value);
    // Strip HTML tags if any
    str = str.replace(/<[^>]*>/g, '');
    // If starts with =, +, -, @, tab, or carriage return, prefix with single quote
    if (/^[=+\-@\t\r]/.test(str.trimStart())) {
      str = "'" + str;
    }
    // Escape internal double quotes
    const escaped = str.replace(/"/g, '""');
    return `"${escaped}"`;
  }

  /**
   * Escape HTML special characters to prevent XSS from OCR or user-entered bill text
   */
  function escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /**
   * Validate bill and tariff inputs, returning normalized numbers and warnings/errors
   */
  function validateAndNormalizeInputs(rawBill = {}, rawTariff = {}, rawConfig = {}) {
    const errors = [];
    const warnings = [];

    const unitsConsumedKwh =
      rawBill.unitsConsumedKwh !== '' &&
      rawBill.unitsConsumedKwh !== null &&
      rawBill.unitsConsumedKwh !== undefined &&
      rawBill.unitsConsumedKwh !== 'Not available'
        ? Number(rawBill.unitsConsumedKwh)
        : null;

    const totalBillAmount =
      rawBill.totalBillAmount !== '' &&
      rawBill.totalBillAmount !== null &&
      rawBill.totalBillAmount !== undefined &&
      rawBill.totalBillAmount !== 'Not available'
        ? Number(rawBill.totalBillAmount)
        : null;

    const energyCharges =
      rawBill.energyCharges !== '' &&
      rawBill.energyCharges !== null &&
      rawBill.energyCharges !== undefined &&
      rawBill.energyCharges !== 'Not available'
        ? Number(rawBill.energyCharges)
        : null;

    const fixedCharges =
      rawBill.fixedCharges !== '' &&
      rawBill.fixedCharges !== null &&
      rawBill.fixedCharges !== undefined &&
      rawBill.fixedCharges !== 'Not available'
        ? Number(rawBill.fixedCharges)
        : null;

    const taxesAndDuties =
      rawBill.taxesAndDuties !== '' &&
      rawBill.taxesAndDuties !== null &&
      rawBill.taxesAndDuties !== undefined &&
      rawBill.taxesAndDuties !== 'Not available'
        ? Number(rawBill.taxesAndDuties)
        : null;

    if (unitsConsumedKwh === null || Number.isNaN(unitsConsumedKwh)) {
      errors.push('Billed consumption (kWh) is missing or not available.');
    } else if (unitsConsumedKwh < 0) {
      errors.push('Billed consumption (kWh) cannot be negative.');
    } else if (unitsConsumedKwh === 0) {
      warnings.push('Billed consumption is 0 kWh. Energy reduction calculations will yield zero savings.');
    } else if (unitsConsumedKwh > 500000) {
      warnings.push('Very high monthly consumption detected (>500,000 kWh). Please verify meter reading and multiplier.');
    }

    if (totalBillAmount === null || Number.isNaN(totalBillAmount)) {
      errors.push('Total bill amount (₹) is missing or not available.');
    } else if (totalBillAmount < 0) {
      errors.push('Total bill amount (₹) cannot be negative.');
    } else if (totalBillAmount > 10000000) {
      warnings.push('Very large bill amount detected (>₹1 Crore). Please double-check decimal places.');
    }

    // Applicable electricity rate resolution
    const explicitMarginalRate =
      rawTariff &&
      rawTariff.marginalRatePerKwh !== '' &&
      rawTariff.marginalRatePerKwh !== null &&
      rawTariff.marginalRatePerKwh !== undefined
        ? Number(rawTariff.marginalRatePerKwh)
        : null;

    let effectiveRatePerKwh = null;
    if (
      totalBillAmount !== null &&
      !Number.isNaN(totalBillAmount) &&
      unitsConsumedKwh !== null &&
      !Number.isNaN(unitsConsumedKwh) &&
      unitsConsumedKwh > 0
    ) {
      effectiveRatePerKwh = totalBillAmount / unitsConsumedKwh;
    }

    let applicableRatePerKwh = null;
    let rateType = 'unavailable'; // 'verified_marginal' | 'user_marginal' | 'approximate_effective' | 'unavailable'
    let rateLabel = 'Rate not available';

    if (explicitMarginalRate !== null && !Number.isNaN(explicitMarginalRate) && explicitMarginalRate > 0) {
      applicableRatePerKwh = explicitMarginalRate;
      rateType = rawTariff.isOfficialVerified ? 'verified_marginal' : 'user_marginal';
      rateLabel = rawTariff.isOfficialVerified
        ? `Verified marginal energy rate (₹${explicitMarginalRate.toFixed(2)}/kWh)`
        : `User/Demo marginal energy rate assumption (₹${explicitMarginalRate.toFixed(2)}/kWh)`;
    } else if (
      energyCharges !== null &&
      !Number.isNaN(energyCharges) &&
      energyCharges > 0 &&
      unitsConsumedKwh !== null &&
      unitsConsumedKwh > 0
    ) {
      applicableRatePerKwh = energyCharges / unitsConsumedKwh;
      rateType = 'derived_energy_charge';
      rateLabel = `Derived energy-charge rate (Energy Charges ÷ Total kWh = ₹${applicableRatePerKwh.toFixed(2)}/kWh)`;
    } else if (effectiveRatePerKwh !== null && effectiveRatePerKwh > 0) {
      applicableRatePerKwh = effectiveRatePerKwh;
      rateType = 'approximate_effective';
      rateLabel = `Approximate effective rate (Total Bill ÷ Total Billed kWh = ₹${effectiveRatePerKwh.toFixed(2)}/kWh — includes fixed charges, taxes & slabs)`;
      warnings.push(
        'Using approximate effective rate (Total Bill ÷ Total kWh) because marginal slab rate was not specified. Fixed charges and taxes mean actual marginal savings per kWh may be lower.'
      );
    } else {
      warnings.push('No valid electricity tariff or effective rate could be calculated.');
    }

    if (explicitMarginalRate !== null && explicitMarginalRate <= 0) {
      errors.push('Marginal electricity rate must be greater than ₹0/kWh.');
    }

    // Overall cap configuration (default 45%, bounded between 5% and 75%)
    let overallCapFraction =
      rawConfig.overallSavingsCapPercent !== undefined && rawConfig.overallSavingsCapPercent !== null
        ? Number(rawConfig.overallSavingsCapPercent) / 100
        : 0.45;
    if (Number.isNaN(overallCapFraction) || overallCapFraction <= 0) {
      overallCapFraction = 0.45;
    }
    overallCapFraction = Math.min(Math.max(overallCapFraction, 0.05), 0.75);

    // CO2 emissions factor validation
    let co2FactorKgPerKwh = null;
    let co2FactorMeta = {
      available: false,
      value: null,
      label: 'CO₂ factor not configured',
      isDemoAssumption: true
    };
    if (
      rawConfig.co2FactorKgPerKwh !== undefined &&
      rawConfig.co2FactorKgPerKwh !== null &&
      rawConfig.co2FactorKgPerKwh !== '' &&
      Number(rawConfig.co2FactorKgPerKwh) > 0
    ) {
      co2FactorKgPerKwh = Number(rawConfig.co2FactorKgPerKwh);
      co2FactorMeta = {
        available: true,
        value: co2FactorKgPerKwh,
        label:
          rawConfig.co2FactorSourceLabel ||
          `Demo assumption: ${co2FactorKgPerKwh} kg CO₂/kWh (CEA India Grid Baseline reference assumption — verify for official audit reporting)`,
        isDemoAssumption: rawConfig.co2FactorVerified !== true
      };
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      normalized: {
        unitsConsumedKwh: unitsConsumedKwh !== null && !Number.isNaN(unitsConsumedKwh) ? unitsConsumedKwh : 0,
        totalBillAmount: totalBillAmount !== null && !Number.isNaN(totalBillAmount) ? totalBillAmount : 0,
        energyCharges,
        fixedCharges,
        taxesAndDuties,
        effectiveRatePerKwh,
        applicableRatePerKwh,
        rateType,
        rateLabel,
        overallCapFraction,
        co2FactorKgPerKwh,
        co2FactorMeta
      }
    };
  }

  /**
   * Calculate equipment-level monthly energy consumption:
   * kWh = Equipment power in kW * Operating hours per day * Number of operating days per month
   */
  function calculateEquipmentEnergy(equipmentItem) {
    if (!equipmentItem || typeof equipmentItem !== 'object') {
      return { valid: false, monthlyKwh: 0, error: 'Invalid equipment entry.' };
    }
    const powerKw = Number(equipmentItem.powerKw);
    const quantity = equipmentItem.quantity !== undefined ? Number(equipmentItem.quantity) : 1;
    const hoursPerDay = Number(equipmentItem.hoursPerDay);
    const daysPerMonth = Number(equipmentItem.daysPerMonth);
    const dutyCycle =
      equipmentItem.dutyCycle !== undefined && equipmentItem.dutyCycle !== null
        ? Number(equipmentItem.dutyCycle)
        : 1.0;

    if (Number.isNaN(powerKw) || powerKw < 0) {
      return { valid: false, monthlyKwh: 0, error: 'Equipment power (kW) must be a non-negative number.' };
    }
    if (Number.isNaN(quantity) || quantity < 0) {
      return { valid: false, monthlyKwh: 0, error: 'Quantity must be a non-negative number.' };
    }
    if (Number.isNaN(hoursPerDay) || hoursPerDay < 0 || hoursPerDay > 24) {
      return {
        valid: false,
        monthlyKwh: 0,
        error: 'Operating hours per day must be between 0 and 24 hours.'
      };
    }
    if (Number.isNaN(daysPerMonth) || daysPerMonth < 0 || daysPerMonth > 31) {
      return {
        valid: false,
        monthlyKwh: 0,
        error: 'Operating days per month must be between 0 and 31 days.'
      };
    }
    const cleanDuty = Number.isNaN(dutyCycle) ? 1.0 : Math.min(Math.max(dutyCycle, 0.05), 1.0);
    const monthlyKwh = powerKw * quantity * hoursPerDay * daysPerMonth * cleanDuty;

    return {
      valid: true,
      monthlyKwh: Math.round(monthlyKwh * 100) / 100,
      error: null
    };
  }

  /**
   * Calculate simple payback in months
   */
  function calculateSimplePayback(implementationCost, monthlySavings) {
    const cost = Number(implementationCost);
    const savings = Number(monthlySavings);
    if (Number.isNaN(cost) || cost < 0) {
      return { months: null, label: 'Cost unknown' };
    }
    if (Number.isNaN(savings) || savings <= 0) {
      return { months: null, label: 'No positive payback estimated.' };
    }
    if (cost === 0) {
      return { months: 0, label: 'Immediate (₹0 upfront cost)' };
    }
    const months = cost / savings;
    return {
      months: Math.round(months * 10) / 10,
      label: `${(Math.round(months * 10) / 10).toFixed(1)} months (~${(months / 12).toFixed(1)} yrs)`
    };
  }

  /**
   * Evaluate Time-of-Day (ToD) load shifting opportunity
   * Note: Shifting usage changes timing, NOT total kWh consumed.
   */
  function evaluateTimeOfDayShifting(bill, tariff, questionnaire, simulatorOverrides = {}) {
    const totalKwh = Math.max(0, Number(bill.unitsConsumedKwh) || 0);
    const peakKwhFromBill =
      bill.peakConsumptionKwh !== undefined &&
      bill.peakConsumptionKwh !== null &&
      bill.peakConsumptionKwh !== '' &&
      bill.peakConsumptionKwh !== 'Not available'
        ? Number(bill.peakConsumptionKwh)
        : null;

    const todSupported = Boolean(tariff && tariff.todSupported);
    const peakRate = tariff && tariff.peakRatePerKwh ? Number(tariff.peakRatePerKwh) : null;
    const offPeakRate = tariff && tariff.offPeakRatePerKwh ? Number(tariff.offPeakRatePerKwh) : null;
    const normalRate = tariff && tariff.marginalRatePerKwh ? Number(tariff.marginalRatePerKwh) : null;

    const canShiftAnswer = questionnaire ? questionnaire.canShiftUsage : 'Not sure';
    const userAllowsShift =
      simulatorOverrides.enableLoadShifting !== undefined
        ? Boolean(simulatorOverrides.enableLoadShifting)
        : canShiftAnswer === 'Yes' || canShiftAnswer === 'Maybe';

    // Determine effective target rate for shifted load (off-peak if lower than peak, or normal rate)
    const targetLowRate =
      offPeakRate !== null && !Number.isNaN(offPeakRate) && offPeakRate > 0
        ? offPeakRate
        : normalRate;

    const rateDifferential =
      todSupported &&
      peakRate !== null &&
      targetLowRate !== null &&
      !Number.isNaN(peakRate) &&
      !Number.isNaN(targetLowRate)
        ? peakRate - targetLowRate
        : 0;

    // Estimate peak consumption if not explicitly on bill (assumed 28% of total kWh in demo/inferred mode)
    const estimatedPeakKwh =
      peakKwhFromBill !== null && !Number.isNaN(peakKwhFromBill)
        ? peakKwhFromBill
        : Math.round(totalKwh * 0.28);

    const peakDataProvenance =
      peakKwhFromBill !== null && !Number.isNaN(peakKwhFromBill)
        ? 'Entered/Extracted from Bill'
        : 'Inferred assumption (28% of total billed kWh assumed in peak slots)';

    // Shiftable fraction of peak load
    const defaultShiftFraction = canShiftAnswer === 'Yes' ? 0.30 : canShiftAnswer === 'Maybe' ? 0.18 : 0.12;
    const shiftFraction =
      simulatorOverrides.loadShiftPercentOfPeak !== undefined
        ? Math.min(Math.max(Number(simulatorOverrides.loadShiftPercentOfPeak) / 100, 0), 0.8)
        : defaultShiftFraction;

    const shiftableKwh = userAllowsShift ? Math.round(estimatedPeakKwh * shiftFraction) : 0;

    if (!todSupported || rateDifferential <= 0) {
      return {
        applicable: false,
        rewardingTariff: false,
        peakWindowsLabel: (tariff && tariff.peakWindowsLabel) || 'Not specified on tariff',
        offPeakWindowsLabel: (tariff && tariff.offPeakWindowsLabel) || 'Not specified on tariff',
        estimatedPeakKwh,
        peakDataProvenance,
        shiftableKwh,
        peakRate,
        targetLowRate,
        rateDifferential: Math.max(0, rateDifferential),
        estimatedMonthlyBillSavings: 0,
        estimatedAnnualBillSavings: 0,
        energySavedKwh: 0, // Shifting does NOT save kWh
        explanation:
          'Your current tariff configuration does not show a positive Peak vs. Off-Peak rate differential. Shifting electricity usage to another time of day changes when power is used, but will not reduce your bill under a flat rate.',
        assumptions: [
          'Shifting electricity usage changes timing, not total kWh consumed (0 kWh energy reduction).',
          'Financial savings require a verified Time-of-Day (ToD) tariff with lower off-peak or normal rates.'
        ]
      };
    }

    const monthlyFinancialSavings = Math.round(shiftableKwh * rateDifferential);
    return {
      applicable: true,
      rewardingTariff: true,
      peakWindowsLabel:
        tariff.peakWindowsLabel || 'Demo Peak Slots: 06:00–10:00 & 18:00–22:00 (Verify with utility tariff schedule)',
      offPeakWindowsLabel:
        tariff.offPeakWindowsLabel || 'Demo Off-Peak / Normal Slots: 22:00–06:00 & 10:00–18:00',
      estimatedPeakKwh,
      peakDataProvenance,
      shiftableKwh,
      peakRate,
      targetLowRate,
      rateDifferential: Math.round(rateDifferential * 100) / 100,
      estimatedMonthlyBillSavings: monthlyFinancialSavings,
      estimatedAnnualBillSavings: monthlyFinancialSavings * 12,
      energySavedKwh: 0, // Crucial safeguard: shifting timing does not reduce kWh
      explanation: userAllowsShift
        ? `Shifting approximately ${shiftableKwh} kWh/month of flexible loads (such as water heating, batch prep, battery charging, or pumping) from Peak (₹${peakRate.toFixed(2)}/kWh) to Off-Peak/Normal (₹${targetLowRate.toFixed(2)}/kWh) can save ~₹${monthlyFinancialSavings.toLocaleString('en-IN')}/month in bill charges without reducing total kWh used.`
        : 'Your tariff has a Peak vs. Off-Peak differential, but flexible load shifting is currently marked as not feasible for your operating hours.',
      assumptions: [
        `Peak consumption (${estimatedPeakKwh} kWh/mo): ${peakDataProvenance}.`,
        `Assumed ${(shiftFraction * 100).toFixed(0)}% of peak usage (${shiftableKwh} kWh/mo) is flexible and can be rescheduled.`,
        `Rate differential of ₹${rateDifferential.toFixed(2)}/kWh (${tariff.isOfficialVerified ? 'User-verified tariff' : 'Demo assumption — not an official TANGEDCO/TNPDCL rate'}).`,
        'Time-shifting reduces bill cost via tariff timing and counts as 0 kWh energy reduction.'
      ]
    };
  }

  /**
   * Build personalized, ranked recommendations with double-counting prevention and energy caps
   */
  function generateSavingsPlan(state = {}) {
    const rawBill = state.bill || {};
    const rawTariff = state.tariff || {};
    const questionnaire = state.questionnaire || {};
    const equipmentList = Array.isArray(state.equipment) ? state.equipment : [];
    const customAssumptions = state.actionAssumptions || {};
    const simulator = state.simulator || {};
    const config = state.config || {};

    const validation = validateAndNormalizeInputs(rawBill, rawTariff, config);
    const norm = validation.normalized;
    const totalBilledKwh = norm.unitsConsumedKwh;
    const totalBillAmount = norm.totalBillAmount;
    const rate = norm.applicableRatePerKwh || 0;

    // Operating hours multiplier inference from Questionnaire Q2
    const hoursMap = {
      'Less than 6 hours': 5,
      '6–8 hours': 7.5,
      '9–12 hours': 10.5,
      'More than 12 hours': 14
    };
    const inferredDailyHours = hoursMap[questionnaire.operatingHours] || 9;
    const equipUsageList = Array.isArray(questionnaire.equipmentUsed)
      ? questionnaire.equipmentUsed
      : ['Lighting', 'Fans', 'Air conditioner'];
    const acIntensity = questionnaire.majorEquipmentFrequency || 'Most operating hours';
    const businessType = questionnaire.businessType || 'Restaurant or café';
    const mainPriority = questionnaire.mainPriority || 'Reduce my monthly bill.';

    // Calculate bottom-up equipment kWh if Advanced Mode equipment rows are provided
    let totalEquipmentEstimatedKwh = 0;
    const equipmentByCategory = {
      cooling: 0,
      refrigeration: 0,
      lighting: 0,
      motors: 0,
      computing: 0,
      other: 0
    };

    const validatedEquipment = equipmentList.map((item) => {
      const calc = calculateEquipmentEnergy(item);
      const kwh = calc.valid ? calc.monthlyKwh : 0;
      totalEquipmentEstimatedKwh += kwh;
      const cat = item.category || 'other';
      if (equipmentByCategory[cat] !== undefined) {
        equipmentByCategory[cat] += kwh;
      } else {
        equipmentByCategory.other += kwh;
      }
      return { ...item, monthlyKwh: kwh, valid: calc.valid, validationError: calc.error };
    });

    const hasDetailedEquipment = totalEquipmentEstimatedKwh > 0 && equipmentList.length > 0;

    // Estimate category shares of totalBilledKwh (bounded & reconciled so shares never exceed 100%)
    let categoryBaselineKwh = {};
    let categoryDataProvenance = {};

    if (hasDetailedEquipment && totalBilledKwh > 0) {
      // Scale or map equipment estimates against billed total so we never exceed 100% of billed kWh
      const scaleFactor =
        totalEquipmentEstimatedKwh > totalBilledKwh
          ? totalBilledKwh / totalEquipmentEstimatedKwh
          : 1.0;
      Object.keys(equipmentByCategory).forEach((cat) => {
        categoryBaselineKwh[cat] = Math.round(equipmentByCategory[cat] * scaleFactor);
        categoryDataProvenance[cat] =
          scaleFactor < 1
            ? 'Entered equipment schedule (scaled to cap at 100% of billed kWh)'
            : 'Entered equipment schedule (kW × hours × days)';
      });
    } else {
      // Inferred category shares based on business type and selected equipment in Simple Mode
      const hasAC =
        equipUsageList.includes('Air conditioner') && acIntensity !== 'Not applicable' && acIntensity !== 'Rarely';
      const hasFridge = equipUsageList.includes('Refrigerator or freezer');
      const hasMotors = equipUsageList.includes('Motors or pumps');
      const hasComputers = equipUsageList.includes('Computers');
      const hasFans = equipUsageList.includes('Fans');

      const rawWeights = {
        cooling: hasAC ? (acIntensity === 'Almost continuously' ? 42 : acIntensity === 'Most operating hours' ? 34 : 18) : 0,
        refrigeration: hasFridge ? (businessType === 'Restaurant or café' ? 26 : 16) : 0,
        lighting: equipUsageList.includes('Lighting') ? (inferredDailyHours > 10 ? 20 : 15) : 8,
        motors: hasMotors ? (businessType === 'Workshop' ? 32 : 14) : 0,
        computing: hasComputers ? (businessType === 'Small office' ? 24 : 10) : 0,
        other: (hasFans ? 10 : 5) + 8
      };
      const weightSum = Object.values(rawWeights).reduce((a, b) => a + b, 0) || 100;
      Object.keys(rawWeights).forEach((cat) => {
        categoryBaselineKwh[cat] = Math.round((totalBilledKwh * rawWeights[cat]) / weightSum);
        categoryDataProvenance[cat] = 'Inferred from business type & questionnaire answers (not sub-metered)';
      });
    }

    // Apply What-If Simulator overrides
    const simHoursReductionPct = Number(simulator.operatingHoursReductionPct) || 0; // 0 to 30%
    const simInstallLed = simulator.installLed !== undefined ? Boolean(simulator.installLed) : true;
    const simOptimizeCooling = simulator.optimizeCooling !== undefined ? Boolean(simulator.optimizeCooling) : true;
    const simBudgetLimit =
      simulator.budgetLimitInr !== undefined && simulator.budgetLimitInr !== null && simulator.budgetLimitInr !== ''
        ? Number(simulator.budgetLimitInr)
        : null;
    const simTop3LowestCostOnly = Boolean(simulator.top3LowestCostOnly);

    // Build candidate recommendation definitions
    // IMPORTANT SAFEGUARD: Recommendations targeting the same category pool draw sequentially from that category's remaining kWh
    // and are subject to both a category cap and the global energy-savings cap.
    const candidateDefs = [
      {
        id: 'ac-setpoint-schedule',
        category: 'cooling',
        actionType: 'energy_reduction',
        title: 'Optimize Air-Conditioning Setpoint (24°C–25°C) & Operating Schedule',
        applicableWhen: () =>
          categoryBaselineKwh.cooling > 0 &&
          (equipUsageList.includes('Air conditioner') || hasDetailedEquipment) &&
          simOptimizeCooling,
        whyItApplies: `Your ${businessType.toLowerCase()} uses air conditioning (${acIntensity.toLowerCase()}), which is estimated to account for ~${categoryBaselineKwh.cooling} kWh/month.`,
        whatToDo:
          'Set split/window AC thermostats to 24°C–25°C instead of 18°C–20°C, use ceiling fans to circulate cool air, keep doors/curtains closed, and switch off ACs 30 minutes before closing.',
        defaultReductionPct: 16,
        defaultCostInr: 0,
        costRangeLabel: '₹0 (No-cost operational adjustment)',
        difficulty: 'Easy',
        confidence: hasDetailedEquipment ? 'Medium' : 'Low-Medium (Inferred load)'
      },
      {
        id: 'ac-filter-coil-maintenance',
        category: 'cooling',
        actionType: 'energy_reduction',
        title: 'Clean AC Filters Bi-Weekly & Service Condenser Coils',
        applicableWhen: () =>
          categoryBaselineKwh.cooling > 0 &&
          (equipUsageList.includes('Air conditioner') || hasDetailedEquipment) &&
          simOptimizeCooling,
        whyItApplies:
          'Dust-clogged filters and outdoor condenser coils in Indian commercial environments force AC compressors to run longer to achieve the same cooling.',
        whatToDo:
          'Wash indoor mesh filters every 2 weeks in-house and schedule a professional wet-service of condenser/evaporator coils before peak summer.',
        defaultReductionPct: 9,
        defaultCostInr: 1800,
        costRangeLabel: '₹1,200 – ₹2,500 (Professional service)',
        difficulty: 'Easy',
        confidence: 'Medium'
      },
      {
        id: 'led-lighting-upgrade',
        category: 'lighting',
        actionType: 'energy_reduction',
        title: 'Replace Older Fluorescent Tubes / Halogens with High-Efficacy LEDs & Task Zoning',
        applicableWhen: () =>
          categoryBaselineKwh.lighting > 0 &&
          (equipUsageList.includes('Lighting') || hasDetailedEquipment) &&
          simInstallLed,
        whyItApplies: `Lighting runs ~${inferredDailyHours} hours/day in your facility (~${categoryBaselineKwh.lighting} kWh/month estimated baseline).`,
        whatToDo:
          'Replace conventional T8/T12 fluorescent battens or CFLs with 18W–20W BIS-certified LED battens/downlights and wire display vs. back-office switches separately.',
        defaultReductionPct: 35,
        defaultCostInr: 4500,
        costRangeLabel: '₹3,000 – ₹6,500 (Depends on fixture count)',
        difficulty: 'Easy',
        confidence: 'High (Well-established wattage reduction)'
      },
      {
        id: 'refrigeration-gasket-coil-care',
        category: 'refrigeration',
        actionType: 'energy_reduction',
        title: 'Maintain Refrigerator Door Seals, Condenser Coils & Thermostat Settings',
        applicableWhen: () =>
          categoryBaselineKwh.refrigeration > 0 &&
          (equipUsageList.includes('Refrigerator or freezer') || hasDetailedEquipment),
        whyItApplies: `Commercial refrigerators/freezers run 24/7 and represent an estimated ~${categoryBaselineKwh.refrigeration} kWh/month of base load.`,
        whatToDo:
          'Vacuum rear/bottom condenser coils quarterly, ensure 10 cm wall clearance for heat rejection, check rubber door gaskets with the paper-slip test, and avoid placing warm food uncovered inside.',
        defaultReductionPct: 12,
        defaultCostInr: 1200,
        costRangeLabel: '₹500 – ₹2,000 (Cleaning & minor gasket repair)',
        difficulty: 'Easy',
        confidence: 'Medium'
      },
      {
        id: 'standby-and-unused-switch-off',
        category: 'other',
        actionType: 'energy_reduction',
        title: 'Eliminate Standby ("Vampire") Loads & Enforce End-of-Shift Switch-Off Checklist',
        applicableWhen: () => totalBilledKwh > 0,
        whyItApplies:
          'Display boards, water dispensers, POS systems, chargers, exhaust fans, and idle equipment left running during low-traffic or closed hours add avoidable base load.',
        whatToDo:
          'Install labeled master power strips for non-essential equipment, assign closing switch-off responsibility to staff, and turn off signage/water heaters outside active business hours.',
        defaultReductionPct: Math.min(40, 18 + Math.round(simHoursReductionPct * 0.8)),
        defaultCostInr: 800,
        costRangeLabel: '₹0 – ₹1,200 (Power strips & timer plugs)',
        difficulty: 'Easy',
        confidence: 'Medium'
      },
      {
        id: 'operating-schedule-optimization',
        category: 'all_non_refrigeration',
        actionType: 'energy_reduction',
        title: 'Stagger Startup & Trim Non-Essential Operating Hours',
        applicableWhen: () => totalBilledKwh > 0 && (inferredDailyHours >= 9 || simHoursReductionPct > 0),
        whyItApplies:
          simHoursReductionPct > 0
            ? `What-If Simulator set to trim effective equipment run-hours by ${simHoursReductionPct}%.`
            : `Operating ${questionnaire.operatingHours || '9–12 hours'} per day creates savings potential during opening setup and closing wind-down hours.`,
        whatToDo:
          'Turn on high-load HVAC and kitchen/workshop machinery only when customer/production activity begins rather than at door-unlock time.',
        defaultReductionPct: simHoursReductionPct > 0 ? Math.min(25, simHoursReductionPct) : 6,
        defaultCostInr: 0,
        costRangeLabel: '₹0 (Schedule discipline)',
        difficulty: 'Easy',
        confidence: 'Medium'
      },
      {
        id: 'motor-pump-preventive-efficiency',
        category: 'motors',
        actionType: 'energy_reduction',
        title: 'Preventive Maintenance & Idle Shut-Off for Motors, Pumps, or Compressors',
        applicableWhen: () =>
          categoryBaselineKwh.motors > 0 && (equipUsageList.includes('Motors or pumps') || hasDetailedEquipment),
        whyItApplies: `Motors, pumps, or workshop machines account for an estimated ~${categoryBaselineKwh.motors} kWh/month.`,
        whatToDo:
          'Fix air/water leaks, check belt tension and lubrication, avoid running motors unloaded between jobs, and evaluate energy-efficient IE3 motors only when existing units require rewinding.',
        defaultReductionPct: 14,
        defaultCostInr: 2500,
        costRangeLabel: '₹1,500 – ₹4,000 (Maintenance & float/timer switches)',
        difficulty: 'Medium',
        confidence: 'Medium'
      },
      {
        id: 'computing-power-management',
        category: 'computing',
        actionType: 'energy_reduction',
        title: 'Enable Automatic Sleep Mode on Computers, Copiers & Office Peripherals',
        applicableWhen: () =>
          categoryBaselineKwh.computing > 0 && (equipUsageList.includes('Computers') || hasDetailedEquipment),
        whyItApplies: `Computers and office equipment account for an estimated ~${categoryBaselineKwh.computing} kWh/month.`,
        whatToDo:
          'Configure monitors to sleep after 10 minutes of inactivity, set PCs to sleep after 20 minutes, and power down printers/copiers overnight.',
        defaultReductionPct: 20,
        defaultCostInr: 0,
        costRangeLabel: '₹0 (OS power settings)',
        difficulty: 'Easy',
        confidence: 'Medium'
      },
      {
        id: 'monthly-submeter-anomaly-tracking',
        category: 'tracking_advisory',
        actionType: 'advisory',
        title: 'Track Weekly Meter Readings & Investigate Unusual Consumption Spikes',
        applicableWhen: () => true,
        whyItApplies:
          'Regularly logging your meter reading every Monday morning catches faulty thermostats, refrigerant leaks, or billing errors before a full billing cycle elapses.',
        whatToDo:
          'Take a smartphone photo of your electricity meter kWh register once a week and compare weekly kWh against business volume. Check equipment efficiency ratings before any end-of-life replacement.',
        defaultReductionPct: 0,
        defaultCostInr: 0,
        costRangeLabel: '₹0 (Habit & logbook)',
        difficulty: 'Easy',
        confidence: 'High (Diagnostic best practice)'
      }
    ];

    // Track remaining kWh in each category pool to prevent double-counting within the same category
    const remainingPoolKwh = { ...categoryBaselineKwh };
    const categoryMaxCapFraction = 0.55; // No single category can lose more than 55% of its baseline
    const categorySavedSoFar = {
      cooling: 0,
      refrigeration: 0,
      lighting: 0,
      motors: 0,
      computing: 0,
      other: 0
    };

    const rawEnergyRecommendations = [];

    candidateDefs.forEach((def) => {
      if (!def.applicableWhen()) return;

      const userOverride = customAssumptions[def.id] || {};
      const reductionPct =
        userOverride.reductionPct !== undefined && userOverride.reductionPct !== null
          ? Math.min(Math.max(Number(userOverride.reductionPct), 0), 80)
          : def.defaultReductionPct;
      const implementationCost =
        userOverride.implementationCost !== undefined && userOverride.implementationCost !== null
          ? Math.max(0, Number(userOverride.implementationCost))
          : def.defaultCostInr;

      if (def.actionType === 'advisory') {
        rawEnergyRecommendations.push({
          id: def.id,
          title: def.title,
          category: def.category,
          actionType: 'advisory',
          whyItApplies: def.whyItApplies,
          whatToDo: def.whatToDo,
          baselineKwh: totalBilledKwh,
          reductionPct: 0,
          uncappedSavedKwh: 0,
          savedKwh: 0,
          capApplied: false,
          monthlySavingsInr: 0,
          annualSavingsInr: 0,
          implementationCostInr: implementationCost,
          costRangeLabel: def.costRangeLabel,
          paybackMonths: null,
          paybackLabel: 'Advisory / Diagnostic action (₹0 cost)',
          co2ReductionKgMonthly: 0,
          co2ReductionKgAnnual: 0,
          difficulty: def.difficulty,
          confidence: def.confidence,
          assumptions: [
            'Diagnostic & tracking habit — direct kWh savings are realized through early fault detection rather than claimed separately.'
          ]
        });
        return;
      }

      let poolBaseline = 0;
      let rawRequestedKwh = 0;

      if (def.category === 'all_non_refrigeration') {
        const eligibleCats = ['cooling', 'lighting', 'motors', 'computing', 'other'];
        poolBaseline = eligibleCats.reduce((acc, c) => acc + (remainingPoolKwh[c] || 0), 0);
        rawRequestedKwh = Math.round(poolBaseline * (reductionPct / 100));
        // Deduct proportionally from remaining pools
        if (poolBaseline > 0 && rawRequestedKwh > 0) {
          eligibleCats.forEach((c) => {
            const share = (remainingPoolKwh[c] || 0) / poolBaseline;
            const deduct = Math.min(remainingPoolKwh[c] || 0, Math.round(rawRequestedKwh * share));
            remainingPoolKwh[c] = Math.max(0, (remainingPoolKwh[c] || 0) - deduct);
            categorySavedSoFar[c] = (categorySavedSoFar[c] || 0) + deduct;
          });
        }
      } else {
        const cat = def.category;
        const catInitial = categoryBaselineKwh[cat] || 0;
        const catRemaining = remainingPoolKwh[cat] || 0;
        const maxAllowedForCat = Math.round(catInitial * categoryMaxCapFraction);
        const headroomInCat = Math.max(0, maxAllowedForCat - (categorySavedSoFar[cat] || 0));

        poolBaseline = catRemaining;
        const desiredKwh = Math.round(catRemaining * (reductionPct / 100));
        rawRequestedKwh = Math.min(desiredKwh, headroomInCat);

        remainingPoolKwh[cat] = Math.max(0, catRemaining - rawRequestedKwh);
        categorySavedSoFar[cat] = (categorySavedSoFar[cat] || 0) + rawRequestedKwh;
      }

      rawEnergyRecommendations.push({
        id: def.id,
        title: def.title,
        category: def.category,
        actionType: 'energy_reduction',
        whyItApplies: def.whyItApplies,
        whatToDo: def.whatToDo,
        baselineKwh: poolBaseline,
        reductionPct,
        uncappedSavedKwh: rawRequestedKwh,
        savedKwh: rawRequestedKwh, // Will be checked against overall bill cap next
        capApplied: false,
        implementationCostInr: implementationCost,
        costRangeLabel: def.costRangeLabel,
        difficulty: def.difficulty,
        confidence: def.confidence,
        provenance: categoryDataProvenance[def.category] || 'Inferred from bill & business profile'
      });
    });

    // Apply overall energy-saving kWh cap across all energy_reduction actions
    // Safeguard: "Apply a configurable overall cap to energy-saving actions so estimated reductions cannot exceed plausible usage."
    const maxTotalSavedKwh = Math.round(totalBilledKwh * norm.overallCapFraction);
    const sumUncappedSavedKwh = rawEnergyRecommendations
      .filter((r) => r.actionType === 'energy_reduction')
      .reduce((acc, r) => acc + r.uncappedSavedKwh, 0);

    const globalCapTriggered = sumUncappedSavedKwh > maxTotalSavedKwh && sumUncappedSavedKwh > 0;
    const globalScaleFactor = globalCapTriggered ? maxTotalSavedKwh / sumUncappedSavedKwh : 1.0;

    let finalizedRecommendations = rawEnergyRecommendations.map((rec) => {
      if (rec.actionType !== 'energy_reduction') return rec;

      const finalSavedKwh = Math.round(rec.uncappedSavedKwh * globalScaleFactor);
      const monthlySavingsInr = Math.round(finalSavedKwh * rate);
      const annualSavingsInr = monthlySavingsInr * 12;
      const payback = calculateSimplePayback(rec.implementationCostInr, monthlySavingsInr);
      const co2Monthly =
        norm.co2FactorKgPerKwh !== null ? Math.round(finalSavedKwh * norm.co2FactorKgPerKwh * 10) / 10 : null;
      const co2Annual = co2Monthly !== null ? Math.round(co2Monthly * 12 * 10) / 10 : null;

      const assumptions = [
        `Category baseline available: ${rec.baselineKwh} kWh/mo (${rec.provenance}).`,
        `Assumed achievable reduction: ${rec.reductionPct}% of remaining category load.`,
        `Valued at ${norm.rateLabel}.`
      ];
      if (globalCapTriggered || rec.savedKwh < Math.round(rec.baselineKwh * (rec.reductionPct / 100))) {
        assumptions.push(
          `Double-counting & plausibility safeguard applied (capped at ${(norm.overallCapFraction * 100).toFixed(0)}% max total bill kWh reduction).`
        );
      }

      return {
        ...rec,
        savedKwh: finalSavedKwh,
        capApplied: globalCapTriggered,
        monthlySavingsInr,
        annualSavingsInr,
        paybackMonths: payback.months,
        paybackLabel: payback.label,
        co2ReductionKgMonthly: co2Monthly,
        co2ReductionKgAnnual: co2Annual,
        assumptions
      };
    });

    // Evaluate Time-of-Day shifting recommendation (EXEMPT from energy-saving kWh cap!)
    const todAnalysis = evaluateTimeOfDayShifting(rawBill, rawTariff, questionnaire, simulator);

    if (todAnalysis.rewardingTariff && todAnalysis.estimatedMonthlyBillSavings > 0) {
      const todOverride = customAssumptions['tod-load-shifting'] || {};
      const todCost =
        todOverride.implementationCost !== undefined ? Math.max(0, Number(todOverride.implementationCost)) : 500;
      const todPayback = calculateSimplePayback(todCost, todAnalysis.estimatedMonthlyBillSavings);

      finalizedRecommendations.push({
        id: 'tod-load-shifting',
        title: 'Shift Flexible Electricity Loads from Peak to Off-Peak / Normal Tariff Hours',
        category: 'time_of_day',
        actionType: 'time_shifting', // Explicitly distinct from energy_reduction
        whyItApplies: `Your tariff rewards off-peak usage with a ₹${todAnalysis.rateDifferential.toFixed(2)}/kWh differential, and you indicated flexible load shifting is "${questionnaire.canShiftUsage || 'Possible'}".`,
        whatToDo: `Reschedule ~${todAnalysis.shiftableKwh} kWh/month of non-time-critical activities (water heating, batch prep, pumping, charging) outside Peak windows (${todAnalysis.peakWindowsLabel}).`,
        baselineKwh: todAnalysis.estimatedPeakKwh,
        reductionPct: 0,
        uncappedSavedKwh: 0,
        savedKwh: 0, // Safeguard: Shifting usage changes timing, NOT total kWh consumed!
        shiftedKwh: todAnalysis.shiftableKwh,
        capApplied: false,
        monthlySavingsInr: todAnalysis.estimatedMonthlyBillSavings,
        annualSavingsInr: todAnalysis.estimatedAnnualBillSavings,
        implementationCostInr: todCost,
        costRangeLabel: '₹0 – ₹1,500 (Timer switches or schedule shift)',
        paybackMonths: todPayback.months,
        paybackLabel: todPayback.label,
        co2ReductionKgMonthly: 0,
        co2ReductionKgAnnual: 0,
        difficulty: 'Medium',
        confidence: 'Medium (Depends on operational flexibility)',
        assumptions: todAnalysis.assumptions
      });
    }

    // Score & Rank recommendations transparently
    // Criteria: expected monthly savings, low implementation cost, fast payback, feasibility (difficulty), confidence, and alignment with user's mainPriority
    finalizedRecommendations = finalizedRecommendations.map((rec) => {
      let score = 0;
      // Savings weight (up to 45 pts)
      score += Math.min(45, (rec.monthlySavingsInr / Math.max(1, totalBillAmount * 0.1)) * 20);
      // Low-cost prioritization for small businesses (up to 25 pts)
      if (rec.implementationCostInr === 0) score += 25;
      else if (rec.implementationCostInr <= 1500) score += 20;
      else if (rec.implementationCostInr <= 5000) score += 12;
      else score += 4;
      // Fast payback (up to 15 pts)
      if (rec.paybackMonths !== null) {
        if (rec.paybackMonths <= 1) score += 15;
        else if (rec.paybackMonths <= 6) score += 12;
        else if (rec.paybackMonths <= 12) score += 8;
        else score += 3;
      }
      // Feasibility & confidence (up to 15 pts)
      if (rec.difficulty === 'Easy') score += 8;
      else if (rec.difficulty === 'Medium') score += 4;
      if (String(rec.confidence).startsWith('High')) score += 7;
      else if (String(rec.confidence).startsWith('Medium')) score += 4;

      // Priority alignment boost
      if (mainPriority === 'Find low-cost improvements.' && rec.implementationCostInr <= 1500) {
        score += 12;
      } else if (mainPriority === 'Reduce peak-time electricity usage.' && rec.actionType === 'time_shifting') {
        score += 18;
      } else if (mainPriority === 'Understand my electricity usage.' && rec.actionType === 'advisory') {
        score += 15;
      }

      // Advisory actions without direct rupee savings stay included at the bottom unless priority is understanding usage
      if (rec.actionType === 'advisory' && mainPriority !== 'Understand my electricity usage.') {
        score = Math.min(score, 18);
      }

      const priorityLevel = score >= 55 ? 'High' : score >= 30 ? 'Medium' : 'Low';
      return { ...rec, priorityScore: Math.round(score * 10) / 10, priority: priorityLevel };
    });

    // Sort descending by priorityScore, then by monthlySavingsInr descending
    finalizedRecommendations.sort((a, b) => {
      if (b.priorityScore !== a.priorityScore) return b.priorityScore - a.priorityScore;
      return b.monthlySavingsInr - a.monthlySavingsInr;
    });

    // Apply What-If Simulator filters (e.g., Top 3 lowest-cost actions only, or Budget cap)
    if (simTop3LowestCostOnly) {
      const sortedByCost = [...finalizedRecommendations]
        .filter((r) => r.monthlySavingsInr > 0)
        .sort((a, b) => a.implementationCostInr - b.implementationCostInr || b.monthlySavingsInr - a.monthlySavingsInr);
      const allowedIds = new Set(sortedByCost.slice(0, 3).map((r) => r.id));
      finalizedRecommendations = finalizedRecommendations.map((r) => ({
        ...r,
        includedInScenario: allowedIds.has(r.id)
      }));
    } else if (simBudgetLimit !== null && !Number.isNaN(simBudgetLimit) && simBudgetLimit >= 0) {
      let runningBudget = 0;
      finalizedRecommendations = finalizedRecommendations.map((r) => {
        if (r.monthlySavingsInr <= 0 && r.actionType === 'advisory') {
          return { ...r, includedInScenario: true };
        }
        if (runningBudget + r.implementationCostInr <= simBudgetLimit) {
          runningBudget += r.implementationCostInr;
          return { ...r, includedInScenario: true };
        }
        return { ...r, includedInScenario: false };
      });
    } else {
      finalizedRecommendations = finalizedRecommendations.map((r) => ({
        ...r,
        includedInScenario: true
      }));
    }

    // Assign rank numbers (1..N)
    finalizedRecommendations = finalizedRecommendations.map((r, idx) => ({
      ...r,
      rank: idx + 1
    }));

    // Aggregate Scenario Summary (only for actions includedInScenario)
    const activeRecs = finalizedRecommendations.filter((r) => r.includedInScenario);
    const totalEnergySavedKwh = activeRecs
      .filter((r) => r.actionType === 'energy_reduction')
      .reduce((acc, r) => acc + r.savedKwh, 0);

    const energyReductionRupeeSavings = activeRecs
      .filter((r) => r.actionType === 'energy_reduction')
      .reduce((acc, r) => acc + r.monthlySavingsInr, 0);

    const timeShiftingRupeeSavings = activeRecs
      .filter((r) => r.actionType === 'time_shifting')
      .reduce((acc, r) => acc + r.monthlySavingsInr, 0);

    // Ensure total rupee savings never exceed variable energy charges (or 75% of total bill if energy charges unknown)
    const maxPlausibleRupeeSavings =
      norm.energyCharges !== null && norm.energyCharges > 0
        ? Math.round(norm.energyCharges * 0.75)
        : Math.round(totalBillAmount * 0.65);

    const rawMonthlyBillSavings = energyReductionRupeeSavings + timeShiftingRupeeSavings;
    const totalMonthlyBillSavings =
      totalBillAmount > 0 ? Math.min(rawMonthlyBillSavings, maxPlausibleRupeeSavings) : 0;
    const totalAnnualBillSavings = totalMonthlyBillSavings * 12;

    const totalImplementationCost = activeRecs.reduce((acc, r) => acc + r.implementationCostInr, 0);
    const portfolioPayback = calculateSimplePayback(totalImplementationCost, totalMonthlyBillSavings);

    const totalCo2MonthlyKg =
      norm.co2FactorKgPerKwh !== null
        ? Math.round(totalEnergySavedKwh * norm.co2FactorKgPerKwh * 10) / 10
        : null;
    const totalCo2AnnualKg =
      totalCo2MonthlyKg !== null ? Math.round(totalCo2MonthlyKg * 12 * 10) / 10 : null;

    const estimatedBillAfterChanges = Math.max(0, totalBillAmount - totalMonthlyBillSavings);
    const estimatedKwhAfterChanges = Math.max(0, totalBilledKwh - totalEnergySavedKwh);

    const highestPriorityAction =
      activeRecs.find((r) => r.monthlySavingsInr > 0) || finalizedRecommendations[0] || null;

    return {
      validation,
      summary: {
        totalBillAmount,
        totalBilledKwh,
        effectiveRatePerKwh:
          norm.effectiveRatePerKwh !== null ? Math.round(norm.effectiveRatePerKwh * 100) / 100 : null,
        applicableRatePerKwh:
          norm.applicableRatePerKwh !== null ? Math.round(norm.applicableRatePerKwh * 100) / 100 : null,
        rateType: norm.rateType,
        rateLabel: norm.rateLabel,
        estimatedMonthlySavingsInr: totalMonthlyBillSavings,
        estimatedAnnualSavingsInr: totalAnnualBillSavings,
        energyReductionRupeeSavings,
        timeShiftingRupeeSavings,
        estimatedEnergySavedKwh: totalEnergySavedKwh,
        estimatedEnergySavedPercent:
          totalBilledKwh > 0 ? Math.round((totalEnergySavedKwh / totalBilledKwh) * 1000) / 10 : 0,
        estimatedBillAfterInr: estimatedBillAfterChanges,
        estimatedKwhAfter: estimatedKwhAfterChanges,
        totalImplementationCostInr: totalImplementationCost,
        portfolioPaybackMonths: portfolioPayback.months,
        portfolioPaybackLabel: portfolioPayback.label,
        co2MonthlyKg: totalCo2MonthlyKg,
        co2AnnualKg: totalCo2AnnualKg,
        co2FactorMeta: norm.co2FactorMeta,
        globalCapTriggered,
        overallCapPercent: Math.round(norm.overallCapFraction * 100),
        recommendationsCount: finalizedRecommendations.length,
        activeRecommendationsCount: activeRecs.length,
        highestPriorityAction
      },
      categoryBreakdown: {
        baselineKwh: categoryBaselineKwh,
        provenance: categoryDataProvenance,
        hasDetailedEquipment,
        validatedEquipment
      },
      todAnalysis,
      recommendations: finalizedRecommendations
    };
  }

  /**
   * Aggregate multiple meters without double-counting duplicate meter IDs or consumer numbers
   */
  function aggregateMeters(meters = []) {
    if (!Array.isArray(meters) || meters.length === 0) {
      return {
        meterCount: 0,
        uniqueMeters: [],
        duplicateWarnings: [],
        totalBilledKwh: 0,
        totalBillAmountInr: 0,
        totalMonthlySavingsInr: 0,
        totalAnnualSavingsInr: 0,
        totalEnergySavedKwh: 0,
        totalImplementationCostInr: 0
      };
    }

    const seenKeys = new Set();
    const uniqueMeters = [];
    const duplicateWarnings = [];

    meters.forEach((m) => {
      if (!m || typeof m !== 'object') return;
      const dedupeKey = `${String(m.consumerNumber || m.id || '').trim().toLowerCase()}__${String(
        m.billingPeriod || ''
      )
        .trim()
        .toLowerCase()}`;

      if (m.consumerNumber && m.consumerNumber !== 'Not available' && seenKeys.has(dedupeKey)) {
        duplicateWarnings.push(
          `Duplicate meter/billing period skipped to prevent double-counting: ${m.meterName || m.consumerNumber} (${
            m.billingPeriod || 'Same period'
          })`
        );
        return;
      }
      if (m.consumerNumber && m.consumerNumber !== 'Not available') {
        seenKeys.add(dedupeKey);
      }
      uniqueMeters.push(m);
    });

    let totalBilledKwh = 0;
    let totalBillAmountInr = 0;
    let totalMonthlySavingsInr = 0;
    let totalAnnualSavingsInr = 0;
    let totalEnergySavedKwh = 0;
    let totalImplementationCostInr = 0;

    const evaluatedMeters = uniqueMeters.map((m) => {
      const plan = generateSavingsPlan(m.state);
      totalBilledKwh += plan.summary.totalBilledKwh;
      totalBillAmountInr += plan.summary.totalBillAmount;
      totalMonthlySavingsInr += plan.summary.estimatedMonthlySavingsInr;
      totalAnnualSavingsInr += plan.summary.estimatedAnnualSavingsInr;
      totalEnergySavedKwh += plan.summary.estimatedEnergySavedKwh;
      totalImplementationCostInr += plan.summary.totalImplementationCostInr;
      return {
        ...m,
        plan
      };
    });

    return {
      meterCount: evaluatedMeters.length,
      uniqueMeters: evaluatedMeters,
      duplicateWarnings,
      totalBilledKwh,
      totalBillAmountInr,
      totalMonthlySavingsInr,
      totalAnnualSavingsInr,
      totalEnergySavedKwh,
      totalImplementationCostInr
    };
  }

  /**
   * Generate safe CSV report string from a savings plan & state
   */
  function generateCsvReport(state = {}, planResult = null, options = { redactSensitive: true }) {
    const plan = planResult || generateSavingsPlan(state);
    const bill = state.bill || {};
    const q = state.questionnaire || {};
    const redact = options && options.redactSensitive !== false;

    const consumerIdDisplay = redact
      ? '[Redacted for Privacy]'
      : bill.consumerNumber || 'Not available';

    const rows = [
      ['Bill-to-Savings — Electricity Cost Optimization Report'],
      ['Data Notice', state.isDemoData ? 'Fictional demo data — not an official electricity bill.' : 'User-entered / reviewed bill data — estimates only, not a guaranteed reduction.'],
      [],
      ['SECTION 1: BUSINESS & BILL SUMMARY'],
      ['Business Name', bill.businessName || 'Not available'],
      ['Consumer / Account ID', consumerIdDisplay],
      ['Electricity Provider', bill.provider || 'Not available'],
      ['Tariff Category', bill.tariffCategory || 'Not available'],
      ['Billing Period', bill.billingPeriod || 'Not available'],
      ['Billed Consumption (kWh)', plan.summary.totalBilledKwh],
      ['Total Bill Amount (INR)', plan.summary.totalBillAmount],
      ['Approximate Effective Rate (INR/kWh)', plan.summary.effectiveRatePerKwh !== null ? plan.summary.effectiveRatePerKwh : 'Not available'],
      ['Applicable Rate Used for Calculations', plan.summary.rateLabel],
      ['Estimated Monthly Savings Opportunity (INR)', plan.summary.estimatedMonthlySavingsInr],
      ['Estimated Annualized Savings Opportunity (INR)', plan.summary.estimatedAnnualSavingsInr],
      ['Estimated Monthly Energy Reduction (kWh)', plan.summary.estimatedEnergySavedKwh],
      ['Estimated Monthly Bill Savings from Load Shifting (INR)', plan.summary.timeShiftingRupeeSavings],
      ['Total Implementation Investment (INR)', plan.summary.totalImplementationCostInr],
      ['Estimated Portfolio Payback', plan.summary.portfolioPaybackLabel],
      ['Estimated Monthly CO2 Reduction (kg)', plan.summary.co2MonthlyKg !== null ? plan.summary.co2MonthlyKg : 'Not available'],
      ['CO2 Emissions Factor Label', plan.summary.co2FactorMeta.label],
      [],
      ['SECTION 2: QUESTIONNAIRE ANSWERS'],
      ['1. Business Type', q.businessType || 'Not answered'],
      ['2. Operating Hours', q.operatingHours || 'Not answered'],
      ['3. Equipment Commonly Used', Array.isArray(q.equipmentUsed) ? q.equipmentUsed.join('; ') : 'Not answered'],
      ['4. Major Equipment Usage Frequency', q.majorEquipmentFrequency || 'Not answered'],
      ['5. Can Shift Electricity Usage to Another Time', q.canShiftUsage || 'Not answered'],
      ['6. Main Priority', q.mainPriority || 'Not answered'],
      [],
      ['SECTION 3: RANKED RECOMMENDATIONS'],
      [
        'Rank',
        'Priority',
        'Action Title',
        'Type',
        'Included in Scenario',
        'Estimated Saved kWh/mo',
        'Estimated Shifted kWh/mo',
        'Estimated Monthly Savings (INR)',
        'Estimated Annualized Savings (INR)',
        'Implementation Cost (INR)',
        'Cost Range',
        'Estimated Payback',
        'Difficulty',
        'Confidence',
        'Why It Applies',
        'What To Do',
        'Assumptions'
      ]
    ];

    plan.recommendations.forEach((r) => {
      rows.push([
        r.rank,
        r.priority,
        r.title,
        r.actionType,
        r.includedInScenario ? 'Yes' : 'No',
        r.savedKwh || 0,
        r.shiftedKwh || 0,
        r.monthlySavingsInr,
        r.annualSavingsInr,
        r.implementationCostInr,
        r.costRangeLabel,
        r.paybackLabel,
        r.difficulty,
        r.confidence,
        r.whyItApplies,
        r.whatToDo,
        (r.assumptions || []).join(' | ')
      ]);
    });

    return rows.map((row) => row.map((cell) => sanitizeCsvCell(cell)).join(',')).join('\n');
  }

  return {
    ALLOWED_FILE_TYPES,
    MAX_FILE_SIZE_BYTES,
    validateBillUpload,
    sanitizeCsvCell,
    escapeHtml,
    validateAndNormalizeInputs,
    calculateEquipmentEnergy,
    calculateSimplePayback,
    evaluateTimeOfDayShifting,
    generateSavingsPlan,
    aggregateMeters,
    generateCsvReport
  };
});
