import React, { useEffect, useMemo, useState } from 'react';
import type {
  CivicPayFrequency,
  CivicRoleType,
  MstCivicRoleAssignment,
  MstCivicTaxLedgerEntry,
  MstCivicTaxSettings,
} from '../../types/mstCivicEconomy';
import {
  defaultTaxSettings,
  deleteRoleAssignment,
  forgiveDefault,
  getTaxSettings,
  listActiveDefaults,
  listRoleAssignments,
  listTaxLedgerForWeek,
  manualCollectTax,
  manualTriggerBounty,
  runDailyJobPayroll,
  runWeeklyJobPayroll,
  runWeeklyTaxCollection,
  saveRoleAssignment,
  saveTaxSettings,
  weekIdFromDate,
} from '../../utils/mstCivicEconomyService';

type StudentLite = { id: string; displayName?: string; email?: string };
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const TAB_DEFS = [
  { id: 'tax' as const, label: 'Tax settings', hint: 'Weekly PP tax & penalties' },
  { id: 'roles' as const, label: 'Role assignments', hint: 'Jobs, pay & discounts' },
  { id: 'ledger' as const, label: 'Tax ledger', hint: 'Per-student weekly records' },
  { id: 'defaults' as const, label: 'Defaults & bounties', hint: 'Collections & forgiveness' },
];

const ROLE_LABELS: Record<CivicRoleType, string> = {
  scorekeeper: 'Scorekeeper',
  flowkeeper: 'Flowkeeper',
  passage_keeper: 'Passage Keeper',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  maxWidth: '280px',
  padding: '0.5rem 0.65rem',
  borderRadius: '0.5rem',
  border: '1px solid #cbd5e1',
  fontSize: '0.875rem',
  background: '#fff',
  color: '#0f172a',
  boxSizing: 'border-box',
};

const selectStyle: React.CSSProperties = { ...inputStyle, cursor: 'pointer' };

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '0.72rem',
  fontWeight: 700,
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
  color: '#64748b',
  marginBottom: '0.35rem',
};

function SectionCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section
      style={{
        background: '#fff',
        borderRadius: '0.75rem',
        border: '1px solid #e2e8f0',
        boxShadow: '0 1px 3px rgba(15, 23, 42, 0.06)',
        padding: '1.25rem 1.5rem',
        marginBottom: '1.25rem',
      }}
    >
      <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#0f172a' }}>{title}</h3>
      {subtitle ? (
        <p style={{ margin: '0.35rem 0 0', fontSize: '0.8125rem', color: '#64748b', lineHeight: 1.45 }}>{subtitle}</p>
      ) : null}
      <div style={{ marginTop: '1.15rem' }}>{children}</div>
    </section>
  );
}

function FieldGrid({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
        gap: '1rem 1.5rem',
        alignItems: 'end',
      }}
    >
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <span style={labelStyle}>{label}</span>
      {children}
    </div>
  );
}

const btnBase: React.CSSProperties = {
  padding: '0.55rem 1.1rem',
  borderRadius: '0.5rem',
  fontSize: '0.875rem',
  fontWeight: 600,
  cursor: 'pointer',
  border: 'none',
  transition: 'background 0.15s, opacity 0.15s',
};

