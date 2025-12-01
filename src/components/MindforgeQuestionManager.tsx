import React, { useState, useEffect } from 'react';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, query, where, orderBy, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';

interface Question {
  id?: string;
  question: string;
  type: 'multiple-choice' | 'short-answer' | 'true-false';
  options?: string[];
  correctAnswer: string;
  topic?: string;
  unit?: string;
  difficulty: 'standard' | 'advanced' | 'exam';
  class: 'graphic-design' | 'ux-ui-design';
  createdAt?: any;
  updatedAt?: any;
}

const MindforgeQuestionManager: React.FC = () => {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filterClass, setFilterClass] = useState<'all' | 'graphic-design' | 'ux-ui-design'>('all');
  const [filterDifficulty, setFilterDifficulty] = useState<'all' | 'standard' | 'advanced' | 'exam'>('all');
  
  // Form state
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);
  const [copyingQuestion, setCopyingQuestion] = useState<Question | null>(null);
  const [showCopyModal, setShowCopyModal] = useState(false);
  const [copyTarget, setCopyTarget] = useState<{
    class: 'graphic-design' | 'ux-ui-design';
    difficulty: 'standard' | 'advanced' | 'exam';
  }>({
    class: 'graphic-design',
    difficulty: 'standard'
  });
  const [formData, setFormData] = useState<Question>({
    question: '',
    type: 'multiple-choice',
    options: ['', '', '', ''],
    correctAnswer: '',
    topic: '',
    unit: '',
    difficulty: 'standard',
    class: 'graphic-design'
  });

  useEffect(() => {
    loadQuestions();
  }, [filterClass, filterDifficulty]);

  const loadQuestions = async () => {
    setLoading(true);
    setError(null);
    try {
      let q;
      
      // Build query based on filters to avoid composite index requirement
      if (filterClass !== 'all') {
        // When filtering by class, don't use orderBy to avoid composite index
        q = query(collection(db, 'mindforgeQuestions'), where('class', '==', filterClass));
      } else {
        // Only use orderBy when not filtering by class
        q = query(collection(db, 'mindforgeQuestions'), orderBy('createdAt', 'desc'));
      }
      
      const snapshot = await getDocs(q);
      let loadedQuestions = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Question[];
      
      // Filter by difficulty if needed (client-side)
      if (filterDifficulty !== 'all') {
        loadedQuestions = loadedQuestions.filter(q => q.difficulty === filterDifficulty);
      }
      
      // Sort by createdAt if we didn't use orderBy (client-side sorting)
      if (filterClass !== 'all') {
        loadedQuestions.sort((a, b) => {
          const aTime = a.createdAt?.toMillis?.() || a.createdAt || 0;
          const bTime = b.createdAt?.toMillis?.() || b.createdAt || 0;
          return bTime - aTime; // Descending order
        });
      }
      
      setQuestions(loadedQuestions);
    } catch (err: any) {
      console.error('Error loading questions:', err);
      setError(err.message || 'Failed to load questions');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    
    // Prevent double submission
    if (saving) {
      return;
    }
    
    // Validation
    if (!formData.question.trim()) {
      setError('Question text is required');
      return;
    }
    
    if (!formData.correctAnswer.trim()) {
      setError('Correct answer is required');
      return;
    }
    
    if (formData.type === 'multiple-choice' && (!formData.options || formData.options.filter(o => o.trim()).length < 2)) {
      setError('Multiple choice questions need at least 2 options');
      return;
    }
    
    if (formData.type === 'multiple-choice' && !formData.options?.includes(formData.correctAnswer)) {
      setError('Correct answer must be one of the options');
      return;
    }

    setSaving(true);
    try {
      // Prepare question data - only include options for multiple-choice questions
      const questionData: any = {
        question: formData.question.trim(),
        type: formData.type,
        correctAnswer: formData.correctAnswer.trim(),
        difficulty: formData.difficulty,
        class: formData.class,
        createdAt: editingQuestion ? editingQuestion.createdAt : serverTimestamp(),
        updatedAt: serverTimestamp()
      };
      
      // Only include options field for multiple-choice questions
      if (formData.type === 'multiple-choice') {
        questionData.options = formData.options?.filter(o => o.trim()) || [];
        // Validate that we have at least 2 options
        if (questionData.options.length < 2) {
          setError('Multiple choice questions need at least 2 options');
          return;
        }
      }
      
      // Include optional fields if they exist
      if (formData.topic && formData.topic.trim()) {
        questionData.topic = formData.topic.trim();
      }
      if (formData.unit && formData.unit.trim()) {
        questionData.unit = formData.unit.trim();
      }

      console.log('Saving question with data:', questionData);

      if (editingQuestion?.id) {
        // Update existing question
        await updateDoc(doc(db, 'mindforgeQuestions', editingQuestion.id), questionData);
        console.log('Question updated successfully');
      } else {
        // Add new question
        const docRef = await addDoc(collection(db, 'mindforgeQuestions'), questionData);
        console.log('Question added successfully with ID:', docRef.id);
      }
      
      // Only close form and reset if save was successful
      setShowAddForm(false);
      setEditingQuestion(null);
      setFormData({
        question: '',
        type: 'multiple-choice',
        options: ['', '', '', ''],
        correctAnswer: '',
        topic: '',
        unit: '',
        difficulty: 'standard',
        class: 'graphic-design'
      });
      setError(null); // Clear any previous errors
      await loadQuestions(); // Wait for questions to reload
    } catch (err: any) {
      console.error('Error saving question:', err);
      console.error('Error details:', {
        code: err.code,
        message: err.message,
        stack: err.stack
      });
      setError(err.message || 'Failed to save question. Please check your admin permissions and try again.');
      // Don't close the form if there's an error - let user see the error and try again
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (question: Question) => {
    setEditingQuestion(question);
    setFormData({
      question: question.question,
      type: question.type,
      options: question.options || ['', '', '', ''],
      correctAnswer: question.correctAnswer,
      topic: question.topic || '',
      unit: question.unit || '',
      difficulty: question.difficulty,
      class: question.class
    });
    setShowAddForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this question?')) {
      return;
    }
    
    try {
      await deleteDoc(doc(db, 'mindforgeQuestions', id));
      loadQuestions();
    } catch (err: any) {
      console.error('Error deleting question:', err);
      setError(err.message || 'Failed to delete question');
    }
  };

  const handleCopy = (question: Question) => {
    setCopyingQuestion(question);
    setCopyTarget({
      class: question.class === 'graphic-design' ? 'ux-ui-design' : 'graphic-design', // Default to other class
      difficulty: question.difficulty // Keep same difficulty by default
    });
    setShowCopyModal(true);
  };

  const handleCopySubmit = async () => {
    if (!copyingQuestion) return;
    
    setError(null);
    
    try {
      // Prepare question data for copy
      const questionData: any = {
        question: copyingQuestion.question,
        type: copyingQuestion.type,
        correctAnswer: copyingQuestion.correctAnswer,
        difficulty: copyTarget.difficulty,
        class: copyTarget.class,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };
      
      // Only include options for multiple-choice questions
      if (copyingQuestion.type === 'multiple-choice' && copyingQuestion.options) {
        questionData.options = copyingQuestion.options;
      }
      
      // Include optional fields if they exist
      if (copyingQuestion.topic && copyingQuestion.topic.trim()) {
        questionData.topic = copyingQuestion.topic.trim();
      }
      if (copyingQuestion.unit && copyingQuestion.unit.trim()) {
        questionData.unit = copyingQuestion.unit.trim();
      }

      // Add new question with copied data
      await addDoc(collection(db, 'mindforgeQuestions'), questionData);
      
      setShowCopyModal(false);
      setCopyingQuestion(null);
      loadQuestions();
    } catch (err: any) {
      console.error('Error copying question:', err);
      setError(err.message || 'Failed to copy question');
    }
  };

  const handleCancel = () => {
    setShowAddForm(false);
    setEditingQuestion(null);
    setFormData({
      question: '',
      type: 'multiple-choice',
      options: ['', '', '', ''],
      correctAnswer: '',
      topic: '',
      unit: '',
      difficulty: 'standard',
      class: 'graphic-design'
    });
  };

  const addOption = () => {
    setFormData({
      ...formData,
      options: [...(formData.options || []), '']
    });
  };

  const removeOption = (index: number) => {
    const newOptions = formData.options?.filter((_, i) => i !== index) || [];
    setFormData({
      ...formData,
      options: newOptions
    });
  };

  const updateOption = (index: number, value: string) => {
    const newOptions = [...(formData.options || [])];
    newOptions[index] = value;
    setFormData({
      ...formData,
      options: newOptions
    });
  };

  const filteredQuestions = questions;

  return (
    <div style={{ padding: '2rem' }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '2rem'
      }}>
        <h2 style={{ fontSize: '2rem', fontWeight: 'bold', color: '#1f2937' }}>
          🧠 Mindforge Question Manager
        </h2>
        <button
          onClick={() => {
            setShowAddForm(true);
            setEditingQuestion(null);
            setFormData({
              question: '',
              type: 'multiple-choice',
              options: ['', '', '', ''],
              correctAnswer: '',
              topic: '',
              unit: '',
              difficulty: 'standard',
              class: 'graphic-design'
            });
          }}
          style={{
            background: '#3b82f6',
            color: 'white',
            border: 'none',
            padding: '0.75rem 1.5rem',
            borderRadius: '0.5rem',
            fontSize: '1rem',
            fontWeight: 'bold',
            cursor: 'pointer'
          }}
        >
          + Add Question
        </button>
      </div>

      {error && (
        <div style={{
          background: '#fee2e2',
          border: '1px solid #ef4444',
          color: '#dc2626',
          padding: '1rem',
          borderRadius: '0.5rem',
          marginBottom: '1rem'
        }}>
          {error}
        </div>
      )}

      {/* Filters */}
      <div style={{
        display: 'flex',
        gap: '1rem',
        marginBottom: '1.5rem',
        flexWrap: 'wrap'
      }}>
        <div>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
            Filter by Class:
          </label>
          <select
            value={filterClass}
            onChange={(e) => setFilterClass(e.target.value as any)}
            style={{
              padding: '0.5rem',
              borderRadius: '0.5rem',
              border: '1px solid #d1d5db',
              fontSize: '1rem'
            }}
          >
            <option value="all">All Classes</option>
            <option value="graphic-design">Graphic Design</option>
            <option value="ux-ui-design">UX/UI Design</option>
          </select>
        </div>
        
        <div>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
            Filter by Difficulty:
          </label>
          <select
            value={filterDifficulty}
            onChange={(e) => setFilterDifficulty(e.target.value as any)}
            style={{
              padding: '0.5rem',
              borderRadius: '0.5rem',
              border: '1px solid #d1d5db',
              fontSize: '1rem'
            }}
          >
            <option value="all">All Difficulties</option>
            <option value="standard">Standard</option>
            <option value="advanced">Advanced</option>
            <option value="exam">Exam Mode</option>
          </select>
        </div>
      </div>

      {/* Add/Edit Form */}
      {showAddForm && (
        <div style={{
          background: 'white',
          border: '2px solid #3b82f6',
          borderRadius: '0.75rem',
          padding: '2rem',
          marginBottom: '2rem',
          boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)'
        }}>
          <h3 style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '1.5rem' }}>
            {editingQuestion ? 'Edit Question' : 'Add New Question'}
          </h3>
          
          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                Class *
              </label>
              <select
                value={formData.class}
                onChange={(e) => setFormData({ ...formData, class: e.target.value as any })}
                required
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  borderRadius: '0.5rem',
                  border: '1px solid #d1d5db',
                  fontSize: '1rem'
                }}
              >
                <option value="graphic-design">Graphic Design</option>
                <option value="ux-ui-design">UX/UI Design</option>
              </select>
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                Difficulty *
              </label>
              <select
                value={formData.difficulty}
                onChange={(e) => setFormData({ ...formData, difficulty: e.target.value as any })}
                required
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  borderRadius: '0.5rem',
                  border: '1px solid #d1d5db',
                  fontSize: '1rem'
                }}
              >
                <option value="standard">Standard</option>
                <option value="advanced">Advanced</option>
                <option value="exam">Exam Mode</option>
              </select>
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                Question Type *
              </label>
              <select
                value={formData.type}
                onChange={(e) => {
                  const newType = e.target.value as any;
                  setFormData({
                    ...formData,
                    type: newType,
                    options: newType === 'multiple-choice' ? ['', '', '', ''] : undefined,
                    correctAnswer: '' // Reset correct answer when type changes
                  });
                }}
                required
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  borderRadius: '0.5rem',
                  border: '1px solid #d1d5db',
                  fontSize: '1rem'
                }}
              >
                <option value="multiple-choice">Multiple Choice</option>
                <option value="true-false">True/False</option>
                <option value="short-answer">Short Answer</option>
              </select>
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                Question Text *
              </label>
              <textarea
                value={formData.question}
                onChange={(e) => setFormData({ ...formData, question: e.target.value })}
                required
                rows={3}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  borderRadius: '0.5rem',
                  border: '1px solid #d1d5db',
                  fontSize: '1rem',
                  fontFamily: 'inherit'
                }}
                placeholder="Enter the question..."
              />
            </div>

            {formData.type === 'multiple-choice' && (
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                  Answer Options *
                </label>
                {formData.options?.map((option, index) => (
                  <div key={index} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                    <input
                      type="text"
                      value={option}
                      onChange={(e) => updateOption(index, e.target.value)}
                      placeholder={`Option ${index + 1}`}
                      style={{
                        flex: 1,
                        padding: '0.75rem',
                        borderRadius: '0.5rem',
                        border: '1px solid #d1d5db',
                        fontSize: '1rem'
                      }}
                    />
                    {formData.options && formData.options.length > 2 && (
                      <button
                        type="button"
                        onClick={() => removeOption(index)}
                        style={{
                          background: '#ef4444',
                          color: 'white',
                          border: 'none',
                          padding: '0.5rem 1rem',
                          borderRadius: '0.5rem',
                          cursor: 'pointer'
                        }}
                      >
                        Remove
                      </button>
                    )}
                  </div>
                ))}
                <button
                  type="button"
                  onClick={addOption}
                  style={{
                    background: '#10b981',
                    color: 'white',
                    border: 'none',
                    padding: '0.5rem 1rem',
                    borderRadius: '0.5rem',
                    cursor: 'pointer',
                    marginTop: '0.5rem'
                  }}
                >
                  + Add Option
                </button>
              </div>
            )}

            {formData.type === 'true-false' && (
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                  Correct Answer *
                </label>
                <select
                  value={formData.correctAnswer}
                  onChange={(e) => setFormData({ ...formData, correctAnswer: e.target.value })}
                  required
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    borderRadius: '0.5rem',
                    border: '1px solid #d1d5db',
                    fontSize: '1rem'
                  }}
                >
                  <option value="">Select answer</option>
                  <option value="True">True</option>
                  <option value="False">False</option>
                </select>
              </div>
            )}

            {formData.type === 'multiple-choice' && (
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                  Correct Answer * (must match one of the options)
                </label>
                <select
                  value={formData.correctAnswer}
                  onChange={(e) => setFormData({ ...formData, correctAnswer: e.target.value })}
                  required
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    borderRadius: '0.5rem',
                    border: '1px solid #d1d5db',
                    fontSize: '1rem'
                  }}
                >
                  <option value="">Select correct answer</option>
                  {formData.options?.filter(o => o.trim()).map((option, index) => (
                    <option key={index} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {formData.type === 'short-answer' && (
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                  Correct Answer * (keywords that should be in the answer)
                </label>
                <textarea
                  value={formData.correctAnswer}
                  onChange={(e) => setFormData({ ...formData, correctAnswer: e.target.value })}
                  required
                  rows={2}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    borderRadius: '0.5rem',
                    border: '1px solid #d1d5db',
                    fontSize: '1rem',
                    fontFamily: 'inherit'
                  }}
                  placeholder="Enter the correct answer or key phrases..."
                />
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                  Topic (optional)
                </label>
                <input
                  type="text"
                  value={formData.topic || ''}
                  onChange={(e) => setFormData({ ...formData, topic: e.target.value })}
                  placeholder="e.g., Color Theory"
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    borderRadius: '0.5rem',
                    border: '1px solid #d1d5db',
                    fontSize: '1rem'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                  Unit (optional)
                </label>
                <input
                  type="text"
                  value={formData.unit || ''}
                  onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                  placeholder="e.g., Unit 1"
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    borderRadius: '0.5rem',
                    border: '1px solid #d1d5db',
                    fontSize: '1rem'
                  }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={handleCancel}
                style={{
                  background: '#6b7280',
                  color: 'white',
                  border: 'none',
                  padding: '0.75rem 1.5rem',
                  borderRadius: '0.5rem',
                  fontSize: '1rem',
                  fontWeight: 'bold',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                style={{
                  background: saving ? '#9ca3af' : '#3b82f6',
                  color: 'white',
                  border: 'none',
                  padding: '0.75rem 1.5rem',
                  borderRadius: '0.5rem',
                  fontSize: '1rem',
                  fontWeight: 'bold',
                  cursor: saving ? 'not-allowed' : 'pointer',
                  opacity: saving ? 0.6 : 1
                }}
              >
                {saving ? 'Saving...' : (editingQuestion ? 'Update Question' : 'Add Question')}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Copy Modal */}
      {showCopyModal && copyingQuestion && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            background: 'white',
            borderRadius: '0.75rem',
            padding: '2rem',
            maxWidth: '500px',
            width: '90%',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)'
          }}>
            <h3 style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '1rem' }}>
              Copy Question
            </h3>
            <p style={{ marginBottom: '1.5rem', color: '#6b7280' }}>
              Copy this question to another class and/or difficulty level.
            </p>
            
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                Target Class *
              </label>
              <select
                value={copyTarget.class}
                onChange={(e) => setCopyTarget({ ...copyTarget, class: e.target.value as any })}
                required
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  borderRadius: '0.5rem',
                  border: '1px solid #d1d5db',
                  fontSize: '1rem'
                }}
              >
                <option value="graphic-design">Graphic Design</option>
                <option value="ux-ui-design">UX/UI Design</option>
              </select>
            </div>

            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                Target Difficulty *
              </label>
              <select
                value={copyTarget.difficulty}
                onChange={(e) => setCopyTarget({ ...copyTarget, difficulty: e.target.value as any })}
                required
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  borderRadius: '0.5rem',
                  border: '1px solid #d1d5db',
                  fontSize: '1rem'
                }}
              >
                <option value="standard">Standard</option>
                <option value="advanced">Advanced</option>
                <option value="exam">Exam Mode</option>
              </select>
            </div>

            <div style={{ 
              background: '#f3f4f6', 
              padding: '1rem', 
              borderRadius: '0.5rem', 
              marginBottom: '1.5rem',
              fontSize: '0.875rem',
              color: '#6b7280'
            }}>
              <strong>Current:</strong> {copyingQuestion.class === 'graphic-design' ? '🎨 Graphic Design' : '💡 UX/UI Design'} • {copyingQuestion.difficulty === 'standard' ? 'Standard' : copyingQuestion.difficulty === 'advanced' ? 'Advanced' : 'Exam'}
              <br />
              <strong>Copying to:</strong> {copyTarget.class === 'graphic-design' ? '🎨 Graphic Design' : '💡 UX/UI Design'} • {copyTarget.difficulty === 'standard' ? 'Standard' : copyTarget.difficulty === 'advanced' ? 'Advanced' : 'Exam'}
            </div>

            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => {
                  setShowCopyModal(false);
                  setCopyingQuestion(null);
                }}
                style={{
                  background: '#6b7280',
                  color: 'white',
                  border: 'none',
                  padding: '0.75rem 1.5rem',
                  borderRadius: '0.5rem',
                  fontSize: '1rem',
                  fontWeight: 'bold',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCopySubmit}
                style={{
                  background: '#10b981',
                  color: 'white',
                  border: 'none',
                  padding: '0.75rem 1.5rem',
                  borderRadius: '0.5rem',
                  fontSize: '1rem',
                  fontWeight: 'bold',
                  cursor: 'pointer'
                }}
              >
                Copy Question
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Questions List */}
      <div style={{
        background: 'white',
        borderRadius: '0.75rem',
        padding: '1.5rem',
        boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)'
      }}>
        <h3 style={{ fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '1rem' }}>
          Questions ({filteredQuestions.length})
        </h3>
        
        {loading ? (
          <div style={{ textAlign: 'center', padding: '2rem' }}>
            Loading questions...
          </div>
        ) : filteredQuestions.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '2rem', color: '#6b7280' }}>
            No questions found. Add your first question to get started!
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {filteredQuestions.map((question) => (
              <div
                key={question.id}
                style={{
                  border: '1px solid #e5e7eb',
                  borderRadius: '0.5rem',
                  padding: '1.5rem',
                  background: '#f9fafb'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '0.5rem' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
                      <span style={{
                        background: question.class === 'graphic-design' ? '#8b5cf6' : '#3b82f6',
                        color: 'white',
                        padding: '0.25rem 0.75rem',
                        borderRadius: '0.25rem',
                        fontSize: '0.875rem',
                        fontWeight: '500'
                      }}>
                        {question.class === 'graphic-design' ? '🎨 Graphic Design' : '💡 UX/UI Design'}
                      </span>
                      <span style={{
                        background: question.difficulty === 'standard' ? '#3b82f6' : question.difficulty === 'advanced' ? '#f59e0b' : '#ef4444',
                        color: 'white',
                        padding: '0.25rem 0.75rem',
                        borderRadius: '0.25rem',
                        fontSize: '0.875rem',
                        fontWeight: '500'
                      }}>
                        {question.difficulty === 'standard' ? 'Standard' : question.difficulty === 'advanced' ? 'Advanced' : 'Exam'}
                      </span>
                      <span style={{
                        background: '#6b7280',
                        color: 'white',
                        padding: '0.25rem 0.75rem',
                        borderRadius: '0.25rem',
                        fontSize: '0.875rem',
                        fontWeight: '500'
                      }}>
                        {question.type === 'multiple-choice' ? 'Multiple Choice' : question.type === 'true-false' ? 'True/False' : 'Short Answer'}
                      </span>
                    </div>
                    <p style={{ fontSize: '1rem', fontWeight: '500', marginBottom: '0.5rem' }}>
                      {question.question}
                    </p>
                    {question.type === 'multiple-choice' && question.options && (
                      <div style={{ marginLeft: '1rem', marginTop: '0.5rem' }}>
                        <p style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.25rem' }}>Options:</p>
                        <ul style={{ margin: 0, paddingLeft: '1.5rem' }}>
                          {question.options.map((option, index) => (
                            <li key={index} style={{
                              color: option === question.correctAnswer ? '#10b981' : '#374151',
                              fontWeight: option === question.correctAnswer ? 'bold' : 'normal'
                            }}>
                              {option} {option === question.correctAnswer && '✓'}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {question.type !== 'multiple-choice' && (
                      <p style={{ fontSize: '0.875rem', color: '#10b981', marginTop: '0.5rem', fontWeight: '500' }}>
                        Correct Answer: {question.correctAnswer}
                      </p>
                    )}
                    {(question.topic || question.unit) && (
                      <p style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.5rem' }}>
                        {question.topic && `Topic: ${question.topic}`} {question.unit && `• Unit: ${question.unit}`}
                      </p>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', marginLeft: '1rem' }}>
                    <button
                      onClick={() => handleCopy(question)}
                      style={{
                        background: '#10b981',
                        color: 'white',
                        border: 'none',
                        padding: '0.5rem 1rem',
                        borderRadius: '0.5rem',
                        cursor: 'pointer',
                        fontSize: '0.875rem'
                      }}
                      title="Copy to another class/difficulty"
                    >
                      Copy
                    </button>
                    <button
                      onClick={() => handleEdit(question)}
                      style={{
                        background: '#3b82f6',
                        color: 'white',
                        border: 'none',
                        padding: '0.5rem 1rem',
                        borderRadius: '0.5rem',
                        cursor: 'pointer',
                        fontSize: '0.875rem'
                      }}
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => question.id && handleDelete(question.id)}
                      style={{
                        background: '#ef4444',
                        color: 'white',
                        border: 'none',
                        padding: '0.5rem 1rem',
                        borderRadius: '0.5rem',
                        cursor: 'pointer',
                        fontSize: '0.875rem'
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default MindforgeQuestionManager;

