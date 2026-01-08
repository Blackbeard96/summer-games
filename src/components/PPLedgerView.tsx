import React, { useState, useEffect } from 'react';
import { Assessment, PPLedgerEntry } from '../types/assessmentGoals';
import { getPPLedgerEntriesByAssessment } from '../utils/assessmentGoalsFirestore';
import { formatPPChange } from '../utils/assessmentGoals';

interface PPLedgerViewProps {
  assessment: Assessment;
}

const PPLedgerView: React.FC<PPLedgerViewProps> = ({ assessment }) => {
  const [entries, setEntries] = useState<PPLedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchEntries = async () => {
      try {
        setLoading(true);
        const ledgerEntries = await getPPLedgerEntriesByAssessment(assessment.id);
        setEntries(ledgerEntries);
      } catch (error) {
        console.error('Error fetching ledger entries:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchEntries();
  }, [assessment.id]);

  if (loading) {
    return <div style={{ padding: '2rem', textAlign: 'center' }}>Loading ledger...</div>;
  }

  return (
    <div>
      <h2>{assessment.title} - PP Ledger</h2>
      
      {entries.length === 0 ? (
        <div style={{ padding: '2rem', textAlign: 'center', background: '#f3f4f6', borderRadius: '0.5rem' }}>
          <p>No ledger entries yet. PP changes will appear here after results are applied.</p>
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', background: 'white' }}>
            <thead>
              <tr style={{ background: '#f3f4f6' }}>
                <th style={{ padding: '0.75rem', textAlign: 'left', border: '1px solid #e5e7eb' }}>Student ID</th>
                <th style={{ padding: '0.75rem', textAlign: 'left', border: '1px solid #e5e7eb' }}>Amount</th>
                <th style={{ padding: '0.75rem', textAlign: 'left', border: '1px solid #e5e7eb' }}>Goal Score</th>
                <th style={{ padding: '0.75rem', textAlign: 'left', border: '1px solid #e5e7eb' }}>Actual Score</th>
                <th style={{ padding: '0.75rem', textAlign: 'left', border: '1px solid #e5e7eb' }}>Outcome</th>
                <th style={{ padding: '0.75rem', textAlign: 'left', border: '1px solid #e5e7eb' }}>Notes</th>
                <th style={{ padding: '0.75rem', textAlign: 'left', border: '1px solid #e5e7eb' }}>Date</th>
              </tr>
            </thead>
            <tbody>
              {entries.map(entry => (
                <tr key={entry.id}>
                  <td style={{ padding: '0.75rem', border: '1px solid #e5e7eb' }}>{entry.studentId}</td>
                  <td style={{ 
                    padding: '0.75rem', 
                    border: '1px solid #e5e7eb',
                    color: entry.amount > 0 ? '#10b981' : entry.amount < 0 ? '#ef4444' : '#6b7280',
                    fontWeight: 'bold'
                  }}>
                    {formatPPChange(entry.amount)}
                  </td>
                  <td style={{ padding: '0.75rem', border: '1px solid #e5e7eb' }}>
                    {entry.goalScore !== undefined ? entry.goalScore : '—'}
                  </td>
                  <td style={{ padding: '0.75rem', border: '1px solid #e5e7eb' }}>
                    {entry.actualScore !== undefined ? entry.actualScore : '—'}
                  </td>
                  <td style={{ padding: '0.75rem', border: '1px solid #e5e7eb' }}>
                    {entry.outcome || '—'}
                  </td>
                  <td style={{ padding: '0.75rem', border: '1px solid #e5e7eb' }}>
                    {entry.notes || '—'}
                  </td>
                  <td style={{ padding: '0.75rem', border: '1px solid #e5e7eb' }}>
                    {entry.createdAt?.toDate?.().toLocaleString() || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default PPLedgerView;








