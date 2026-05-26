/** Shared LOINC Observation builders for seed/backfill scripts. */

export const LOINC = {
  heartRate: '8867-4',
  oxygenSaturation: '59408-5',
  bodyWeight: '29463-7',
  bloodPressurePanel: '55284-4',
  systolicBloodPressure: '8480-6',
  diastolicBloodPressure: '8462-4',
  bloodGlucose: '15074-8',
  ldlCholesterol: '13457-7',
  hdlCholesterol: '2085-9',
  triglycerides: '2571-8',
  wbcCount: '6690-2',
  egfr: '62238-1',
  stepCount: '55423-8',
  sleepDuration: '93832-4',
};

export const LOINC_DISPLAY = {
  [LOINC.heartRate]: 'Heart rate',
  [LOINC.oxygenSaturation]: 'Oxygen saturation in Arterial blood by Pulse oximetry',
  [LOINC.bodyWeight]: 'Body weight',
  [LOINC.bloodPressurePanel]: 'Blood pressure panel with all children optional',
  [LOINC.systolicBloodPressure]: 'Systolic blood pressure',
  [LOINC.diastolicBloodPressure]: 'Diastolic blood pressure',
  [LOINC.bloodGlucose]: 'Glucose [Mass/volume] in Blood',
  [LOINC.ldlCholesterol]: 'Cholesterol in LDL [Mass/volume] in Serum or Plasma',
  [LOINC.hdlCholesterol]: 'Cholesterol in HDL [Mass/volume] in Serum or Plasma',
  [LOINC.triglycerides]: 'Triglyceride [Mass/volume] in Serum or Plasma',
  [LOINC.wbcCount]: 'Leukocytes [#/volume] in Blood by Automated count',
  [LOINC.egfr]:
    'Glomerular filtration rate/1.73 sq M.predicted [Volume Rate/Area] in Serum, Plasma or Blood by Creatinine-based formula (CKD-EPI)',
  [LOINC.stepCount]: 'Number of steps in 24 hour Measured',
  [LOINC.sleepDuration]: 'Sleep duration',
};

function loincCoding(code) {
  return [{ system: 'http://loinc.org', code, display: LOINC_DISPLAY[code] }];
}

export function vitalCategory() {
  return [
    {
      coding: [
        {
          system: 'http://terminology.hl7.org/CodeSystem/observation-category',
          code: 'vital-signs',
          display: 'Vital Signs',
        },
      ],
    },
  ];
}

export function labCategory() {
  return [
    {
      coding: [
        {
          system: 'http://terminology.hl7.org/CodeSystem/observation-category',
          code: 'laboratory',
          display: 'Laboratory',
        },
      ],
    },
  ];
}

export function activityCategory() {
  return [
    {
      coding: [
        {
          system: 'http://terminology.hl7.org/CodeSystem/observation-category',
          code: 'activity',
          display: 'Activity',
        },
      ],
    },
  ];
}

export function stepCountObservation(patientId, effectiveDateTime, steps) {
  return {
    resourceType: 'Observation',
    status: 'final',
    category: activityCategory(),
    code: {
      coding: loincCoding(LOINC.stepCount),
      text: 'Step count',
    },
    subject: { reference: `Patient/${patientId}` },
    effectiveDateTime,
    valueQuantity: {
      value: steps,
      unit: 'steps',
      system: 'http://unitsofmeasure.org',
      code: '{steps}',
    },
  };
}

export function sleepDurationObservation(patientId, effectiveDateTime, hours) {
  return {
    resourceType: 'Observation',
    status: 'final',
    category: activityCategory(),
    code: {
      coding: loincCoding(LOINC.sleepDuration),
      text: 'Sleep duration',
    },
    subject: { reference: `Patient/${patientId}` },
    effectiveDateTime,
    valueQuantity: {
      value: hours,
      unit: 'h',
      system: 'http://unitsofmeasure.org',
      code: 'h',
    },
  };
}

export function lipidObservation(patientId, effectiveDateTime, code, value, unit = 'mg/dL') {
  return {
    resourceType: 'Observation',
    status: 'final',
    category: labCategory(),
    code: {
      coding: loincCoding(code),
      text:
        code === LOINC.ldlCholesterol
          ? 'LDL cholesterol'
          : code === LOINC.hdlCholesterol
            ? 'HDL cholesterol'
            : 'Triglycerides',
    },
    subject: { reference: `Patient/${patientId}` },
    effectiveDateTime,
    valueQuantity: {
      value,
      unit,
      system: 'http://unitsofmeasure.org',
      code: unit,
    },
  };
}

