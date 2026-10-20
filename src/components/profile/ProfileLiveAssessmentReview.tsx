import React, { useEffect, useState } from 'react';
import ExamResultsBreakdown from '../exam/ExamResultsBreakdown';
import {
  loadLiveAssessmentDetail,
  loadRecentLiveAssessments,
  type LiveAssessmentReviewDetail,
  type LiveAssessmentReviewItem,
} from '../../utils/liveAssessmentReview';

interface Props {
  userId: string;
}

function scoreColor(pct: number): string {
  if (pct >= 90) return '#059669';
  if (pct >= 70) return '#2563eb';
  if (pct >= 50) return '#d97706';
  return '#dc2626';
}

const ProfileLiveAssessmentReview: React.FC<Props> = ({ userId }) => {
  const [items, setItems] = useState<LiveAssessmentReviewItem[] | null>(null);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, LiveAssessmentReviewDetail | 'error'>>({});

  useEffect(() => {
    let cancelled = false;
    setItems(null);
    setOpenKey(null);
    setDetails({});
    loadRecentLiveAssessments(userId, 3)
      .then((rows) => {
        if (!cancelled) setItems(rows);
      })
      .catch((e) => {
        console.warn('[ProfileLiveAssessmentReview] load', e);
        if (!cancelled) setItems([]);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const toggle = (item: LiveAssessmentReviewItem) => {
    if (openKey === item.key) {
      setOpenKey(null);
      return;
    }
    setOpenKey(item.key);
    if (details[item.key] && details[item.key] !== 'error') return;
    loadLiveAssessmentDetail(item, userId)
      .then((d) => setDetails((prev) => ({ ...prev, [item.key]: d })))
      .catch((e) => {
        console.warn('[ProfileLiveAssessmentReview] detail', e);
        setDetails((prev) => ({ ...prev, [item.key]: 'error' }));
      });
  };

  return (
    <div className="mst-profile-panel" style={{ marginTop: '1.5rem', padding: '1.25rem' }}>
      <h2 className="mst-profile-panel-title">Review Live Event Quizzes &amp; Exams</h2>
      <p style={{ margin: '0 0 1rem', color: 'var(--mst-text-muted)', fontSize: '0.875rem' }}>
        Your last 3 live event quizzes or exams. Open one to see your score and every response.
      </p>

      {items === null ? (
        <p style={{ margin: 0, color: 'var(--mst-text-muted)' }}>Loading your recent results…</p>
      ) : items.length === 0 ? (
        <p style={{ margin: 0, color: 'var(--mst-text-muted)' }}>
          No live event quizzes or exams yet. Finish one in a Live Event to review it here.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {items.map((item) => {
            const pct = Math.round(item.scorePercent);
            const isOpen = openKey === item.key;
            const detail = details[item.key];
            return (
              <div
                key={item.key}
                style={{
                  background: 'rgba(255,255,255,0.92)',
                  borderRadius: '0.6rem',
                  border: '1px solid rgba(99, 102, 241, 0.3)',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                    padding: '0.75rem 0.9rem',
                    flexWrap: 'wrap',
                  }}
                >
                  <span
                    style={{
                      fontSize: '0.68rem',
                      fontWeight: 800,
                      letterSpacing: '0.04em',
                      textTransform: 'uppercase',
                      padding: '0.2rem 0.5rem',
                      borderRadius: '999px',
                      background: item.kind === 'exam' ? '#ede9fe' : '#dbeafe',
                      color: item.kind === 'exam' ? '#5b21b6' : '#1d4ed8',
                    }}
                  >
                    {item.kind === 'exam' ? 'Exam' : 'Quiz'}
                  </span>
                  <div style={{ flex: '1 1 180px', minWidth: 0 }}>
                    <div style={{ fontWeight: 700, color: '#1e293b', fontSize: '0.9rem' }}>{item.title}</div>
                    <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: 2 }}>
                      {item.scoreLine}
                      {item.completedAtMs ? ` · ${new Date(item.completedAtMs).toLocaleString()}` : ''}
                    </div>
                  </div>
                  <div style={{ fontWeight: 800, fontSize: '1.15rem', color: scoreColor(pct) }}>{pct}%</div>
                  <button
                    type="button"
                    onClick={() => toggle(item)}
                    aria-expanded={isOpen}
                    style={{
                      padding: '0.4rem 0.8rem',
                      borderRadius: '0.45rem',
                      border: '1px solid #6366f1',
                      background: isOpen ? '#6366f1' : '#fff',
                      color: isOpen ? '#fff' : '#4338ca',
                      fontWeight: 700,
                      fontSize: '0.8rem',
                      cursor: 'pointer',
                    }}
                  >
                    {isOpen ? 'Hide responses' : 'Review responses'}
                  </button>
                </div>

                {isOpen ? (
                  <div style={{ borderTop: '1px solid #e2e8f0', padding: '1rem', background: '#fff' }}>
                    {!detail ? (
                      <p style={{ margin: 0, color: '#64748b' }}>Loading responses…</p>
                    ) : detail === 'error' ? (
                      <p style={{ margin: 0, color: '#b45309', fontWeight: 600 }}>
                        Could not load the questions for this one. Try again in a moment.
                      </p>
                    ) : detail.questions.length === 0 ? (
                      <p style={{ margin: 0, color: '#64748b' }}>
                        The questions for this one are no longer available to review.
                      </p>
                    ) : (
                      <>
                        {!detail.responsesSaved ? (
                          <p
                            style={{
                              margin: '0 0 0.75rem',
                              padding: '0.6rem 0.75rem',
                              background: '#fffbeb',
                              border: '1px solid #fde68a',
                              borderRadius: '0.45rem',
                              color: '#92400e',
                              fontSize: '0.82rem',
                            }}
                          >
                            Your exact choices weren&apos;t saved for this one because it was taken before response
                            saving was added. You can still see which questions you got right and the correct answers.
                          </p>
                        ) : null}
                        <ExamResultsBreakdown
                          questions={detail.questions}
                          answers={detail.answers}
                          scorePercent={item.scorePercent}
                          correctCount={detail.answers.filter((a) => a.isCorrect).length}
                          summary={item.scoreLine}
                        />
                      </>
                    )}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ProfileLiveAssessmentReview;
