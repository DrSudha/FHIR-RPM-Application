'use client';

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Search, UserPlus, Edit3, Heart, RefreshCw, ChevronRight, AlertCircle, ClipboardList, Bell, CheckCircle2, Circle } from 'lucide-react';
import PatientForm from '@/components/PatientForm';
import WeightExploreModal, { type WeightExplorePatient } from '@/components/WeightExploreModal';
import MedicationRefillModal, {
  type MedicationRefillPatient,
} from '@/components/MedicationRefillModal';
import RpmLogoIcon from '@/components/RpmLogoIcon';
import HeaderUserChip from '@/components/HeaderUserChip';
import PatientNameHoverPreview from '@/components/PatientNameHoverPreview';
import {
  resolvePatientCareProfiles,
  getGeneralCareSubCategoryLabel,
} from '@/lib/careCategory';
import { getPatientPhone } from '@/lib/patientContact';
import {
  resolveCardiacVitalsTask,
  resolveMedicationRefillsTask,
  type DailyTaskAction,
} from '@/lib/dailyTaskActions';
import { resolveMissedGlucoseNotification, resolveWeightGainNotification, findPatientsWithWeightGainWarning } from '@/lib/notificationActions';
import {
  clearNotificationVitalAlerts,
  syncNotificationVitalAlerts,
} from '@/lib/notificationVitalAlerts';
import {
  clearTaskVitalOverrides,
  saveTaskVitalOverrides,
} from '@/lib/taskVitalOverrides';
import {
  groupGeneralCarePatientsBySubcategory,
  sortPatientsByRecentActivity,
} from '@/lib/patientListSort';
import {
  areAllRefillTasksComplete,
  countPendingRefillInitiations,
  type RefillTaskPatient,
} from '@/lib/medicationRefillWorkflow';