export function heartRateObservation(patientId, effectiveDateTime, bpm) {
  return {
    resourceType: 'Observation',
    status: 'final',
    category: vitalCategory(),
    code: {
      coding: loincCoding(LOINC.heartRate),
      text: 'Heart rate',
    },
    subject: { reference: `Patient/${patientId}` },
    effectiveDateTime,
    valueQuantity: {
      value: bpm,
      unit: '/min',
      system: 'http://unitsofmeasure.org',
      code: '/min',
    },
  };
}

export const EDSS_SNOMED = '273513009';

export function edssObservation(patientId, effectiveDateTime, score) {
  return {
    resourceType: 'Observation',
    status: 'final',
    category: [
      {
        coding: [
          {
            system: 'http://terminology.hl7.org/CodeSystem/observation-category',
            code: 'survey',
            display: 'Survey',
          },
        ],
      },
    ],
    code: {
      coding: [
        {
          system: 'http://snomed.info/sct',
          code: EDSS_SNOMED,
          display: 'Kurtzke Expanded Disability Status Scale',
        },
      ],
      text: 'EDSS',
    },
    subject: { reference: `Patient/${patientId}` },
    effectiveDateTime,
    valueQuantity: {
      value: score,
      unit: 'score',
      system: 'http://unitsofmeasure.org',
      code: '{score}',
    },
  };
}

export function glucoseObservation(patientId, effectiveDateTime, mgDl) {
  return {
    resourceType: 'Observation',
    status: 'final',
    category: labCategory(),
    code: {
      coding: loincCoding(LOINC.bloodGlucose),
      text: 'Blood glucose',
    },
    subject: { reference: `Patient/${patientId}` },
    effectiveDateTime,
    valueQuantity: {
      value: mgDl,
      unit: 'mg/dL',
      system: 'http://unitsofmeasure.org',
      code: 'mg/dL',
    },
  };
}

export function wbcObservation(patientId, effectiveDateTime, valueTen9PerL) {
  return {
    resourceType: 'Observation',
    status: 'final',
    category: labCategory(),
    code: {
      coding: loincCoding(LOINC.wbcCount),
      text: 'WBC count',
    },
    subject: { reference: `Patient/${patientId}` },
    effectiveDateTime,
    valueQuantity: {
      value: valueTen9PerL,
      unit: '10*9/L',
      system: 'http://unitsofmeasure.org',
      code: '10*9/L',
    },
  };
}

export function egfrObservation(patientId, effectiveDateTime, valueMlMin) {
  return {
    resourceType: 'Observation',
    status: 'final',
    category: labCategory(),
    code: {
      coding: loincCoding(LOINC.egfr),
      text: 'eGFR',
    },
    subject: { reference: `Patient/${patientId}` },
    effectiveDateTime,
    valueQuantity: {
      value: valueMlMin,
      unit: 'mL/min/{1.73_m2}',
      system: 'http://unitsofmeasure.org',
      code: 'mL/min/{1.73_m2}',
    },
  };
}

export function weightObservation(patientId, effectiveDateTime, weightKg) {
  return {
    resourceType: 'Observation',
    status: 'final',
    category: vitalCategory(),
    code: {
      coding: loincCoding(LOINC.bodyWeight),
      text: 'Weight',
    },
    subject: { reference: `Patient/${patientId}` },
    effectiveDateTime,
    valueQuantity: {
      value: weightKg,
      unit: 'kg',
      system: 'http://unitsofmeasure.org',
      code: 'kg',
    },
  };
}

export function oxygenSaturationObservation(patientId, effectiveDateTime, percent) {
  return {
    resourceType: 'Observation',
    status: 'final',
    category: vitalCategory(),
    code: {
      coding: loincCoding(LOINC.oxygenSaturation),
      text: 'Oxygen saturation',
    },
    subject: { reference: `Patient/${patientId}` },
    effectiveDateTime,
    valueQuantity: {
      value: percent,
      unit: '%',
      system: 'http://unitsofmeasure.org',
      code: '%',
    },
  };
}

export function bloodPressureObservation(patientId, effectiveDateTime, systolic, diastolic) {
  return {
    resourceType: 'Observation',
    status: 'final',
    category: vitalCategory(),
    code: {
      coding: loincCoding(LOINC.bloodPressurePanel),
      text: 'Blood pressure',
    },
    subject: { reference: `Patient/${patientId}` },
    effectiveDateTime,
    component: [
      {
        code: {
          coding: loincCoding(LOINC.systolicBloodPressure),
        },
        valueQuantity: {
          value: systolic,
          unit: 'mmHg',
          system: 'http://unitsofmeasure.org',
          code: 'mm[Hg]',
        },
      },
      {
        code: {
          coding: loincCoding(LOINC.diastolicBloodPressure),
        },
        valueQuantity: {
          value: diastolic,
          unit: 'mmHg',
          system: 'http://unitsofmeasure.org',
          code: 'mm[Hg]',
        },
      },
    ],
  };
}
