import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  getPublishedQuizSets,
  getLastAttempt,
  isTrainingQuizAcceptingSoloCompletions,
} from '../utils/trainingGroundsService';
import { TrainingQuizSet, TrainingAttempt } from '../types/trainingGrounds';
import { getClassesByStudent } from '../utils/assessmentGoalsFirestore';

const TrainingGrounds: React.FC = () => {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const [quizSets, setQuizSets] = useState<TrainingQuizSet[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastAttempts, setLastAttempts] = useState<Record<string, TrainingAttempt>>({});
  const [enrolledClassIds, setEnrolledClassIds] = useState<string[]>([]);

  useEffect(() => {
    if (!currentUser) return;
    
    const loadQuizSets = async () => {
      try {
        setLoading(true);
        
        // Get user's classrooms from the classrooms collection
        const userClasses = await getClassesByStudent(currentUser.uid);
        const classIds = userClasses.map(c => c.id);
        setEnrolledClassIds(classIds);

        const published = await getPublishedQuizSets(classIds);
        setQuizSets(published);
        
        // Load last attempt for each quiz set
        const attempts: Record<string, TrainingAttempt> = {};
        for (const quizSet of published) {
          const lastAttempt = await getLastAttempt(currentUser.uid, quizSet.id);
          if (lastAttempt) {
            attempts[quizSet.id] = lastAttempt;
          }
        }
        setLastAttempts(attempts);
      } catch (error) {
        console.error('Error loading quiz sets:', error);
      } finally {
        setLoading(false);
      }
    };
    
    loadQuizSets();
  }, [currentUser]);

  const handleStartQuiz = (quizSetId: string) => {
    navigate(`/training-grounds/quiz/${quizSetId}`);
  };

  const canSubmitQuiz = (quiz: TrainingQuizSet) => isTrainingQuizAcceptingSoloCompletions(quiz);

  if (loading) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <div>Loading Training Grounds (CFUs)...</div>
      </div>
    );
  }

  return (
    <div style={{ 
      minHeight: '100vh', 
      background: 'linear-gradient(to bottom, #f3f4f6, #e5e7eb)',
      padding: '2rem'
    }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
        <div style={{ marginBottom: '2rem' }}>
          <h1 style={{ 
            fontSize: '2.5rem', 
            fontWeight: 'bold', 
            color: '#1f2937',
            marginBottom: '0.5rem'
          }}>
            🎯 Training Grounds (CFUs)
          </h1>
          <p style={{ fontSize: '1.125rem', color: '#6b7280' }}>
            Practice quizzes to review assignments and earn rewards
          </p>
        </div>

        {quizSets.length === 0 ? (
          <div style={{
            background: 'white',
            borderRadius: '1rem',
            padding: '3rem',
            textAlign: 'center',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
          }}>
            <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>📚</div>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>
              No quizzes available
            </h2>
            <p style={{ color: '#6b7280' }}>
              {enrolledClassIds.length === 0
                ? 'You need to be enrolled in a class to see CFU quizzes. Ask your teacher if you believe this is a mistake.'
                : 'There are no published CFU quizzes for your class yet. Check back later.'}
            </p>
          </div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
            gap: '1.5rem'
          }}>
            {quizSets.map(quizSet => {
              const lastAttempt = lastAttempts[quizSet.id];
              const estimatedMinutes = Math.ceil(quizSet.questionCount * 0.5); // ~30 seconds per question
              const openForCompletions = canSubmitQuiz(quizSet);
              
              return (
                <div
                  key={quizSet.id}
                  style={{
                    background: 'white',
                    borderRadius: '1rem',
                    padding: '1.5rem',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                    transition: 'transform 0.2s, box-shadow 0.2s',
                    cursor: openForCompletions ? 'pointer' : 'default'
                  }}
                  onMouseEnter={(e) => {
                    if (!openForCompletions) return;
                    e.currentTarget.style.transform = 'translateY(-4px)';
                    e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)';
                  }}
                  onClick={() => {
                    if (openForCompletions) handleStartQuiz(quizSet.id);
                  }}
                >
                  <div style={{ marginBottom: '1rem' }}>
                    <h3 style={{ 
                      fontSize: '1.25rem', 
                      fontWeight: 'bold',
                      marginBottom: '0.5rem',
                      color: '#1f2937'
                    }}>
                      {quizSet.title}
                    </h3>
                    {quizSet.description && (
                      <p style={{ 
                        fontSize: '0.875rem', 
                        color: '#6b7280',
                        marginBottom: '1rem'
                      }}>
                        {quizSet.description}
                      </p>
                    )}
                  </div>

                  <div style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '0.75rem',
                    marginBottom: '1rem',
                    fontSize: '0.875rem',
                    color: '#6b7280'
                  }}>
                    <div>📝 {quizSet.questionCount} questions</div>
                    <div>⏱️ ~{estimatedMinutes} min</div>
                  </div>

                  {!openForCompletions && (
                    <div
                      style={{
                        background: '#fef3c7',
                        border: '1px solid #fbbf24',
                        borderRadius: '0.5rem',
                        padding: '0.65rem 0.75rem',
                        marginBottom: '1rem',
                        fontSize: '0.8125rem',
                        color: '#92400e',
                        lineHeight: 1.4,
                      }}
                    >
                      This CFU is visible but <strong>temporarily closed</strong> for completions. Check back when your teacher reopens it.
                    </div>
                  )}

                  {lastAttempt && (
                    <div style={{
                      background: '#f3f4f6',
                      borderRadius: '0.5rem',
                      padding: '0.75rem',
                      marginBottom: '1rem'
                    }}>
                      <div style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.5rem' }}>
                        Last attempt
                      </div>
                      <div style={{ 
                        fontSize: '1.5rem', 
                        fontWeight: 'bold',
                        color: lastAttempt.percent >= 70 ? '#10b981' : lastAttempt.percent >= 50 ? '#f59e0b' : '#ef4444',
                        marginBottom: '0.25rem'
                      }}>
                        {lastAttempt.percent}%
                      </div>
                      <div style={{ 
                        fontSize: '0.875rem', 
                        color: '#6b7280'
                      }}>
                        {lastAttempt.scoreCorrect} out of {lastAttempt.scoreTotal} correct
                      </div>
                      {lastAttempt.rewards && (lastAttempt.rewards.ppGained > 0 || lastAttempt.rewards.xpGained > 0) && (
                        <div style={{ 
                          fontSize: '0.75rem', 
                          color: '#6b7280',
                          marginTop: '0.5rem',
                          paddingTop: '0.5rem',
                          borderTop: '1px solid #e5e7eb'
                        }}>
                          Earned: {lastAttempt.rewards.ppGained > 0 && `+${lastAttempt.rewards.ppGained} PP`}
                          {lastAttempt.rewards.ppGained > 0 && lastAttempt.rewards.xpGained > 0 && ' • '}
                          {lastAttempt.rewards.xpGained > 0 && `+${lastAttempt.rewards.xpGained} XP`}
                        </div>
                      )}
                    </div>
                  )}

                  <button
                    type="button"
                    disabled={!openForCompletions}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (openForCompletions) handleStartQuiz(quizSet.id);
                    }}
                    style={{
                      width: '100%',
                      background: openForCompletions ? '#4f46e5' : '#9ca3af',
                      color: 'white',
                      border: 'none',
                      borderRadius: '0.5rem',
                      padding: '0.75rem',
                      fontSize: '1rem',
                      fontWeight: '600',
                      cursor: openForCompletions ? 'pointer' : 'not-allowed',
                      transition: 'background 0.2s'
                    }}
                    onMouseEnter={(e) => {
                      if (!openForCompletions) return;
                      e.currentTarget.style.background = '#4338ca';
                    }}
                    onMouseLeave={(e) => {
                      if (!openForCompletions) return;
                      e.currentTarget.style.background = '#4f46e5';
                    }}
                  >
                    {!openForCompletions
                      ? 'Not accepting completions'
                      : lastAttempt
                        ? 'Retry Quiz'
                        : 'Start Quiz'}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default TrainingGrounds;