const CivicEconomyAdmin: React.FC<{ students: StudentLite[] }> = ({ students }) => {
  const [tab, setTab] = useState<'tax' | 'roles' | 'ledger' | 'defaults'>('tax');
  const [settings, setSettings] = useState<MstCivicTaxSettings>(defaultTaxSettings());
  const [roles, setRoles] = useState<MstCivicRoleAssignment[]>([]);
  const [ledgerWeek, setLedgerWeek] = useState(weekIdFromDate(new Date()));
  const [ledgerRows, setLedgerRows] = useState<MstCivicTaxLedgerEntry[]>([]);
  const [defaults, setDefaults] = useState<Awaited<ReturnType<typeof listActiveDefaults>>>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [newRole, setNewRole] = useState<Partial<MstCivicRoleAssignment>>({
    roleType: 'flowkeeper',
    payFrequency: 'weekly',
    payRatePp: 10,
    taxDiscountPercent: 10,
    active: true,
  });

  const load = async () => {
    setErr(null);
    const [s, r, d] = await Promise.all([getTaxSettings(), listRoleAssignments(), listActiveDefaults()]);
    setSettings(s);
    setRoles(r);
    setDefaults(d);
  };
  useEffect(() => {
    void load();
  }, []);
  useEffect(() => {
    let c = false;
    listTaxLedgerForWeek(ledgerWeek).then((rows) => {
      if (!c) setLedgerRows(rows);
    });
    return () => {
      c = true;
    };
  }, [ledgerWeek]);

  const studentOptions = useMemo(
    () => [...students].sort((a, b) => (a.displayName || a.id).localeCompare(b.displayName || b.id)),
    [students]
  );

  const statusStyle = (s: string): React.CSSProperties => {
    const map: Record<string, { bg: string; fg: string }> = {
      paid: { bg: '#dcfce7', fg: '#166534' },
      unpaid: { bg: '#fef3c7', fg: '#92400e' },
      defaulted: { bg: '#fee2e2', fg: '#991b1b' },
      forgiven: { bg: '#e0e7ff', fg: '#3730a3' },
    };
    const t = map[s] || { bg: '#f1f5f9', fg: '#475569' };
    return {
      display: 'inline-block',
      padding: '0.15rem 0.5rem',
      borderRadius: '999px',
      fontSize: '0.7rem',
      fontWeight: 700,
      textTransform: 'uppercase',
      letterSpacing: '0.03em',
      background: t.bg,
      color: t.fg,
    };
  };

  return (
    <div
      style={{
        maxWidth: '1100px',
        margin: '0 auto',
        padding: '1.25rem 1.5rem 2rem',
        fontFamily: 'system-ui, -apple-system, Segoe UI, sans-serif',
      }}
    >
      <header style={{ marginBottom: '1.5rem' }}>
        <p style={{ margin: 0, fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.12em', color: '#0d9488', textTransform: 'uppercase' }}>
          MST · Civic economy
        </p>
        <h2 style={{ margin: '0.25rem 0 0', fontSize: '1.65rem', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em' }}>
          Class treasury & roles
        </h2>
        <p style={{ margin: '0.5rem 0 0', fontSize: '0.9rem', color: '#64748b', maxWidth: '52ch', lineHeight: 1.5 }}>
          Configure weekly vault tax, civic jobs, ledger, and defaults. Students see status on their profile.
        </p>
      </header>

      {(msg || err) && (
        <div
          role="status"
          style={{
            marginBottom: '1rem',
            padding: '0.75rem 1rem',
            borderRadius: '0.5rem',
            fontSize: '0.875rem',
            fontWeight: 600,
            background: err ? '#fef2f2' : '#ecfdf5',
            color: err ? '#b91c1c' : '#047857',
            border: `1px solid ${err ? '#fecaca' : '#a7f3d0'}`,
          }}
        >
          {err || msg}
        </div>
      )}

      <nav
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '0.5rem',
          marginBottom: '1.5rem',
          padding: '0.35rem',
          background: '#f1f5f9',
          borderRadius: '0.75rem',
          border: '1px solid #e2e8f0',
        }}
        aria-label="Civic economy sections"
      >
        {TAB_DEFS.map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              style={{
                flex: '1 1 auto',
                minWidth: '140px',
                textAlign: 'left',
                padding: '0.65rem 0.9rem',
                borderRadius: '0.5rem',
                border: active ? '1px solid #0f766e' : '1px solid transparent',
                background: active ? '#fff' : 'transparent',
                boxShadow: active ? '0 1px 4px rgba(15, 118, 110, 0.12)' : 'none',
                cursor: 'pointer',
                transition: 'background 0.15s, box-shadow 0.15s',
              }}
            >
              <span style={{ display: 'block', fontSize: '0.875rem', fontWeight: 700, color: active ? '#0f766e' : '#334155' }}>
                {t.label}
              </span>
              <span style={{ display: 'block', fontSize: '0.7rem', color: '#94a3b8', marginTop: '0.15rem', fontWeight: 500 }}>{t.hint}</span>
            </button>
          );
        })}
      </nav>

      {tab === 'tax' && (
        <>
          <SectionCard
            title="Weekly tax"
            subtitle="Base amount is reduced by each student’s best active role tax discount. PP is never taken below zero."
          >
            <FieldGrid>
              <Field label="Base weekly tax (PP)">
                <input
                  type="number"
                  min={0}
                  value={settings.baseWeeklyTaxPp}
                  onChange={(e) => setSettings({ ...settings, baseWeeklyTaxPp: +e.target.value || 0 })}
                  style={inputStyle}
                />
              </Field>
              <Field label="Collection weekday">
                <select
                  value={settings.collectionDayOfWeek}
                  onChange={(e) => setSettings({ ...settings, collectionDayOfWeek: +e.target.value })}
                  style={selectStyle}
                >
                  {DAYS.map((d, i) => (
                    <option key={d} value={i}>
                      {d}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Collection time (local)">
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                  <input
                    type="number"
                    min={0}
                    max={23}
                    value={settings.collectionHour}
                    onChange={(e) => setSettings({ ...settings, collectionHour: +e.target.value })}
                    style={{ ...inputStyle, maxWidth: '5rem' }}
                    aria-label="Hour"
                  />
                  <span style={{ color: '#94a3b8', fontWeight: 700 }}>:</span>
                  <input
                    type="number"
                    min={0}
                    max={59}
                    value={settings.collectionMinute}
                    onChange={(e) => setSettings({ ...settings, collectionMinute: +e.target.value })}
                    style={{ ...inputStyle, maxWidth: '5rem' }}
                    aria-label="Minute"
                  />
                </div>
              </Field>
              <Field label="Grace period (hours)">
                <input
                  type="number"
                  min={0}
                  value={settings.gracePeriodHours}
                  onChange={(e) => setSettings({ ...settings, gracePeriodHours: +e.target.value || 0 })}
                  style={inputStyle}
                />
              </Field>
              <Field label="Shutdown penalty (hours)">
                <input
                  type="number"
                  min={1}
                  value={settings.shutdownPenaltyHours}
                  onChange={(e) => setSettings({ ...settings, shutdownPenaltyHours: +e.target.value || 9 })}
                  style={inputStyle}
                />
              </Field>
            </FieldGrid>

            <div
              style={{
                marginTop: '1.25rem',
                paddingTop: '1.25rem',
                borderTop: '1px solid #f1f5f9',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.85rem',
              }}
            >
              <span style={{ ...labelStyle, marginBottom: 0 }}>Automation & consequences</span>
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.6rem',
                  fontSize: '0.875rem',
                  color: '#334155',
                  cursor: 'pointer',
                }}
              >
                <input
                  type="checkbox"
                  checked={settings.automaticDeductionEnabled}
                  onChange={(e) => setSettings({ ...settings, automaticDeductionEnabled: e.target.checked })}
                  style={{ width: '1.05rem', height: '1.05rem', accentColor: '#0d9488' }}
                />
                Enable automatic weekly deduction (scheduled runs respect this; “Run tax now” always runs)
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', fontSize: '0.875rem', color: '#334155', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={settings.restrictSeatOnUnpaid}
                  onChange={(e) => setSettings({ ...settings, restrictSeatOnUnpaid: e.target.checked })}
                  style={{ width: '1.05rem', height: '1.05rem', accentColor: '#0d9488' }}
                />
                Restrict seat choice when unpaid / defaulted
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', fontSize: '0.875rem', color: '#334155', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={settings.createBountyOnDefault}
                  onChange={(e) => setSettings({ ...settings, createBountyOnDefault: e.target.checked })}
                  style={{ width: '1.05rem', height: '1.05rem', accentColor: '#0d9488' }}
                />
                Create vault bounty on tax default
              </label>
            </div>

            <div style={{ marginTop: '1.35rem', display: 'flex', flexWrap: 'wrap', gap: '0.65rem' }}>
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  void saveTaxSettings(settings).then((res) => {
                    if (res.ok) {
                      setErr(null);
                      setMsg('Tax settings saved');
                    } else {
                      setMsg(null);
                      setErr(res.error || 'Save failed');
                    }
                  })
                }
                style={{
                  ...btnBase,
                  background: '#0f766e',
                  color: '#fff',
                  opacity: busy ? 0.6 : 1,
                  cursor: busy ? 'wait' : 'pointer',
                }}
              >
                Save settings
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  setErr(null);
                  const r = await runWeeklyTaxCollection({ force: true });
                  setBusy(false);
                  if (!r.ok) {
                    setMsg(null);
                    setErr(r.error || 'Tax run failed');
                  } else if (r.skipped) {
                    setMsg('Tax run skipped (automatic deduction is off and run was not forced).');
                  } else {
                    setMsg(`Tax run: processed ${r.processed}, paid ${r.paid}, defaulted ${r.defaulted} (week ${r.weekId})`);
                  }
                  await load();
                }}
                style={{
                  ...btnBase,
                  background: '#fff',
                  color: '#0f766e',
                  border: '2px solid #0f766e',
                  opacity: busy ? 0.6 : 1,
                  cursor: busy ? 'wait' : 'pointer',
                }}
              >
                Run weekly tax now
              </button>
            </div>
          </SectionCard>
        </>
      )}

      {tab === 'roles' && (
        <>
          <SectionCard title="Add or edit assignment" subtitle="Pick a student, role, pay, and tax discount. Use Edit on a row to update an existing assignment.">
            <FieldGrid>
              <Field label="Role">
                <select
                  value={newRole.roleType}
                  onChange={(e) => setNewRole({ ...newRole, roleType: e.target.value as CivicRoleType })}
                  style={selectStyle}
                >
                  {(Object.keys(ROLE_LABELS) as CivicRoleType[]).map((k) => (
                    <option key={k} value={k}>
                      {ROLE_LABELS[k]}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Student">
                <select
                  value={newRole.studentId || ''}
                  onChange={(e) => setNewRole({ ...newRole, studentId: e.target.value })}
                  style={selectStyle}
                >
                  <option value="">Select student…</option>
                  {studentOptions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.displayName || s.id}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Pay rate (PP)">
                <input
                  type="number"
                  min={0}
                  value={newRole.payRatePp ?? 0}
                  onChange={(e) => setNewRole({ ...newRole, payRatePp: +e.target.value })}
                  style={inputStyle}
                />
              </Field>
              <Field label="Pay frequency">
                <select
                  value={newRole.payFrequency}
                  onChange={(e) => setNewRole({ ...newRole, payFrequency: e.target.value as CivicPayFrequency })}
                  style={selectStyle}
                >
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                </select>
              </Field>
              <Field label="Tax discount (%)">
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={newRole.taxDiscountPercent ?? 0}
                  onChange={(e) => setNewRole({ ...newRole, taxDiscountPercent: +e.target.value })}
                  style={inputStyle}
                />
              </Field>
              <Field label="Status">
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', color: '#334155', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={newRole.active !== false}
                    onChange={(e) => setNewRole({ ...newRole, active: e.target.checked })}
                    style={{ width: '1.05rem', height: '1.05rem', accentColor: '#0d9488' }}
                  />
                  Active
                </label>
              </Field>
            </FieldGrid>
            <div style={{ marginTop: '1rem' }}>
              <Field label="Notes / responsibilities">
                <textarea
                  value={newRole.notes || ''}
                  onChange={(e) => setNewRole({ ...newRole, notes: e.target.value })}
                  rows={3}
                  placeholder="Optional notes visible to admins…"
                  style={{ ...inputStyle, maxWidth: '100%', minHeight: '4.5rem', resize: 'vertical' }}
                />
              </Field>
            </div>

            <div style={{ marginTop: '1.25rem', display: 'flex', flexWrap: 'wrap', gap: '0.65rem', alignItems: 'center' }}>
              <button
                type="button"
                disabled={!newRole.studentId}
                onClick={async () => {
                  setErr(null);
                  const st = studentOptions.find((s) => s.id === newRole.studentId);
                  const res = await saveRoleAssignment({
                    ...(newRole as Omit<MstCivicRoleAssignment, 'id'>),
                    studentName: st?.displayName,
                  });
                  if (!res.ok) {
                    setMsg(null);
                    setErr(res.error || 'Save role failed');
                    return;
                  }
                  await load();
                  setMsg('Role saved');
                }}
                style={{
                  ...btnBase,
                  background: '#0f766e',
                  color: '#fff',
                  opacity: !newRole.studentId ? 0.45 : 1,
                  cursor: !newRole.studentId ? 'not-allowed' : 'pointer',
                }}
              >
                Save role
              </button>
              <button
                type="button"
                onClick={() =>
                  void runWeeklyJobPayroll().then((r) =>
                    r.ok ? setMsg(`Weekly payroll: ${r.paid} role(s) paid`) : setErr(r.error || 'Payroll failed')
                  )
                }
                style={{ ...btnBase, background: '#f1f5f9', color: '#334155', border: '1px solid #cbd5e1' }}
              >
                Run weekly payroll
              </button>
              <button
                type="button"
                onClick={() =>
                  void runDailyJobPayroll().then((r) =>
                    r.ok ? setMsg(`Daily payroll: ${r.paid} role(s) paid`) : setErr(r.error || 'Payroll failed')
                  )
                }
                style={{ ...btnBase, background: '#f1f5f9', color: '#334155', border: '1px solid #cbd5e1' }}
              >
                Run daily payroll
              </button>
            </div>
          </SectionCard>

          <SectionCard title="Current assignments" subtitle={`${roles.length} row(s)`}>
            {roles.length === 0 ? (
              <p style={{ margin: 0, color: '#64748b', fontSize: '0.9rem' }}>No roles yet. Add one above.</p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid #e2e8f0', textAlign: 'left', color: '#64748b' }}>
                      <th style={{ padding: '0.5rem 0.65rem' }}>Role</th>
                      <th style={{ padding: '0.5rem 0.65rem' }}>Student</th>
                      <th style={{ padding: '0.5rem 0.65rem' }}>Pay</th>
                      <th style={{ padding: '0.5rem 0.65rem' }}>Freq</th>
                      <th style={{ padding: '0.5rem 0.65rem' }}>Discount</th>
                      <th style={{ padding: '0.5rem 0.65rem' }}>Active</th>
                      <th style={{ padding: '0.5rem 0.65rem' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {roles.map((r) => (
                      <tr key={r.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '0.6rem 0.65rem', fontWeight: 600, color: '#0f172a' }}>{ROLE_LABELS[r.roleType]}</td>
                        <td style={{ padding: '0.6rem 0.65rem', color: '#475569' }}>{r.studentName || r.studentId}</td>
                        <td style={{ padding: '0.6rem 0.65rem' }}>{r.payRatePp} PP</td>
                        <td style={{ padding: '0.6rem 0.65rem', textTransform: 'capitalize' }}>{r.payFrequency}</td>
                        <td style={{ padding: '0.6rem 0.65rem' }}>{r.taxDiscountPercent}%</td>
                        <td style={{ padding: '0.6rem 0.65rem' }}>{r.active ? 'Yes' : 'No'}</td>
                        <td style={{ padding: '0.6rem 0.65rem' }}>
                          <button
                            type="button"
                            onClick={() => setNewRole({ ...r })}
                            style={{ ...btnBase, padding: '0.35rem 0.65rem', fontSize: '0.75rem', background: '#fff', border: '1px solid #cbd5e1', marginRight: '0.35rem' }}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => void deleteRoleAssignment(r.id).then(load)}
                            style={{ ...btnBase, padding: '0.35rem 0.65rem', fontSize: '0.75rem', background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca' }}
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>
        </>
      )}

      {tab === 'ledger' && (
        <SectionCard title="Tax ledger" subtitle="ISO week start id (Monday-based) — matches internal weekId.">
          <div style={{ marginBottom: '1rem', maxWidth: '280px' }}>
            <span style={labelStyle}>Week id</span>
            <input value={ledgerWeek} onChange={(e) => setLedgerWeek(e.target.value)} style={inputStyle} placeholder="YYYY-MM-DD" />
          </div>
          {ledgerRows.length === 0 ? (
            <p style={{ margin: 0, color: '#64748b', fontSize: '0.9rem' }}>No ledger rows for this week.</p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #e2e8f0', textAlign: 'left', color: '#64748b' }}>
                    <th style={{ padding: '0.5rem 0.65rem' }}>Student</th>
                    <th style={{ padding: '0.5rem 0.65rem' }}>Final tax</th>
                    <th style={{ padding: '0.5rem 0.65rem' }}>Status</th>
                    <th style={{ padding: '0.5rem 0.65rem' }}>PP after</th>
                    <th style={{ padding: '0.5rem 0.65rem' }}>Discount %</th>
                  </tr>
                </thead>
                <tbody>
                  {ledgerRows.map((row) => (
                    <tr key={row.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '0.6rem 0.65rem', fontWeight: 600 }}>{row.studentName}</td>
                      <td style={{ padding: '0.6rem 0.65rem' }}>{row.finalTaxOwed} PP</td>
                      <td style={{ padding: '0.6rem 0.65rem' }}>
                        <span style={statusStyle(row.status)}>{row.status}</span>
                      </td>
                      <td style={{ padding: '0.6rem 0.65rem' }}>{row.ppBalanceAfter}</td>
                      <td style={{ padding: '0.6rem 0.65rem' }}>{row.roleDiscount}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      )}

      {tab === 'defaults' && (
        <SectionCard title="Defaults & bounties" subtitle="Students with unpaid tax consequences, shutdown, or an active bounty.">
          {defaults.length === 0 ? (
            <p style={{ margin: 0, color: '#64748b', fontSize: '0.9rem' }}>No active defaults or bounties.</p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #e2e8f0', textAlign: 'left', color: '#64748b' }}>
                    <th style={{ padding: '0.5rem 0.65rem' }}>Student</th>
                    <th style={{ padding: '0.5rem 0.65rem' }}>Tax status</th>
                    <th style={{ padding: '0.5rem 0.65rem' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {defaults.map((p) => (
                    <tr key={p.studentId} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '0.6rem 0.65rem', fontWeight: 600 }}>{p.displayName || p.studentId}</td>
                      <td style={{ padding: '0.6rem 0.65rem' }}>
                        <span style={statusStyle(p.taxStatus)}>{p.taxStatus}</span>
                        {p.activeBounty ? (
                          <span style={{ ...statusStyle('unpaid'), marginLeft: '0.35rem' }}>bounty</span>
                        ) : null}
                      </td>
                      <td style={{ padding: '0.6rem 0.65rem' }}>
                        <button
                          type="button"
                          onClick={() => void forgiveDefault(p.studentId).then(load)}
                          style={{ ...btnBase, padding: '0.35rem 0.65rem', fontSize: '0.75rem', background: '#ecfdf5', color: '#047857', border: '1px solid #a7f3d0', marginRight: '0.35rem' }}
                        >
                          Forgive
                        </button>
                        <button
                          type="button"
                          onClick={() => void manualCollectTax(p.studentId, weekIdFromDate(new Date())).then(load)}
                          style={{ ...btnBase, padding: '0.35rem 0.65rem', fontSize: '0.75rem', background: '#fff', border: '1px solid #cbd5e1', marginRight: '0.35rem' }}
                        >
                          Collect tax
                        </button>
                        <button
                          type="button"
                          onClick={() => void manualTriggerBounty(p.studentId).then(load)}
                          style={{ ...btnBase, padding: '0.35rem 0.65rem', fontSize: '0.75rem', background: '#fff7ed', color: '#9a3412', border: '1px solid #fed7aa' }}
                        >
                          Set bounty
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      )}
    </div>
  );
};

export default CivicEconomyAdmin;
