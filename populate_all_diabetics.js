const fs = require('fs');
const path = require('path');

// Helper to pause execution
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Load environmental variables from .env.local
const envPath = path.join(__dirname, '.env.local');

let FHIR_BASE_URL = 'https://hapi.fhir.org/baseR4';
let FHIR_AUTH_TOKEN = '';

try {
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    const lines = envContent.split('\n');
    lines.forEach(line => {
      const matchUrl = line.match(/^\s*FHIR_BASE_URL\s*=\s*(.*?)\s*$/);
      if (matchUrl) FHIR_BASE_URL = matchUrl[1].trim();
      const matchToken = line.match(/^\s*FHIR_AUTH_TOKEN\s*=\s*(.*?)\s*$/);
      if (matchToken) FHIR_AUTH_TOKEN = matchToken[1].trim();
    });
  }
} catch (e) {
  console.warn('Warning: Could not read .env.local, falling back to default', e);
}

const headers = {
  'Content-Type': 'application/fhir+json',
  'Accept': 'application/fhir+json'
};
if (FHIR_AUTH_TOKEN) {
  headers['Authorization'] = `Bearer ${FHIR_AUTH_TOKEN}`;
}

// Generate past ISO timestamp helper
function getPastDateString(daysAgo, hour = 8, minute = 0) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

// Deterministic hash used by Next.js app to assign sandbox categories
function getDeterministicCategory(patientId) {
  let hash = 0;
  const idStr = String(patientId);
  for (let i = 0; i < idStr.length; i++) {
    hash = idStr.charCodeAt(i) + ((hash << 5) - hash);
  }
  const mod = Math.abs(hash) % 3;
  if (mod === 0) return 'diabetic';
  if (mod === 1) return 'cardiac';
  return 'other';
}

