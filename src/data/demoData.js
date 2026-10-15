/**
 * Bill-to-Savings — Fictional Demo Data & Sample Bills
 * All figures are internally mathematically consistent and explicitly labelled:
 * "Fictional demo data — not an official electricity bill."
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.BillToSavingsDemoData = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const DEMO_NOTICE = 'Fictional demo data — not an official electricity bill.';

  // Primary sample business in Chennai, Tamil Nadu
  const primaryDemoMeter = {
    id: 'meter-tn-cafe-01',
    meterName: 'Main Café & Bakery Meter (Ground Floor)',
    isDemoData: true,
    demoNotice: DEMO_NOTICE,
    bill: {
      provider: 'Tamil Nadu Commercial Distribution Demo Utility (Fictional Sample)',
      consumerNumber: 'DEMO-09-248-1104-X',
      businessName: 'Sri Murugan Café & Filter Coffee House (Fictional Demo)',
      tariffCategory: 'LT Commercial Demo Tariff (Fictional — Not Official TANGEDCO/TNPDCL)',
      billingPeriod: '01 Sep 2026 to 30 Sep 2026 (30 Days)',
      unitsConsumedKwh: 2400,
      energyCharges: 20400, // 2,400 kWh * ₹8.50/kWh = ₹20,400
      fixedCharges: 1800, // 12 kW sanctioned load * ₹150/kW = ₹1,800
      taxesAndDuties: 1020, // 5% electricity tax on energy charges = ₹1,020
      otherCharges: 180, // Meter rent & power factor surcharge adjustment = ₹180
      totalBillAmount: 23400, // 20,400 + 1,800 + 1,020 + 180 = ₹23,400 (Effective rate = ₹9.75/kWh)
      todConsumptionAvailable: true,
      peakConsumptionKwh: 720, // 30% during peak hours
      offPeakConsumptionKwh: 480, // 20% during night/off-peak hours
      normalConsumptionKwh: 1200, // 50% during daytime normal hours
      fieldStatus: {
        provider: 'verified',
        consumerNumber: 'verified',
        businessName: 'verified',
        tariffCategory: 'uncertain',
        billingPeriod: 'verified',
        unitsConsumedKwh: 'verified',
        energyCharges: 'verified',
        fixedCharges: 'verified',
        taxesAndDuties: 'verified',
        otherCharges: 'uncertain',
        totalBillAmount: 'verified',
        peakConsumptionKwh: 'uncertain',
        offPeakConsumptionKwh: 'uncertain'
      }
    },
    tariff: {
      isOfficialVerified: false,
      tariffName: 'Fictional Tamil Nadu Commercial Demo Tariff (Editable Assumption)',
      marginalRatePerKwh: 8.5,
      todSupported: true,
      peakRatePerKwh: 10.2, // Demo assumption: +20% peak rate
      offPeakRatePerKwh: 7.65, // Demo assumption: -10% night/off-peak rate
      peakWindowsLabel: '06:00–10:00 & 18:00–22:00 (Fictional Demo Assumption)',
      offPeakWindowsLabel: '22:00–06:00 (Fictional Demo Assumption)'
    },
    questionnaire: {
      businessType: 'Restaurant or café',
      operatingHours: '9–12 hours',
      equipmentUsed: [
        'Air conditioner',
        'Refrigerator or freezer',
        'Fans',
        'Lighting',
        'Computers',
        'Motors or pumps'
      ],
      majorEquipmentFrequency: 'Most operating hours',
      canShiftUsage: 'Yes',
      mainPriority: 'Reduce my monthly bill.'
    },
    equipment: [
      {
        id: 'eq-1',
        name: 'Split Air Conditioners (1.5 Ton Non-Inverter)',
        category: 'cooling',
        powerKw: 1.6,
        quantity: 2,
        hoursPerDay: 9,
        daysPerMonth: 30,
        dutyCycle: 0.75 // 1.6 * 2 * 9 * 30 * 0.75 = 648 kWh/mo
      },
      {
        id: 'eq-2',
        name: 'Commercial Reach-In Chiller & Pastry Display Freezer',
        category: 'refrigeration',
        powerKw: 0.65,
        quantity: 2,
        hoursPerDay: 24,
        daysPerMonth: 30,
        dutyCycle: 0.65 // 0.65 * 2 * 24 * 30 * 0.65 = 608.4 kWh/mo
      },
      {
        id: 'eq-3',
        name: '36W Conventional Fluorescent Tube Battens & Signage',
        category: 'lighting',
        powerKw: 0.04,
        quantity: 28,
        hoursPerDay: 11,
        daysPerMonth: 30,
        dutyCycle: 1.0 // 0.04 * 28 * 11 * 30 = 369.6 kWh/mo
      },
      {
        id: 'eq-4',
        name: 'Commercial Wet Grinder, Dough Kneader & Water Pump',
        category: 'motors',
        powerKw: 1.5,
        quantity: 2,
        hoursPerDay: 4.5,
        daysPerMonth: 30,
        dutyCycle: 0.8 // 1.5 * 2 * 4.5 * 30 * 0.8 = 324 kWh/mo
      },
      {
        id: 'eq-5',
        name: 'POS Billing Terminal, CCTV DVR & Office PC',
        category: 'computing',
        powerKw: 0.18,
        quantity: 2,
        hoursPerDay: 12,
        daysPerMonth: 30,
        dutyCycle: 1.0 // 0.18 * 2 * 12 * 30 = 129.6 kWh/mo
      },
      {
        id: 'eq-6',
        name: 'Ceiling Fans, Exhaust Blowers & Coffee Urn Standby',
        category: 'other',
        powerKw: 0.95,
        quantity: 1,
        hoursPerDay: 11.2,
        daysPerMonth: 30,
        dutyCycle: 1.0 // ~319.2 kWh/mo -> Total equipment = ~2,398.8 kWh (~2,400 kWh)
      }
    ],
    actionAssumptions: {},
    simulator: {
      operatingHoursReductionPct: 0,
      installLed: true,
      optimizeCooling: true,
      enableLoadShifting: true,
      loadShiftPercentOfPeak: 30,
      budgetLimitInr: null,
      top3LowestCostOnly: false
    },
    config: {
      overallSavingsCapPercent: 45,
      co2FactorKgPerKwh: 0.716,
      co2FactorVerified: false,
      co2FactorSourceLabel:
        'Demo assumption: 0.716 kg CO₂/kWh (Reference assumption based on CEA India Grid weighted average — not an official project audit factor)'
    }
  };

  // Secondary sample meter for Advanced Mode multi-meter portfolio testing
  const secondaryDemoMeter = {
    id: 'meter-tn-cafe-02',
    meterName: 'First Floor Prep Kitchen & Cold Storage Meter',
    isDemoData: true,
    demoNotice: DEMO_NOTICE,
    bill: {
      provider: 'Tamil Nadu Commercial Distribution Demo Utility (Fictional Sample)',
      consumerNumber: 'DEMO-09-248-1105-Y',
      businessName: 'Sri Murugan Café — Annex Prep Kitchen (Fictional Demo)',
      tariffCategory: 'LT Commercial Demo Tariff (Fictional — Not Official TANGEDCO/TNPDCL)',
      billingPeriod: '01 Sep 2026 to 30 Sep 2026 (30 Days)',
      unitsConsumedKwh: 1100,
      energyCharges: 9350, // 1,100 * 8.50
      fixedCharges: 900,
      taxesAndDuties: 468,
      otherCharges: 82,
      totalBillAmount: 10800, // 9350 + 900 + 468 + 82 = 10,800
      todConsumptionAvailable: true,
      peakConsumptionKwh: 330,
      offPeakConsumptionKwh: 220,
      normalConsumptionKwh: 550,
      fieldStatus: {
        provider: 'verified',
        consumerNumber: 'verified',
        businessName: 'verified',
        tariffCategory: 'uncertain',
        billingPeriod: 'verified',
        unitsConsumedKwh: 'verified',
        energyCharges: 'verified',
        fixedCharges: 'verified',
        taxesAndDuties: 'verified',
        otherCharges: 'verified',
        totalBillAmount: 'verified',
        peakConsumptionKwh: 'uncertain',
        offPeakConsumptionKwh: 'uncertain'
      }
    },
    tariff: {
      isOfficialVerified: false,
      tariffName: 'Fictional Tamil Nadu Commercial Demo Tariff (Editable Assumption)',
      marginalRatePerKwh: 8.5,
      todSupported: true,
      peakRatePerKwh: 10.2,
      offPeakRatePerKwh: 7.65,
      peakWindowsLabel: '06:00–10:00 & 18:00–22:00 (Fictional Demo Assumption)',
      offPeakWindowsLabel: '22:00–06:00 (Fictional Demo Assumption)'
    },
    questionnaire: {
      businessType: 'Restaurant or café',
      operatingHours: '9–12 hours',
      equipmentUsed: ['Refrigerator or freezer', 'Fans', 'Lighting', 'Motors or pumps'],
      majorEquipmentFrequency: 'Most operating hours',
      canShiftUsage: 'Yes',
      mainPriority: 'Reduce my monthly bill.'
    },
    equipment: [],
    actionAssumptions: {},
    simulator: {
      operatingHoursReductionPct: 0,
      installLed: true,
      optimizeCooling: true,
      enableLoadShifting: true,
      loadShiftPercentOfPeak: 30,
      budgetLimitInr: null,
      top3LowestCostOnly: false
    },
    config: {
      overallSavingsCapPercent: 45,
      co2FactorKgPerKwh: 0.716,
      co2FactorVerified: false,
      co2FactorSourceLabel:
        'Demo assumption: 0.716 kg CO₂/kWh (Reference assumption — not an official project audit factor)'
    }
  };

  // Additional preset profiles for quick testing (Retail Shop, Salon, Small Office, Workshop)
  const businessPresets = {
    cafe: primaryDemoMeter,
    retail: {
      ...JSON.parse(JSON.stringify(primaryDemoMeter)),
      id: 'preset-retail',
      meterName: 'Kaveri Textiles & Garments (Fictional Retail Demo)',
      bill: {
        ...primaryDemoMeter.bill,
        consumerNumber: 'DEMO-04-112-8890-R',
        businessName: 'Kaveri Textiles & Readymades (Fictional Demo)',
        unitsConsumedKwh: 1500,
        energyCharges: 12750,
        fixedCharges: 1200,
        taxesAndDuties: 638,
        otherCharges: 112,
        totalBillAmount: 14700,
        peakConsumptionKwh: 520,
        offPeakConsumptionKwh: 180,
        normalConsumptionKwh: 800
      },
      questionnaire: {
        businessType: 'Retail shop',
        operatingHours: '9–12 hours',
        equipmentUsed: ['Air conditioner', 'Fans', 'Lighting', 'Computers'],
        majorEquipmentFrequency: 'Most operating hours',
        canShiftUsage: 'No',
        mainPriority: 'Find low-cost improvements.'
      },
      equipment: []
    },
    workshop: {
      ...JSON.parse(JSON.stringify(primaryDemoMeter)),
      id: 'preset-workshop',
      meterName: 'Guindy Precision Fabrication Works (Fictional Workshop Demo)',
      bill: {
        ...primaryDemoMeter.bill,
        consumerNumber: 'DEMO-07-554-3321-W',
        businessName: 'Guindy Precision Fabrication Works (Fictional Demo)',
        unitsConsumedKwh: 3800,
        energyCharges: 30400,
        fixedCharges: 3200,
        taxesAndDuties: 1520,
        otherCharges: 280,
        totalBillAmount: 35400,
        peakConsumptionKwh: 1140,
        offPeakConsumptionKwh: 760,
        normalConsumptionKwh: 1900
      },
      questionnaire: {
        businessType: 'Workshop',
        operatingHours: '9–12 hours',
        equipmentUsed: ['Fans', 'Lighting', 'Computers', 'Motors or pumps'],
        majorEquipmentFrequency: 'Most operating hours',
        canShiftUsage: 'Yes',
        mainPriority: 'Reduce peak-time electricity usage.'
      },
      equipment: []
    }
  };

  return {
    DEMO_NOTICE,
    primaryDemoMeter,
    secondaryDemoMeter,
    businessPresets
  };
});
