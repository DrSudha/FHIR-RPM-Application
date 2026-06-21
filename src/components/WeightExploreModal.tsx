'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { X } from 'lucide-react';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Filler,
  type ChartOptions,
} from 'chart.js';
import {
  buildWeightChangeLabels,
  collapseWeightObservationsByDay,
  findLatestDailyWeightIncrease,
  formatWeightChartDate,
} from '@/lib/patientAnthropometrics';
import { formatClinicalDateFromString } from '@/lib/patientClinicalLists';
import VitalReadingCell from '@/components/VitalReadingCell';
import { WeightIcon } from '@/components/VitalIcons';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Filler);

type WeightPoint = { date: Date; dateStr: string; value: number };

export type WeightExplorePatient = {
  id: string;
  name: string;
  reason: string;
};

interface WeightExploreModalProps {
  patients: WeightExplorePatient[];
  initialPatientIndex?: number;
  onClose: () => void;
  onMarkReviewed: () => void;
  readOnly?: boolean;
}

function formatVitalTimeLabel(dateStr: string): string {
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return dateStr;
  return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

export default function WeightExploreModal({
  patients,
  initialPatientIndex = 0,
  onClose,
  onMarkReviewed,
  readOnly = false,
}: WeightExploreModalProps) {
  const router = useRouter();
  const [activeIndex, setActiveIndex] = useState(initialPatientIndex);
  const [weightData, setWeightData] = useState<WeightPoint[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const activePatient = patients[activeIndex] ?? patients[0];

  useEffect(() => {
    if (!activePatient?.id) return undefined;

    let cancelled = false;

    (async () => {
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch(
          `/api/fhir/Observation?subject=Patient/${activePatient.id}&code=29463-7&_sort=date&_count=60`
        );
        if (!response.ok) {
          throw new Error(`Failed to load weight data (${response.status})`);
        }

        const bundle = await response.json();
        const points: WeightPoint[] = (bundle.entry || [])
          .map((entry: { resource?: { effectiveDateTime?: string; valueQuantity?: { value?: number } } }) => {
            const dateStr = entry.resource?.effectiveDateTime;
            const value = entry.resource?.valueQuantity?.value;
            if (!dateStr || typeof value !== 'number') return null;
            const date = new Date(dateStr);
            if (Number.isNaN(date.getTime())) return null;
            return { date, dateStr, value };
          })
          .filter((point: WeightPoint | null): point is WeightPoint => point !== null);

        if (cancelled) return;
        setWeightData(collapseWeightObservationsByDay(points));
      } catch (err: unknown) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Unable to load weight readings');
          setWeightData([]);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activePatient?.id]);

  const latestIncrease = useMemo(() => findLatestDailyWeightIncrease(weightData), [weightData]);
  const changeLabels = useMemo(() => buildWeightChangeLabels(weightData), [weightData]);

  const chartConfig = useMemo(() => {
    const labels = weightData.map((point) => formatWeightChartDate(point.date));
    const values = weightData.map((point) => point.value);

    const chartData = {
      labels,
      datasets: [
        {
          label: 'Weight (kg)',
          data: values,
          borderColor: '#8b5cf6',
          backgroundColor: 'rgba(139, 92, 246, 0.12)',
          borderWidth: 2.5,
          pointBackgroundColor: '#8b5cf6',
          pointRadius: 4,
          pointHoverRadius: 7,
          tension: 0.3,
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
          padding: 12,
          backgroundColor: 'rgba(15, 23, 42, 0.9)',
          callbacks: {
            label: (context) => ` ${context.parsed.y} kg`,
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { font: { family: 'Inter', size: 11 }, maxTicksLimit: 8 },
        },
        y: {
          grid: { color: 'rgba(156, 163, 175, 0.12)' },
          ticks: { font: { family: 'Inter', size: 11 } },
          title: {
            display: true,
            text: 'kg',
            font: { family: 'Inter', size: 11 },
            color: '#64748b',
          },
        },
      },
    };

    return { data: chartData, options };
  }, [weightData]);

  const tableReadings = useMemo(
    () => [...weightData].sort((a, b) => b.date.getTime() - a.date.getTime()),
    [weightData]
  );

  if (!activePatient) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content glass-card weight-explore-modal"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="weight-explore-modal-header">
          <div>
            <h2 className="weight-explore-modal-title">
              <WeightIcon size={22} />
              Weight trend — {activePatient.name}
            </h2>
            <p className="weight-explore-modal-subtitle">{activePatient.reason}</p>
          </div>
          <button
            type="button"
            className="btn btn-secondary btn-icon"
            onClick={onClose}
            aria-label="Close weight chart"
          >
            <X size={18} />
          </button>
        </div>

        {patients.length > 1 && (
          <div className="weight-explore-patient-tabs">
            {patients.map((patient, index) => (
              <button
                key={patient.id}
                type="button"
                className={`weight-explore-patient-tab ${index === activeIndex ? 'active' : ''}`}
                onClick={() => setActiveIndex(index)}
              >
                {patient.name}
              </button>
            ))}
          </div>
        )}

        {latestIncrease && (
          <div className="weight-explore-alert-banner">
            <VitalReadingCell
              type="weight"
              raw={String(latestIncrease.deltaKg)}
              display={`Warning: increased ${latestIncrease.deltaKg} kg in 1 day (${latestIncrease.previousKg} → ${latestIncrease.currentKg} kg)`}
            />
          </div>
        )}

        <div className="weight-explore-chart-panel">
          {isLoading ? (
            <div className="weight-explore-chart-empty">Loading weight chart…</div>
          ) : error ? (
            <div className="weight-explore-chart-empty">{error}</div>
          ) : weightData.length === 0 ? (
            <div className="weight-explore-chart-empty">No weight readings available.</div>
          ) : (
            <div className="weight-explore-chart-container">
              <Line data={chartConfig.data} options={chartConfig.options} />
            </div>
          )}
        </div>

        {!isLoading && !error && tableReadings.length > 0 && (
          <div className="table-container weight-explore-table-wrap">
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
                {tableReadings.map((reading) => {
                  const change = changeLabels.get(reading.dateStr) ?? '—';
                  const isIncrease = change.startsWith('Increased');
                  const isDecrease = change.startsWith('Decreased');
                  const increaseMatch = change.match(/Increased ([0-9.]+) kg/);
                  const increaseDelta = increaseMatch?.[1];

                  return (
                    <tr key={reading.dateStr}>
                      <td style={{ fontWeight: 600 }}>
                        {formatClinicalDateFromString(reading.dateStr)}
                      </td>
                      <td>{formatVitalTimeLabel(reading.dateStr)}</td>
                      <td style={{ fontWeight: 600, color: '#8b5cf6' }}>
                        {reading.value.toFixed(1)} kg
                      </td>
                      <td
                        style={{
                          fontWeight: 500,
                          color: isIncrease ? '#b45309' : isDecrease ? '#059669' : 'var(--text-muted)',
                        }}
                      >
                        {isIncrease && increaseDelta ? (
                          <VitalReadingCell type="weight" raw={increaseDelta} display={change} />
                        ) : (
                          change
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="weight-explore-modal-footer">
          <div className="weight-explore-modal-footer-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Close
            </button>
            {!readOnly && (
            <button type="button" className="btn btn-primary" onClick={onMarkReviewed}>
              Mark reviewed
            </button>
            )}
          </div>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => {
              onClose();
              router.push(`/patient/${activePatient.id}`);
            }}
          >
            Open patient chart
          </button>
        </div>
      </div>
    </div>
  );
}
