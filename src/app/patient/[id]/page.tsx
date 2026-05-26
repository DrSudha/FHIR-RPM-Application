'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { 
  ArrowLeft, Activity, Heart, Eye, Percent, 
  Ruler, Scale, LayoutGrid, Calendar, FileText, CheckCircle2, 
  AlertCircle, Pill, RefreshCw, BarChart2, Table, X, ChevronDown, ChevronRight,
  FlaskConical, Footprints, Moon, Brain,
} from 'lucide-react';
import {
  applyTaskVitalOverrides,
} from '@/lib/taskVitalOverrides';
import {
  resolveAnthropometricsFromVitals,
  resolvePatientHeightCm,
  resolveWeightObservationsFromVitals,
  findLatestDailyWeightIncrease,
  buildWeightChangeLabels,
  calculateBmi,
  formatHeight,
  formatWeight,
  formatBmi,
} from '@/lib/patientAnthropometrics';
import {
  resolveDailyStepCountsFromObservations,
  resolveSleepPatternFromObservations,
  formatSteps,
  formatSleepHours,
} from '@/lib/patientWearableMetrics';
import {
  LOINC,
  LAB_OBSERVATION_CODES,
  LAB_TEST_LABELS,
  LIPID_OBSERVATION_CODES,
  WEARABLE_ACTIVITY_CODES,
} from '@/lib/loincObservationCodes';
import {
  getNotificationVitalAlertsForPatient,
  subscribeToNotificationVitalAlerts,
  type NotificationVitalAlert,
  type NotificationVitalType,
} from '@/lib/notificationVitalAlerts';
import {
  classifyCareCategoryFromResources,
  extractGeneralCareSubCategoryFromResources,
} from '@/lib/careCategory';
import { hasMultipleSclerosisCondition, getMultipleSclerosisOnsetDate, formatMsDiagnosisLabel } from '@/lib/msCondition';
import { EGFR_ABNORMAL_THRESHOLD, formatEgfrValue, isEgfrAbnormal } from '@/lib/egfr';
import { buildClinicalWorkspaceSnapshot } from '@/lib/buildClinicalWorkspaceSnapshot';
import {
  getClinicalWorkspaceCohort,
  hasClinicalWorkspace,
} from '@/lib/patientClinicalWorkspace';
import PatientClinicalNotesSection from '@/components/PatientClinicalNotesSection';
import PatientAssessmentsSection from '@/components/PatientAssessmentsSection';
import {
  CLINICAL_LIST_PREVIEW_COUNT,
  sortConditionsForDisplay,
  sortMedicationsForDisplay,
  getConditionName,
  getConditionDisplayDate,
  getMedicationName,
  getMedicationStartDate,
  getMedicationEndDate,
  getMedicationDosage,
  getMedicationFrequency,
  getMedicationRoute,
  isCompletedMedicationStatus,
  formatMedicationDate,
  formatClinicalDateFromString,
} from '@/lib/patientClinicalLists';
import VitalReadingCell from '@/components/VitalReadingCell';
import VitalChartCard from '@/components/VitalChartCard';
import { 
  HeartRateIcon, 
  BloodPressureIcon, 
  OxygenSatIcon, 
  WeightIcon, 
  BloodGlucoseIcon 
} from '@/components/VitalIcons';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
  ChartOptions
} from 'chart.js';

// Register ChartJS plugins
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

interface DataPoint {
  date: Date;
  dateStr: string;
  value: number;
}

interface BPDataPoint {
  date: Date;
  dateStr: string;
  systolic: number;
  diastolic: number;
}

interface VitalTableRow {
  dateStr: string;
  date: Date;
  hr?: string;
  bp?: string;
  temp?: string;
  rr?: string;
  o2?: string;
  height?: string;
  weight?: string;
  bmi?: string;
}

type VitalValueKey = Exclude<keyof VitalTableRow, 'dateStr' | 'date'>;

const VITAL_TABLE_FIELDS: VitalValueKey[] = [
  'hr',
  'bp',
  'temp',
  'rr',
  'o2',
  'height',
  'weight',
  'bmi',
];

/** Latest value per vital type across all timestamps on the same day. */
function buildDaySummary(readings: VitalTableRow[], heightCm: number | null): VitalTableRow {
  const sorted = [...readings].sort((a, b) => b.date.getTime() - a.date.getTime());
  const summary: VitalTableRow = {
    dateStr: sorted[0].dateStr,
    date: sorted[0].date,
  };

  for (const field of VITAL_TABLE_FIELDS) {
    if (field === 'bmi') continue;
    const latest = sorted.find((row) => row[field] != null && row[field] !== '');
    if (latest) {
      summary[field] = latest[field];
    }
  }

  if (summary.weight && heightCm) {
    const bmi = calculateBmi(heightCm, parseFloat(summary.weight));
    if (bmi != null) {
      summary.bmi = String(bmi);
    }
  }

  return summary;
}

type ChartDrillDown =
  | { kind: 'vitals'; dateLabel: string }
  | { kind: 'weight'; anchorDate: Date };

function weightReadingsForWeek(anchor: Date, readings: DataPoint[]): DataPoint[] {
  const start = new Date(anchor);
  start.setDate(start.getDate() - 6);
  start.setHours(0, 0, 0, 0);
  const end = new Date(anchor);
  end.setHours(23, 59, 59, 999);

  return readings
    .filter((point) => point.date >= start && point.date <= end)
    .sort((a, b) => b.date.getTime() - a.date.getTime());
}