async function run() {
  console.log('===============================================================');
  console.log('   CLINICAL DIABETIC BLOOD GLUCOSE HISTORY POPULATOR');
  console.log('===============================================================');
  console.log('Target Server Base URL:', FHIR_BASE_URL);
  console.log('Auth Token Configured:', FHIR_AUTH_TOKEN ? 'YES' : 'NO');
  console.log('---------------------------------------------------------------');

  try {
    // 1. Fetch patients
    console.log('Fetching patients from server (up to 100)...');
    const patientUrl = `${FHIR_BASE_URL}/Patient?_count=100`;
    const patientRes = await fetch(patientUrl, { headers });
    if (!patientRes.ok) {
      throw new Error(`Failed to fetch patient directory: Status ${patientRes.status}`);
    }
    const patientBundle = await patientRes.json();
    const patients = patientBundle.entry ? patientBundle.entry.map(e => e.resource) : [];
    console.log(`Successfully fetched ${patients.length} patients.`);

    // 2. Fetch conditions to check for active diabetes diagnoses
    console.log('Fetching all conditions from server (up to 200)...');
    const condUrl = `${FHIR_BASE_URL}/Condition?_count=200`;
    const condRes = await fetch(condUrl, { headers });
    if (!condRes.ok) {
      throw new Error(`Failed to fetch conditions directory: Status ${condRes.status}`);
    }
    const condBundle = await condRes.json();
    const conditions = condBundle.entry ? condBundle.entry.map(e => e.resource) : [];
    console.log(`Successfully fetched ${conditions.length} conditions.`);

    // Map patientId -> conditions array
    const patientConditionsMap = {};
    conditions.forEach(cond => {
      const ref = cond.subject?.reference || cond.patient?.reference;
      if (!ref) return;
      const pId = ref.replace('Patient/', '');
      if (!patientConditionsMap[pId]) patientConditionsMap[pId] = [];
      
      const text = (cond.code?.text || cond.code?.coding?.[0]?.display || '').toLowerCase();
      if (text) {
        patientConditionsMap[pId].push(text);
      }
    });

    // 3. Classify patients to identify ALL Diabetic Care Patients
    const diabeticPatients = [];
    patients.forEach(p => {
      const pId = p.id;
      const pConditions = patientConditionsMap[pId] || [];
      
      // Determine if diabetic based on real condition codes
      const hasRealDiabetesCond = pConditions.some(c => 
        c.includes('diabete') || 
        c.includes('diabetic') || 
        c.includes('hyperglycemia') ||
        c.includes('sugar')
      );
      
      // Determine if diabetic based on Next.js sandbox fallback hash
      const isFallbackDiabetic = getDeterministicCategory(pId) === 'diabetic';
      
      // If patient has real diabetes condition OR (if they have no conditions at all and match the sandbox fallback)
      const isDiabetic = hasRealDiabetesCond || (pConditions.length === 0 && isFallbackDiabetic);
      
      if (isDiabetic) {
        const pName = p.name?.[0]?.given?.join(' ') + ' ' + (p.name?.[0]?.family || '');
        diabeticPatients.push({
          id: pId,
          name: pName.trim() || `Patient #${pId}`,
          reason: hasRealDiabetesCond ? 'Real Condition' : 'Sandbox Fallback Hash'
        });
      }
    });

    console.log(`\nIdentified ${diabeticPatients.length} Diabetic Care patients:`);
    diabeticPatients.forEach((dp, idx) => {
      console.log(`  ${idx + 1}. [ID: ${dp.id}] ${dp.name} (Matched via: ${dp.reason})`);
    });
    console.log('---------------------------------------------------------------');

    if (diabeticPatients.length === 0) {
      console.log('No diabetic care patients found on this server. Populating sandbox environment.');
      return;
    }

    // 4. Generate historical blood sugar observations
    const batchEntries = [];
    
    for (let pIdx = 0; pIdx < diabeticPatients.length; pIdx++) {
      const patient = diabeticPatients[pIdx];
      
      // 3 to 5 years backward: randomly select a range between 3 * 365 (1095 days) and 5 * 365 (1825 days)
      const years = 3 + Math.random() * 2; // e.g. 3.42 years
      const daysRange = Math.round(years * 365);
      
      console.log(`Generating data for ${patient.name}...`);
      console.log(`  -> Time span: ${daysRange} days backward (~${years.toFixed(2)} years)`);

      // Initialize a realistic clinical diabetic baseline glucose
      let currentBaseline = 120 + Math.random() * 35; // between 120 and 155 mg/dL

      let patientObsCount = 0;

      for (let day = 0; day < daysRange; day++) {
        // Apply a slow, realistic random-walk drift to baseline control
        currentBaseline += (Math.random() - 0.5) * 6;
        currentBaseline = Math.max(100, Math.min(180, currentBaseline)); // keep baseline in reasonable range

        // Daily 1, 2, or 3 times on random basis
        const numReadings = Math.floor(Math.random() * 3) + 1; // 1, 2, or 3

        for (let r = 0; r < numReadings; r++) {
          let hour, minute, val;

          if (r === 0) {
            // Reading 1: Morning Fasting (7:30 AM - 8:30 AM)
            hour = 7;
            minute = 30 + Math.floor(Math.random() * 30);
            val = Math.round(currentBaseline + (Math.random() - 0.5) * 15);
          } else if (r === 1) {
            // Reading 2: Afternoon Post-Lunch (1:30 PM - 2:30 PM)
            hour = 13;
            minute = 30 + Math.floor(Math.random() * 30);
            // Simulate a clinical post-lunch spike
            val = Math.round(currentBaseline * (1.2 + Math.random() * 0.25));
          } else {
            // Reading 3: Evening Post-Dinner (7:30 PM - 8:30 PM)
            hour = 19;
            minute = 30 + Math.floor(Math.random() * 30);
            // Simulate a clinical post-dinner spike
            val = Math.round(currentBaseline * (1.15 + Math.random() * 0.2));
          }

          // Safety bounds
          val = Math.max(70, Math.min(350, val));
          const timeISO = getPastDateString(day, hour, minute);

          batchEntries.push({
            request: { method: 'POST', url: 'Observation' },
            resource: {
              resourceType: 'Observation',
              status: 'final',
              category: [{
                coding: [{
                  system: 'http://terminology.hl7.org/CodeSystem/observation-category',
                  code: 'laboratory',
                  display: 'Laboratory'
                }]
              }],
              code: {
                coding: [{
                  system: 'http://loinc.org',
                  code: '15074-8',
                  display: 'Glucose [Mass/volume] in Blood'
                }],
                text: 'Blood Glucose'
              },
              subject: { reference: `Patient/${patient.id}` },
              effectiveDateTime: timeISO,
              valueQuantity: {
                value: val,
                unit: 'mg/dL',
                system: 'http://unitsofmeasure.org',
                code: 'mg/dL'
              }
            }
          });

          patientObsCount++;
        }
      }
      
      console.log(`  -> Generated ${patientObsCount} blood glucose observations.`);
    }

    const totalGenerated = batchEntries.length;
    console.log('---------------------------------------------------------------');
    console.log(`Total Observations Generated: ${totalGenerated}`);
    console.log(`Sending in batches of 100 entries with a 150ms sleep interval...`);
    console.log('---------------------------------------------------------------\n');

    // 5. Post Batches to FHIR Server
    const BATCH_SIZE = 100;
    let batchCount = 0;
    const totalBatches = Math.ceil(totalGenerated / BATCH_SIZE);

    for (let i = 0; i < totalGenerated; i += BATCH_SIZE) {
      const chunk = batchEntries.slice(i, i + BATCH_SIZE);
      const batchBundle = {
        resourceType: 'Bundle',
        type: 'batch',
        entry: chunk
      };

      batchCount++;
      process.stdout.write(`Sending batch #${batchCount} / ${totalBatches} (${chunk.length} entries)... `);

      const response = await fetch(FHIR_BASE_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify(batchBundle)
      });

      if (!response.ok) {
        console.log('FAILED');
        throw new Error(`Batch post failed with server status ${response.status}`);
      }

      const resJSON = await response.json();
      const successes = resJSON.entry ? resJSON.entry.filter(e => e.response && String(e.response.status).startsWith('2')).length : 0;
      
      console.log(`SUCCESS [${successes} / ${chunk.length} processed]`);

      // Throttle to avoid API Gateway locks
      await sleep(150);
    }

    console.log('\n===============================================================');
    console.log(`   SUCCESSFULLY POPULATED ${totalGenerated} BLOOD SUGAR ENTRIES!`);
    console.log('===============================================================');

  } catch (e) {
    console.error('\nData population failed:', e);
  }
}

run();
