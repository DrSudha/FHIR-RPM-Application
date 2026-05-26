/** LOINC codes used when reading and writing FHIR Observation resources. */
export const LOINC = {
  heartRate: '8867-4',
  bodyTemperature: '8310-5',
  respiratoryRate: '9279-1',
  oxygenSaturation: '59408-5',
  bodyHeight: '8302-2',
  bodyWeight: '29463-7',
  bmi: '39156-5',
  bloodPressurePanel: '55284-4',
  systolicBloodPressure: '8480-6',
  diastolicBloodPressure: '8462-4',
  bloodGlucose: '15074-8',
  ldlCholesterol: '13457-7',
  hdlCholesterol: '2085-9',
  triglycerides: '2571-8',
  /** Leukocytes [#/volume] in Blood by Automated count */
  wbcCount: '6690-2',
  /** eGFR by Creatinine-based formula (CKD-EPI) */
  egfr: '62238-1',
  /** Number of steps in 24 hour Measured */
  stepCount: '55423-8',
  /** Sleep duration */
  sleepDuration: '93832-4',
  /** Kurtzke Expanded Disability Status Scale (SNOMED) */
  edss: '273513009',
} as const;

export type LoincLabCode =
  | typeof LOINC.bloodGlucose
  | typeof LOINC.ldlCholesterol
  | typeof LOINC.hdlCholesterol
  | typeof LOINC.triglycerides
  | typeof LOINC.wbcCount
  | typeof LOINC.egfr;

export const LAB_OBSERVATION_CODES: readonly LoincLabCode[] = [
  LOINC.bloodGlucose,
  LOINC.ldlCholesterol,
  LOINC.hdlCholesterol,
  LOINC.triglycerides,
  LOINC.wbcCount,
  LOINC.egfr,
];

export const LIPID_OBSERVATION_CODES = [
  LOINC.ldlCholesterol,
  LOINC.hdlCholesterol,
  LOINC.triglycerides,
] as const;

export type LoincLipidCode = (typeof LIPID_OBSERVATION_CODES)[number];

export const WEARABLE_ACTIVITY_CODES = [LOINC.stepCount, LOINC.sleepDuration] as const;

export const LAB_TEST_LABELS: Record<LoincLabCode, string> = {
  [LOINC.bloodGlucose]: 'Blood Glucose',
  [LOINC.ldlCholesterol]: 'LDL Cholesterol',
  [LOINC.hdlCholesterol]: 'HDL Cholesterol',
  [LOINC.triglycerides]: 'Triglycerides',
  [LOINC.wbcCount]: 'WBC Count',
  [LOINC.egfr]: 'eGFR',
};

export const LOINC_DISPLAY: Record<string, string> = {
  [LOINC.heartRate]: 'Heart rate',
  [LOINC.bodyTemperature]: 'Body temperature',
  [LOINC.respiratoryRate]: 'Respiratory rate',
  [LOINC.oxygenSaturation]: 'Oxygen saturation in Arterial blood by Pulse oximetry',
  [LOINC.bodyHeight]: 'Body height',
  [LOINC.bodyWeight]: 'Body weight',
  [LOINC.bmi]: 'Body mass index (BMI) [Ratio]',
  [LOINC.bloodPressurePanel]: 'Blood pressure panel with all children optional',
  [LOINC.bloodGlucose]: 'Glucose [Mass/volume] in Blood',
  [LOINC.ldlCholesterol]: 'Cholesterol in LDL [Mass/volume] in Serum or Plasma',
  [LOINC.hdlCholesterol]: 'Cholesterol in HDL [Mass/volume] in Serum or Plasma',
  [LOINC.triglycerides]: 'Triglyceride [Mass/volume] in Serum or Plasma',
  [LOINC.wbcCount]: 'Leukocytes [#/volume] in Blood by Automated count',
  [LOINC.egfr]:
    'Glomerular filtration rate/1.73 sq M.predicted [Volume Rate/Area] in Serum, Plasma or Blood by Creatinine-based formula (CKD-EPI)',
  [LOINC.stepCount]: 'Number of steps in 24 hour Measured',
  [LOINC.sleepDuration]: 'Sleep duration',
  [LOINC.edss]: 'Kurtzke Expanded Disability Status Scale',
};
