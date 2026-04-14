import React, { useEffect, useState } from 'react';
import type { HabitEvidenceType } from '../types/assessmentGoals';
import {
  formatHabitLiveEventEvidenceLines,
  habitEvidenceTracksLiveEvents,
  listHabitLiveEventSessionEvidence,
} from '../utils/habitLiveEventEvidenceService';

const HabitLiveEventEvidencePanel: React.FC<{
  submissionId: string;
  habitEvidenceType?: HabitEvidenceType;
}> = ({ submissionId, habitEvidenceType }) => {
  const [lines, setLines] = useState<string[] | null>(null);

  useEffect(() => {
    if (!habitEvidenceTracksLiveEvents(habitEvidenceType)) {
      setLines(null);
      return;
    }
    let cancelled = false;
    listHabitLiveEventSessionEvidence(submissionId)
      .then((sessions) => {
        if (!cancelled) setLines(formatHabitLiveEventEvidenceLines(habitEvidenceType, sessions));
      })
      .catch(() => {
        if (!cancelled) setLines(['Could not load live event evidence. Try again later.']);
      });
    return () => {
      cancelled = true;
    };
  }, [submissionId, habitEvidenceType]);

  if (!habitEvidenceTracksLiveEvents(habitEvidenceType)) return null;
  if (lines === null) {
    return (
      <p style={{ margin: '0.35rem 0 0', fontSize: '0.8rem', color: '#64748b' }}>Loading live event evidence…</p>
    );
  }

  return (
    <div
      style={{
        marginTop: '0.5rem',
        padding: '0.5rem 0.65rem',
        background: 'rgba(15, 23, 42, 0.06)',
        borderRadius: 6,
        fontSize: '0.8rem',
        color: '#334155',
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: 4 }}>Live Event evidence (auto)</div>
      <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
        {lines.map((line, i) => (
          <li key={`${i}-${line.slice(0, 48)}`} style={{ marginBottom: 2 }}>
            {line}
          </li>
        ))}
      </ul>
    </div>
  );
};

export default HabitLiveEventEvidencePanel;