export default function PatientDetails() {
  const router = useRouter();
  const { id } = useParams();
  
  const [patient, setPatient] = useState<any | null>(null);
  const [vitals, setVitals] = useState<{ [key: string]: DataPoint[] }>({});
  const [bpVitals, setBpVitals] = useState<BPDataPoint[]>([]);
  const [edssData, setEdssData] = useState<DataPoint[]>([]);
  const [conditions, setConditions] = useState<any[]>([]);
  const [medications, setMedications] = useState<any[]>([]);
  const [showAllConditions, setShowAllConditions] = useState(false);
  const [showAllMedications, setShowAllMedications] = useState(false);
  
  const [viewMode, setViewMode] = useState<'chart' | 'table'>('chart');
  const [labViewMode, setLabViewMode] = useState<'chart' | 'table'>('chart');
  const [edssViewMode, setEdssViewMode] = useState<'chart' | 'table'>('chart');
  const [expandedVitalDays, setExpandedVitalDays] = useState<Set<string>>(new Set());
  const [expandedLabDays, setExpandedLabDays] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [chartDrillDown, setChartDrillDown] = useState<ChartDrillDown | null>(null);
  const [glucoseRange, setGlucoseRange] = useState<'1w' | '2w' | '1m'>('1w');
  const [wbcRange, setWbcRange] = useState<'1y' | '5y' | 'older'>('5y');
  const [egfrRange, setEgfrRange] = useState<'1y' | '5y' | 'older'>('5y');
  const [stepRange, setStepRange] = useState<'1w' | '2w'>('1w');
  const [sleepRange, setSleepRange] = useState<'1w' | '2w'>('1w');
  const [heartRateRange, setHeartRateRange] = useState<'1w' | '2w' | '1m'>('1w');
  const [bpRange, setBpRange] = useState<'1w' | '2w' | '1m'>('1w');
  const [vitalAlerts, setVitalAlerts] = useState<NotificationVitalAlert[]>([]);

  type VitalRange = '1w' | '2w' | '1m';
  type WbcRange = '1y' | '5y' | 'older';
  type WearableRange = '1w' | '2w';

  const WEARABLE_HISTORY_DAYS = 14;

  const daysForVitalRange = (range: VitalRange): number => {
    if (range === '2w') return 14;
    if (range === '1m') return 30;
    return 7;
  };

  const filterByVitalRange = <T extends { date: Date }>(data: T[], range: VitalRange): T[] => {
    if (data.length === 0) return [];
    const maxDate = new Date(Math.max(...data.map((dp) => dp.date.getTime())));
    const limitDate = new Date(maxDate.getTime() - daysForVitalRange(range) * 24 * 60 * 60 * 1000);
    return data.filter((dp) => dp.date >= limitDate);
  };

  const VitalRangeToggle = ({
    range,
    onChange,
    visible,
    className,
  }: {
    range: VitalRange;
    onChange: (r: VitalRange) => void;
    visible: boolean;
    className?: string;
  }) => {
    if (!visible) return null;
    return (
      <div
        className={className}
        style={{
          display: 'flex',
          justifyContent: 'center',
          gap: '0.5rem',
          marginTop: '0.75rem',
          borderTop: '1px solid var(--border-card)',
          paddingTop: '0.75rem',
        }}
      >
        {(['1w', '2w', '1m'] as const).map((key) => (
          <button
            key={key}
            type="button"
            className={`toggle-btn ${range === key ? 'active' : ''}`}
            style={{ fontSize: '0.7rem', padding: '0.2rem 0.5rem', borderRadius: '4px' }}
            onClick={() => onChange(key)}
          >
            {key === '1w' ? '1 Week' : key === '2w' ? '2 Weeks' : '1 Month'}
          </button>
        ))}
      </div>
    );
  };

  const filterWbcByRange = (data: DataPoint[], range: WbcRange): DataPoint[] => {
    if (data.length === 0) return [];
    if (range === 'older') return data;

    const now = new Date();
    const days = range === '1y' ? 365 : 365 * 5;
    const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    return data.filter((point) => point.date >= cutoff);
  };

  const filterWearableByRange = <T extends { date: Date }>(
    data: T[],
    range: WearableRange
  ): T[] => {
    if (data.length === 0) return [];
    const days = range === '2w' ? 14 : 7;
    return data.slice(-days);
  };

  const WearableRangeToggle = ({
    range,
    onChange,
    visible,
  }: {
    range: WearableRange;
    onChange: (r: WearableRange) => void;
    visible: boolean;
  }) => {
    if (!visible) return null;
    return (
      <div className="wearable-range-toggle">
        {(['1w', '2w'] as const).map((key) => (
          <button
            key={key}
            type="button"
            className={`toggle-btn ${range === key ? 'active' : ''}`}
            onClick={() => onChange(key)}
          >
            {key === '1w' ? '1 Week' : '2 Weeks'}
          </button>
        ))}
      </div>
    );
  };

  const WbcRangeLegend = ({
    range,
    onChange,
  }: {
    range: WbcRange;
    onChange: (r: WbcRange) => void;
  }) => (
    <div className="wbc-range-legend" role="group" aria-label="WBC chart time range">
      {(
        [
          { key: '1y' as const, label: '1 Year' },
          { key: '5y' as const, label: '5 Years' },
          { key: 'older' as const, label: 'Older' },
        ] as const
      ).map(({ key, label }) => (
        <button
          key={key}
          type="button"
          className={`wbc-range-legend-btn ${range === key ? 'active' : ''}`}
          onClick={() => onChange(key)}
        >
          {label}
        </button>
      ))}
    </div>
  );

  // Formatting helpers
  const formatBirthDate = (birthDateStr?: string): string => {
    if (!birthDateStr) return 'N/A';
    if (/^\d{2}-\d{2}-\d{4}$/.test(birthDateStr)) return birthDateStr;
    if (/^\d{4}-\d{2}-\d{2}$/.test(birthDateStr)) {
      const [year, month, day] = birthDateStr.split('-');
      return `${day}-${month}-${year}`;
    }
    return birthDateStr;
  };

  const calculateAge = (birthDateStr?: string): string => {
    if (!birthDateStr) return 'N/A';
    let birthDate: Date;
    if (/^\d{2}-\d{2}-\d{4}$/.test(birthDateStr)) {
      const [day, month, year] = birthDateStr.split('-').map(Number);
      birthDate = new Date(year, month - 1, day);
    } else {
      birthDate = new Date(birthDateStr);
    }
    if (isNaN(birthDate.getTime())) return 'N/A';
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return `${age} years`;
  };

  const getAgeNumeric = (birthDateStr?: string): number => {
    if (!birthDateStr) return 35;
    let birthDate: Date;
    if (/^\d{2}-\d{2}-\d{4}$/.test(birthDateStr)) {
      const [day, month, year] = birthDateStr.split('-').map(Number);
      birthDate = new Date(year, month - 1, day);
    } else {
      birthDate = new Date(birthDateStr);
    }
    if (isNaN(birthDate.getTime())) return 35;
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age;
  };

  const renderAvatar = (genderStr: string, birthDateStr?: string, patientId?: string) => {
    // 1. Calculate deterministic seed from patient ID (or fallback)
    const seedStr = patientId || birthDateStr || genderStr || 'avatar';
    let hash = 0;
    for (let i = 0; i < seedStr.length; i++) {
      hash = seedStr.charCodeAt(i) + ((hash << 5) - hash);
    }
    const seed = Math.abs(hash);

    const gender = (genderStr || 'unknown').toLowerCase();
    
    // 2. Background pastel colors
    const bgPastels = [
      '#fce7f3', // Pink
      '#e0f2fe', // Sky Blue
      '#dcfce7', // Mint Green
      '#fef3c7', // Amber/Cream
      '#f3e8ff', // Lavender
      '#ffe4e6', // Soft Rose
      '#ffedd5', // Warm Peach
      '#e0e7ff', // Soft Indigo
    ];
    const bgColor = bgPastels[seed % bgPastels.length];

    // 3. Skin tone details
    const skinTones = ['#fed7aa', '#ffd8be', '#fdba74', '#ffe4e6', '#fca5a5'];
    const skinColor = skinTones[seed % skinTones.length];
    const skinColorShadow = skinTones[(seed + 1) % skinTones.length];
    const lineColor = '#2c3e50'; // Slate navy line outline for premium line-art feel

    // 4. Hair Styles and Colors (aligned with patient gender and age)
    const femaleStyles = [2, 3, 4, 5, 7]; // Combed Side, Center Part, Curly Bob, Long Straight, Classic Bob
    const maleStyles = [0, 1, 2, 3, 6];    // Bald, Short Spiky, Combed Side, Center Part, Messy Top
    
    let hairStyle = 0;
    if (gender === 'female') {
      hairStyle = femaleStyles[seed % femaleStyles.length];
    } else if (gender === 'male') {
      hairStyle = maleStyles[seed % maleStyles.length];
    } else {
      hairStyle = seed % 8;
    }

    const hairColors = [
      '#1e293b', // Jet Black
      '#475569', // Slate Gray
      '#7c2d12', // Autumn Chestnut
      '#d97706', // Golden Blond
      '#b91c1c', // Auburn Red
      '#cbd5e1', // Snow White
    ];

    const age = getAgeNumeric(birthDateStr);
    let hairColor = hairColors[seed % hairColors.length];
    if (age >= 60) {
      hairColor = '#f8fafc'; // Silver white for seniors
    } else if (age >= 48) {
      hairColor = '#94a3b8'; // Graying slate
    }

    // 5. Eyeglasses (30% chance)
    const hasSpecs = seed % 3 === 0;
    const specsType = seed % 2 === 0 ? 'round' : 'rectangular';
    const specsColors = ['#1e293b', '#2563eb', '#dc2626', '#059669', '#7c3aed'];
    const specsColor = specsColors[seed % specsColors.length];

    // 6. Face shape, Mouth, and Clothes
    const faceShapes = ['round', 'oval', 'square'];
    const faceShape = faceShapes[seed % faceShapes.length];
    
    const mouthStyles = ['smile', 'laugh', 'smirk', 'curve'];
    const mouthStyle = mouthStyles[seed % mouthStyles.length];

    const clothingColors = ['#0d9488', '#2563eb', '#db2777', '#7c3aed', '#059669', '#ea580c', '#475569'];
    const clothesColor = clothingColors[seed % clothingColors.length];
    const clothesStyle = (seed % 3); // 0 = scrub, 1 = labcoat, 2 = crew neck

    const hasBeard = gender === 'male' && (seed % 3 === 0);

    return (
      <div 
        style={{
          width: '80px',
          height: '80px',
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          background: bgColor,
          overflow: 'hidden'
        }}
      >
        <svg 
          viewBox="0 0 24 24" 
          style={{
            width: '100%',
            height: '100%',
            display: 'block'
          }}
        >
          {/* 1. Neck & Shadow */}
          <path 
            d="M10.8 14.5 v2.5 c0 0.5 0.4 0.9 0.9 0.9 h0.6 c0.5 0 0.9 -0.4 0.9 -0.9 v-2.5 Z" 
            fill={skinColorShadow} 
            stroke={lineColor} 
            strokeWidth="0.5" 
            strokeLinecap="round" 
            strokeLinejoin="round" 
          />
          
          {/* 2. Face shape */}
          {faceShape === 'round' && (
            <circle cx="12" cy="10.5" r="3.6" fill={skinColor} stroke={lineColor} strokeWidth="0.5" />
          )}
          {faceShape === 'oval' && (
            <ellipse cx="12" cy="10.5" rx="3.3" ry="3.9" fill={skinColor} stroke={lineColor} strokeWidth="0.5" />
          )}
          {faceShape === 'square' && (
            <path 
              d="M8.7 9 c0 -1.8 1.5 -3.2 3.3 -3.2 s3.3 1.4 3.3 3.2 v1.8 c0 1.2 -1 2.2 -2.2 2.2 h-2.2 c-1.2 0 -2.2 -1 -2.2 -2.2 Z" 
              fill={skinColor} 
              stroke={lineColor} 
              strokeWidth="0.5" 
              strokeLinejoin="round" 
            />
          )}

          {/* 3. Rosy Cheeks */}
          <circle cx="9.2" cy="11.5" r="0.5" fill="#f43f5e" opacity="0.15" />
          <circle cx="14.8" cy="11.5" r="0.5" fill="#f43f5e" opacity="0.15" />

          {/* 4. Eyes & Eyebrows */}
          <circle cx="10.2" cy="9.8" r="0.5" fill={lineColor} />
          <circle cx="13.8" cy="9.8" r="0.5" fill={lineColor} />
          <circle cx="10.0" cy="9.6" r="0.15" fill="#ffffff" />
          <circle cx="13.6" cy="9.6" r="0.15" fill="#ffffff" />
          
          {/* Eyebrows */}
          <path d="M9.3 8.8 c0.3 -0.3 1 -0.3 1.3 0" fill="none" stroke={lineColor} strokeWidth="0.4" strokeLinecap="round" />
          <path d="M13.4 8.8 c0.3 -0.3 1 -0.3 1.3 0" fill="none" stroke={lineColor} strokeWidth="0.4" strokeLinecap="round" />

          {/* 5. Nose */}
          <path d="M11.8 10.8 h0.4 v0.7" fill="none" stroke={lineColor} strokeWidth="0.5" strokeLinecap="round" strokeLinejoin="round" />

          {/* 6. Mouth */}
          {mouthStyle === 'smile' && (
            <path d="M10.4 12.2 c0.5 0.7 2.7 0.7 3.2 0" fill="none" stroke={lineColor} strokeWidth="0.5" strokeLinecap="round" />
          )}
          {mouthStyle === 'laugh' && (
            <path d="M10.4 12.1 c0.3 1 2.9 1 3.2 0 Z" fill="#f43f5e" stroke={lineColor} strokeWidth="0.5" strokeLinecap="round" />
          )}
          {mouthStyle === 'smirk' && (
            <path d="M10.8 12.3 c0.4 0.2 1.4 0 1.6 -0.1" fill="none" stroke={lineColor} strokeWidth="0.5" strokeLinecap="round" />
          )}
          {mouthStyle === 'curve' && (
            <path d="M10.6 12.2 q1.4 0.6 2.8 0" fill="none" stroke={lineColor} strokeWidth="0.5" strokeLinecap="round" />
          )}

          {/* 7. Beard (Male only) */}
          {hasBeard && (
            <path 
              d="M8.6 10.8 c0.2 2.6 1.8 3.8 3.4 3.8 s3.2 -1.2 3.4 -3.8 c-0.4 0.6 -1.2 0.8 -1.8 0.8 h-3.2 c-0.6 0 -1.4 -0.2 -1.8 -0.8 Z" 
              fill={hairColor} 
              stroke={lineColor} 
              strokeWidth="0.5" 
              strokeLinejoin="round" 
              opacity="0.9" 
            />
          )}

          {/* 8. Hair layer */}
          {hairStyle === 1 && (
            /* Short Spiky */
            <path 
              d="M8.2 8.4 l0.6 -1.6 l0.7 0.8 l0.8 -2 l1 1.8 l0.8 -1.4 l0.8 1.6 l0.9 -1.2 l0.8 2 v1.2 h-7.4 Z" 
              fill={hairColor} 
              stroke={lineColor} 
              strokeWidth="0.5" 
              strokeLinejoin="round" 
            />
          )}
          {hairStyle === 2 && (
            /* Combed Side */
            <g>
              <path d="M8.3 8.3 c0 -2.8 2 -3.8 3.7 -3.8 s3.9 1 3.9 2.8 v1.4 h-7.6 Z" fill={hairColor} stroke={lineColor} strokeWidth="0.5" strokeLinejoin="round" />
              <path d="M8.3 8.3 c1 -1 2.3 -1.2 3.5 -0.8 s2.3 -0.8 3 -1.5" fill="none" stroke={lineColor} strokeWidth="0.4" strokeLinecap="round" />
            </g>
          )}
          {hairStyle === 3 && (
            /* Center Part */
            <g>
              <path d="M8.1 8.6 c0 -3 1.7 -4 3.9 -4 s3.9 1 3.9 4 v1 h-7.8 Z" fill={hairColor} stroke={lineColor} strokeWidth="0.5" strokeLinejoin="round" />
              <path d="M12 4.6 v4.2" fill="none" stroke={lineColor} strokeWidth="0.5" />
            </g>
          )}
          {hairStyle === 4 && (
            /* Curly Bob */
            <path 
              d="M8.1 9 c-0.6 -0.6 -1.2 0.2 -1.2 0.8 c0 0.8 0.6 1.2 0.8 1.8 v0.8 c-0.4 0.4 -0.4 1.2 0 1.6 s1 0.2 1 -0.8 M15.9 9 c0.6 -0.6 1.2 0.2 1.2 0.8 c0 0.8 -0.6 1.2 -0.8 1.8 v0.8 c0.4 0.4 0.4 1.2 0 1.6 s-1 0.2 -1 -0.8 M8.1 9 c0 -2.8 1.8 -3.8 3.9 -3.8 s3.9 1 3.9 3.8 Z" 
              fill={hairColor} 
              stroke={lineColor} 
              strokeWidth="0.5" 
              strokeLinejoin="round" 
            />
          )}
          {hairStyle === 5 && (
            /* Long Straight */
            <path 
              d="M8.3 8.5 v8 c0 0.8 0.4 1.2 0.8 1.2 s0.7 -0.4 0.7 -1.2 v-8 h4.4 v8 c0 0.8 0.4 1.2 0.8 1.2 s0.8 -0.4 0.8 -1.2 v-8 c0 -2.8 -1.8 -3.8 -3.9 -3.8 s-3.6 1 -3.6 3.8" 
              fill={hairColor} 
              stroke={lineColor} 
              strokeWidth="0.5" 
              strokeLinejoin="round" 
            />
          )}
          {hairStyle === 6 && (
            /* Messy Top */
            <g>
              <path d="M8.3 8.8 c0 -2.3 1.7 -3.3 3.7 -3.3 s3.7 1 3.7 3.3 v0.5 h-7.4 Z" fill={hairColor} stroke={lineColor} strokeWidth="0.5" strokeLinejoin="round" />
              <path d="M10.8 5.6 c0 -1.2 1.2 -2.2 1.2 -2.2 s1.2 1 1.2 2.2 Z" fill={hairColor} stroke={lineColor} strokeWidth="0.5" strokeLinejoin="round" />
            </g>
          )}
          {hairStyle === 7 && (
            /* Classic Bob */
            <path 
              d="M8.1 8.8 c0 -2.8 1.7 -3.8 3.9 -3.8 s3.9 1 3.9 3.8 v2.3 c0 0.8 -0.6 1.2 -1.2 1.2 s-0.8 -0.4 -0.8 -1.2 v-2.3 h-3.8 v2.3 c0 0.8 -0.6 1.2 -1.2 1.2 s-1 -0.4 -1 -1.2 Z" 
              fill={hairColor} 
              stroke={lineColor} 
              strokeWidth="0.5" 
              strokeLinejoin="round" 
            />
          )}

          {/* 9. Spectacles */}
          {hasSpecs && specsType === 'round' && (
            <g>
              <circle cx="10.2" cy="9.8" r="1.3" stroke={specsColor} strokeWidth="0.5" fill="none" />
              <circle cx="13.8" cy="9.8" r="1.3" stroke={specsColor} strokeWidth="0.5" fill="none" />
              <line x1="11.5" y1="9.8" x2="12.5" y2="9.8" stroke={specsColor} strokeWidth="0.5" />
              <line x1="8.9" y1="9.8" x2="9.2" y2="9.8" stroke={specsColor} strokeWidth="0.4" />
              <line x1="14.8" y1="9.8" x2="15.1" y2="9.8" stroke={specsColor} strokeWidth="0.4" />
            </g>
          )}
          {hasSpecs && specsType === 'rectangular' && (
            <g>
              <rect x="9.0" y="9.0" width="2.4" height="1.6" rx="0.3" stroke={specsColor} strokeWidth="0.5" fill="none" />
              <rect x="12.6" y="9.0" width="2.4" height="1.6" rx="0.3" stroke={specsColor} strokeWidth="0.5" fill="none" />
              <line x1="11.4" y1="9.8" x2="12.6" y2="9.8" stroke={specsColor} strokeWidth="0.5" />
            </g>
          )}

          {/* 10. Clothing */}
          {clothesStyle === 0 && (
            /* Scrub V-Neck */
            <g>
              <path d="M5.8 18 c0 -2.2 2.2 -2.8 6.2 -2.8 s6.2 0.6 6.2 2.8 v2 h-12.4 Z" fill={clothesColor} stroke={lineColor} strokeWidth="0.5" strokeLinejoin="round" />
              <path d="M10.6 15.2 l1.4 1.8 l1.4 -1.8" fill={skinColor} stroke={lineColor} strokeWidth="0.5" />
            </g>
          )}
          {clothesStyle === 1 && (
            /* Doctor Lab Coat */
            <g>
              <path d="M5.8 18 c0 -2.2 2.2 -2.8 6.2 -2.8 s6.2 0.6 6.2 2.8 v2 h-12.4 Z" fill="#ffffff" stroke={lineColor} strokeWidth="0.5" strokeLinejoin="round" />
              <path d="M10.4 15.2 l1.6 2.6 l1.6 -2.6" fill={clothesColor} stroke={lineColor} strokeWidth="0.5" />
              <path d="M9.4 15.2 l2.6 3.2 l2.6 -3.2" fill="none" stroke={lineColor} strokeWidth="0.4" />
            </g>
          )}
          {clothesStyle === 2 && (
            /* Casual Crew Neck */
            <g>
              <path d="M5.8 18 c0 -2.2 2.2 -2.8 6.2 -2.8 s6.2 0.6 6.2 2.8 v2 h-12.4 Z" fill={clothesColor} stroke={lineColor} strokeWidth="0.5" strokeLinejoin="round" />
              <path d="M10.2 15.2 c0.8 0.5 2.8 0.5 3.6 0" fill="none" stroke={lineColor} strokeWidth="0.5" />
            </g>
          )}
        </svg>
      </div>
    );
  };

  const formatDateLabel = (date: Date): string => {
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const sortedConditions = useMemo(
    () => sortConditionsForDisplay(conditions),
    [conditions]
  );

  const sortedMedications = useMemo(
    () => sortMedicationsForDisplay(medications),
    [medications]
  );

  const visibleConditions = showAllConditions
    ? sortedConditions
    : sortedConditions.slice(0, CLINICAL_LIST_PREVIEW_COUNT);

  const visibleMedications = showAllMedications
    ? sortedMedications
    : sortedMedications.slice(0, CLINICAL_LIST_PREVIEW_COUNT);

  const hiddenConditionCount = Math.max(
    0,
    sortedConditions.length - CLINICAL_LIST_PREVIEW_COUNT
  );

  const hiddenMedicationCount = Math.max(
    0,
    sortedMedications.length - CLINICAL_LIST_PREVIEW_COUNT
  );

  useEffect(() => {
    setShowAllConditions(false);
    setShowAllMedications(false);
    setExpandedVitalDays(new Set());
    setExpandedLabDays(new Set());
    setChartDrillDown(null);
    setEdssViewMode('chart');
    setStepRange('1w');
    setSleepRange('1w');
  }, [id]);

  /** Show combined lipid panel chart when any lipid results exist. */
  const showLipidCharts =
    (vitals[LOINC.ldlCholesterol]?.length ?? 0) > 0 ||
    (vitals[LOINC.hdlCholesterol]?.length ?? 0) > 0 ||
    (vitals[LOINC.triglycerides]?.length ?? 0) > 0;

  // Helper to check if patient has diabetic or cardiovascular care conditions
  const showBloodGlucose = () => {
    // 1. Show if they already have laboratory observation logs
    if (LAB_OBSERVATION_CODES.some((code) => (vitals[code]?.length ?? 0) > 0)) {
      return true;
    }
    
    // 2. Show if they have an explicit diabetic or cardiac condition on the server
    const hasExplicitCondition = conditions.some(cond => {
      const condText = (
        cond.code?.text || 
        cond.code?.coding?.[0]?.display || 
        ''
      ).toLowerCase();
      
      return condText.includes('diabete') || 
             condText.includes('diabetic') || 
             condText.includes('hyperglycemia') ||
             condText.includes('sugar') ||
             condText.includes('heart') || 
             condText.includes('cardiac') || 
             condText.includes('cardio') || 
             condText.includes('hypertension') || 
             condText.includes('coronary') || 
             condText.includes('infarction') || 
             condText.includes('atrial') || 
             condText.includes('vascular') ||
             condText.includes('stroke');
    });

    if (hasExplicitCondition) return true;

    // 3. Smart sandbox fallback: if there are no conditions at all for the patient,
    // match the deterministic hash on the patient ID used in page.tsx
    if (conditions.length === 0 && id) {
      let hash = 0;
      const idStr = String(id);
      for (let i = 0; i < idStr.length; i++) {
        hash = idStr.charCodeAt(i) + ((hash << 5) - hash);
      }
      const mod = Math.abs(hash) % 3;
      // 0 = diabetic, 1 = cardiac (cardiovascular care also shows blood glucose chart)
      if (mod === 0 || mod === 1) {
        return true;
      }
    }

    return false;
  };

  const showLaboratoryTests = () =>
    showBloodGlucose() ||
    (vitals[LOINC.wbcCount]?.length ?? 0) > 0 ||
    (vitals[LOINC.egfr]?.length ?? 0) > 0 ||
    showLipidCharts;

  const showWbcChart = (vitals[LOINC.wbcCount]?.length ?? 0) > 0;
  const showEgfrChart = (vitals[LOINC.egfr]?.length ?? 0) > 0;

  const fetchData = useCallback(async () => {
    if (!id) return;
    setIsLoading(true);
    setError(null);
    try {
      // 1. Fetch Patient Demographics
      const patientRes = await fetch(`/api/fhir/Patient/${id}`);
      if (!patientRes.ok) {
        throw new Error(`Failed to fetch patient demographic data (Status ${patientRes.status})`);
      }
      const patientData = await patientRes.json();
      setPatient(patientData);

      // 2. Fetch Conditions
      const conditionsRes = await fetch(`/api/fhir/Condition?patient=${id}`);
      if (conditionsRes.ok) {
        const condData = await conditionsRes.json();
        if (condData.entry) {
          setConditions(condData.entry.map((e: any) => e.resource));
        } else {
          setConditions([]);
        }
      }

      // 3. Fetch Medications
      const medsRes = await fetch(`/api/fhir/MedicationRequest?patient=${id}`);
      if (medsRes.ok) {
        const medsData = await medsRes.json();
        if (medsData.entry) {
          setMedications(medsData.entry.map((e: any) => e.resource));
        } else {
          setMedications([]);
        }
      }

      // 4. Fetch Observations — separate queries so a large glucose history
      // cannot crowd out lipid results within _count limits.
      const wearableCodes = [
        LOINC.heartRate,
        LOINC.bodyTemperature,
        LOINC.respiratoryRate,
        LOINC.oxygenSaturation,
        LOINC.bodyHeight,
        LOINC.bodyWeight,
        LOINC.bmi,
        LOINC.bloodPressurePanel,
        ...WEARABLE_ACTIVITY_CODES,
      ].join(',');
      const lipidCodes = LIPID_OBSERVATION_CODES.join(',');

      const [wearableObsRes, glucoseObsRes, lipidObsRes, wbcObsRes, egfrObsRes, edssObsRes] = await Promise.all([
        fetch(`/api/fhir/Observation?subject=Patient/${id}&code=${wearableCodes}&_count=1000`),
        fetch(
          `/api/fhir/Observation?subject=Patient/${id}&code=${LOINC.bloodGlucose}&_sort=-date&_count=1000`
        ),
        fetch(
          `/api/fhir/Observation?subject=Patient/${id}&code=${lipidCodes}&_sort=date&_count=500`
        ),
        fetch(
          `/api/fhir/Observation?subject=Patient/${id}&code=${LOINC.wbcCount}&_sort=date&_count=300`
        ),
        fetch(
          `/api/fhir/Observation?subject=Patient/${id}&code=${LOINC.egfr}&_sort=date&_count=300`
        ),
        fetch(
          `/api/fhir/Observation?subject=Patient/${id}&code=${LOINC.edss}&_sort=date&_count=300`
        ),
      ]);

      const obsEntries: any[] = [];
      if (wearableObsRes.ok) {
        const wearableData = await wearableObsRes.json();
        if (wearableData.entry) {
          obsEntries.push(...wearableData.entry.map((e: any) => e.resource));
        }
      }
      if (glucoseObsRes.ok) {
        const glucoseData = await glucoseObsRes.json();
        if (glucoseData.entry) {
          obsEntries.push(...glucoseData.entry.map((e: any) => e.resource));
        }
      }
      if (lipidObsRes.ok) {
        const lipidData = await lipidObsRes.json();
        if (lipidData.entry) {
          obsEntries.push(...lipidData.entry.map((e: any) => e.resource));
        }
      }
      if (wbcObsRes.ok) {
        const wbcData = await wbcObsRes.json();
        if (wbcData.entry) {
          obsEntries.push(...wbcData.entry.map((e: any) => e.resource));
        }
      }
      if (egfrObsRes.ok) {
        const egfrData = await egfrObsRes.json();
        if (egfrData.entry) {
          obsEntries.push(...egfrData.entry.map((e: any) => e.resource));
        }
      }

      const parsedEdss: DataPoint[] = [];
      if (edssObsRes.ok) {
        const edssBundle = await edssObsRes.json();
        (edssBundle.entry || []).forEach((entry: any) => {
          const obs = entry.resource;
          const dateStr = obs?.effectiveDateTime || obs?.issued;
          const value = obs?.valueQuantity?.value;
          if (!dateStr || typeof value !== 'number') return;
          parsedEdss.push({ date: new Date(dateStr), dateStr, value });
        });
        parsedEdss.sort((a, b) => a.date.getTime() - b.date.getTime());
      }
      setEdssData(parsedEdss);

      if (obsEntries.length > 0) {
        // Parse Vitals
        const parsedVitals: { [key: string]: DataPoint[] } = {
          [LOINC.heartRate]: [],
          [LOINC.bodyTemperature]: [],
          [LOINC.respiratoryRate]: [],
          [LOINC.oxygenSaturation]: [],
          [LOINC.bodyHeight]: [],
          [LOINC.bodyWeight]: [],
          [LOINC.bmi]: [],
          [LOINC.bloodGlucose]: [],
          [LOINC.ldlCholesterol]: [],
          [LOINC.hdlCholesterol]: [],
          [LOINC.triglycerides]: [],
          [LOINC.wbcCount]: [],
          [LOINC.egfr]: [],
          [LOINC.stepCount]: [],
          [LOINC.sleepDuration]: [],
        };
        const parsedBP: BPDataPoint[] = [];

        obsEntries.forEach((obs: any) => {
          const dateStr = obs.effectiveDateTime || obs.issued;
          if (!dateStr) return;
          const date = new Date(dateStr);

          // Get primary coding
          const codes = obs.code?.coding?.map((c: any) => c.code) || [];
          
          // Check Blood Pressure (55284-4)
          if (codes.includes('55284-4') || obs.code?.text?.toLowerCase().includes('blood pressure')) {
            let systolic = 0;
            let diastolic = 0;

            if (obs.component) {
              obs.component.forEach((comp: any) => {
                const compCodes = comp.code?.coding?.map((c: any) => c.code) || [];
                if (compCodes.includes('8480-6')) {
                  systolic = comp.valueQuantity?.value || 0;
                } else if (compCodes.includes('8462-4')) {
                  diastolic = comp.valueQuantity?.value || 0;
                }
              });
            }

            if (systolic && diastolic) {
              parsedBP.push({ date, dateStr, systolic, diastolic });
            }
          } else {
            // Check other vital signs
            const matchingCode = Object.keys(parsedVitals).find(c => codes.includes(c));
            if (matchingCode) {
              const val = obs.valueQuantity?.value;
              if (typeof val === 'number') {
                parsedVitals[matchingCode].push({ date, dateStr, value: val });
              }
            }
          }
        });

        // Sort all parsed arrays chronologically
        Object.keys(parsedVitals).forEach(code => {
          parsedVitals[code].sort((a, b) => a.date.getTime() - b.date.getTime());
        });
        parsedBP.sort((a, b) => a.date.getTime() - b.date.getTime());

        const withOverrides = applyTaskVitalOverrides(
          id as string,
          parsedVitals,
          parsedBP
        );

        setVitals(withOverrides.vitals);
        setBpVitals(withOverrides.bpVitals);
      } else if (!wearableObsRes.ok && !glucoseObsRes.ok && !lipidObsRes.ok) {
        console.warn(
          'Failed to fetch observations:',
          wearableObsRes.status,
          glucoseObsRes.status,
          lipidObsRes.status
        );
      }
    } catch (err: any) {
      console.error('Error fetching patient clinical data:', err);
      setError(err.message || 'An unexpected error occurred while loading patient records.');
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (!id) return undefined;

    const refreshAlerts = () => {
      setVitalAlerts(getNotificationVitalAlertsForPatient(id as string));
    };

    refreshAlerts();
    return subscribeToNotificationVitalAlerts(refreshAlerts);
  }, [id]);

  const hasVitalAlert = (vitalType: NotificationVitalType) =>
    vitalAlerts.some((alert) => alert.vitalType === vitalType);

  const vitalAlertTitle = (vitalType: NotificationVitalType) =>
    vitalAlerts.find((alert) => alert.vitalType === vitalType)?.reason;

  // Chart rendering helper
  const getChartConfig = (
    label: string,
    dataPoints: DataPoint[],
    color: string,
    unit: string,
    onPointClick?: (date: Date) => void,
    interactive = true
  ) => {
    const labels = dataPoints.map(dp => formatDateLabel(dp.date));
    const values = dataPoints.map(dp => dp.value);

    const chartData = {
      labels,
      datasets: [
        {
          label: `${label} (${unit})`,
          data: values,
          borderColor: color,
          backgroundColor: `${color}1A`, // 10% opacity
          borderWidth: 2,
          pointBackgroundColor: color,
          pointHoverRadius: 6,
          tension: 0.3,
          fill: true,
        }
      ]
    };

    const options: ChartOptions<'line'> = {
      responsive: true,
      maintainAspectRatio: false,
      ...(interactive
        ? {
            onClick: (event: any, elements: any[]) => {
              if (elements && elements.length > 0) {
                const index = elements[0].index;
                const clickedDate = dataPoints[index].date;
                if (onPointClick) {
                  onPointClick(clickedDate);
                } else {
                  setChartDrillDown({ kind: 'vitals', dateLabel: formatDateLabel(clickedDate) });
                }
              }
            },
            onHover: (event: any, chartElement: any[]) => {
              if (event.native && event.native.target) {
                (event.native.target as HTMLElement).style.cursor = chartElement.length
                  ? 'pointer'
                  : 'default';
              }
            },
          }
        : {}),
      plugins: {
        legend: { display: false },
        tooltip: {
          padding: 10,
          backgroundColor: 'rgba(15, 23, 42, 0.9)',
          titleFont: { family: 'Inter', size: 12 },
          bodyFont: { family: 'Inter', size: 12 },
          callbacks: {
            label: (context) => ` ${context.parsed.y} ${unit}`
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { font: { family: 'Inter', size: 10 }, maxTicksLimit: 6 }
        },
        y: {
          grid: { color: 'rgba(156, 163, 175, 0.1)' },
          ticks: { font: { family: 'Inter', size: 10 } }
        }
      }
    };

    return { data: chartData, options };
  };

  const getEdssChartConfig = (dataPoints: DataPoint[]) => {
    const useYearLabels = dataPoints.length > 20;
    const chartData = {
      labels: dataPoints.map((point) =>
        useYearLabels
          ? point.date.toLocaleDateString(undefined, { month: 'short', year: 'numeric' })
          : formatDateLabel(point.date)
      ),
      datasets: [
        {
          label: 'EDSS score',
          data: dataPoints.map((point) => point.value),
          borderColor: '#7c3aed',
          backgroundColor: '#7c3aed1A',
          borderWidth: 2,
          pointBackgroundColor: '#7c3aed',
          pointHoverRadius: 6,
          tension: 0.2,
          fill: true,
        },
      ],
    };

    const options: ChartOptions<'line'> = {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          ticks: {
            maxRotation: 45,
            minRotation: useYearLabels ? 45 : 0,
            autoSkip: true,
            maxTicksLimit: useYearLabels ? 18 : 12,
          },
        },
        y: {
          min: 0,
          max: 10,
          ticks: { stepSize: 1 },
          title: { display: true, text: 'EDSS score' },
        },
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (context) => `EDSS ${context.parsed.y}`,
          },
        },
      },
    };

    return { data: chartData, options };
  };

  // Dual Line Blood Pressure Chart
  const getBPChartConfig = (bpData: BPDataPoint[]) => {
    const labels = bpData.map(dp => formatDateLabel(dp.date));
    const systolicVals = bpData.map(dp => dp.systolic);
    const diastolicVals = bpData.map(dp => dp.diastolic);

    const chartData = {
      labels,
      datasets: [
        {
          label: 'Systolic',
          data: systolicVals,
          borderColor: '#ef4444',
          backgroundColor: 'transparent',
          borderWidth: 2.5,
          pointBackgroundColor: '#ef4444',
          tension: 0.3,
        },
        {
          label: 'Diastolic',
          data: diastolicVals,
          borderColor: '#3b82f6',
          backgroundColor: 'transparent',
          borderWidth: 2.5,
          pointBackgroundColor: '#3b82f6',
          tension: 0.3,
        }
      ]
    };

    const options: ChartOptions<'line'> = {
      responsive: true,
      maintainAspectRatio: false,
      onClick: (event: any, elements: any[]) => {
        if (elements && elements.length > 0) {
          const index = elements[0].index;
          setChartDrillDown({
            kind: 'vitals',
            dateLabel: formatDateLabel(bpData[index].date),
          });
        }
      },
      onHover: (event: any, chartElement: any[]) => {
        if (event.native && event.native.target) {
          (event.native.target as HTMLElement).style.cursor = chartElement.length ? 'pointer' : 'default';
        }
      },
      plugins: {
        legend: {
          display: true,
          position: 'top',
          labels: { font: { family: 'Inter', size: 10 } }
        },
        tooltip: {
          padding: 10,
          backgroundColor: 'rgba(15, 23, 42, 0.9)',
          titleFont: { family: 'Inter', size: 12 },
          bodyFont: { family: 'Inter', size: 12 },
          callbacks: {
            label: (context) => ` ${context.dataset.label}: ${context.parsed.y} mmHg`
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { font: { family: 'Inter', size: 10 }, maxTicksLimit: 6 }
        },
        y: {
          grid: { color: 'rgba(156, 163, 175, 0.1)' },
          ticks: { font: { family: 'Inter', size: 10 } }
        }
      }
    };

    return { data: chartData, options };
  };

  const formatMonthAxisLabel = (date: Date): string =>
    date.toLocaleDateString(undefined, { month: 'short', year: '2-digit' });

  const getLipidPanelChartConfig = (
    ldlPoints: DataPoint[],
    hdlPoints: DataPoint[],
    triglyceridePoints: DataPoint[]
  ) => {
    const lipidMonths = 6;

    const toDayKey = (date: Date): string => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    const filterLastMonths = (data: DataPoint[]): DataPoint[] => {
      if (data.length === 0) return [];
      const maxDate = new Date(Math.max(...data.map((dp) => dp.date.getTime())));
      const limitDate = new Date(maxDate);
      limitDate.setMonth(limitDate.getMonth() - lipidMonths);
      return data.filter((dp) => dp.date >= limitDate);
    };

    const ldl = filterLastMonths(ldlPoints);
    const hdl = filterLastMonths(hdlPoints);
    const triglycerides = filterLastMonths(triglyceridePoints);

    const dateByKey = new Map<string, Date>();
    [...ldl, ...hdl, ...triglycerides].forEach((dp) => {
      dateByKey.set(toDayKey(dp.date), dp.date);
    });

    const sortedKeys = Array.from(dateByKey.keys()).sort(
      (a, b) => dateByKey.get(a)!.getTime() - dateByKey.get(b)!.getTime()
    );

    const labels = sortedKeys.map((key) => formatMonthAxisLabel(dateByKey.get(key)!));

    const valueForDay = (data: DataPoint[], dayKey: string): number | null => {
      const match = data.find((dp) => toDayKey(dp.date) === dayKey);
      return match != null ? match.value : null;
    };

    const chartData = {
      labels,
      datasets: [
        {
          label: 'LDL',
          data: sortedKeys.map((key) => valueForDay(ldl, key)),
          borderColor: '#ef4444',
          backgroundColor: 'transparent',
          borderWidth: 2,
          pointBackgroundColor: '#ef4444',
          pointRadius: 4,
          tension: 0.3,
        },
        {
          label: 'HDL',
          data: sortedKeys.map((key) => valueForDay(hdl, key)),
          borderColor: '#22c55e',
          backgroundColor: 'transparent',
          borderWidth: 2,
          pointBackgroundColor: '#22c55e',
          pointRadius: 4,
          tension: 0.3,
        },
        {
          label: 'Triglycerides',
          data: sortedKeys.map((key) => valueForDay(triglycerides, key)),
          borderColor: '#8b5cf6',
          backgroundColor: 'transparent',
          borderWidth: 2,
          pointBackgroundColor: '#8b5cf6',
          pointRadius: 4,
          tension: 0.3,
        },
      ],
    };

    const options: ChartOptions<'line'> = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: true,
          position: 'top',
          labels: { font: { family: 'Inter', size: 10 }, boxWidth: 10, padding: 8 },
        },
        tooltip: {
          padding: 10,
          backgroundColor: 'rgba(15, 23, 42, 0.9)',
          titleFont: { family: 'Inter', size: 12 },
          bodyFont: { family: 'Inter', size: 12 },
          callbacks: {
            label: (context) => ` ${context.dataset.label}: ${context.parsed.y} mg/dL`,
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { font: { family: 'Inter', size: 10 }, maxTicksLimit: 6 },
        },
        y: {
          grid: { color: 'rgba(156, 163, 175, 0.1)' },
          ticks: { font: { family: 'Inter', size: 10 } },
        },
      },
    };

    return { data: chartData, options, hasData: sortedKeys.length > 0 };
  };

  const heartRateData = vitals['8867-4'] || [];
  const glucoseData = vitals['15074-8'] || [];
  const wbcData = vitals[LOINC.wbcCount] || [];
  const egfrData = vitals[LOINC.egfr] || [];
  const ldlData = vitals['13457-7'] || [];
  const hdlData = vitals['2085-9'] || [];
  const triglycerideData = vitals['2571-8'] || [];
  const filteredHeartRate = filterByVitalRange(heartRateData, heartRateRange);
  const filteredBpVitals = filterByVitalRange(bpVitals, bpRange);
  const filteredGlucose = filterByVitalRange(glucoseData, glucoseRange);
  const filteredWbc = filterWbcByRange(wbcData, wbcRange);
  const filteredEgfr = filterWbcByRange(egfrData, egfrRange);
  const latestEgfr = egfrData.length > 0 ? egfrData[egfrData.length - 1].value : null;
  const lipidPanelChart = getLipidPanelChartConfig(ldlData, hdlData, triglycerideData);
  const latestLdl = ldlData[ldlData.length - 1]?.value;
  const latestHdl = hdlData[hdlData.length - 1]?.value;
  const latestTriglycerides = triglycerideData[triglycerideData.length - 1]?.value;

  const renderLabChartCard = (
    title: string,
    data: DataPoint[],
    chartData: DataPoint[],
    color: string,
    icon: React.ReactNode,
    latestDisplay: string,
    latestValueClass: string,
    rangeToggle?: { range: VitalRange; onChange: (r: VitalRange) => void },
    alertOptions?: { showAlert?: boolean; alertTitle?: string }
  ) => (
    <VitalChartCard
      className="glass-card lab-chart-card"
      showAlert={alertOptions?.showAlert}
      alertTitle={alertOptions?.alertTitle}
    >
      <div className="vital-header lab-chart-header">
        <div className="lab-chart-header-main">
          <span className="vital-title">{title}</span>
          <span className={`lab-latest-value ${latestValueClass}`}>{latestDisplay}</span>
        </div>
        {icon}
      </div>
      <div className="vital-chart-container lab-chart-container">
        {chartData.length > 0 ? (
          <Line {...getChartConfig(title, chartData, color, 'mg/dL', undefined, false)} />
        ) : (
          <div
            style={{
              display: 'flex',
              height: '100%',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '0.75rem',
              color: 'var(--text-muted)',
            }}
          >
            No records available
          </div>
        )}
      </div>
      {rangeToggle && (
        <VitalRangeToggle
          range={rangeToggle.range}
          onChange={rangeToggle.onChange}
          visible={data.length > 0}
          className="lab-chart-range-toggle"
        />
      )}
    </VitalChartCard>
  );

  const getWbcChartConfig = (dataPoints: DataPoint[]) => {
    const useYearLabels = dataPoints.length > 16;
    const chartData = {
      labels: dataPoints.map((point) =>
        useYearLabels
          ? point.date.toLocaleDateString(undefined, { month: 'short', year: 'numeric' })
          : formatDateLabel(point.date)
      ),
      datasets: [
        {
          label: 'WBC count',
          data: dataPoints.map((point) => point.value),
          borderColor: '#0d9488',
          backgroundColor: '#0d94881A',
          borderWidth: 2,
          pointBackgroundColor: '#0d9488',
          pointHoverRadius: 6,
          tension: 0.25,
          fill: true,
        },
      ],
    };

    const options: ChartOptions<'line'> = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (context) => `WBC ${context.parsed.y?.toFixed(1)} ×10⁹/L`,
          },
        },
      },
      scales: {
        x: {
          ticks: {
            maxRotation: 45,
            minRotation: useYearLabels ? 45 : 0,
            autoSkip: true,
            maxTicksLimit: useYearLabels ? 14 : 8,
          },
        },
        y: {
          min: 3,
          max: 11,
          title: { display: true, text: '×10⁹/L' },
          grid: { color: 'rgba(156, 163, 175, 0.1)' },
        },
      },
    };

    return { data: chartData, options };
  };

  const getEgfrChartConfig = (dataPoints: DataPoint[]) => {
    const useYearLabels = dataPoints.length > 16;
    const chartData = {
      labels: dataPoints.map((point) =>
        useYearLabels
          ? point.date.toLocaleDateString(undefined, { month: 'short', year: 'numeric' })
          : formatDateLabel(point.date)
      ),
      datasets: [
        {
          label: 'eGFR',
          data: dataPoints.map((point) => point.value),
          borderColor: '#6366f1',
          backgroundColor: '#6366f11A',
          borderWidth: 2,
          pointBackgroundColor: dataPoints.map((point) =>
            isEgfrAbnormal(point.value) ? '#ef4444' : '#6366f1'
          ),
          pointBorderColor: dataPoints.map((point) =>
            isEgfrAbnormal(point.value) ? '#ef4444' : '#6366f1'
          ),
          pointRadius: dataPoints.map((point) => (isEgfrAbnormal(point.value) ? 5 : 4)),
          pointHoverRadius: 7,
          tension: 0.25,
          fill: true,
        },
      ],
    };

    const options: ChartOptions<'line'> = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (context) => {
              const value = context.parsed.y ?? 0;
              const status = isEgfrAbnormal(value) ? ' (abnormal)' : '';
              return `eGFR ${Math.round(value)} mL/min/1.73m²${status}`;
            },
          },
        },
      },
      scales: {
        x: {
          ticks: {
            maxRotation: 45,
            minRotation: useYearLabels ? 45 : 0,
            autoSkip: true,
            maxTicksLimit: useYearLabels ? 14 : 8,
          },
        },
        y: {
          min: 30,
          max: 120,
          title: { display: true, text: 'mL/min/1.73m²' },
          grid: { color: 'rgba(156, 163, 175, 0.1)' },
        },
      },
    };

    return { data: chartData, options };
  };

  const renderWbcChartCard = () => (
    <div className="glass-card lab-chart-card wbc-chart-card">
      <div className="vital-header lab-chart-header">
        <div className="lab-chart-header-main">
          <span className="vital-title">WBC Count</span>
          <span className="lab-latest-value lab-latest-wbc">
            {wbcData.length > 0 ? `${wbcData[wbcData.length - 1].value.toFixed(1)} ×10⁹/L` : 'N/A'}
          </span>
        </div>
        <FlaskConical size={18} style={{ color: 'var(--primary)', flexShrink: 0 }} />
      </div>
      <div className="vital-chart-container lab-chart-container wbc-chart-container">
        {filteredWbc.length > 0 ? (
          <Line {...getWbcChartConfig(filteredWbc)} />
        ) : (
          <div
            style={{
              display: 'flex',
              height: '100%',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '0.75rem',
              color: 'var(--text-muted)',
            }}
          >
            No WBC readings in this range
          </div>
        )}
      </div>
      <WbcRangeLegend range={wbcRange} onChange={setWbcRange} />
    </div>
  );

  const renderEgfrChartCard = () => (
    <VitalChartCard
      className="glass-card lab-chart-card egfr-chart-card"
      showAlert={latestEgfr != null && isEgfrAbnormal(latestEgfr)}
      alertTitle={`Low eGFR (${Math.round(latestEgfr ?? 0)} mL/min/1.73m²) — below ${EGFR_ABNORMAL_THRESHOLD}`}
    >
      <div className="vital-header lab-chart-header">
        <div className="lab-chart-header-main">
          <span className="vital-title">eGFR</span>
          <span
            className={`lab-latest-value lab-latest-egfr ${
              latestEgfr != null && isEgfrAbnormal(latestEgfr) ? 'lab-latest-egfr-abnormal' : ''
            }`}
          >
            {latestEgfr != null ? formatEgfrValue(latestEgfr) : 'N/A'}
          </span>
        </div>
        <FlaskConical size={18} style={{ color: 'var(--primary)', flexShrink: 0 }} />
      </div>
      <div className="vital-chart-container lab-chart-container egfr-chart-container">
        {filteredEgfr.length > 0 ? (
          <Line {...getEgfrChartConfig(filteredEgfr)} />
        ) : (
          <div
            style={{
              display: 'flex',
              height: '100%',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '0.75rem',
              color: 'var(--text-muted)',
            }}
          >
            No eGFR readings in this range
          </div>
        )}
      </div>
      <WbcRangeLegend range={egfrRange} onChange={setEgfrRange} />
    </VitalChartCard>
  );

  const formatVitalTimeLabel = (dateStr: string): string => {
    const date = new Date(dateStr);
    if (Number.isNaN(date.getTime())) return dateStr;
    return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  };

  const getVitalDayKey = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const toggleLabDayExpanded = (dayKey: string) => {
    setExpandedLabDays((current) => {
      const next = new Set(current);
      if (next.has(dayKey)) {
        next.delete(dayKey);
      } else {
        next.add(dayKey);
      }
      return next;
    });
  };

  const toggleVitalDayExpanded = (dayKey: string) => {
    setExpandedVitalDays((current) => {
      const next = new Set(current);
      if (next.has(dayKey)) {
        next.delete(dayKey);
      } else {
        next.add(dayKey);
      }
      return next;
    });
  };

  const patientHeightCm = useMemo(() => resolvePatientHeightCm(vitals), [vitals]);

  const flatVitals = useMemo(() => {
    const rowsMap: { [key: string]: VitalTableRow } = {};

    const addReading = (dateStr: string, date: Date, type: VitalValueKey, value: string) => {
      if (!rowsMap[dateStr]) {
        rowsMap[dateStr] = { dateStr, date };
      }
      rowsMap[dateStr][type] = value;
    };

    bpVitals.forEach((bp) => {
      addReading(bp.dateStr, bp.date, 'bp', `${bp.systolic}/${bp.diastolic}`);
    });

    const keyMap: Record<string, VitalValueKey> = {
      '8867-4': 'hr',
      '8310-5': 'temp',
      '9279-1': 'rr',
      '59408-5': 'o2',
      '29463-7': 'weight',
    };

    Object.keys(vitals).forEach((code) => {
      const typeKey = keyMap[code];
      if (!typeKey) return;
      vitals[code].forEach((reading) => {
        addReading(reading.dateStr, reading.date, typeKey, String(reading.value));
      });
    });

    Object.values(rowsMap).forEach((row) => {
      if (!row.weight || !patientHeightCm) return;
      const bmi = calculateBmi(patientHeightCm, parseFloat(row.weight));
      if (bmi != null) {
        row.bmi = String(bmi);
      }
    });

    return Object.values(rowsMap).sort((a, b) => b.date.getTime() - a.date.getTime());
  }, [bpVitals, vitals, patientHeightCm]);

  const groupedVitals = useMemo(() => {
    const groups = new Map<string, VitalTableRow[]>();

    flatVitals.forEach((row) => {
      const dayKey = getVitalDayKey(row.date);
      const existing = groups.get(dayKey) || [];
      existing.push(row);
      groups.set(dayKey, existing);
    });

    return Array.from(groups.entries())
      .map(([dayKey, readings]) => ({
        dayKey,
        readings: readings.sort((a, b) => b.date.getTime() - a.date.getTime()),
      }))
      .sort(
        (a, b) =>
          new Date(b.readings[0].dateStr).getTime() - new Date(a.readings[0].dateStr).getTime()
      );
  }, [flatVitals]);

  const formatLabResultDisplay = (testCode: string, value: number): string => {
    if (testCode === LOINC.bloodGlucose) return `${value.toFixed(0)} mg/dL`;
    if (testCode === LOINC.wbcCount) return `${value.toFixed(1)} ×10⁹/L`;
    if (testCode === LOINC.egfr) return formatEgfrValue(value);
    return `${value.toFixed(0)} mg/dL`;
  };

  const groupedLabResults = useMemo(() => {
    const groups = new Map<string, (DataPoint & { testCode: string; testName: string })[]>();

    LAB_OBSERVATION_CODES.forEach((testCode) => {
      (vitals[testCode] || []).forEach((reading) => {
        const dayKey = getVitalDayKey(reading.date);
        const groupKey = `${dayKey}|${testCode}`;
        const existing = groups.get(groupKey) || [];
        existing.push({
          ...reading,
          testCode,
          testName: LAB_TEST_LABELS[testCode],
        });
        groups.set(groupKey, existing);
      });
    });

    return Array.from(groups.entries())
      .map(([groupKey, readings]) => ({
        groupKey,
        dayKey: groupKey.split('|')[0],
        testCode: readings[0].testCode,
        testName: readings[0].testName,
        readings: readings.sort((a, b) => b.date.getTime() - a.date.getTime()),
      }))
      .sort(
        (a, b) =>
          b.readings[0].date.getTime() - a.readings[0].date.getTime()
      );
  }, [vitals]);

  const allDailyStepCounts = useMemo(
    () =>
      resolveDailyStepCountsFromObservations(
        vitals[LOINC.stepCount] || [],
        id as string | undefined,
        WEARABLE_HISTORY_DAYS
      ),
    [vitals, id]
  );

  const allSleepPattern = useMemo(
    () =>
      resolveSleepPatternFromObservations(
        vitals[LOINC.sleepDuration] || [],
        id as string | undefined,
        WEARABLE_HISTORY_DAYS
      ),
    [vitals, id]
  );

  const dailyStepCounts = useMemo(
    () => filterWearableByRange(allDailyStepCounts, stepRange),
    [allDailyStepCounts, stepRange]
  );

  const sleepPattern = useMemo(
    () => filterWearableByRange(allSleepPattern, sleepRange),
    [allSleepPattern, sleepRange]
  );

  const stepChartPoints = useMemo(
    () =>
      dailyStepCounts.map((reading) => ({
        date: reading.date,
        dateStr: reading.dateStr,
        value: reading.steps,
      })),
    [dailyStepCounts]
  );

  const sleepChartPoints = useMemo(
    () =>
      sleepPattern.map((reading) => ({
        date: reading.date,
        dateStr: reading.dateStr,
        value: reading.hours,
      })),
    [sleepPattern]
  );

  const latestStepCount = allDailyStepCounts[allDailyStepCounts.length - 1]?.steps ?? null;
  const latestSleep = allSleepPattern[allSleepPattern.length - 1] ?? null;

  const weightData = useMemo(() => resolveWeightObservationsFromVitals(vitals), [vitals]);
  const latestWeightIncrease = useMemo(
    () => findLatestDailyWeightIncrease(weightData),
    [weightData]
  );

  const renderVitalTableCells = (row: VitalTableRow) => (
    <>
      <td>
        <VitalReadingCell
          type="hr"
          raw={row.hr}
          display={row.hr ? `${row.hr} bpm` : '—'}
        />
      </td>
      <td style={{ fontWeight: 600, color: 'var(--primary)' }}>
        <VitalReadingCell
          type="bp"
          raw={row.bp}
          display={row.bp ? `${row.bp} mmHg` : '—'}
        />
      </td>
      <td>{row.temp ? `${parseFloat(row.temp).toFixed(1)} °C` : '—'}</td>
      <td>
        <VitalReadingCell
          type="rr"
          raw={row.rr}
          display={row.rr ? `${row.rr} /min` : '—'}
        />
      </td>
      <td>
        <VitalReadingCell
          type="o2"
          raw={row.o2}
          display={row.o2 ? `${row.o2}%` : '—'}
        />
      </td>
      <td>
        {row.weight ? (
          <VitalReadingCell
            type="weight"
            raw={
              latestWeightIncrease &&
              row.dateStr === latestWeightIncrease.dateStr
                ? String(latestWeightIncrease.deltaKg)
                : undefined
            }
            display={`${row.weight} kg`}
          />
        ) : (
          '—'
        )}
      </td>
      <td>{row.bmi ? parseFloat(row.bmi).toFixed(1) : '—'}</td>
    </>
  );

  const weightDrillDownReadings =
    chartDrillDown?.kind === 'weight'
      ? weightReadingsForWeek(chartDrillDown.anchorDate, weightData)
      : [];
  const weightChangeLabels =
    chartDrillDown?.kind === 'weight'
      ? buildWeightChangeLabels(weightDrillDownReadings)
      : new Map<string, string>();

  const bannerAnthropometrics = useMemo(
    () => resolveAnthropometricsFromVitals(vitals),
    [vitals]
  );

  const patientCareCategory = useMemo(
    () => classifyCareCategoryFromResources(conditions),
    [conditions]
  );

  const generalCareSubCategory = useMemo(
    () => extractGeneralCareSubCategoryFromResources(conditions),
    [conditions]
  );

  const clinicalWorkspaceSnapshot = useMemo(() => {
    if (!id) return null;
    return buildClinicalWorkspaceSnapshot({
      patientId: id as string,
      careCategory: patientCareCategory,
      generalSubCategory: generalCareSubCategory,
      conditions: sortedConditions,
      heartRateData,
      bpVitals,
      glucoseData,
      ldlData,
      hdlData,
      triglycerideData,
      o2Data: vitals[LOINC.oxygenSaturation] || [],
      weightData,
      latestWeightIncrease,
      dailyStepCounts: allDailyStepCounts,
      sleepPattern: allSleepPattern,
    });
  }, [
    id,
    patientCareCategory,
    generalCareSubCategory,
    sortedConditions,
    heartRateData,
    bpVitals,
    glucoseData,
    ldlData,
    hdlData,
    triglycerideData,
    vitals,
    weightData,
    latestWeightIncrease,
    allDailyStepCounts,
    allSleepPattern,
  ]);

  const clinicalWorkspaceCohort = getClinicalWorkspaceCohort(patientCareCategory);

  const showEdssChart =
    edssData.length > 0 || hasMultipleSclerosisCondition(sortedConditions);

  const latestEdssScore =
    edssData.length > 0 ? edssData[edssData.length - 1].value : null;

  const sortedEdssRows = useMemo(
    () => [...edssData].sort((a, b) => b.date.getTime() - a.date.getTime()),
    [edssData]
  );

  const msDiagnosisLabel = useMemo(() => {
    const onset = getMultipleSclerosisOnsetDate(sortedConditions);
    return onset ? formatMsDiagnosisLabel(onset) : null;
  }, [sortedConditions]);

  // Loading state
  if (isLoading) {
    return (
      <div className="app-container">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '2rem' }}>
          <div className="skeleton skeleton-text" style={{ width: '10%', height: '2rem' }}></div>
        </div>
        <div className="skeleton" style={{ height: '10rem', borderRadius: '20px', marginBottom: '2rem' }}></div>
        <div className="skeleton skeleton-title" style={{ width: '15%' }}></div>
        <div className="vitals-grid">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="skeleton" style={{ height: '14rem', borderRadius: '16px' }}></div>
          ))}
        </div>
      </div>
    );
  }

  // Error state
  if (error || !patient) {
    return (
      <div className="app-container" style={{ textAlign: 'center', padding: '5rem 2rem' }}>
        <div style={{ color: 'var(--danger)', marginBottom: '1.5rem' }}>
          <AlertCircle size={64} style={{ margin: '0 auto' }} />
        </div>
        <h2 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>Failed to Load Clinical Record</h2>
        <p className="text-muted" style={{ maxWidth: '500px', margin: '0 auto 2rem' }}>
          {error || 'The patient record could not be located on the server.'}
        </p>
        <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem' }}>
          <button className="btn btn-secondary" onClick={() => router.push('/')}>
            <ArrowLeft size={16} />
            Back to Patients list
          </button>
          <button className="btn btn-primary" onClick={fetchData}>
            <RefreshCw size={14} style={{ marginRight: '0.5rem' }} />
            Retry Connection
          </button>
        </div>
      </div>
    );
  }

  const patientGivenName = patient.name?.[0]?.given?.join(' ') || '';
  const patientFamilyName = patient.name?.[0]?.family || '';
  const patientFullName = [patientGivenName, patientFamilyName].filter(Boolean).join(' ') || 'Unnamed Patient';
  const patientGender = patient.gender || 'unknown';
  const patientBirthDate = patient.birthDate;
  const showClinicalWorkspace = hasClinicalWorkspace(patient.id);

  return (
    <div className="app-container">
      {/* 1. Demographics Banner */}
      <section className="demographics-banner">
        <div className="demographics-main">
          <div>
            <h1 className="demographics-title">{patientFullName}</h1>
            <span style={{ fontSize: '0.875rem', padding: '0.35rem 0.75rem', background: 'rgba(255, 255, 255, 0.15)', borderRadius: '6px', fontWeight: 500 }}>
              Medical ID: {patient.id}
            </span>
          </div>

          <div>
            {renderAvatar(patientGender, patientBirthDate, patient.id)}
          </div>
        </div>

        <div className="demographics-details-row">
          <div className="demographics-detail-item">
            <div className="demographics-item-label">Gender</div>
            <div className="demographics-item-value">{patientGender}</div>
          </div>
          <div className="demographics-detail-item">
            <div className="demographics-item-label">Date of Birth</div>
            <div className="demographics-item-value">
              <Calendar size={12} style={{ marginRight: '0.3rem', verticalAlign: 'middle', display: 'inline' }} />
              {formatBirthDate(patientBirthDate)}
            </div>
          </div>
          <div className="demographics-detail-item">
            <div className="demographics-item-label">Age</div>
            <div className="demographics-item-value">{calculateAge(patientBirthDate)}</div>
          </div>
          <div className="demographics-anthropometrics" aria-label="Height, weight, and BMI">
            <div className="demographics-anthropometrics-row">
              <span className="demographics-anthropometrics-label">Height:</span>
              <span className="demographics-anthropometrics-value">
                {formatHeight(bannerAnthropometrics.heightCm)}
              </span>
            </div>
            <div className="demographics-anthropometrics-row">
              <span className="demographics-anthropometrics-label">Weight:</span>
              <span className="demographics-anthropometrics-value">
                {formatWeight(bannerAnthropometrics.weightKg)}
              </span>
            </div>
            <div className="demographics-anthropometrics-row">
              <span className="demographics-anthropometrics-label">BMI:</span>
              <span className="demographics-anthropometrics-value">
                {formatBmi(bannerAnthropometrics.bmi)}
              </span>
            </div>
          </div>
        </div>
      </section>

      {showClinicalWorkspace && (
        <section className="clinical-workspace-grid">
          <PatientClinicalNotesSection
            patientId={id as string}
            snapshot={clinicalWorkspaceSnapshot}
          />
          <PatientAssessmentsSection
            patientId={id as string}
            cohort={clinicalWorkspaceCohort}
            snapshot={clinicalWorkspaceSnapshot}
          />
        </section>
      )}

      {showEdssChart && (
        <section className="edss-scoring-section" style={{ marginBottom: '2.5rem' }}>
          <div className="vitals-section-toolbar" style={{ marginBottom: '1rem' }}>
            <h2
              style={{
                fontSize: '1.25rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                margin: 0,
              }}
            >
              <Brain size={20} style={{ color: 'var(--primary)' }} />
              EDSS Scoring
            </h2>
            <div className="toggle-group vitals-section-toolbar-toggle">
              <button
                className={`toggle-btn ${edssViewMode === 'chart' ? 'active' : ''}`}
                onClick={() => setEdssViewMode('chart')}
              >
                <BarChart2 size={12} style={{ marginRight: '0.25rem', verticalAlign: 'middle' }} />
                Chart View
              </button>
              <button
                className={`toggle-btn ${edssViewMode === 'table' ? 'active' : ''}`}
                onClick={() => setEdssViewMode('table')}
              >
                <Table size={12} style={{ marginRight: '0.25rem', verticalAlign: 'middle' }} />
                Table View
              </button>
            </div>
          </div>

          {edssViewMode === 'chart' ? (
            <div className="glass-card edss-chart-card" style={{ padding: '1rem 1.25rem' }}>
              <div className="vital-header" style={{ marginBottom: '0.75rem' }}>
                <div>
                  <span className="vital-title">Expanded Disability Status Scale</span>
                  <p style={{ margin: '0.25rem 0 0', fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                    EDSS assessments every 6–8 months since MS diagnosis
                    {msDiagnosisLabel ? ` (${msDiagnosisLabel})` : ''}
                  </p>
                </div>
                {latestEdssScore != null && (
                  <span className="edss-latest-score">
                    Latest: <strong>{latestEdssScore.toFixed(1)}</strong>
                  </span>
                )}
              </div>
              <div
                className="vital-chart-container edss-chart-container"
                style={{ minHeight: edssData.length > 20 ? '240px' : '180px' }}
              >
                {edssData.length > 0 ? (
                  <Line {...getEdssChartConfig(edssData)} />
                ) : (
                  <div
                    style={{
                      display: 'flex',
                      height: '100%',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '0.8125rem',
                      color: 'var(--text-muted)',
                    }}
                  >
                    No EDSS scores recorded yet
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="glass-card edss-table-card" style={{ padding: 0, overflow: 'hidden' }}>
              {sortedEdssRows.length === 0 ? (
                <div
                  style={{
                    textAlign: 'center',
                    padding: '3rem 2rem',
                    color: 'var(--text-muted)',
                    fontSize: '0.8125rem',
                  }}
                >
                  No EDSS scores recorded yet
                </div>
              ) : (
                <div className="table-container" style={{ border: 'none', margin: 0, borderRadius: 0 }}>
                  <table className="premium-table vitals-table edss-scores-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>EDSS Score</th>
                        <th>Change</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedEdssRows.map((reading, index) => {
                        const olderReading = sortedEdssRows[index + 1];
                        const change =
                          olderReading != null
                            ? reading.value - olderReading.value
                            : null;

                        return (
                          <tr key={reading.dateStr}>
                            <td style={{ fontWeight: 500, color: 'var(--text-main)' }}>
                              {formatClinicalDateFromString(reading.dateStr)}
                            </td>
                            <td style={{ fontWeight: 600, color: '#7c3aed' }}>
                              {reading.value.toFixed(1)}
                            </td>
                            <td
                              style={{
                                fontWeight: 500,
                                color:
                                  change == null
                                    ? 'var(--text-muted)'
                                    : change > 0
                                      ? '#dc2626'
                                      : change < 0
                                        ? '#16a34a'
                                        : 'var(--text-muted)',
                              }}
                            >
                              {change == null
                                ? '—'
                                : `${change > 0 ? '+' : ''}${change.toFixed(1)}`}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {/* 2. Vitals Section Header & Toggle */}
      <section style={{ marginBottom: '2.5rem' }}>
        <div className="vitals-section-toolbar">
          <h2 style={{ fontSize: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
            <Activity size={20} style={{ color: 'var(--primary)' }} />
            Vital Signs & wearables data
          </h2>

          <div className="toggle-group vitals-section-toolbar-toggle">
            <button 
              className={`toggle-btn ${viewMode === 'chart' ? 'active' : ''}`}
              onClick={() => setViewMode('chart')}
            >
              <BarChart2 size={12} style={{ marginRight: '0.25rem', verticalAlign: 'middle' }} />
              Chart View
            </button>
            <button 
              className={`toggle-btn ${viewMode === 'table' ? 'active' : ''}`}
              onClick={() => setViewMode('table')}
            >
              <Table size={12} style={{ marginRight: '0.25rem', verticalAlign: 'middle' }} />
              Table View
            </button>
          </div>

          <button className="btn vitals-section-toolbar-back" onClick={() => router.push('/')}>
            <ArrowLeft size={16} />
            Back to Patients list
          </button>
        </div>

        {/* 3. Vitals Views */}
        {viewMode === 'chart' ? (
          <div className="vitals-grid">
            {/* Heart Rate */}
            <VitalChartCard
              className="glass-card vital-card"
              style={{ display: 'flex', flexDirection: 'column', height: '100%' }}
              showAlert={hasVitalAlert('heart-rate')}
              alertTitle={vitalAlertTitle('heart-rate')}
            >
              <div className="vital-header">
                <span className="vital-title">Heart Rate</span>
                <HeartRateIcon size={24} />
              </div>
              <div className="vital-value-display">
                <span className="vital-value">
                  {heartRateData.length > 0 ? heartRateData[heartRateData.length - 1].value : 'N/A'}
                </span>
                <span className="vital-unit">bpm</span>
              </div>
              <div className="vital-chart-container" style={{ flexGrow: 1, minHeight: '130px' }}>
                {filteredHeartRate.length > 0 ? (
                  <Line {...getChartConfig('Heart Rate', filteredHeartRate, '#ef4444', 'bpm')} />
                ) : (
                  <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', color: 'var(--text-muted)' }}>No records available</div>
                )}
              </div>
              <VitalRangeToggle
                range={heartRateRange}
                onChange={setHeartRateRange}
                visible={heartRateData.length > 0}
              />
            </VitalChartCard>

            {/* Blood Pressure (Dual lines) */}
            <VitalChartCard
              className="glass-card vital-card"
              style={{ display: 'flex', flexDirection: 'column', height: '100%' }}
              showAlert={hasVitalAlert('bp')}
              alertTitle={vitalAlertTitle('bp')}
            >
              <div className="vital-header">
                <span className="vital-title">Blood Pressure</span>
                <BloodPressureIcon size={24} />
              </div>
              <div className="vital-value-display">
                <span className="vital-value">
                  {bpVitals.length > 0 ? `${bpVitals[bpVitals.length - 1].systolic}/${bpVitals[bpVitals.length - 1].diastolic}` : 'N/A'}
                </span>
                <span className="vital-unit">mmHg</span>
              </div>
              <div className="vital-chart-container" style={{ flexGrow: 1, minHeight: '130px' }}>
                {filteredBpVitals.length > 0 ? (
                  <Line {...getBPChartConfig(filteredBpVitals)} />
                ) : (
                  <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', color: 'var(--text-muted)' }}>No records available</div>
                )}
              </div>
              <VitalRangeToggle
                range={bpRange}
                onChange={setBpRange}
                visible={bpVitals.length > 0}
              />
            </VitalChartCard>

            {/* Oxygen Saturation */}
            <VitalChartCard
              className="glass-card vital-card"
              showAlert={hasVitalAlert('o2')}
              alertTitle={vitalAlertTitle('o2')}
            >
              <div className="vital-header">
                <span className="vital-title">Oxygen Saturation</span>
                <OxygenSatIcon size={24} />
              </div>
              <div className="vital-value-display">
                <span className="vital-value">
                  {vitals['59408-5']?.length > 0 ? vitals['59408-5'][vitals['59408-5'].length - 1].value : 'N/A'}
                </span>
                <span className="vital-unit">% SpO₂</span>
              </div>
              <div className="vital-chart-container">
                {vitals['59408-5']?.length > 0 ? (
                  <Line {...getChartConfig('O2 Saturation', vitals['59408-5'], '#06b6d4', '%')} />
                ) : (
                  <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', color: 'var(--text-muted)' }}>No records available</div>
                )}
              </div>
            </VitalChartCard>

            {/* Weight */}
            <VitalChartCard
              className="glass-card vital-card"
              showAlert={hasVitalAlert('weight')}
              alertTitle={vitalAlertTitle('weight')}
            >
              <div className="vital-header">
                <span className="vital-title">Weight</span>
                <WeightIcon size={24} />
              </div>
              <div className="vital-value-display">
                <span className="vital-value">
                  {weightData.length > 0 ? weightData[weightData.length - 1].value : 'N/A'}
                </span>
                <span className="vital-unit">kg</span>
              </div>
              <div className="vital-chart-container">
                {weightData.length > 0 ? (
                  <Line
                    {...getChartConfig(
                      'Weight',
                      weightData,
                      '#8b5cf6',
                      'kg',
                      (clickedDate) => setChartDrillDown({ kind: 'weight', anchorDate: clickedDate })
                    )}
                  />
                ) : (
                  <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', color: 'var(--text-muted)' }}>No records available</div>
                )}
              </div>
            </VitalChartCard>
          </div>
        ) : (
          /* Vitals Table View */
          <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
            {groupedVitals.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '4rem 2rem', color: 'var(--text-muted)' }}>
                No vital readings logged on the server.
              </div>
            ) : (
              <div className="table-container" style={{ border: 'none', margin: 0, borderRadius: 0 }}>
                <table className="premium-table vitals-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Heart Rate</th>
                      <th>Blood Pressure</th>
                      <th>Temp (°C)</th>
                      <th>Resp Rate</th>
                      <th>O₂ Sat (%)</th>
                      <th>Weight (kg)</th>
                      <th>BMI (kg/m²)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {groupedVitals.map((group) => {
                      const isExpandable = group.readings.length > 1;
                      const isExpanded = expandedVitalDays.has(group.dayKey);
                      const summaryRow = buildDaySummary(group.readings, patientHeightCm);
                      const expandedReadings = [...group.readings].sort(
                        (a, b) => b.date.getTime() - a.date.getTime()
                      );

                      if (isExpandable && isExpanded) {
                        return expandedReadings.map((row, readingIndex) => (
                          <tr
                            key={`${group.dayKey}-${row.dateStr}`}
                            className={readingIndex > 0 ? 'vitals-day-detail-row' : 'vitals-day-expanded-row'}
                          >
                            <td style={{ fontWeight: 500, color: 'var(--text-main)' }}>
                              <div className="vitals-date-cell">
                                {readingIndex === 0 && (
                                  <button
                                    type="button"
                                    className="vitals-day-toggle"
                                    onClick={() => toggleVitalDayExpanded(group.dayKey)}
                                    aria-expanded
                                    aria-label={`Collapse readings for ${formatClinicalDateFromString(summaryRow.dateStr)}`}
                                  >
                                    <ChevronDown size={14} />
                                  </button>
                                )}
                                <span className="vitals-date-label">
                                  {readingIndex === 0
                                    ? formatClinicalDateFromString(row.dateStr)
                                    : ''}
                                </span>
                                <span className="vitals-time-label">{formatVitalTimeLabel(row.dateStr)}</span>
                              </div>
                            </td>
                            {renderVitalTableCells(row)}
                          </tr>
                        ));
                      }

                      return (
                        <tr key={group.dayKey} className={isExpandable ? 'vitals-day-summary-row' : undefined}>
                          <td style={{ fontWeight: 500, color: 'var(--text-main)' }}>
                            <div className="vitals-date-cell">
                              {isExpandable && (
                                <button
                                  type="button"
                                  className="vitals-day-toggle"
                                  onClick={() => toggleVitalDayExpanded(group.dayKey)}
                                  aria-expanded={false}
                                  aria-label={`Expand ${group.readings.length} readings for ${formatClinicalDateFromString(summaryRow.dateStr)}`}
                                >
                                  <ChevronRight size={14} />
                                </button>
                              )}
                              <span className="vitals-date-label">
                                {formatClinicalDateFromString(summaryRow.dateStr)}
                              </span>
                              {isExpandable && (
                                <span className="vitals-reading-count">
                                  {group.readings.length} readings
                                </span>
                              )}
                            </div>
                          </td>
                          {renderVitalTableCells(summaryRow)}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </section>

      {/* 3. Step count, Sleep pattern & Laboratory tests */}
      <section className="wearable-metrics-row">
        <div className="wearable-metrics-panel wearable-metrics-panel-steps">
          <div className="wearable-metrics-panel-header">
            <h2 style={{ fontSize: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
              <Footprints size={20} style={{ color: 'var(--primary)' }} />
              Step count
            </h2>
          </div>
          <div className="wearable-metrics-panel-content">
          <div className="glass-card wearable-metrics-card">
            <div className="vital-value-display">
              <span className="vital-value">
                {latestStepCount != null ? formatSteps(latestStepCount) : 'N/A'}
              </span>
              <span className="vital-unit">steps today</span>
            </div>
            <div className="vital-chart-container wearable-chart-container">
              {stepChartPoints.length > 0 ? (
                <Line {...getChartConfig('Steps', stepChartPoints, '#0ea5e9', 'steps', undefined, false)} />
              ) : (
                <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  No step data available
                </div>
              )}
            </div>
            <div className="wearable-metrics-list">
              {[...dailyStepCounts].reverse().map((reading) => (
                <div key={reading.dateStr} className="wearable-metrics-list-row">
                  <span>{formatClinicalDateFromString(reading.dateStr)}</span>
                  <span>{formatSteps(reading.steps)} steps</span>
                </div>
              ))}
            </div>
            <WearableRangeToggle
              range={stepRange}
              onChange={setStepRange}
              visible={allDailyStepCounts.length > 0}
            />
          </div>
          </div>
        </div>

        <div className="wearable-metrics-panel wearable-metrics-panel-sleep">
          <div className="wearable-metrics-panel-header">
            <h2 style={{ fontSize: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
              <Moon size={20} style={{ color: 'var(--primary)' }} />
              Sleep pattern
            </h2>
          </div>
          <div className="wearable-metrics-panel-content">
          <div className="glass-card wearable-metrics-card">
            <div className="vital-value-display">
              <span className="vital-value">
                {latestSleep ? formatSleepHours(latestSleep.hours) : 'N/A'}
              </span>
              <span className="vital-unit">last night</span>
            </div>
            <div className="vital-chart-container wearable-chart-container">
              {sleepChartPoints.length > 0 ? (
                <Line {...getChartConfig('Sleep', sleepChartPoints, '#6366f1', 'h', undefined, false)} />
              ) : (
                <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  No sleep data available
                </div>
              )}
            </div>
            <div className="wearable-metrics-list">
              {[...sleepPattern].reverse().map((reading) => (
                <div key={reading.dateStr} className="wearable-metrics-list-row">
                  <span>{formatClinicalDateFromString(reading.dateStr)}</span>
                  <span>
                    {formatSleepHours(reading.hours)}
                    <span
                      className={`sleep-quality-badge sleep-quality-${reading.quality.toLowerCase()}`}
                    >
                      {reading.quality}
                    </span>
                  </span>
                </div>
              ))}
            </div>
            <WearableRangeToggle
              range={sleepRange}
              onChange={setSleepRange}
              visible={allSleepPattern.length > 0}
            />
          </div>
          </div>
        </div>

        <div className="wearable-metrics-panel wearable-metrics-panel-lab">
        <div className="wearable-metrics-panel-header wearable-metrics-lab-header">
          <h2 style={{ fontSize: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
            <FlaskConical size={20} style={{ color: 'var(--primary)' }} />
            Laboratory tests
          </h2>

          <div className="toggle-group vitals-section-toolbar-toggle">
            {showLaboratoryTests() && (
              <>
                <button
                  className={`toggle-btn ${labViewMode === 'chart' ? 'active' : ''}`}
                  onClick={() => setLabViewMode('chart')}
                >
                  <BarChart2 size={12} style={{ marginRight: '0.25rem', verticalAlign: 'middle' }} />
                  Chart View
                </button>
                <button
                  className={`toggle-btn ${labViewMode === 'table' ? 'active' : ''}`}
                  onClick={() => setLabViewMode('table')}
                >
                  <Table size={12} style={{ marginRight: '0.25rem', verticalAlign: 'middle' }} />
                  Table View
                </button>
              </>
            )}
          </div>
        </div>

        <div className="wearable-metrics-panel-content">
        {!showLaboratoryTests() ? (
          <div className="glass-card" style={{ textAlign: 'center', padding: '3rem 2rem', color: 'var(--text-muted)' }}>
            No laboratory tests recorded for this patient.
          </div>
        ) : labViewMode === 'chart' ? (
          <div className="lab-charts-stack">
            {showBloodGlucose() && renderLabChartCard(
              'Blood Glucose',
              glucoseData,
              filteredGlucose,
              '#f59e0b',
              <BloodGlucoseIcon size={20} />,
              glucoseData.length > 0
                ? `${glucoseData[glucoseData.length - 1].value.toFixed(0)} mg/dL`
                : 'N/A',
              'lab-latest-glucose',
              { range: glucoseRange, onChange: setGlucoseRange },
              {
                showAlert: hasVitalAlert('glucose'),
                alertTitle: vitalAlertTitle('glucose'),
              }
            )}
            {showWbcChart && renderWbcChartCard()}
            {showEgfrChart && renderEgfrChartCard()}
            {showLipidCharts && (
              <div className="glass-card lab-chart-card">
                <div className="vital-header lipid-panel-header">
                  <div className="lipid-panel-header-main">
                    <span className="vital-title">Lipid Panel</span>
                    <div className="lipid-panel-header-values">
                      <span className="lipid-latest-value lipid-latest-ldl">
                        LDL {latestLdl != null ? latestLdl.toFixed(0) : '—'}
                      </span>
                      <span className="lipid-latest-value lipid-latest-hdl">
                        HDL {latestHdl != null ? latestHdl.toFixed(0) : '—'}
                      </span>
                      <span className="lipid-latest-value lipid-latest-tg">
                        Triglycerides {latestTriglycerides != null ? latestTriglycerides.toFixed(0) : '—'}
                      </span>
                      <span className="lipid-latest-unit">mg/dL</span>
                    </div>
                  </div>
                  <FlaskConical size={18} style={{ color: 'var(--primary)', flexShrink: 0 }} />
                </div>
                <div className="vital-chart-container lab-chart-container lipid-panel-chart-container">
                  {lipidPanelChart.hasData ? (
                    <Line data={lipidPanelChart.data} options={lipidPanelChart.options} />
                  ) : (
                    <div
                      style={{
                        display: 'flex',
                        height: '100%',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '0.75rem',
                        color: 'var(--text-muted)',
                      }}
                    >
                      No lipid panel records available
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
            {groupedLabResults.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '4rem 2rem', color: 'var(--text-muted)' }}>
                No laboratory test results logged on the server.
              </div>
            ) : (
              <div className="table-container" style={{ border: 'none', margin: 0, borderRadius: 0 }}>
                <table className="premium-table vitals-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Test</th>
                      <th>Result</th>
                    </tr>
                  </thead>
                  <tbody>
                    {groupedLabResults.map((group) => {
                      const isExpandable = group.readings.length > 1;
                      const isExpanded = expandedLabDays.has(group.groupKey);
                      const summaryReading = group.readings[0];
                      const isGlucose = group.testCode === LOINC.bloodGlucose;
                      const isWbc = group.testCode === LOINC.wbcCount;
                      const isEgfr = group.testCode === LOINC.egfr;

                      const labResultColor = (value: number) => {
                        if (isGlucose) return '#f59e0b';
                        if (isWbc) return '#0d9488';
                        if (isEgfr && isEgfrAbnormal(value)) return '#ef4444';
                        if (isEgfr) return '#6366f1';
                        return 'var(--text-main)';
                      };

                      if (isExpandable && isExpanded) {
                        return group.readings.map((reading, readingIndex) => (
                          <tr
                            key={`${group.groupKey}-${readingIndex}`}
                            className={readingIndex > 0 ? 'vitals-day-detail-row' : 'vitals-day-expanded-row'}
                          >
                            <td style={{ fontWeight: 500, color: 'var(--text-main)' }}>
                              <div className="vitals-date-cell">
                                {readingIndex === 0 && (
                                  <button
                                    type="button"
                                    className="vitals-day-toggle"
                                    onClick={() => toggleLabDayExpanded(group.groupKey)}
                                    aria-expanded
                                    aria-label={`Collapse ${group.testName} readings for ${formatClinicalDateFromString(reading.dateStr)}`}
                                  >
                                    <ChevronDown size={14} />
                                  </button>
                                )}
                                <span className="vitals-date-label">
                                  {readingIndex === 0
                                    ? formatClinicalDateFromString(reading.dateStr)
                                    : ''}
                                </span>
                                <span className="vitals-time-label">{formatVitalTimeLabel(reading.dateStr)}</span>
                              </div>
                            </td>
                            <td style={{ fontWeight: 500 }}>{group.testName}</td>
                            <td style={{ fontWeight: 600, color: labResultColor(reading.value) }}>
                              {isGlucose ? (
                                <VitalReadingCell
                                  type="glucose"
                                  raw={String(reading.value)}
                                  display={formatLabResultDisplay(group.testCode, reading.value)}
                                />
                              ) : (
                                formatLabResultDisplay(group.testCode, reading.value)
                              )}
                            </td>
                          </tr>
                        ));
                      }

                      return (
                        <tr key={group.groupKey} className={isExpandable ? 'vitals-day-summary-row' : undefined}>
                          <td style={{ fontWeight: 500, color: 'var(--text-main)' }}>
                            <div className="vitals-date-cell">
                              {isExpandable && (
                                <button
                                  type="button"
                                  className="vitals-day-toggle"
                                  onClick={() => toggleLabDayExpanded(group.groupKey)}
                                  aria-expanded={false}
                                  aria-label={`Expand ${group.readings.length} ${group.testName} readings for ${formatClinicalDateFromString(summaryReading.dateStr)}`}
                                >
                                  <ChevronRight size={14} />
                                </button>
                              )}
                              <span className="vitals-date-label">
                                {formatClinicalDateFromString(summaryReading.dateStr)}
                              </span>
                              {isExpandable && (
                                <span className="vitals-reading-count">
                                  {group.readings.length} readings
                                </span>
                              )}
                            </div>
                          </td>
                          <td style={{ fontWeight: 500 }}>{group.testName}</td>
                          <td style={{ fontWeight: 600, color: labResultColor(summaryReading.value) }}>
                            {isGlucose ? (
                              <VitalReadingCell
                                type="glucose"
                                raw={String(summaryReading.value)}
                                display={formatLabResultDisplay(group.testCode, summaryReading.value)}
                              />
                            ) : (
                              formatLabResultDisplay(group.testCode, summaryReading.value)
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
        </div>
        </div>
      </section>

      {/* 4. Conditions & Medication Grid */}
      <section className="clinical-records-grid">
        
        {/* Conditions Card */}
        <div className="glass-card conditions-card">
          <div className="clinical-record-card-header">
            <FileText size={18} style={{ color: 'var(--primary)' }} />
            <h3 style={{ margin: 0, fontSize: '1rem' }}>Active Medical Diagnoses / Conditions</h3>
          </div>
          
          {sortedConditions.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem 2rem', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
              No current medical diagnoses reported.
            </div>
          ) : (
            <div className="table-container" style={{ border: 'none', margin: 0, borderRadius: 0 }}>
              <table className="premium-table">
                <thead>
                  <tr>
                    <th>Diagnosis / Condition</th>
                    <th>Clinical Status</th>
                    <th>Onset / Recorded Date</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleConditions.map((cond) => {
                    const onsetDateStr =
                      cond.recordedDate || cond.onsetDateTime || cond.meta?.lastUpdated;
                    const condName = getConditionName(cond);
                    const status = cond.clinicalStatus?.coding?.[0]?.code || 'active';
                    const isStatusActive = status === 'active';

                    return (
                      <tr key={cond.id}>
                        <td style={{ fontWeight: 500, color: 'var(--text-main)' }}>{condName}</td>
                        <td>
                          <span className="badge" style={{ 
                            background: isStatusActive ? 'rgba(16, 185, 129, 0.1)' : 'var(--border-card)', 
                            color: isStatusActive ? '#10b981' : 'var(--text-muted)',
                            fontWeight: 600,
                            fontSize: '0.7rem',
                            padding: '0.15rem 0.5rem'
                          }}>
                            {status}
                          </span>
                        </td>
                        <td style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                          {formatClinicalDateFromString(onsetDateStr)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {hiddenConditionCount > 0 && (
                <div className="clinical-list-more-row">
                  <button
                    type="button"
                    className="clinical-list-more-btn"
                    onClick={() => setShowAllConditions((current) => !current)}
                  >
                    {showAllConditions
                      ? 'Show fewer conditions'
                      : `${hiddenConditionCount} more condition${hiddenConditionCount === 1 ? '' : 's'}…`}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Medications Card */}
        <div className="glass-card medications-card">
          <div className="clinical-record-card-header">
            <Pill size={18} style={{ color: 'var(--primary)' }} />
            <h3 style={{ margin: 0, fontSize: '1rem' }}>Medication Prescriptions</h3>
          </div>

          {sortedMedications.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem 2rem', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
              No medication requests found.
            </div>
          ) : (
            <div className="table-container medications-table-container" style={{ border: 'none', margin: 0, borderRadius: 0 }}>
              <table className="premium-table medications-table">
                <thead>
                  <tr>
                    <th>Medication Name</th>
                    <th>Dosage</th>
                    <th>Frequency</th>
                    <th>Route</th>
                    <th>Start Date</th>
                    <th>End Date</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleMedications.map((med) => {
                    const medName = getMedicationName(med);
                    const status = med.status || 'unknown';
                    const dose = getMedicationDosage(med);
                    const frequency = getMedicationFrequency(med);
                    const route = getMedicationRoute(med);
                    const startDate = getMedicationStartDate(med);
                    const endDate = getMedicationEndDate(med);
                    const showEndDate = isCompletedMedicationStatus(status);
                    
                    // Determine status badge class
                    let statusBadgeClass = 'badge-unknown';
                    if (status === 'active') statusBadgeClass = 'badge-male';
                    if (status === 'completed') statusBadgeClass = 'badge-female';
                    if (status === 'stopped' || status === 'cancelled' || status === 'discontinued') statusBadgeClass = 'badge-other';

                    return (
                      <tr key={med.id}>
                        <td style={{ fontWeight: 500, color: 'var(--text-main)' }}>{medName}</td>
                        <td style={{ fontWeight: 500 }}>{dose}</td>
                        <td>{frequency}</td>
                        <td>{route}</td>
                        <td style={{ color: 'var(--text-muted)' }}>
                          {formatMedicationDate(startDate)}
                        </td>
                        <td style={{ color: 'var(--text-muted)' }}>
                          {showEndDate && endDate ? formatMedicationDate(endDate) : '—'}
                        </td>
                        <td>
                          <span className={`badge ${statusBadgeClass}`}>
                            {status}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {hiddenMedicationCount > 0 && (
                <div className="clinical-list-more-row">
                  <button
                    type="button"
                    className="clinical-list-more-btn"
                    onClick={() => setShowAllMedications((current) => !current)}
                  >
                    {showAllMedications
                      ? 'Show fewer medications'
                      : `${hiddenMedicationCount} more medication${hiddenMedicationCount === 1 ? '' : 's'}…`}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

      </section>

      {/* Chart drill-down modal */}
      {chartDrillDown && (
        <div className="modal-overlay" onClick={() => setChartDrillDown(null)}>
          <div className="modal-content glass-card" style={{ maxWidth: '800px' }} onClick={(e) => e.stopPropagation()}>
            <div className="flex-between" style={{ borderBottom: '1px solid var(--border-card)', paddingBottom: '1rem', marginBottom: '1.5rem' }}>
              <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.25rem', margin: 0 }}>
                {chartDrillDown.kind === 'weight' ? (
                  <>
                    <WeightIcon size={20} />
                    Weight readings — week ending {formatDateLabel(chartDrillDown.anchorDate)}
                  </>
                ) : (
                  <>
                    <Activity size={20} style={{ color: 'var(--primary)' }} />
                    Clinical Readings for {chartDrillDown.dateLabel}
                  </>
                )}
              </h2>
              <button className="btn btn-secondary btn-icon" onClick={() => setChartDrillDown(null)} aria-label="Close modal">
                <X size={18} />
              </button>
            </div>

            <div className="table-container" style={{ border: 'none', margin: 0, borderRadius: '8px', maxHeight: '450px', overflowY: 'auto' }}>
              {chartDrillDown.kind === 'weight' ? (
                <table className="premium-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Time</th>
                      <th>Weight (kg)</th>
                      <th>Change</th>
                    </tr>
                  </thead>
                  <tbody>
                    {weightDrillDownReadings.length === 0 ? (
                      <tr>
                        <td colSpan={4} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>
                          No weight readings in this 7-day period.
                        </td>
                      </tr>
                    ) : (
                      weightDrillDownReadings.map((reading) => {
                        const change = weightChangeLabels.get(reading.dateStr) ?? '—';
                        const isIncrease = change.startsWith('Increased');
                        const isDecrease = change.startsWith('Decreased');
                        const increaseMatch = change.match(/Increased ([0-9.]+) kg/);
                        const increaseDelta = increaseMatch?.[1];

                        return (
                          <tr key={reading.dateStr}>
                            <td style={{ fontWeight: 600, color: 'var(--text-main)' }}>
                              {formatClinicalDateFromString(reading.dateStr)}
                            </td>
                            <td>{formatVitalTimeLabel(reading.dateStr)}</td>
                            <td style={{ fontWeight: 600, color: '#8b5cf6' }}>
                              {reading.value.toFixed(1)} kg
                            </td>
                            <td
                              style={{
                                fontWeight: 500,
                                color: isIncrease
                                  ? '#b45309'
                                  : isDecrease
                                    ? '#059669'
                                    : 'var(--text-muted)',
                              }}
                            >
                              {isIncrease && increaseDelta ? (
                                <VitalReadingCell
                                  type="weight"
                                  raw={increaseDelta}
                                  display={change}
                                />
                              ) : (
                                change
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              ) : (
                <table className="premium-table">
                  <thead>
                    <tr>
                      <th>Time Logged</th>
                      <th>Heart Rate</th>
                      <th>Blood Pressure</th>
                      <th>Resp Rate</th>
                      <th>O₂ Sat</th>
                    </tr>
                  </thead>
                  <tbody>
                    {flatVitals
                      .filter((row) => formatDateLabel(new Date(row.dateStr)) === chartDrillDown.dateLabel)
                      .map((row, idx) => (
                        <tr key={idx}>
                          <td style={{ fontWeight: 600, color: 'var(--text-main)' }}>
                            {new Date(row.dateStr).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                          </td>
                          <td>
                            <VitalReadingCell
                              type="hr"
                              raw={row.hr}
                              display={row.hr ? `${row.hr} bpm` : '—'}
                            />
                          </td>
                          <td style={{ fontWeight: 600, color: 'var(--primary)' }}>
                            <VitalReadingCell
                              type="bp"
                              raw={row.bp}
                              display={row.bp ? `${row.bp} mmHg` : '—'}
                            />
                          </td>
                          <td>
                            <VitalReadingCell
                              type="rr"
                              raw={row.rr}
                              display={row.rr ? `${row.rr} /min` : '—'}
                            />
                          </td>
                          <td>
                            <VitalReadingCell
                              type="o2"
                              raw={row.o2}
                              display={row.o2 ? `${row.o2}%` : '—'}
                            />
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              )}
            </div>
            
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1.5rem', borderTop: '1px solid var(--border-card)', paddingTop: '1.25rem' }}>
              <button className="btn btn-primary" onClick={() => setChartDrillDown(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
