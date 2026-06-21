'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  BarChart3,
  Bell,
  ClipboardList,
  RefreshCw,
  ShieldAlert,
  Users,
} from 'lucide-react';
import { Bar, Doughnut, Line } from 'react-chartjs-2';
import {
  ArcElement,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Filler,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
} from 'chart.js';
import RpmLogoIcon from '@/components/RpmLogoIcon';
import HeaderUserChip from '@/components/HeaderUserChip';
import ReadOnlyBanner from '@/components/ReadOnlyBanner';
import { useSessionUser } from '@/hooks/useSessionUser';
import {
  loadInsightsSnapshot,
  type InsightsSnapshot,
  type RiskTier,
} from '@/lib/insightsAnalytics';
import './insights.css';

ChartJS.register(
  ArcElement,
  BarElement,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
  Filler
);

const CARE_COLORS = {
  diabetic: '#c9922e',
  cardiac: '#d4727d',
  other: '#6b9bd1',
};

const RISK_COLORS: Record<RiskTier, string> = {
  low: '#2ea87a',
  medium: '#d4923a',
  high: '#d4727d',
  critical: '#dc6b6b',
};

const chartFont = { family: 'Inter, sans-serif', size: 11 };

function formatGeneratedAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function careCategoryLabel(category: string): string {
  if (category === 'diabetic') return 'Diabetic Care';
  if (category === 'cardiac') return 'Cardiovascular Care';
  return 'General Care';
}