export default function Home() {
  const router = useRouter();
  const [patients, setPatients] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingPatient, setEditingPatient] = useState<any | undefined>(undefined);
  
  type PortalTab = 'tasks' | 'notifications';
  type CareCategory = 'diabetic' | 'cardiac' | 'other';

  const CARE_CATEGORY_GROUPS: {
    id: CareCategory;
    label: string;
    accent: string;
  }[] = [
    { id: 'diabetic', label: 'Diabetic Care', accent: 'var(--care-diabetic)' },
    { id: 'cardiac', label: 'Cardiovascular Care', accent: 'var(--care-cardiac)' },
    { id: 'other', label: 'General Care', accent: 'var(--care-general)' },
  ];

  const [expandedPortalTab, setExpandedPortalTab] = useState<PortalTab | null>(null);
  const [expandedCareCategories, setExpandedCareCategories] = useState<Set<CareCategory>>(new Set());
  const [activeTaskView, setActiveTaskView] = useState<{
    sourceId: string;
    sourceType: 'task' | 'notification';
    title: string;
    highlights: Map<string, string>;
    action?: DailyTaskAction;
    refillPatients?: RefillTaskPatient[];
  } | null>(null);
  const [taskActionLoading, setTaskActionLoading] = useState<string | null>(null);
  const [refillModalView, setRefillModalView] = useState<{
    patients: MedicationRefillPatient[];
    initialPatientIndex: number;
  } | null>(null);
  const [refillProgressVersion, setRefillProgressVersion] = useState(0);
  const [weightExploreView, setWeightExploreView] = useState<{
    notificationId: string;
    patients: WeightExplorePatient[];
  } | null>(null);
  const patientPanelRef = useRef<HTMLDivElement>(null);

  const handlePortalTabClick = (tab: PortalTab) => {
    setExpandedPortalTab((current) => (current === tab ? null : tab));
  };

  const toggleCareCategory = (category: CareCategory) => {
    setExpandedCareCategories((current) => {
      const next = new Set(current);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  };

  type NotificationAction = 'elevated-bp' | 'missed-glucose' | 'weight-gain';

  type DailyTaskItem = {
    id: string;
    title: string;
    due: string;
    done: boolean;
    action?: DailyTaskAction;
  };

  type PortalNotification = {
    id: string;
    title: string;
    detail: string;
    priority: 'high' | 'medium' | 'low';
    action?: NotificationAction;
    reviewed?: boolean;
    reviewedAt?: string;
  };

  const [dailyTasks, setDailyTasks] = useState<DailyTaskItem[]>([
    {
      id: '1',
      title: 'Review overnight vitals for cardiac patients',
      due: '09:00',
      done: false,
      action: 'cardiac-vitals',
    },
    {
      id: '2',
      title: 'Confirm medication refills',
      due: '11:30',
      done: false,
      action: 'med-refills',
    },
    { id: '3', title: 'Call back patients with missed readings', due: '14:00', done: true },
    { id: '4', title: 'Update care plans for diabetic cohort', due: '16:00', done: false },
  ]);

  const [attentionNotifications, setAttentionNotifications] = useState<PortalNotification[]>([
    {
      id: 'n1',
      title: 'Elevated cardiac findings',
      detail: '2 cardiac patients with Blood pressure and HR readings elevated.',
      priority: 'high',
      action: 'elevated-bp',
    },
    {
      id: 'n2',
      title: 'Missed glucose monitoring',
      detail: '1 diabetic patient has no blood glucose reading in the past 48 hours.',
      priority: 'medium',
      action: 'missed-glucose',
    },
    {
      id: 'n3',
      title: 'New patient registration',
      detail: 'Review demographics for patients added in the last week.',
      priority: 'low',
    },
  ]);

  /** Completing a cardiac vitals task also clears the related BP notification. */
  const LINKED_NOTIFICATION_BY_TASK: Record<string, string> = {
    '1': 'n1',
  };

  const LINKED_TASK_BY_NOTIFICATION: Record<string, string> = {
    'n1': '1',
    'n2': '4',
  };

  const calculateAgeYears = (birthDateStr?: string): string => {
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
    if (age < 0) return 'N/A';
    return `${age} years`;
  };

  // Render high-fidelity cropped patient avatar from shared assets sheet
  const renderAvatar = (genderStr: string, birthDateStr?: string, patientId?: string) => {
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
      '#b91c1c', // Autumn Red
      '#cbd5e1', // Snow White
    ];

    // Determine age to set hair color gray/white for senior patients
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
          width: '32px',
          height: '32px',
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

  // Fetch patients list with condition revincludes for categorization
  const fetchPatients = useCallback(async (query: string = '') => {
    setIsLoading(true);
    setError(null);
    try {
      let url = '/api/fhir/Patient';
      
      // Append name search parameter and request condition revinclude
      if (query.trim()) {
        url += `?name=${encodeURIComponent(query.trim())}&_revinclude=Condition:patient`;
      } else {
        url += '?_count=45&_revinclude=Condition:patient';
      }

      console.log('Fetching patients from proxy:', url);
      const response = await fetch(url);
      
      if (!response.ok) {
        const message =
          response.status === 502
            ? 'The FHIR server is temporarily unavailable (502 Bad Gateway). Please try again in a few minutes.'
            : `Failed to load patients. Server returned status code ${response.status}.`;
        throw new Error(message);
      }

      const data = await response.json();
      
      if (data.resourceType === 'Bundle' && data.entry) {
        const patientResources = data.entry
          .filter((e: any) => e.resource && e.resource.resourceType === 'Patient')
          .map((e: any) => e.resource);

        const patientIds = patientResources.map((p: any) => p.id).filter(Boolean);
        const careProfiles = await resolvePatientCareProfiles(patientIds);

        const parsed = patientResources.map((p: any) => ({
          ...p,
          clinicalCategory: careProfiles[p.id]?.category ?? 'other',
          generalCareSubCategory: careProfiles[p.id]?.generalCareSubCategory ?? null,
        }));
        
        setPatients(parsed);
      } else {
        setPatients([]);
      }
    } catch (err: any) {
      console.error('Error fetching patients:', err);
      setError(err.message || 'An error occurred while fetching the patient list.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    fetchPatients();
  }, [fetchPatients]);

  // Debounced search logic
  useEffect(() => {
    const delayDebounce = setTimeout(() => {
      fetchPatients(searchQuery);
    }, 400); // 400ms debounce delay

    return () => clearTimeout(delayDebounce);
  }, [searchQuery, fetchPatients]);

  // Expand care-category sections that contain search results (rows are hidden when collapsed)
  useEffect(() => {
    const query = searchQuery.trim();
    if (!query) {
      if (!activeTaskView) {
        setExpandedCareCategories(new Set());
      }
      return;
    }

    setActiveTaskView(null);

    const categoriesWithResults = new Set<CareCategory>();
    patients.forEach((p) => {
      const cat = p.clinicalCategory as CareCategory;
      if (cat === 'diabetic' || cat === 'cardiac' || cat === 'other') {
        categoriesWithResults.add(cat);
      }
    });
    setExpandedCareCategories(categoriesWithResults);
  }, [searchQuery, patients, activeTaskView]);

  useEffect(() => {
    if (patients.length === 0) return undefined;

    let cancelled = false;

    (async () => {
      try {
        const highlights = await findPatientsWithWeightGainWarning(
          patients.map((patient) => ({
            id: patient.id,
            clinicalCategory: patient.clinicalCategory as CareCategory,
          }))
        );

        if (cancelled) return;

        setAttentionNotifications((current) => {
          const base = current.filter((note) => note.id !== 'n-weight-gain');
          if (highlights.length === 0) return base;

          const detail =
            highlights.length === 1
              ? `${highlights[0].reason}.`
              : `${highlights.length} patients logged a weight increase of 1 kg or more in 1 day.`;

          return [
            ...base,
            {
              id: 'n-weight-gain',
              title: 'Rapid weight gain',
              detail,
              priority: 'high',
              action: 'weight-gain',
            },
          ];
        });
      } catch (err) {
        console.error('Failed to load weight gain notifications:', err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [patients]);

  useEffect(() => {
    if (patients.length === 0) return undefined;

    let cancelled = false;

    (async () => {
      try {
        await syncNotificationVitalAlerts(attentionNotifications, patients);
      } catch (err) {
        if (!cancelled) {
          console.error('Failed to sync notification vital alerts:', err);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [patients, attentionNotifications]);

  const handleEditClick = (e: React.MouseEvent, patient: any) => {
    e.stopPropagation(); // Avoid row click navigation
    setEditingPatient(patient);
    setIsFormOpen(true);
  };

  const handleCreateClick = () => {
    setEditingPatient(undefined);
    setIsFormOpen(true);
  };

  const handleRowClick = (patientId: string) => {
    if (!patientId) return;

    if (
      activeTaskView?.action === 'med-refills' &&
      activeTaskView.highlights.has(patientId)
    ) {
      const modalPatients: MedicationRefillPatient[] = Array.from(
        activeTaskView.highlights.keys()
      ).map((id) => {
        const patient = patients.find((p) => p.id === id);
        const givenName = patient?.name?.[0]?.given?.join(' ') || '';
        const familyName = patient?.name?.[0]?.family || '';
        const name = [givenName, familyName].filter(Boolean).join(' ') || 'Patient';
        const refillInfo = activeTaskView.refillPatients?.find((entry) => entry.patientId === id);

        return {
          id,
          name,
          reason: activeTaskView.highlights.get(id) ?? '',
          dueMedicationIds: refillInfo?.dueMedicationIds ?? [],
        };
      });

      const initialPatientIndex = Math.max(
        0,
        modalPatients.findIndex((patient) => patient.id === patientId)
      );

      setRefillModalView({ patients: modalPatients, initialPatientIndex });
      return;
    }

    router.push(`/patient/${patientId}`);
  };

  const handleTaskClick = async (task: (typeof dailyTasks)[number]) => {
    if (task.done || !task.action || taskActionLoading) return;

    setTaskActionLoading(task.id);
    setSearchQuery('');

    try {
      let expandCategories: CareCategory[] = [];
      let highlights = new Map<string, string>();

      if (task.action === 'cardiac-vitals') {
        const cardiacPatients = patients.filter((p) => p.clinicalCategory === 'cardiac');
        const result = await resolveCardiacVitalsTask(cardiacPatients);
        expandCategories = result.expandCategories;
        result.highlights.forEach((h) => highlights.set(h.patientId, h.reason));
        saveTaskVitalOverrides(
          result.highlights
            .map((h) => h.vitalOverride)
            .filter((override): override is NonNullable<typeof override> => Boolean(override))
        );
      } else if (task.action === 'med-refills') {
        const result = await resolveMedicationRefillsTask(
          patients.map((p) => ({ id: p.id, clinicalCategory: p.clinicalCategory as CareCategory }))
        );
        expandCategories = result.expandCategories;
        result.highlights.forEach((h) => highlights.set(h.patientId, h.reason));
        setActiveTaskView({
          sourceId: task.id,
          sourceType: 'task',
          title: task.title,
          highlights,
          action: 'med-refills',
          refillPatients: result.refillPatients ?? [],
        });
        setExpandedCareCategories(new Set(expandCategories));
        setExpandedPortalTab(null);

        requestAnimationFrame(() => {
          patientPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
        return;
      }

      setActiveTaskView({ sourceId: task.id, sourceType: 'task', title: task.title, highlights });
      setExpandedCareCategories(new Set(expandCategories));
      setExpandedPortalTab(null);

      requestAnimationFrame(() => {
        patientPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    } catch (err) {
      console.error('Task action failed:', err);
    } finally {
      setTaskActionLoading(null);
    }
  };

  const clearActiveTaskView = () => {
    if (activeTaskView) {
      const reviewedAt = new Date().toLocaleTimeString(undefined, {
        hour: '2-digit',
        minute: '2-digit',
      });

      if (activeTaskView.sourceType === 'task') {
        setDailyTasks((current) =>
          current.map((task) =>
            task.id === activeTaskView.sourceId ? { ...task, done: true } : task
          )
        );

        const linkedNotificationId = LINKED_NOTIFICATION_BY_TASK[activeTaskView.sourceId];
        if (linkedNotificationId) {
          setAttentionNotifications((current) =>
            current.map((note) =>
              note.id === linkedNotificationId
                ? { ...note, reviewed: true, reviewedAt }
                : note
            )
          );
          clearNotificationVitalAlerts(linkedNotificationId);
        }
      } else {
        setAttentionNotifications((current) =>
          current.map((note) =>
            note.id === activeTaskView.sourceId
              ? { ...note, reviewed: true, reviewedAt }
              : note
          )
        );
        clearNotificationVitalAlerts(activeTaskView.sourceId);

        const linkedTaskId = LINKED_TASK_BY_NOTIFICATION[activeTaskView.sourceId];
        if (linkedTaskId) {
          setDailyTasks((current) =>
            current.map((task) =>
              task.id === linkedTaskId ? { ...task, done: true } : task
            )
          );
        }
      }
    }

    setActiveTaskView(null);
    setExpandedCareCategories(new Set());
    clearTaskVitalOverrides();
  };

  const handleWeightExploreClose = () => {
    setWeightExploreView(null);
  };

  const handleWeightExploreMarkReviewed = () => {
    if (weightExploreView?.notificationId) {
      const reviewedAt = new Date().toLocaleTimeString(undefined, {
        hour: '2-digit',
        minute: '2-digit',
      });

      setAttentionNotifications((current) =>
        current.map((n) =>
          n.id === weightExploreView.notificationId
            ? { ...n, reviewed: true, reviewedAt }
            : n
        )
      );
      clearNotificationVitalAlerts(weightExploreView.notificationId);
    }

    setWeightExploreView(null);
    setExpandedPortalTab('notifications');
  };

  const applyListViewResult = (
    sourceId: string,
    sourceType: 'task' | 'notification',
    title: string,
    expandCategories: CareCategory[],
    highlights: Map<string, string>
  ) => {
    setActiveTaskView({ sourceId, sourceType, title, highlights });
    setExpandedCareCategories(new Set(expandCategories));
    setExpandedPortalTab(null);
    requestAnimationFrame(() => {
      patientPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  const handleNotificationClick = async (note: PortalNotification) => {
    if (!note.action || note.priority === 'low' || note.reviewed || taskActionLoading) return;

    setTaskActionLoading(note.id);
    setSearchQuery('');

    try {
      if (note.action === 'elevated-bp') {
        const cardiacPatients = patients.filter((p) => p.clinicalCategory === 'cardiac');
        const result = await resolveCardiacVitalsTask(cardiacPatients);
        const highlights = new Map<string, string>();
        result.highlights.forEach((h) => highlights.set(h.patientId, h.reason));
        saveTaskVitalOverrides(
          result.highlights
            .map((h) => h.vitalOverride)
            .filter((override): override is NonNullable<typeof override> => Boolean(override))
        );
        applyListViewResult(note.id, 'notification', note.title, result.expandCategories, highlights);
      } else if (note.action === 'missed-glucose') {
        const diabeticPatients = patients.filter((p) => p.clinicalCategory === 'diabetic');
        const result = await resolveMissedGlucoseNotification(
          diabeticPatients.map((p) => ({ id: p.id, clinicalCategory: p.clinicalCategory as CareCategory }))
        );

        if (result.navigateToPatientId) {
          setExpandedPortalTab(null);
          router.push(`/patient/${result.navigateToPatientId}`);
          return;
        }

        const highlights = new Map<string, string>();
        result.highlights.forEach((h) => highlights.set(h.patientId, h.reason));
        applyListViewResult(note.id, 'notification', note.title, result.expandCategories, highlights);
      } else if (note.action === 'weight-gain') {
        const result = await resolveWeightGainNotification(
          patients.map((p) => ({ id: p.id, clinicalCategory: p.clinicalCategory as CareCategory }))
        );

        if (result.highlights.length === 0) return;

        const explorePatients: WeightExplorePatient[] = result.highlights.map((highlight) => {
          const patient = patients.find((p) => p.id === highlight.patientId);
          const givenName = patient?.name?.[0]?.given?.join(' ') || '';
          const familyName = patient?.name?.[0]?.family || '';
          const name = [givenName, familyName].filter(Boolean).join(' ') || 'Patient';

          return {
            id: highlight.patientId,
            name,
            reason: highlight.reason,
          };
        });

        setExpandedPortalTab(null);
        setWeightExploreView({ notificationId: note.id, patients: explorePatients });
      }
    } catch (err) {
      console.error('Notification action failed:', err);
    } finally {
      setTaskActionLoading(null);
    }
  };

  const pendingTaskCount = dailyTasks.filter((t) => !t.done).length;
  const attentionCount = attentionNotifications.filter(
    (n) => n.priority !== 'low' && !n.reviewed
  ).length;

  const isSearching = searchQuery.trim().length > 0;

  const patientsByCategory = useMemo(
    (): Record<CareCategory, any[]> => ({
      diabetic: sortPatientsByRecentActivity(
        patients.filter((p) => p.clinicalCategory === 'diabetic')
      ),
      cardiac: sortPatientsByRecentActivity(
        patients.filter((p) => p.clinicalCategory === 'cardiac')
      ),
      other: sortPatientsByRecentActivity(
        patients.filter((p) => p.clinicalCategory === 'other')
      ),
    }),
    [patients]
  );

  const generalCareSubgroups = useMemo(
    () =>
      groupGeneralCarePatientsBySubcategory(
        patientsByCategory.other,
        getGeneralCareSubCategoryLabel
      ),
    [patientsByCategory.other]
  );

  const visibleCareCategories = CARE_CATEGORY_GROUPS.filter(
    (category) => !isSearching || patientsByCategory[category.id].length > 0
  );

  const pendingRefillCount = useMemo(() => {
    if (activeTaskView?.action !== 'med-refills') return 0;
    return countPendingRefillInitiations(activeTaskView.refillPatients ?? []);
  }, [activeTaskView, refillProgressVersion]);

  const allRefillsComplete = useMemo(() => {
    if (activeTaskView?.action !== 'med-refills') return true;
    return areAllRefillTasksComplete(activeTaskView.refillPatients ?? []);
  }, [activeTaskView, refillProgressVersion]);

  const renderPatientRow = (patient: any, options?: { hideSubcategoryBadge?: boolean }) => {
    const givenName = patient.name?.[0]?.given?.join(' ') || '';
    const familyName = patient.name?.[0]?.family || '';
    const fullName = [givenName, familyName].filter(Boolean).join(' ') || 'Unnamed Record';
    const gender = patient.gender || 'unknown';
    const birthDateStr = patient.birthDate;
    const patientPhone = getPatientPhone(patient);
    const taskHighlight = activeTaskView?.highlights.get(patient.id);

    return (
      <tr
        key={patient.id}
        onClick={() => handleRowClick(patient.id)}
        className={taskHighlight ? 'patient-row-task-highlight' : undefined}
        style={{ cursor: 'pointer' }}
      >
        <td className="patient-name-cell">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            {renderAvatar(gender, birthDateStr, patient.id)}
            <div className="patient-name-stack">
              <div className="patient-name-row">
                <PatientNameHoverPreview patient={patient} fullName={fullName} />
                {patient.clinicalCategory === 'other' &&
                  patient.generalCareSubCategory &&
                  !options?.hideSubcategoryBadge && (
                  <span className="patient-subcategory-badge">
                    {getGeneralCareSubCategoryLabel(patient.generalCareSubCategory)}
                  </span>
                )}
              </div>
              {taskHighlight && (
                <span className="patient-task-flag" title={taskHighlight}>
                  {taskHighlight}
                </span>
              )}
            </div>
          </div>
        </td>
        <td>
          <span className={`badge badge-${gender}`}>{gender}</span>
        </td>
        <td style={{ color: 'var(--text-muted)', fontWeight: 500 }}>
          {calculateAgeYears(birthDateStr)}
        </td>
        <td style={{ color: 'var(--text-muted)', fontWeight: 500, fontSize: '0.8125rem' }}>
          {patientPhone || '—'}
        </td>
        <td style={{ textAlign: 'right' }}>
          <div style={{ display: 'inline-flex', gap: '0.5rem' }} onClick={(e) => e.stopPropagation()}>
            <button
              className="btn btn-secondary"
              onClick={(e) => handleEditClick(e, patient)}
              style={{ padding: '0.375rem 0.75rem', fontSize: '0.75rem', borderRadius: '6px' }}
            >
              <Edit3 size={12} />
              Edit
            </button>
            <button
              className="btn btn-secondary btn-icon"
              onClick={() => handleRowClick(patient.id)}
              style={{ padding: '0.375rem', borderRadius: '6px' }}
              title="View Details"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </td>
      </tr>
    );
  };

  const renderPatientTable = (
    categoryPatients: any[],
    options?: { hideSubcategoryBadge?: boolean }
  ) => (
    <div className="table-container" style={{ border: 'none', margin: 0, borderRadius: 0 }}>
      <table className="premium-table">
        <thead>
          <tr>
            <th>Patient Full Name</th>
            <th>Gender</th>
            <th>Age</th>
            <th>Phone</th>
            <th style={{ textAlign: 'right' }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {categoryPatients.map((patient) => renderPatientRow(patient, options))}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="app-container app-home">
      {/* Premium Portal Header */}
      <header className="app-header-bar">
        <div className="app-header-brand">
          <div className="app-logo-mark">
            <RpmLogoIcon size={22} className="app-logo-icon" />
          </div>
          <h1 className="app-header-title">Pro Health - Remote Patient Monitoring</h1>
          <p className="app-header-tagline">
            <span className="app-header-tagline-lead">We care for your health</span>
            <span className="app-header-tagline-divider" aria-hidden="true" />
            <span className="app-header-tagline-accent">proactively!</span>
          </p>
        </div>

        <HeaderUserChip />

      </header>

      {/* Portal toolbar: tabs + register */}
      <div className={`portal-toolbar ${expandedPortalTab ? 'portal-toolbar-expanded' : 'portal-toolbar-collapsed'}`}>
        <div className="portal-tabs">
          <button
            type="button"
            className={`portal-tab ${expandedPortalTab === 'tasks' ? 'active' : ''}`}
            onClick={() => handlePortalTabClick('tasks')}
            aria-expanded={expandedPortalTab === 'tasks'}
          >
            <ClipboardList size={16} />
            Daily tasks
            {pendingTaskCount > 0 && <span className="portal-tab-badge">{pendingTaskCount}</span>}
          </button>
          <button
            type="button"
            className={`portal-tab ${expandedPortalTab === 'notifications' ? 'active' : ''}`}
            onClick={() => handlePortalTabClick('notifications')}
            aria-expanded={expandedPortalTab === 'notifications'}
          >
            <Bell size={16} />
            Notifications
            {attentionCount > 0 && <span className="portal-tab-badge portal-tab-badge-alert">{attentionCount}</span>}
          </button>
        </div>
        <button className="btn btn-primary portal-toolbar-action" onClick={handleCreateClick}>
          <UserPlus size={16} />
          Register Patient
        </button>
      </div>

      {/* Tab panel (expanded on tab click only) */}
      {expandedPortalTab && (
      <div className="glass-card portal-tab-panel">
        {expandedPortalTab === 'tasks' && (
          <div>
            <h2 style={{ fontSize: '1rem', margin: '0 0 1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <ClipboardList size={18} style={{ color: 'var(--primary)' }} />
              Today&apos;s tasks
            </h2>
            <ul className="task-list">
              {dailyTasks.map((task) => (
                <li
                  key={task.id}
                  className={`task-item ${task.done ? 'task-item-done' : ''} ${
                    task.action && !task.done ? 'task-item-clickable' : ''
                  } ${activeTaskView?.sourceId === task.id && activeTaskView?.sourceType === 'task' ? 'task-item-active' : ''}`}
                  onClick={() => handleTaskClick(task)}
                  onKeyDown={(event) => {
                    if (task.action && !task.done && (event.key === 'Enter' || event.key === ' ')) {
                      event.preventDefault();
                      void handleTaskClick(task);
                    }
                  }}
                  role={task.action && !task.done ? 'button' : undefined}
                  tabIndex={task.action && !task.done ? 0 : undefined}
                  aria-busy={taskActionLoading === task.id}
                >
                  {task.done ? (
                    <CheckCircle2 size={18} style={{ color: 'var(--success)', flexShrink: 0, marginTop: '0.1rem' }} />
                  ) : taskActionLoading === task.id ? (
                    <RefreshCw size={18} className="spin" style={{ color: 'var(--primary)', flexShrink: 0, marginTop: '0.1rem' }} />
                  ) : (
                    <Circle size={18} style={{ color: 'var(--text-muted)', flexShrink: 0, marginTop: '0.1rem' }} />
                  )}
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 500, textDecoration: task.done ? 'line-through' : 'none' }}>
                      {task.title}
                      {task.action && !task.done && (
                        <span className="task-item-hint"> — click to open list</span>
                      )}
                    </div>
                    <div className="text-muted" style={{ fontSize: '0.75rem', marginTop: '0.2rem' }}>
                      Due by {task.due}
                      {task.done && (
                        <span className="reviewed-at-label"> · Completed</span>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {expandedPortalTab === 'notifications' && (
          <div>
            <h2 style={{ fontSize: '1rem', margin: '0 0 1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Bell size={18} style={{ color: 'var(--danger)' }} />
              Requiring attention
            </h2>
            <ul className="notification-list">
              {attentionNotifications.map((note) => (
                <li
                  key={note.id}
                  className={`notification-item ${
                    note.reviewed ? 'notification-item-reviewed' : ''
                  } ${
                    note.action && note.priority !== 'low' && !note.reviewed
                      ? 'notification-item-clickable'
                      : ''
                  } ${
                    activeTaskView?.sourceId === note.id && activeTaskView?.sourceType === 'notification'
                      ? 'notification-item-active'
                      : ''
                  }`}
                  style={{
                    borderLeftWidth: '4px',
                    borderLeftColor: note.reviewed
                      ? 'var(--success)'
                      : note.priority === 'high'
                        ? 'var(--danger)'
                        : note.priority === 'medium'
                          ? 'var(--warning)'
                          : '#94a3b8',
                  }}
                  onClick={() => handleNotificationClick(note)}
                  onKeyDown={(event) => {
                    if (
                      note.action &&
                      note.priority !== 'low' &&
                      !note.reviewed &&
                      (event.key === 'Enter' || event.key === ' ')
                    ) {
                      event.preventDefault();
                      void handleNotificationClick(note);
                    }
                  }}
                  role={note.action && note.priority !== 'low' && !note.reviewed ? 'button' : undefined}
                  tabIndex={note.action && note.priority !== 'low' && !note.reviewed ? 0 : undefined}
                  aria-busy={taskActionLoading === note.id}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
                    {note.reviewed ? (
                      <CheckCircle2
                        size={18}
                        style={{ color: 'var(--success)', flexShrink: 0, marginTop: '0.1rem' }}
                      />
                    ) : taskActionLoading === note.id ? (
                      <RefreshCw size={18} className="spin" style={{ color: 'var(--primary)', flexShrink: 0, marginTop: '0.1rem' }} />
                    ) : (
                      <AlertCircle
                        size={18}
                        style={{
                          color:
                            note.priority === 'high'
                              ? '#ef4444'
                              : note.priority === 'medium'
                                ? '#f59e0b'
                                : '#94a3b8',
                          flexShrink: 0,
                          marginTop: '0.1rem',
                        }}
                      />
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem', flexWrap: 'wrap' }}>
                        <span
                          style={{
                            fontWeight: 600,
                            fontSize: '0.875rem',
                            textDecoration: note.reviewed ? 'line-through' : 'none',
                            opacity: note.reviewed ? 0.75 : 1,
                          }}
                        >
                          {note.title}
                        </span>
                        <span
                          className="badge"
                          style={{
                            marginLeft: 'auto',
                            fontSize: '0.65rem',
                            textTransform: 'uppercase',
                            background: note.reviewed
                              ? 'var(--success-light)'
                              : note.priority === 'high'
                                ? 'rgba(239, 68, 68, 0.1)'
                                : note.priority === 'medium'
                                  ? 'rgba(245, 158, 11, 0.1)'
                                  : 'var(--border-card)',
                            color: note.reviewed
                              ? 'var(--success)'
                              : note.priority === 'high'
                                ? '#ef4444'
                                : note.priority === 'medium'
                                  ? '#f59e0b'
                                  : 'var(--text-muted)',
                          }}
                        >
                          {note.reviewed ? 'Reviewed' : note.priority}
                        </span>
                      </div>
                      <p
                        className="text-muted"
                        style={{
                          fontSize: '0.8125rem',
                          margin: 0,
                          textDecoration: note.reviewed ? 'line-through' : 'none',
                          opacity: note.reviewed ? 0.7 : 1,
                        }}
                      >
                        {note.detail}
                        {!note.reviewed && note.action && note.priority !== 'low' && (
                          <span className="task-item-hint"> — click to review</span>
                        )}
                        {note.reviewed && note.reviewedAt && (
                          <span className="reviewed-at-label"> — Reviewed at {note.reviewedAt}</span>
                        )}
                      </p>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
      )}

      {/* Content Area */}
      {error ? (
        <div className="glass-card" style={{ textAlign: 'center', padding: '3rem 2rem', borderColor: 'rgba(239, 68, 68, 0.2)' }}>
          <div style={{ color: 'var(--danger)', marginBottom: '1rem' }}>
            <AlertCircle size={48} style={{ margin: '0 auto' }} />
          </div>
          <h3 style={{ fontSize: '1.25rem', marginBottom: '0.5rem' }}>Failed to Fetch Clinical Data</h3>
          <p className="text-muted" style={{ maxWidth: '500px', margin: '0 auto 1.5rem' }}>
            {error}
          </p>
          <button className="btn btn-primary" onClick={() => fetchPatients(searchQuery)}>
            <RefreshCw size={14} style={{ marginRight: '0.5rem' }} />
            Try Reconnecting
          </button>
        </div>
      ) : isLoading && patients.length === 0 ? (
        /* Animated Loading Skeletons */
        <div className="glass-card" style={{ padding: '2rem' }}>
          <div className="skeleton skeleton-title" style={{ width: '20%' }}></div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1.5rem' }}>
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="skeleton skeleton-text" style={{ height: '3.5rem', borderRadius: '8px' }}></div>
            ))}
          </div>
        </div>
      ) : (
        /* Patient Data Grid */
        <div className="glass-card patient-panel" ref={patientPanelRef}>
          <div className="patient-panel-header">
            {activeTaskView && (
              <div className="task-view-banner">
                <div className="task-view-banner-text">
                  <strong>{activeTaskView.sourceType === 'notification' ? 'Notification' : 'Task'}:</strong>{' '}
                  {activeTaskView.title}
                  {activeTaskView.highlights.size > 0 ? (
                    <span className="text-muted">
                      {' '}
                      — {activeTaskView.highlights.size} patient
                      {activeTaskView.highlights.size === 1 ? '' : 's'} highlighted
                      {activeTaskView.action === 'med-refills' && pendingRefillCount > 0 && (
                        <>
                          {' '}
                          · {pendingRefillCount} refill initiation
                          {pendingRefillCount === 1 ? '' : 's'} pending
                        </>
                      )}
                    </span>
                  ) : (
                    <span className="text-muted"> — no matching patients flagged</span>
                  )}
                  {activeTaskView.action === 'med-refills' && activeTaskView.highlights.size > 0 && (
                    <span className="task-view-banner-hint">
                      Click a highlighted patient to review medications and initiate refills.
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  className="btn btn-secondary task-view-clear"
                  onClick={clearActiveTaskView}
                  disabled={activeTaskView.action === 'med-refills' && !allRefillsComplete}
                  title={
                    activeTaskView.action === 'med-refills' && !allRefillsComplete
                      ? 'Initiate all due refills before marking this task complete'
                      : undefined
                  }
                >
                  {activeTaskView.sourceType === 'notification' ? 'Mark reviewed' : 'Mark completed'}
                </button>
              </div>
            )}
            <h2 className="patient-panel-title">
              <Heart size={16} className="patient-panel-title-icon" />
              Patients list
              <span className="text-muted" style={{ fontSize: '0.875rem', fontWeight: 500 }}>
                ({patients.length})
              </span>
            </h2>

            <div className="patient-search-section">
              <div className="patient-search-label">
                I am looking for ....
              </div>
              <div className="patient-search-row">
                <div className="patient-search-input-wrap">
                  <Search size={18} className="patient-search-icon" />
                  <input
                    type="text"
                    className="form-input patient-search-input"
                    placeholder="Search patients by name (e.g. Smith, John)..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
                <button
                  className="btn btn-secondary btn-icon"
                  onClick={() => fetchPatients(searchQuery)}
                  disabled={isLoading}
                  title="Refresh List"
                >
                  <RefreshCw size={18} className={isLoading ? 'spin' : ''} />
                </button>
              </div>
            </div>
          </div>

          {patients.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '4rem 2rem' }}>
              <p className="text-muted" style={{ marginBottom: '1.5rem' }}>No patients found.</p>
              <button className="btn btn-primary" onClick={handleCreateClick}>
                <UserPlus size={14} />
                Register Patient
              </button>
            </div>
          ) : (
            <div className="patient-category-list" style={{ padding: '0 1.5rem 1.5rem' }}>
              {isSearching && visibleCareCategories.length === 0 && (
                <p className="text-muted" style={{ fontSize: '0.875rem', padding: '0.5rem 0 1rem' }}>
                  No patients match your search.
                </p>
              )}
              {visibleCareCategories.map((category) => {
                const categoryPatients = patientsByCategory[category.id];
                const isExpanded = expandedCareCategories.has(category.id);

                return (
                  <div
                    key={category.id}
                    className="patient-category-group"
                    data-category={category.id}
                    style={{ borderLeftColor: category.accent }}
                  >
                    <button
                      type="button"
                      className={`patient-category-header ${isExpanded ? 'expanded' : ''}`}
                      onClick={() => toggleCareCategory(category.id)}
                      aria-expanded={isExpanded}
                    >
                      <ChevronRight
                        size={18}
                        className="patient-category-chevron"
                        style={{ color: category.accent }}
                      />
                      <span className="patient-category-title" style={{ color: category.accent }}>
                        {category.label}
                      </span>
                      <span className="patient-category-count text-muted">
                        {categoryPatients.length} patient{categoryPatients.length === 1 ? '' : 's'}
                      </span>
                    </button>

                    {isExpanded && (
                      <div className="patient-category-body">
                        {categoryPatients.length === 0 ? (
                          <p className="text-muted" style={{ fontSize: '0.875rem', padding: '1rem 1.25rem' }}>
                            No patients in this care category.
                          </p>
                        ) : category.id === 'other' ? (
                          <div className="patient-subcategory-list">
                            {generalCareSubgroups.map((group) => (
                              <section
                                key={group.subCategory ?? 'general-care'}
                                className="patient-subcategory-group"
                              >
                                <div className="patient-subcategory-header">
                                  <span className="patient-subcategory-title">{group.label}</span>
                                  <span className="patient-subcategory-count text-muted">
                                    {group.patients.length} patient
                                    {group.patients.length === 1 ? '' : 's'}
                                  </span>
                                </div>
                                {renderPatientTable(group.patients, { hideSubcategoryBadge: true })}
                              </section>
                            ))}
                          </div>
                        ) : (
                          renderPatientTable(categoryPatients)
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Register/Edit Patient Form Modal */}
      {weightExploreView && (
        <WeightExploreModal
          patients={weightExploreView.patients}
          onClose={handleWeightExploreClose}
          onMarkReviewed={handleWeightExploreMarkReviewed}
        />
      )}

      {refillModalView && (
        <MedicationRefillModal
          patients={refillModalView.patients}
          initialPatientIndex={refillModalView.initialPatientIndex}
          onClose={() => setRefillModalView(null)}
          onRefillInitiated={() => setRefillProgressVersion((current) => current + 1)}
        />
      )}

      <PatientForm
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        patientToEdit={editingPatient}
        onSuccess={() => fetchPatients(searchQuery)}
      />

      <style jsx global>{`
        .pulse {
          animation: pulse-animation 2s infinite;
        }
        @keyframes pulse-animation {
          0% { transform: scale(1); }
          50% { transform: scale(1.08); }
          100% { transform: scale(1); }
        }
        .spin {
          animation: spin-animation 1s linear infinite;
        }
        @keyframes spin-animation {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
