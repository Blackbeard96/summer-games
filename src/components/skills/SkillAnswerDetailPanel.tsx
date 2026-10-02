import React, { useEffect, useMemo, useState } from 'react';
import type { AcademicSkill } from '../../types/academicSkills';
import {
  SkillAnswerBreakdown,
  SkillAnswerRow,
  answerOutcome,
  describeCorrectAnswer,
  describePlayerAnswer,
  getSkillAnswerBreakdown,
} from '../../utils/skillAnswerBreakdown';
import { isMatchingQuestion } from '../../utils/quizMatching';

interface SkillAnswerDetailPanelProps {
  skillId: string;
  skill?: AcademicSkill;
  classStudentIds: string[];
  className?: string;
  onClose: () => void;
}

const OUTCOME_STYLE = {
  correct: { label: '✓ Correct', color: '#6ee7a8' },
  partial: { label: '◐ Partial', color: '#f0c96a' },
  incorrect: { label: '✗ Incorrect', color: '#fca5a5' },
} as const;

const MODE_LABEL: Record<string, string> = {
  'training-grounds': 'Solo CFU',
  'live-event': 'Live Event',
  exam: 'Exam',
};

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

function formatWhen(ms: number): string {
  return ms ? new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '—';
}

function formatSeconds(ms: number): string {
  if (!ms) return '—';
  const s = Math.round(ms / 1000);
  return s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`;
}

const ResultCell: React.FC<{ row: SkillAnswerRow }> = ({ row }) => {
  const outcome = answerOutcome(row);
  const style = OUTCOME_STYLE[outcome];
  return (
    <span style={{ color: style.color, fontWeight: 700, whiteSpace: 'nowrap' }}>
      {style.label}
      {outcome === 'partial' ? ` (${pct(row.partialCredit)})` : ''}
    </span>
  );
};

const SkillAnswerDetailPanel: React.FC<SkillAnswerDetailPanelProps> = ({
  skillId,
  skill,
  classStudentIds,
  className,
  onClose,
}) => {
  const [data, setData] = useState<SkillAnswerBreakdown | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [playerFilter, setPlayerFilter] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setPlayerFilter(null);
    getSkillAnswerBreakdown({ skillId, classStudentIds })
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load answers');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [skillId, classStudentIds]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const visibleQuestions = useMemo(() => {
    if (!data) return [];
    return data.questions
      .map((q) => ({ ...q, rows: playerFilter ? q.rows.filter((r) => r.userId === playerFilter) : q.rows }))
      .filter((q) => q.rows.length > 0);
  }, [data, playerFilter]);

  const totals = useMemo(() => {
    const rows = data?.questions.flatMap((q) => q.rows) ?? [];
    return {
      answers: rows.length,
      correct: rows.filter((r) => r.correct).length,
      credit: rows.length ? rows.reduce((s, r) => s + r.partialCredit, 0) / rows.length : 0,
    };
  }, [data]);

  const filteredPlayerName = playerFilter ? data?.players.find((p) => p.userId === playerFilter)?.playerName : null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${skill?.name || skillId} answers`}
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.65)',
        zIndex: 1000,
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'flex-start',
        padding: '2rem 1rem',
        overflowY: 'auto',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 1050,
          background: '#0b0f19',
          border: '1px solid rgba(212,168,79,0.35)',
          borderRadius: '0.9rem',
          padding: '1.25rem 1.4rem 1.6rem',
          color: '#f4f0e6',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: '0.75rem', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {skill?.category || 'Skill'}{className ? ` · ${className}` : ''}
            </div>
            <h2 className="mst-display" style={{ margin: '0.15rem 0 0', color: 'var(--mst-gold-bright)', fontSize: '1.4rem' }}>
              {skill?.name || skillId}
            </h2>
            {!loading && data && (
              <div style={{ marginTop: '0.35rem', fontSize: '0.85rem', color: '#9ca3af' }}>
                {data.players.length} player{data.players.length === 1 ? '' : 's'} · {data.questions.length} question
                {data.questions.length === 1 ? '' : 's'} · {totals.answers} answer{totals.answers === 1 ? '' : 's'} ·{' '}
                {totals.correct} fully correct · {pct(totals.credit)} average credit
              </div>
            )}
          </div>
          <button type="button" onClick={onClose} style={closeBtn} aria-label="Close">
            ✕
          </button>
        </div>

        {loading ? (
          <p style={{ color: '#9ca3af', marginTop: '1rem' }}>Loading every answer for this skill…</p>
        ) : error ? (
          <p style={{ color: '#fca5a5', marginTop: '1rem' }}>{error}</p>
        ) : !data || data.questions.length === 0 ? (
          <p style={{ color: '#9ca3af', marginTop: '1rem' }}>
            No answers recorded for this skill in this class yet.
          </p>
        ) : (
          <>
            <h3 style={sectionHeading}>Players</h3>
            <p style={{ margin: '0 0 0.5rem', fontSize: '0.8rem', color: '#9ca3af' }}>
              Click a player to see only their answers.
            </p>
            <div style={tableWrap}>
              <table style={table}>
                <thead>
                  <tr style={headRow}>
                    <th style={th}>Player</th>
                    <th style={th}>Questions</th>
                    <th style={th}>Answers</th>
                    <th style={th}>Fully correct</th>
                    <th style={th}>Avg credit</th>
                    <th style={th}>Last answered</th>
                  </tr>
                </thead>
                <tbody>
                  {data.players.map((p) => {
                    const active = playerFilter === p.userId;
                    return (
                      <tr
                        key={p.userId}
                        onClick={() => setPlayerFilter(active ? null : p.userId)}
                        style={{
                          cursor: 'pointer',
                          borderTop: '1px solid rgba(255,255,255,0.06)',
                          background: active ? 'rgba(212,168,79,0.14)' : undefined,
                        }}
                      >
                        <td style={{ ...td, fontWeight: 700 }}>{p.playerName}</td>
                        <td style={td}>{p.questions}</td>
                        <td style={td}>{p.answered}</td>
                        <td style={td}>
                          {p.correct}/{p.answered}
                        </td>
                        <td style={{ ...td, fontWeight: 700, color: p.averageCredit >= 0.7 ? '#6ee7a8' : p.averageCredit >= 0.5 ? '#f0c96a' : '#fca5a5' }}>
                          {pct(p.averageCredit)}
                        </td>
                        <td style={{ ...td, color: '#9ca3af' }}>{formatWhen(p.lastAnsweredMs)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.75rem', flexWrap: 'wrap' }}>
              <h3 style={sectionHeading}>Questions</h3>
              {filteredPlayerName && (
                <button type="button" onClick={() => setPlayerFilter(null)} style={chipBtn}>
                  Showing {filteredPlayerName} only · show everyone ✕
                </button>
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {visibleQuestions.map((q, index) => {
                const matching = isMatchingQuestion(q.question);
                return (
                  <div key={q.key} style={questionCard}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '0.75rem', color: '#9ca3af' }}>
                          {q.cfuTitle} · {matching ? 'Matching' : 'Multiple choice'}
                          {q.question?.difficulty ? ` · ${q.question.difficulty}` : ''}
                        </div>
                        <div style={{ fontWeight: 700, marginTop: '0.2rem' }}>
                          Q{index + 1}. {q.question?.prompt || '(question was deleted)'}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right', fontSize: '0.8rem', color: '#9ca3af', whiteSpace: 'nowrap' }}>
                        <div>
                          <strong style={{ color: '#f4f0e6' }}>
                            {q.correctCount}/{q.rows.length}
                          </strong>{' '}
                          fully correct
                        </div>
                        <div>{q.players} player{q.players === 1 ? '' : 's'} · {pct(q.averageCredit)} avg</div>
                      </div>
                    </div>
                    {q.question?.imageUrl && (
                      <img
                        src={q.question.imageUrl}
                        alt=""
                        style={{ maxHeight: 120, maxWidth: '100%', borderRadius: 8, marginTop: '0.5rem' }}
                      />
                    )}
                    <div style={{ marginTop: '0.5rem', fontSize: '0.85rem' }}>
                      <span style={{ color: '#9ca3af' }}>Correct answer: </span>
                      <span style={{ color: '#6ee7a8', fontWeight: 600 }}>{describeCorrectAnswer(q.question)}</span>
                    </div>

                    <div style={{ ...tableWrap, marginTop: '0.65rem', marginBottom: 0 }}>
                      <table style={table}>
                        <thead>
                          <tr style={headRow}>
                            <th style={th}>Player</th>
                            <th style={th}>Their answer</th>
                            <th style={th}>Result</th>
                            <th style={th}>Try</th>
                            <th style={th}>Where</th>
                            <th style={th}>When</th>
                            <th style={th}>Time</th>
                          </tr>
                        </thead>
                        <tbody>
                          {q.rows.map((row) => {
                            const described = describePlayerAnswer(q.question, row);
                            return (
                              <tr key={row.evidenceId} style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                                <td style={{ ...td, fontWeight: 700, whiteSpace: 'nowrap' }}>{row.playerName}</td>
                                <td style={td}>
                                  <div style={{ color: row.answer ? '#e5e7eb' : '#9ca3af' }}>{described.summary}</div>
                                  {described.details && (
                                    <ul style={{ margin: '0.3rem 0 0', paddingLeft: '1rem', fontSize: '0.78rem' }}>
                                      {described.details.map((d, i) => (
                                        <li key={i} style={{ color: d.correct ? '#6ee7a8' : '#fca5a5' }}>
                                          {d.prompt} → {d.placed}
                                        </li>
                                      ))}
                                    </ul>
                                  )}
                                </td>
                                <td style={td}>
                                  <ResultCell row={row} />
                                </td>
                                <td style={td}>#{row.attemptNumber}</td>
                                <td style={{ ...td, whiteSpace: 'nowrap' }}>{MODE_LABEL[row.mode] || row.mode}</td>
                                <td style={{ ...td, color: '#9ca3af', whiteSpace: 'nowrap' }}>{formatWhen(row.timestampMs)}</td>
                                <td style={{ ...td, color: '#9ca3af' }}>{formatSeconds(row.responseTimeMs)}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

const closeBtn: React.CSSProperties = {
  background: 'transparent',
  border: '1px solid rgba(212,168,79,0.35)',
  color: '#f4f0e6',
  borderRadius: '0.45rem',
  padding: '0.35rem 0.6rem',
  cursor: 'pointer',
};

const chipBtn: React.CSSProperties = {
  background: 'rgba(212,168,79,0.14)',
  border: '1px solid rgba(212,168,79,0.45)',
  color: '#f0c96a',
  borderRadius: 999,
  padding: '0.2rem 0.7rem',
  fontSize: '0.8rem',
  cursor: 'pointer',
};

const sectionHeading: React.CSSProperties = {
  margin: '1.25rem 0 0.4rem',
  fontSize: '1rem',
  color: '#f0c96a',
};

const tableWrap: React.CSSProperties = {
  overflowX: 'auto',
  borderRadius: '0.6rem',
  border: '1px solid rgba(212,168,79,0.25)',
  marginBottom: '0.5rem',
};

const table: React.CSSProperties = { width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' };
const headRow: React.CSSProperties = { background: 'rgba(212,168,79,0.1)', color: '#f0c96a' };
const th: React.CSSProperties = { textAlign: 'left', padding: '0.55rem 0.7rem', fontWeight: 700, whiteSpace: 'nowrap' };
const td: React.CSSProperties = { padding: '0.55rem 0.7rem', color: '#e5e7eb', verticalAlign: 'top' };

const questionCard: React.CSSProperties = {
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: '0.75rem',
  padding: '0.85rem 1rem',
  background: 'rgba(255,255,255,0.02)',
};

export default SkillAnswerDetailPanel;