export default function InsightsPage() {
  const [snapshot, setSnapshot] = useState<InsightsSnapshot | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { canMutate } = useSessionUser();

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await loadInsightsSnapshot();
      setSnapshot(data);
    } catch (err: any) {
      setError(err.message || 'Unable to load insights.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const careCategoryChart = useMemo(() => {
    if (!snapshot) return null;
    const { byCareCategory } = snapshot.population;
    return {
      data: {
        labels: ['Diabetic Care', 'Cardiovascular Care', 'General Care'],
        datasets: [
          {
            data: [byCareCategory.diabetic, byCareCategory.cardiac, byCareCategory.other],
            backgroundColor: [CARE_COLORS.diabetic, CARE_COLORS.cardiac, CARE_COLORS.other],
            borderWidth: 0,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom' as const, labels: { font: chartFont, boxWidth: 10 } },
        },
      },
    };
  }, [snapshot]);

  const ageBandChart = useMemo(() => {
    if (!snapshot) return null;
    return {
      data: {
        labels: snapshot.population.ageBands.map((band) => band.label),
        datasets: [
          {
            label: 'Patients',
            data: snapshot.population.ageBands.map((band) => band.count),
            backgroundColor: 'hsla(168, 45%, 42%, 0.75)',
            borderRadius: 6,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { font: chartFont }, grid: { display: false } },
          y: { beginAtZero: true, ticks: { stepSize: 1, font: chartFont }, grid: { color: 'rgba(0,0,0,0.05)' } },
        },
      },
    };
  }, [snapshot]);

  const genderChart = useMemo(() => {
    if (!snapshot) return null;
    return {
      data: {
        labels: snapshot.population.genderCounts.map((entry) => entry.label),
        datasets: [
          {
            label: 'Patients',
            data: snapshot.population.genderCounts.map((entry) => entry.count),
            backgroundColor: ['#6b9bd1', '#d4727d', '#94a3b8'],
            borderRadius: 6,
          },
        ],
      },
      options: {
        indexAxis: 'y' as const,
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { beginAtZero: true, ticks: { stepSize: 1, font: chartFont }, grid: { color: 'rgba(0,0,0,0.05)' } },
          y: { ticks: { font: chartFont }, grid: { display: false } },
        },
      },
    };
  }, [snapshot]);

  const subCategoryChart = useMemo(() => {
    if (!snapshot) return null;
    const entries = Object.entries(snapshot.population.byGeneralSubCategory);
    if (entries.length === 0) return null;

    return {
      data: {
        labels: entries.map(([label]) => label),
        datasets: [
          {
            label: 'Patients',
            data: entries.map(([, count]) => count),
            backgroundColor: 'hsla(24, 85%, 58%, 0.75)',
            borderRadius: 6,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { font: chartFont }, grid: { display: false } },
          y: { beginAtZero: true, ticks: { stepSize: 1, font: chartFont }, grid: { color: 'rgba(0,0,0,0.05)' } },
        },
      },
    };
  }, [snapshot]);

  const allergyChart = useMemo(() => {
    if (!snapshot) return null;
    const { withAllergies, withoutAllergies } = snapshot.population;
    return {
      data: {
        labels: ['With allergies', 'NKA / none recorded'],
        datasets: [
          {
            data: [withAllergies, withoutAllergies],
            backgroundColor: ['#d4923a', '#2ea87a'],
            borderWidth: 0,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom' as const, labels: { font: chartFont, boxWidth: 10 } },
        },
      },
    };
  }, [snapshot]);

  const taskAlertChart = useMemo(() => {
    if (!snapshot) return null;
    return {
      data: {
        labels: snapshot.taskItems.map((item) => item.label),
        datasets: [
          {
            label: 'Open items',
            data: snapshot.taskItems.map((item) => item.count),
            backgroundColor: snapshot.taskItems.map((item) =>
              item.severity === 'high' ? '#dc6b6b' : item.severity === 'medium' ? '#d4923a' : '#6b9bd1'
            ),
            borderRadius: 6,
          },
        ],
      },
      options: {
        indexAxis: 'y' as const,
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { beginAtZero: true, ticks: { stepSize: 1, font: chartFont }, grid: { color: 'rgba(0,0,0,0.05)' } },
          y: { ticks: { font: chartFont }, grid: { display: false } },
        },
      },
    };
  }, [snapshot]);

  const riskTierChart = useMemo(() => {
    if (!snapshot) return null;
    const tiers: RiskTier[] = ['low', 'medium', 'high', 'critical'];
    return {
      data: {
        labels: ['Low', 'Medium', 'High', 'Critical'],
        datasets: [
          {
            data: tiers.map((tier) => snapshot.riskTierCounts[tier]),
            backgroundColor: tiers.map((tier) => RISK_COLORS[tier]),
            borderWidth: 0,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom' as const, labels: { font: chartFont, boxWidth: 10 } },
        },
      },
    };
  }, [snapshot]);

  const riskTrendChart = useMemo(() => {
    if (!snapshot) return null;
    const topPatients = snapshot.riskProfiles.slice(0, 8);
    return {
      data: {
        labels: topPatients.map((profile) => profile.patientName.split(' ')[0] || profile.patientName),
        datasets: [
          {
            label: 'Risk score',
            data: topPatients.map((profile) => profile.score),
            borderColor: '#dc6b6b',
            backgroundColor: 'rgba(220, 107, 107, 0.12)',
            fill: true,
            tension: 0.35,
            pointRadius: 4,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { font: chartFont }, grid: { display: false } },
          y: { beginAtZero: true, max: 100, ticks: { font: chartFont }, grid: { color: 'rgba(0,0,0,0.05)' } },
        },
      },
    };
  }, [snapshot]);

  const alertsByCategoryChart = useMemo(() => {
    if (!snapshot) return null;
    const counts = { diabetic: 0, cardiac: 0, other: 0 };
    snapshot.alertHighlights.forEach((highlight) => {
      counts[highlight.category] += 1;
    });

    return {
      data: {
        labels: ['Diabetic Care', 'Cardiovascular Care', 'General Care'],
        datasets: [
          {
            label: 'Active alerts',
            data: [counts.diabetic, counts.cardiac, counts.other],
            backgroundColor: [CARE_COLORS.diabetic, CARE_COLORS.cardiac, CARE_COLORS.other],
            borderRadius: 6,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { font: chartFont }, grid: { display: false } },
          y: { beginAtZero: true, ticks: { stepSize: 1, font: chartFont }, grid: { color: 'rgba(0,0,0,0.05)' } },
        },
      },
    };
  }, [snapshot]);

  return (
    <div className="app-container app-home insights-page">
      <header className="app-header-bar">
        <div className="app-header-brand">
          <div className="app-logo-mark">
            <RpmLogoIcon size={22} className="app-logo-icon" />
          </div>
          <h1 className="app-header-title">Pro Health - Remote Patient Monitoring</h1>
          <p className="app-header-tagline">
            <span className="app-header-tagline-lead">Population &amp; risk insights</span>
          </p>
        </div>
        <HeaderUserChip />
      </header>

      {!canMutate && <ReadOnlyBanner />}

      <div className="insights-toolbar">
        <div className="insights-toolbar-title">
          <h1>Clinical Insights Dashboard</h1>
          <p>Patient population, operational tasks, alerts, and risk predictions</p>
        </div>
        <div className="insights-toolbar-actions">
          {snapshot && (
            <span className="insights-generated-at">
              Updated {formatGeneratedAt(snapshot.generatedAt)}
            </span>
          )}
          <Link href="/" className="btn btn-primary">
            <ArrowLeft size={14} />
            Back to patients
          </Link>
          <button type="button" className="btn btn-primary" onClick={() => void loadData()} disabled={isLoading}>
            <RefreshCw size={14} className={isLoading ? 'spin' : undefined} />
            Refresh
          </button>
        </div>
      </div>

      {isLoading && !snapshot && (
        <div className="insights-loading glass-card">Loading insights from FHIR data…</div>
      )}

      {error && (
        <div className="insights-error glass-card">
          {error}
          <div style={{ marginTop: '1rem' }}>
            <button type="button" className="btn btn-primary" onClick={() => void loadData()}>
              Retry
            </button>
          </div>
        </div>
      )}

      {snapshot && (
        <>
          <div className="insights-kpi-grid">
            <div className="insights-kpi-card">
              <div className="insights-kpi-label">Total patients</div>
              <div className="insights-kpi-value">{snapshot.population.total}</div>
              <div className="insights-kpi-sub">
                {snapshot.population.registeredLast7Days} updated in last 7 days
              </div>
            </div>
            <div className="insights-kpi-card">
              <div className="insights-kpi-label">Open alerts</div>
              <div className="insights-kpi-value" style={{ color: 'var(--danger)' }}>
                {snapshot.alerts.totalOpenAlerts}
              </div>
              <div className="insights-kpi-sub">Tasks &amp; clinical notifications</div>
            </div>
            <div className="insights-kpi-card">
              <div className="insights-kpi-label">High / critical risk</div>
              <div className="insights-kpi-value" style={{ color: 'var(--warning)' }}>
                {snapshot.riskTierCounts.high + snapshot.riskTierCounts.critical}
              </div>
              <div className="insights-kpi-sub">Patients needing proactive review</div>
            </div>
            <div className="insights-kpi-card">
              <div className="insights-kpi-label">Documented allergies</div>
              <div className="insights-kpi-value">{snapshot.population.withAllergies}</div>
              <div className="insights-kpi-sub">
                {snapshot.population.withoutAllergies} with NKA or none recorded
              </div>
            </div>
          </div>

          <section className="insights-section">
            <div className="insights-section-header">
              <Users size={18} style={{ color: 'var(--primary)' }} />
              <h2>Patient population</h2>
            </div>
            <div className="insights-grid-3">
              <div className="insights-chart-card">
                <h3>Care programme enrolment</h3>
                <div className="insights-chart-wrap">
                  {careCategoryChart && <Doughnut data={careCategoryChart.data} options={careCategoryChart.options} />}
                </div>
              </div>
              <div className="insights-chart-card">
                <h3>Age distribution</h3>
                <div className="insights-chart-wrap">
                  {ageBandChart && <Bar data={ageBandChart.data} options={ageBandChart.options} />}
                </div>
              </div>
              <div className="insights-chart-card">
                <h3>Gender breakdown</h3>
                <div className="insights-chart-wrap">
                  {genderChart && <Bar data={genderChart.data} options={genderChart.options} />}
                </div>
              </div>
            </div>
            <div className="insights-grid-2" style={{ marginTop: '1rem' }}>
              <div className="insights-chart-card">
                <h3>General care subcategories</h3>
                <div className="insights-chart-wrap">
                  {subCategoryChart ? (
                    <Bar data={subCategoryChart.data} options={subCategoryChart.options} />
                  ) : (
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '2rem' }}>
                      No general care subcategories recorded yet.
                    </p>
                  )}
                </div>
              </div>
              <div className="insights-chart-card">
                <h3>Allergy documentation</h3>
                <div className="insights-chart-wrap">
                  {allergyChart && <Doughnut data={allergyChart.data} options={allergyChart.options} />}
                </div>
              </div>
            </div>
          </section>

          <section className="insights-section">
            <div className="insights-section-header">
              <ClipboardList size={18} style={{ color: 'var(--primary)' }} />
              <h2>Tasks &amp; alerts</h2>
            </div>
            <div className="insights-grid-2">
              <div className="insights-chart-card">
                <h3>Open operational tasks</h3>
                <div className="insights-chart-wrap">
                  {taskAlertChart && <Bar data={taskAlertChart.data} options={taskAlertChart.options} />}
                </div>
              </div>
              <div className="insights-chart-card">
                <h3>Alerts by care programme</h3>
                <div className="insights-chart-wrap">
                  {alertsByCategoryChart && (
                    <Bar data={alertsByCategoryChart.data} options={alertsByCategoryChart.options} />
                  )}
                </div>
              </div>
            </div>
            <div className="glass-card" style={{ marginTop: '1rem', padding: '1rem 1.1rem' }}>
              <div className="insights-section-header" style={{ marginBottom: '0.65rem' }}>
                <Bell size={16} style={{ color: 'var(--warning)' }} />
                <h2 style={{ fontSize: '0.9rem' }}>Active alert feed</h2>
              </div>
              {snapshot.alertHighlights.length === 0 ? (
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>No open alerts across the cohort.</p>
              ) : (
                <ul className="insights-alert-list">
                  {snapshot.alertHighlights.slice(0, 12).map((highlight, index) => {
                    const taskItem = snapshot.taskItems.find((item) =>
                      highlight.reason.toLowerCase().includes(item.label.split(' ')[0].toLowerCase())
                    );
                    const severity = taskItem?.severity ?? 'medium';
                    const patient = snapshot.patients.find((entry) => entry.id === highlight.patientId);
                    return (
                      <li key={`${highlight.patientId}-${index}`} className="insights-alert-item">
                        <div>
                          <strong>
                            <Link href={`/patient/${highlight.patientId}`} className="insights-patient-link">
                              {patient?.name ?? 'Patient'}
                            </Link>
                          </strong>
                          <div>
                            <span>{highlight.reason}</span>
                            {' · '}
                            <span>{careCategoryLabel(highlight.category)}</span>
                          </div>
                        </div>
                        <span className={`insights-severity-pill ${severity}`}>{severity}</span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </section>

          <section className="insights-section">
            <div className="insights-section-header">
              <ShieldAlert size={18} style={{ color: 'var(--danger)' }} />
              <h2>Risk predictions</h2>
            </div>
            <div className="insights-grid-2">
              <div className="insights-chart-card">
                <h3>Risk tier distribution</h3>
                <div className="insights-chart-wrap">
                  {riskTierChart && <Doughnut data={riskTierChart.data} options={riskTierChart.options} />}
                </div>
              </div>
              <div className="insights-chart-card">
                <h3>Top patients by composite risk score</h3>
                <div className="insights-chart-wrap">
                  {riskTrendChart && <Line data={riskTrendChart.data} options={riskTrendChart.options} />}
                </div>
              </div>
            </div>
            <div className="glass-card" style={{ marginTop: '1rem', padding: '0.5rem 0.75rem 0.75rem' }}>
              <div className="insights-section-header" style={{ padding: '0.5rem 0.35rem' }}>
                <BarChart3 size={16} style={{ color: 'var(--primary)' }} />
                <h2 style={{ fontSize: '0.9rem' }}>Patient risk register</h2>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table className="insights-risk-table">
                  <thead>
                    <tr>
                      <th>Patient</th>
                      <th>Programme</th>
                      <th>Score</th>
                      <th>Tier</th>
                      <th>Contributing factors</th>
                    </tr>
                  </thead>
                  <tbody>
                    {snapshot.riskProfiles.slice(0, 15).map((profile) => (
                      <tr key={profile.patientId}>
                        <td>
                          <Link href={`/patient/${profile.patientId}`} className="insights-patient-link">
                            {profile.patientName}
                          </Link>
                        </td>
                        <td>{careCategoryLabel(profile.careCategory)}</td>
                        <td>{profile.score}</td>
                        <td>
                          <span className={`insights-risk-tier ${profile.tier}`}>{profile.tier}</span>
                        </td>
                        <td>
                          {profile.factors.length > 0
                            ? profile.factors.slice(0, 3).join('; ')
                            : 'No elevated factors detected'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', padding: '0.5rem 0.35rem 0' }}>
                Risk scores combine vital sign severity, missed monitoring, weight alerts, age, CKD eGFR, and allergy
                documentation. Scores are indicative for care prioritisation — not diagnostic predictions.
              </p>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
