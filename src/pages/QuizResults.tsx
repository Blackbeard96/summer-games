import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getAttempt, getQuizSet, getQuestions } from '../utils/trainingGroundsService';
import { TrainingAttempt, TrainingQuestion } from '../types/trainingGrounds';

const QuizResults: React.FC = () => {
  const { attemptId } = useParams<{ attemptId: string }>();
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  
  const [attempt, setAttempt] = useState<TrainingAttempt | null>(null);
  const [quizSet, setQuizSet] = useState<any>(null);
  const [questions, setQuestions] = useState<TrainingQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedQuestions, setExpandedQuestions] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!attemptId || !currentUser) return;
    
    const loadResults = async () => {
      try {
        setLoading(true);
        const attemptData = await getAttempt(attemptId);
        if (!attemptData || attemptData.userId !== currentUser.uid) {
          alert('Attempt not found');
          navigate('/training-grounds');
          return;
        }
        setAttempt(attemptData);
        
        const quiz = await getQuizSet(attemptData.quizSetId);
        setQuizSet(quiz);
        
        const quizQuestions = await getQuestions(attemptData.quizSetId);
        setQuestions(quizQuestions);
      } catch (error) {
        console.error('Error loading results:', error);
        alert('Failed to load results');
        navigate('/training-grounds');
      } finally {
        setLoading(false);
      }
    };
    
    loadResults();
  }, [attemptId, currentUser, navigate]);

  const toggleQuestion = (questionId: string) => {
    setExpandedQuestions(prev => {
      const newSet = new Set(prev);
      if (newSet.has(questionId)) {
        newSet.delete(questionId);
      } else {
        newSet.add(questionId);
      }
      return newSet;
    });
  };

  if (loading || !attempt || !quizSet) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <div>Loading results...</div>
      </div>
    );
  }

  const scoreColor = attempt.percent >= 70 ? '#10b981' : attempt.percent >= 50 ? '#f59e0b' : '#ef4444';

  return (
    <div style={{ 
      minHeight: '100vh', 
      background: 'linear-gradient(to bottom, #f3f4f6, #e5e7eb)',
      padding: '2rem'
    }}>
      <div style={{ maxWidth: '900px', margin: '0 auto' }}>
        {/* Score card */}
        <div style={{
          background: 'white',
          borderRadius: '1rem',
          padding: '2rem',
          marginBottom: '1.5rem',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          textAlign: 'center'
        }}>
          <h1 style={{ 
            fontSize: '2rem', 
            fontWeight: 'bold',
            marginBottom: '1rem',
            color: '#1f2937'
          }}>
            Quiz Complete!
          </h1>
          <div style={{
            fontSize: '4rem',
            fontWeight: 'bold',
            color: scoreColor,
            marginBottom: '0.5rem'
          }}>
            {attempt.percent}%
          </div>
          <div style={{ fontSize: '1.125rem', color: '#6b7280', marginBottom: '2rem' }}>
            {attempt.scoreCorrect} out of {attempt.scoreTotal} correct
          </div>

          {/* Rewards */}
          <div style={{
            background: '#f3f4f6',
            borderRadius: '0.75rem',
            padding: '1.5rem',
            marginBottom: '1.5rem'
          }}>
            <h3 style={{ 
              fontSize: '1.25rem', 
              fontWeight: 'bold',
              marginBottom: '1rem',
              color: '#1f2937'
            }}>
              Rewards Earned
            </h3>
            <div style={{ 
              display: 'flex', 
              justifyContent: 'center',
              gap: '2rem',
              flexWrap: 'wrap'
            }}>
              <div>
                <div style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.25rem' }}>
                  Participation Points
                </div>
                <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#4f46e5' }}>
                  +{attempt.rewards.ppGained} PP
                </div>
              </div>
              <div>
                <div style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.25rem' }}>
                  Experience Points
                </div>
                <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#10b981' }}>
                  +{attempt.rewards.xpGained} XP
                </div>
              </div>
            </div>
            {attempt.rewards.bonuses.length > 0 && (
              <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid #e5e7eb' }}>
                <div style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.5rem' }}>
                  Bonuses:
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', justifyContent: 'center' }}>
                  {attempt.rewards.bonuses.map((bonus, index) => (
                    <span 
                      key={index}
                      style={{
                        background: '#fef3c7',
                        color: '#92400e',
                        padding: '0.25rem 0.75rem',
                        borderRadius: '9999px',
                        fontSize: '0.875rem',
                        fontWeight: '600'
                      }}
                    >
                      {bonus}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Question breakdown */}
        <div style={{
          background: 'white',
          borderRadius: '1rem',
          padding: '2rem',
          marginBottom: '1.5rem',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
        }}>
          <h2 style={{ 
            fontSize: '1.5rem', 
            fontWeight: 'bold',
            marginBottom: '1.5rem',
            color: '#1f2937'
          }}>
            Question Breakdown
          </h2>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {questions.map((question, index) => {
              const answer = attempt.answers.find(a => a.questionId === question.id);
              const isCorrect = answer?.isCorrect || false;
              const isExpanded = expandedQuestions.has(question.id);

              return (
                <div
                  key={question.id}
                  style={{
                    border: `2px solid ${isCorrect ? '#10b981' : '#ef4444'}`,
                    borderRadius: '0.5rem',
                    overflow: 'hidden'
                  }}
                >
                  <div
                    onClick={() => toggleQuestion(question.id)}
                    style={{
                      padding: '1rem',
                      background: isCorrect ? '#ecfdf5' : '#fef2f2',
                      cursor: 'pointer',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                      <span style={{ 
                        fontSize: '1.25rem',
                        fontWeight: 'bold'
                      }}>
                        {isCorrect ? '✓' : '✗'}
                      </span>
                      <span style={{ fontWeight: '600' }}>
                        Question {index + 1}: {question.prompt.length > 50 
                          ? question.prompt.substring(0, 50) + '...' 
                          : question.prompt}
                      </span>
                    </div>
                    <span style={{ fontSize: '1.5rem' }}>
                      {isExpanded ? '▼' : '▶'}
                    </span>
                  </div>

                  {isExpanded && (
                    <div style={{ padding: '1rem', background: 'white' }}>
                      <div style={{ marginBottom: '1rem' }}>
                        <strong>Question:</strong> {question.prompt}
                      </div>
                      {question.imageUrl && (
                        <div style={{ marginBottom: '1rem', textAlign: 'center' }}>
                          <img 
                            src={question.imageUrl} 
                            alt="Question illustration"
                            style={{
                              maxWidth: '100%',
                              maxHeight: '300px',
                              borderRadius: '0.5rem'
                            }}
                          />
                        </div>
                      )}
                      <div style={{ marginBottom: '1rem' }}>
                        <strong>Your answer(s):</strong>{' '}
                        <span style={{ color: isCorrect ? '#10b981' : (answer?.partialCredit && answer.partialCredit > 0 ? '#f59e0b' : '#ef4444'), fontWeight: '600' }}>
                          {(() => {
                            const selectedIndices = answer?.selectedIndices || 
                              (answer?.selectedIndex !== undefined ? [answer.selectedIndex] : []);
                            if (selectedIndices.length === 0) return 'None selected';
                            return selectedIndices.map(idx => `${String.fromCharCode(65 + idx)}: ${question.options[idx]}`).join(', ');
                          })()}
                        </span>
                        {answer?.partialCredit && answer.partialCredit > 0 && answer.partialCredit < 1 && (
                          <span style={{ color: '#f59e0b', marginLeft: '0.5rem' }}>
                            ({Math.round(answer.partialCredit * 100)}% credit)
                          </span>
                        )}
                      </div>
                      <div style={{ marginBottom: '1rem' }}>
                        <strong>Correct answer(s):</strong>{' '}
                        <span style={{ color: '#10b981', fontWeight: '600' }}>
                          {(() => {
                            const correctIndices = (question as any).correctIndices || 
                              (question.correctIndex !== undefined ? [question.correctIndex] : []);
                            if (correctIndices.length === 0) return 'None';
                            return correctIndices.map((idx: number) => `${String.fromCharCode(65 + idx)}: ${question.options[idx]}`).join(', ');
                          })()}
                        </span>
                      </div>
                      {question.explanation && (
                        <div style={{
                          padding: '0.75rem',
                          background: '#f3f4f6',
                          borderRadius: '0.5rem',
                          color: '#6b7280'
                        }}>
                          <strong>Explanation:</strong> {question.explanation}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Action buttons */}
        <div style={{
          display: 'flex',
          gap: '1rem',
          justifyContent: 'center',
          flexWrap: 'wrap'
        }}>
          <button
            onClick={() => navigate(`/training-grounds/quiz/${attempt.quizSetId}`)}
            style={{
              padding: '0.75rem 2rem',
              background: '#4f46e5',
              color: 'white',
              border: 'none',
              borderRadius: '0.5rem',
              fontSize: '1rem',
              fontWeight: '600',
              cursor: 'pointer',
            }}
          >
            Retry Quiz
          </button>
          <button
            onClick={() => navigate('/training-grounds')}
            style={{
              padding: '0.75rem 2rem',
              background: '#6b7280',
              color: 'white',
              border: 'none',
              borderRadius: '0.5rem',
              fontSize: '1rem',
              fontWeight: '600',
              cursor: 'pointer',
            }}
          >
            Back to Training Grounds
          </button>
        </div>
      </div>
    </div>
  );
};

export default QuizResults;

