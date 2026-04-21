import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { db } from '../firebase';
import { collection, getDocs, doc, getDoc, deleteField } from 'firebase/firestore';
import {
  getAllQuizSets,
  createQuizSet,
  updateQuizSet,
  deleteQuizSet,
  getQuestions,
  addQuestion,
  updateQuestion,
  deleteQuestion,
  reorderQuestions,
  uploadQuestionImage,
  deleteQuestionImage,
  getQuizSetAttempts,
  assignedClassIdsForQuiz,
  sortQuizSetsForAdminByClass,
} from '../utils/trainingGroundsService';
import { TrainingQuizSet, TrainingQuestion, DEFAULT_REWARDS } from '../types/trainingGrounds';
import { getAvailableArtifacts } from '../utils/artifactCompensation';

const MIN_TRAINING_ANSWER_CHOICES = 2;
const MAX_TRAINING_ANSWER_CHOICES = 6;

/**
 * Drop empty option rows and remap correct-answer indices onto the stored array.
 * Form indices refer to the full option list (including blanks); Firestore stores only non-empty strings.
 */
function compactOptionsAndCorrectIndices(
  options: string[],
  correctIndicesInput: number[],
  correctIndexSingle?: number
): { validOptions: string[]; correctIndices: number[] } | { error: string } {
  const rawIndices =
    correctIndicesInput.length > 0
      ? [...correctIndicesInput]
      : correctIndexSingle !== undefined
        ? [correctIndexSingle]
        : [];
  const validOptions: string[] = [];
  const oldToNew = new Map<number, number>();
  options.forEach((o, i) => {
    const t = o.trim();
    if (t) {
      oldToNew.set(i, validOptions.length);
      validOptions.push(t);
    }
  });
  if (validOptions.length < MIN_TRAINING_ANSWER_CHOICES) {
    return {
      error: `Please provide at least ${MIN_TRAINING_ANSWER_CHOICES} non-empty answer choices.`,
    };
  }
  const remapped = rawIndices
    .map((i) => oldToNew.get(i))
    .filter((x): x is number => x !== undefined);
  const correctIndices = Array.from(new Set(remapped)).sort((a, b) => a - b);
  if (correctIndices.length === 0) {
    return {
      error: 'Select at least one correct answer among your filled-in choices.',
    };
  }
  return { validOptions, correctIndices };
}

const TrainingGroundsAdmin: React.FC = () => {
  const { currentUser } = useAuth();
  const [quizSets, setQuizSets] = useState<TrainingQuizSet[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedQuizSet, setSelectedQuizSet] = useState<TrainingQuizSet | null>(null);
  const [questions, setQuestions] = useState<TrainingQuestion[]>([]);
  const [classrooms, setClassrooms] = useState<Array<{ id: string; name: string }>>([]);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showQuestionForm, setShowQuestionForm] = useState(false);
  const [showImportForm, setShowImportForm] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<TrainingQuestion | null>(null);
  const [uploading, setUploading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [sourceQuizSetId, setSourceQuizSetId] = useState('');
  const [sourceQuestions, setSourceQuestions] = useState<TrainingQuestion[]>([]);
  const [selectedSourceQuestionIds, setSelectedSourceQuestionIds] = useState<string[]>([]);
  const [availableArtifacts, setAvailableArtifacts] = useState<Array<{ id: string; name: string; icon: string }>>([]);
  const [showCompletionStats, setShowCompletionStats] = useState(false);
  const [completionStats, setCompletionStats] = useState<Array<{
    userId: string;
    displayName: string;
    attemptCount: number;
    bestScore: number;
    latestScore: number;
  }>>([]);
  const [loadingStats, setLoadingStats] = useState(false);
  const [editClassIds, setEditClassIds] = useState<string[]>([]);
  const [savingClassIds, setSavingClassIds] = useState(false);

  // Form state
  const [quizSetForm, setQuizSetForm] = useState({
    title: '',
    description: '',
    classIds: [] as string[],
    tags: [] as string[],
    isPublished: false,
  });

  const [questionForm, setQuestionForm] = useState({
    prompt: '',
    options: ['', '', '', ''], // default four rows; save requires ≥2 non-empty
    correctIndex: 0, // DEPRECATED: Use correctIndices instead (0=A, 1=B, 2=C, 3=D)
    correctIndices: [] as number[], // Array of correct answer indices (supports multiple)
    explanation: '',
    difficulty: 'medium' as 'easy' | 'medium' | 'hard',
    category: '',
    imageFile: null as File | null,
    imageUrl: '' as string | null,
    pointsPP: 10,
    pointsXP: 10,
    artifactRewards: [] as string[],
  });

  useEffect(() => {
    loadQuizSets();
    loadClassrooms();
    loadArtifacts();
  }, []);

  const loadArtifacts = () => {
    const artifacts = getAvailableArtifacts();
    setAvailableArtifacts(artifacts.map(a => ({ id: a.id, name: a.name, icon: a.icon || '🎁' })));
  };

  useEffect(() => {
    if (selectedQuizSet) {
      loadQuestions(selectedQuizSet.id);
    }
  }, [selectedQuizSet]);

  useEffect(() => {
    if (selectedQuizSet) {
      setEditClassIds(assignedClassIdsForQuiz(selectedQuizSet));
    } else {
      setEditClassIds([]);
    }
  }, [selectedQuizSet?.id, (selectedQuizSet?.classIds || []).join(',')]);

  const sortedQuizSetsForAdmin = useMemo(
    () => sortQuizSetsForAdminByClass(quizSets, classrooms),
    [quizSets, classrooms]
  );

  const classLabelsForQuiz = (quiz: TrainingQuizSet): string => {
    const ids = assignedClassIdsForQuiz(quiz);
    if (ids.length === 0) return 'Unassigned';
    return ids
      .map((id) => classrooms.find((c) => c.id === id)?.name?.trim() || id)
      .sort((a, b) => a.localeCompare(b))
      .join(' · ');
  };

  const sectionHeaderKeyForQuiz = (quiz: TrainingQuizSet): string => {
    const ids = assignedClassIdsForQuiz(quiz);
    if (ids.length === 0) return '__unassigned';
    return [...ids]
      .sort()
      .map((id) => classrooms.find((c) => c.id === id)?.name?.trim() || id)
      .join(' | ');
  };

  const loadQuizSets = async () => {
    try {
      setLoading(true);
      const all = await getAllQuizSets(true);
      setQuizSets(all);
    } catch (error) {
      console.error('Error loading quiz sets:', error);
      alert('Failed to load quiz sets');
    } finally {
      setLoading(false);
    }
  };

  const loadClassrooms = async () => {
    try {
      const classroomsSnapshot = await getDocs(collection(db, 'classrooms'));
      const classroomsList = classroomsSnapshot.docs.map(doc => ({
        id: doc.id,
        name: doc.data().name || doc.id,
      }));
      setClassrooms(classroomsList);
    } catch (error) {
      console.error('Error loading classrooms:', error);
    }
  };

  const loadQuestions = async (quizSetId: string) => {
    try {
      const quizQuestions = await getQuestions(quizSetId);
      setQuestions(quizQuestions);
    } catch (error) {
      console.error('Error loading questions:', error);
      alert('Failed to load questions');
    }
  };

  const loadCompletionStats = async (quizSetId: string) => {
    if (!quizSetId) return;
    
    setLoadingStats(true);
    try {
      // Get all attempts for this quiz set
      const attempts = await getQuizSetAttempts(quizSetId);
      
      // Group attempts by user
      const userAttemptsMap = new Map<string, typeof attempts>();
      attempts.forEach(attempt => {
        const userId = attempt.userId;
        if (!userAttemptsMap.has(userId)) {
          userAttemptsMap.set(userId, []);
        }
        userAttemptsMap.get(userId)!.push(attempt);
      });
      
      // Fetch user display names and calculate stats
      const statsPromises = Array.from(userAttemptsMap.entries()).map(async ([userId, userAttempts]) => {
        // Get display name from students or users collection
        let displayName = userId; // Fallback to userId
        
        try {
          const [userDoc, studentDoc] = await Promise.all([
            getDoc(doc(db, 'users', userId)),
            getDoc(doc(db, 'students', userId))
          ]);
          
          if (userDoc.exists()) {
            displayName = userDoc.data().displayName || displayName;
          }
          if (studentDoc.exists() && displayName === userId) {
            displayName = studentDoc.data().displayName || studentDoc.data().name || displayName;
          }
        } catch (error) {
          console.error(`Error fetching display name for ${userId}:`, error);
        }
        
        // Calculate stats
        const attemptCount = userAttempts.length;
        const scores = userAttempts.map(a => a.percent);
        const bestScore = Math.max(...scores);
        const latestScore = scores[0]; // Already sorted by most recent first
        
        return {
          userId,
          displayName,
          attemptCount,
          bestScore,
          latestScore,
        };
      });
      
      const stats = await Promise.all(statsPromises);
      // Sort by display name
      stats.sort((a, b) => a.displayName.localeCompare(b.displayName));
      
      setCompletionStats(stats);
      setShowCompletionStats(true);
    } catch (error) {
      console.error('Error loading completion stats:', error);
      alert('Failed to load completion statistics');
    } finally {
      setLoadingStats(false);
    }
  };

  const handleCreateQuizSet = async () => {
    if (!currentUser || !quizSetForm.title.trim()) {
      alert('Please enter a title');
      return;
    }
    if (quizSetForm.isPublished && quizSetForm.classIds.length === 0) {
      alert('Choose at least one class before publishing. Students only see CFUs assigned to their class.');
      return;
    }

    try {
      const quizSetId = await createQuizSet({
        title: quizSetForm.title,
        description: quizSetForm.description,
        createdBy: currentUser.uid,
        classIds: quizSetForm.classIds,
        isPublished: quizSetForm.isPublished,
        tags: quizSetForm.tags,
      });

      alert('Quiz set created successfully!');
      setShowCreateForm(false);
      setQuizSetForm({
        title: '',
        description: '',
        classIds: [],
        tags: [],
        isPublished: false,
      });
      await loadQuizSets();
      
      // Select the newly created quiz set
      const newQuizSetDoc = await getDoc(doc(db, 'trainingQuizSets', quizSetId));
      if (newQuizSetDoc.exists()) {
        const newQuizSet = { id: newQuizSetDoc.id, ...newQuizSetDoc.data() } as TrainingQuizSet;
        setSelectedQuizSet(newQuizSet);
      }
    } catch (error) {
      console.error('Error creating quiz set:', error);
      alert('Failed to create quiz set');
    }
  };

  const handleDeleteQuizSet = async (quizSetId: string) => {
    if (!window.confirm('Are you sure you want to delete this quiz set? This will also delete all questions.')) {
      return;
    }

    try {
      await deleteQuizSet(quizSetId);
      alert('Quiz set deleted successfully');
      if (selectedQuizSet?.id === quizSetId) {
        setSelectedQuizSet(null);
        setQuestions([]);
      }
      await loadQuizSets();
    } catch (error) {
      console.error('Error deleting quiz set:', error);
      alert('Failed to delete quiz set');
    }
  };

  const handleSaveQuizSetClasses = async () => {
    if (!selectedQuizSet) return;
    setSavingClassIds(true);
    try {
      await updateQuizSet(selectedQuizSet.id, { classIds: editClassIds });
      await loadQuizSets();
      const refreshed = await getDoc(doc(db, 'trainingQuizSets', selectedQuizSet.id));
      if (refreshed.exists()) {
        setSelectedQuizSet({ id: refreshed.id, ...refreshed.data() } as TrainingQuizSet);
      }
    } catch (error) {
      console.error('Error updating class assignment:', error);
      alert('Failed to save class assignment');
    } finally {
      setSavingClassIds(false);
    }
  };

  const handleTogglePublish = async (quizSet: TrainingQuizSet) => {
    const turningOn = !quizSet.isPublished;
    const effectiveClassIds =
      selectedQuizSet?.id === quizSet.id ? editClassIds : assignedClassIdsForQuiz(quizSet);
    if (turningOn && effectiveClassIds.length === 0) {
      alert('Assign this quiz to at least one class before publishing. Students only see CFUs for their class.');
      return;
    }
    try {
      const payload: Partial<TrainingQuizSet> = { isPublished: turningOn };
      if (turningOn && selectedQuizSet?.id === quizSet.id) {
        payload.classIds = editClassIds;
      }
      await updateQuizSet(quizSet.id, payload);
      await loadQuizSets();
      if (selectedQuizSet?.id === quizSet.id) {
        const refreshed = await getDoc(doc(db, 'trainingQuizSets', quizSet.id));
        if (refreshed.exists()) {
          setSelectedQuizSet({ id: refreshed.id, ...refreshed.data() } as TrainingQuizSet);
        } else {
          setSelectedQuizSet({ ...selectedQuizSet, isPublished: turningOn });
        }
      }
    } catch (error) {
      console.error('Error updating quiz set:', error);
      alert('Failed to update quiz set');
    }
  };

  const handleAddQuestion = async () => {
    if (!selectedQuizSet || !questionForm.prompt.trim()) {
      alert('Please enter a question prompt');
      return;
    }
    
    const compact = compactOptionsAndCorrectIndices(
      questionForm.options,
      questionForm.correctIndices,
      questionForm.correctIndex
    );
    if ('error' in compact) {
      alert(compact.error);
      return;
    }
    const { validOptions, correctIndices } = compact;

    try {
      setUploading(true);

      // Create question first (without image)
      const rewardConfig = DEFAULT_REWARDS[questionForm.difficulty];

      const questionData: any = {
        prompt: questionForm.prompt,
        imageUrl: questionForm.imageUrl || null,
        options: validOptions,
        correctIndices,
        explanation: questionForm.explanation || null,
        difficulty: questionForm.difficulty,
        pointsPP: questionForm.pointsPP || rewardConfig.basePP,
        pointsXP: questionForm.pointsXP || rewardConfig.baseXP,
        order: questions.length,
      };
      
      // Keep correctIndex for backwards compatibility (only if exactly one correct answer)
      // Firestore doesn't allow undefined values, so we only include it when there's exactly one
      if (correctIndices.length === 1) {
        questionData.correctIndex = correctIndices[0];
      }
      
      // Only include category if it has a value
      if (questionForm.category && questionForm.category.trim()) {
        questionData.category = questionForm.category.trim();
      }
      
      const questionId = await addQuestion(selectedQuizSet.id, questionData);

      // Upload image after question is created (if new image file provided)
      if (questionForm.imageFile) {
        try {
          const imageUrl = await uploadQuestionImage(selectedQuizSet.id, questionId, questionForm.imageFile);
          await updateQuestion(selectedQuizSet.id, questionId, { imageUrl });
        } catch (imageError: any) {
          // If image upload fails (e.g., permissions), log but don't fail the whole operation
          console.warn('Failed to upload question image:', imageError);
          // Question was already created successfully, so we continue
        }
      }

      alert('Question added successfully!');
      setShowQuestionForm(false);
    setQuestionForm({
      prompt: '',
      options: ['', '', '', ''],
      correctIndex: 0,
      correctIndices: [],
      explanation: '',
      difficulty: 'medium',
      category: '',
      imageFile: null,
      imageUrl: null,
      pointsPP: 10,
      pointsXP: 10,
      artifactRewards: [],
    });
      await loadQuestions(selectedQuizSet.id);
    } catch (error) {
      console.error('Error adding question:', error);
      alert('Failed to add question');
    } finally {
      setUploading(false);
    }
  };

  const handleUpdateQuestion = async () => {
    if (!selectedQuizSet || !editingQuestion) return;

    try {
      setUploading(true);

      const compact = compactOptionsAndCorrectIndices(
        questionForm.options,
        questionForm.correctIndices,
        questionForm.correctIndex
      );
      if ('error' in compact) {
        alert(compact.error);
        return;
      }
      const { validOptions, correctIndices } = compact;

      const updateData: any = {
        prompt: questionForm.prompt,
        options: validOptions,
        correctIndices,
        explanation: questionForm.explanation || null,
        difficulty: questionForm.difficulty,
        pointsPP: questionForm.pointsPP || DEFAULT_REWARDS[questionForm.difficulty]?.basePP || 10,
        pointsXP: questionForm.pointsXP || DEFAULT_REWARDS[questionForm.difficulty]?.baseXP || 10,
      };
      
      // Handle correctIndex for backwards compatibility
      // Only set it if there's exactly one correct answer, otherwise delete it if it existed
      if (correctIndices.length === 1) {
        updateData.correctIndex = correctIndices[0];
      } else if (editingQuestion.correctIndex !== undefined) {
        // If question previously had a single correctIndex but now has multiple, delete the old field
        updateData.correctIndex = deleteField();
      }
      
      // Handle image upload separately - only if new file is provided
      if (questionForm.imageFile) {
        try {
          const imageUrl = await uploadQuestionImage(selectedQuizSet.id, editingQuestion.id, questionForm.imageFile);
          updateData.imageUrl = imageUrl;
        } catch (imageError: any) {
          // If image upload fails (e.g., permissions), alert user and keep existing image
          console.error('Failed to upload question image:', imageError);
          const errorMessage = imageError?.code === 'storage/unauthorized' 
            ? 'You do not have permission to upload images. Please contact an administrator or check Firebase Storage rules.'
            : 'Failed to upload image. The question will be saved without the new image.';
          
          // Keep existing imageUrl if upload fails
          if (editingQuestion.imageUrl) {
            updateData.imageUrl = editingQuestion.imageUrl;
            alert(`⚠️ ${errorMessage}\n\nQuestion updated with existing image.`);
          } else {
            updateData.imageUrl = null;
            alert(`⚠️ ${errorMessage}\n\nQuestion updated without image.`);
          }
          // Continue with the update even if image upload fails
        }
      } else {
        // No new image file - keep existing imageUrl from form or question
        // Use questionForm.imageUrl if it was set (when editing), otherwise use existing question imageUrl
        updateData.imageUrl = questionForm.imageUrl || editingQuestion.imageUrl || null;
      }
      
      // Only include category if it has a value
      if (questionForm.category && questionForm.category.trim()) {
        updateData.category = questionForm.category.trim();
      }
      
      await updateQuestion(selectedQuizSet.id, editingQuestion.id, updateData);

      alert('Question updated successfully!');
      setEditingQuestion(null);
      setShowQuestionForm(false);
    setQuestionForm({
      prompt: '',
      options: ['', '', '', ''],
      correctIndex: 0,
      correctIndices: [],
      explanation: '',
      difficulty: 'medium',
      category: '',
      imageFile: null,
      imageUrl: null,
      pointsPP: 10,
      pointsXP: 10,
      artifactRewards: [],
    });
      await loadQuestions(selectedQuizSet.id);
    } catch (error) {
      console.error('Error updating question:', error);
      alert('Failed to update question');
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteQuestion = async (questionId: string) => {
    if (!selectedQuizSet) return;
    if (!window.confirm('Are you sure you want to delete this question?')) {
      return;
    }

    try {
      await deleteQuestion(selectedQuizSet.id, questionId);
      await deleteQuestionImage(selectedQuizSet.id, questionId).catch(() => {}); // Ignore errors
      alert('Question deleted successfully');
      await loadQuestions(selectedQuizSet.id);
      await loadQuizSets(); // Refresh to update question count
    } catch (error) {
      console.error('Error deleting question:', error);
      alert('Failed to delete question');
    }
  };

  const handleDuplicateQuestion = async (question: TrainingQuestion) => {
    if (!selectedQuizSet) return;

    try {
      setUploading(true);
      const rawOpts = [...(question.options || [])].map((o) => String(o ?? ''));
      const prevCorrect = (question as any).correctIndices?.length
        ? ([...(question as any).correctIndices] as number[])
        : (question.correctIndex !== undefined ? [question.correctIndex] : []);
      const dupCompact = compactOptionsAndCorrectIndices(rawOpts, prevCorrect);
      if ('error' in dupCompact) {
        alert(`Cannot duplicate: ${dupCompact.error}`);
        return;
      }
      const { validOptions: options, correctIndices } = dupCompact;

      const duplicateData: Omit<TrainingQuestion, 'id' | 'createdAt' | 'updatedAt'> = {
        prompt: question.prompt,
        options,
        correctIndices,
        explanation: question.explanation ?? null,
        difficulty: question.difficulty || 'medium',
        pointsPP: question.pointsPP ?? 10,
        pointsXP: question.pointsXP ?? 10,
        order: questions.length,
      };
      if (correctIndices.length === 1) (duplicateData as any).correctIndex = correctIndices[0];
      if (question.category?.trim()) (duplicateData as any).category = question.category.trim();
      if (question.artifactRewards?.length) (duplicateData as any).artifactRewards = [...question.artifactRewards];
      if (question.imageUrl) (duplicateData as any).imageUrl = question.imageUrl;

      await addQuestion(selectedQuizSet.id, duplicateData);
      alert('Question duplicated successfully!');
      await loadQuestions(selectedQuizSet.id);
      await loadQuizSets();
    } catch (error) {
      console.error('Error duplicating question:', error);
      alert('Failed to duplicate question');
    } finally {
      setUploading(false);
    }
  };

  const handleMoveQuestion = async (questionId: string, direction: 'up' | 'down') => {
    if (!selectedQuizSet) return;

    const currentIndex = questions.findIndex(q => q.id === questionId);
    if (currentIndex === -1) return;

    const newIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (newIndex < 0 || newIndex >= questions.length) return;

    const reordered = [...questions];
    [reordered[currentIndex], reordered[newIndex]] = [reordered[newIndex], reordered[currentIndex]];
    
    const questionIds = reordered.map(q => q.id);
    await reorderQuestions(selectedQuizSet.id, questionIds);
    await loadQuestions(selectedQuizSet.id);
  };

  const resetImportState = () => {
    setShowImportForm(false);
    setSourceQuizSetId('');
    setSourceQuestions([]);
    setSelectedSourceQuestionIds([]);
  };

  const handleSourceQuizChange = async (quizId: string) => {
    setSourceQuizSetId(quizId);
    setSelectedSourceQuestionIds([]);
    if (!quizId) {
      setSourceQuestions([]);
      return;
    }
    try {
      const imported = await getQuestions(quizId);
      setSourceQuestions(imported);
    } catch (error) {
      console.error('Error loading source quiz questions:', error);
      alert('Failed to load questions from source quiz');
      setSourceQuestions([]);
    }
  };

  const toggleSourceQuestion = (questionId: string, checked: boolean) => {
    setSelectedSourceQuestionIds(prev => {
      if (checked) return [...prev, questionId];
      return prev.filter(id => id !== questionId);
    });
  };

  const handleImportQuestions = async () => {
    if (!selectedQuizSet) return;
    if (!sourceQuizSetId) {
      alert('Please choose a source quiz set.');
      return;
    }
    if (selectedSourceQuestionIds.length === 0) {
      alert('Please select at least one question to import.');
      return;
    }

    try {
      setImporting(true);
      const selectedQuestions = sourceQuestions.filter(q => selectedSourceQuestionIds.includes(q.id));
      const sortedSelected = [...selectedQuestions].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      const baseOrder = questions.length;

      for (let i = 0; i < sortedSelected.length; i++) {
        const question = sortedSelected[i];
        const rawOpts = [...(question.options || [])].map((o) => String(o ?? ''));
        const prevCorrect = (question as any).correctIndices?.length
          ? ([...(question as any).correctIndices] as number[])
          : (question.correctIndex !== undefined ? [question.correctIndex] : []);
        const impCompact = compactOptionsAndCorrectIndices(rawOpts, prevCorrect);
        if ('error' in impCompact) {
          alert(`Skipping a question (${question.prompt?.slice(0, 40) || question.id}…): ${impCompact.error}`);
          continue;
        }
        const { validOptions: options, correctIndices } = impCompact;

        const importData: Omit<TrainingQuestion, 'id' | 'createdAt' | 'updatedAt'> = {
          prompt: question.prompt,
          imageUrl: question.imageUrl ?? null,
          options,
          correctIndices,
          explanation: question.explanation ?? null,
          difficulty: question.difficulty || 'medium',
          pointsPP: question.pointsPP ?? DEFAULT_REWARDS[question.difficulty || 'medium']?.basePP ?? 10,
          pointsXP: question.pointsXP ?? DEFAULT_REWARDS[question.difficulty || 'medium']?.baseXP ?? 10,
          order: baseOrder + i,
        };

        if (correctIndices.length === 1) {
          (importData as any).correctIndex = correctIndices[0];
        }
        if (question.category?.trim()) {
          (importData as any).category = question.category.trim();
        }
        if (question.artifactRewards?.length) {
          (importData as any).artifactRewards = [...question.artifactRewards];
        }

        await addQuestion(selectedQuizSet.id, importData);
      }

      await loadQuestions(selectedQuizSet.id);
      await loadQuizSets();
      alert(`Imported ${sortedSelected.length} question${sortedSelected.length === 1 ? '' : 's'} successfully.`);
      resetImportState();
    } catch (error) {
      console.error('Error importing questions:', error);
      alert('Failed to import selected questions.');
    } finally {
      setImporting(false);
    }
  };

  const startEditQuestion = (question: TrainingQuestion) => {
    setEditingQuestion(question);
    const stored = [...(question.options || [])].map((o) => String(o ?? ''));
    const options = stored.length > 0 ? stored : ['', ''];
    const correctIndices = (question as any).correctIndices || 
      (question.correctIndex !== undefined ? [question.correctIndex] : []);
    
    setQuestionForm({
      prompt: question.prompt,
      options,
      correctIndex: correctIndices.length === 1 ? correctIndices[0] : 0, // For backwards compatibility
      correctIndices: correctIndices,
      explanation: question.explanation || '',
      difficulty: question.difficulty,
      category: question.category || '',
      imageFile: null,
      imageUrl: question.imageUrl || null,
      pointsPP: question.pointsPP || DEFAULT_REWARDS[question.difficulty]?.basePP || 10,
      pointsXP: question.pointsXP || DEFAULT_REWARDS[question.difficulty]?.baseXP || 10,
      artifactRewards: question.artifactRewards || [],
    });
    setShowQuestionForm(true);
  };

  const addOption = () => {
    if (questionForm.options.length < MAX_TRAINING_ANSWER_CHOICES) {
      setQuestionForm({ ...questionForm, options: [...questionForm.options, ''] });
    }
  };

  const removeOption = (index: number) => {
    if (questionForm.options.length <= MIN_TRAINING_ANSWER_CHOICES) return;
    const newOptions = questionForm.options.filter((_, i) => i !== index);
    const newCorrectIndices = questionForm.correctIndices
      .filter((i) => i !== index)
      .map((i) => (i > index ? i - 1 : i));
    let newCorrectIndex = questionForm.correctIndex;
    if (newCorrectIndex === index) {
      newCorrectIndex = newCorrectIndices.length === 1 ? newCorrectIndices[0] : 0;
    } else if (newCorrectIndex > index) {
      newCorrectIndex -= 1;
    }
    if (newCorrectIndex >= newOptions.length) {
      newCorrectIndex = Math.max(0, newOptions.length - 1);
    }
    setQuestionForm({
      ...questionForm,
      options: newOptions,
      correctIndices: newCorrectIndices,
      correctIndex: newCorrectIndex,
    });
  };

  if (loading) {
    return <div style={{ padding: '2rem', textAlign: 'center' }}>Loading...</div>;
  }

  return (
    <div style={{ padding: '2rem' }}>
      <div style={{ marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>Training Grounds (CFUs) Management</h2>
        <button
          onClick={() => setShowCreateForm(true)}
          style={{
            padding: '0.5rem 1rem',
            background: '#4f46e5',
            color: 'white',
            border: 'none',
            borderRadius: '0.5rem',
            cursor: 'pointer',
            fontWeight: '600',
          }}
        >
          + Create Quiz Set
        </button>
      </div>

      {/* Create Quiz Set Modal */}
      {showCreateForm && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
        }}>
          <div style={{
            background: 'white',
            borderRadius: '1rem',
            padding: '2rem',
            maxWidth: '600px',
            width: '90%',
            maxHeight: '90vh',
            overflowY: 'auto',
          }}>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '1rem' }}>Create Quiz Set</h3>
            
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600' }}>Title *</label>
              <input
                type="text"
                value={quizSetForm.title}
                onChange={(e) => setQuizSetForm({ ...quizSetForm, title: e.target.value })}
                style={{ width: '100%', padding: '0.5rem', border: '1px solid #ccc', borderRadius: '0.5rem' }}
                placeholder="Quiz set title"
              />
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600' }}>Description</label>
              <textarea
                value={quizSetForm.description}
                onChange={(e) => setQuizSetForm({ ...quizSetForm, description: e.target.value })}
                style={{ width: '100%', padding: '0.5rem', border: '1px solid #ccc', borderRadius: '0.5rem', minHeight: '100px' }}
                placeholder="Quiz set description"
              />
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600' }}>Assign to Classes</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {classrooms.map(classroom => (
                  <label key={classroom.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <input
                      type="checkbox"
                      checked={quizSetForm.classIds.includes(classroom.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setQuizSetForm({ ...quizSetForm, classIds: [...quizSetForm.classIds, classroom.id] });
                        } else {
                          setQuizSetForm({ ...quizSetForm, classIds: quizSetForm.classIds.filter(id => id !== classroom.id) });
                        }
                      }}
                    />
                    {classroom.name}
                  </label>
                ))}
              </div>
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <input
                  type="checkbox"
                  checked={quizSetForm.isPublished}
                  onChange={(e) => setQuizSetForm({ ...quizSetForm, isPublished: e.target.checked })}
                />
                Published (only students in the selected classes will see this CFU)
              </label>
            </div>

            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
              <button
                onClick={() => {
                  setShowCreateForm(false);
                  setQuizSetForm({ title: '', description: '', classIds: [], tags: [], isPublished: false });
                }}
                style={{
                  padding: '0.5rem 1rem',
                  background: '#6b7280',
                  color: 'white',
                  border: 'none',
                  borderRadius: '0.5rem',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleCreateQuizSet}
                style={{
                  padding: '0.5rem 1rem',
                  background: '#4f46e5',
                  color: 'white',
                  border: 'none',
                  borderRadius: '0.5rem',
                  cursor: 'pointer',
                }}
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Quiz Sets List */}
      <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: '2rem' }}>
        <div>
          <h3 style={{ fontSize: '1.125rem', fontWeight: 'bold', marginBottom: '1rem' }}>Quiz Sets</h3>
          <p style={{ fontSize: '0.75rem', color: '#6b7280', margin: '-0.5rem 0 0.75rem' }}>
            Sorted by assigned class. Students only see published sets for classes they are enrolled in.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {(() => {
              let lastSection = '';
              const nodes: React.ReactNode[] = [];
              sortedQuizSetsForAdmin.forEach((quizSet) => {
                const section = sectionHeaderKeyForQuiz(quizSet);
                if (section !== lastSection) {
                  lastSection = section;
                  const label =
                    assignedClassIdsForQuiz(quizSet).length === 0
                      ? 'Unassigned (not visible to students)'
                      : section;
                  nodes.push(
                    <div
                      key={`section-${section}`}
                      style={{
                        fontSize: '0.68rem',
                        fontWeight: 700,
                        letterSpacing: '0.05em',
                        textTransform: 'uppercase',
                        color: '#6b7280',
                        marginTop: nodes.length ? '0.65rem' : 0,
                        marginBottom: '0.2rem',
                      }}
                    >
                      {label}
                    </div>
                  );
                }
                nodes.push(
                  <div
                    key={quizSet.id}
                    onClick={() => setSelectedQuizSet(quizSet)}
                    style={{
                      padding: '1rem',
                      background: selectedQuizSet?.id === quizSet.id ? '#eef2ff' : 'white',
                      border: `2px solid ${selectedQuizSet?.id === quizSet.id ? '#4f46e5' : '#e5e7eb'}`,
                      borderRadius: '0.5rem',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ fontWeight: '600', marginBottom: '0.25rem' }}>{quizSet.title}</div>
                    <div style={{ fontSize: '0.72rem', color: '#4f46e6', marginBottom: '0.25rem' }}>
                      {classLabelsForQuiz(quizSet)}
                    </div>
                    <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                      {quizSet.questionCount} questions
                      {quizSet.isPublished ? ' • Published' : ' • Draft'}
                    </div>
                  </div>
                );
              });
              return nodes;
            })()}
          </div>
        </div>

        {/* Questions Editor */}
        {selectedQuizSet ? (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <div>
                <h3 style={{ fontSize: '1.125rem', fontWeight: 'bold' }}>{selectedQuizSet.title}</h3>
                <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                  {selectedQuizSet.questionCount} questions
                </div>
                <div
                  style={{
                    marginTop: '0.75rem',
                    padding: '0.75rem',
                    background: '#f9fafb',
                    borderRadius: '0.5rem',
                    border: '1px solid #e5e7eb',
                  }}
                >
                  <div style={{ fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.35rem', color: '#374151' }}>
                    Classes (who can see this CFU when published)
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', marginBottom: '0.5rem' }}>
                    {classrooms.map((classroom) => (
                      <label key={classroom.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem' }}>
                        <input
                          type="checkbox"
                          checked={editClassIds.includes(classroom.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setEditClassIds([...editClassIds, classroom.id]);
                            } else {
                              setEditClassIds(editClassIds.filter((id) => id !== classroom.id));
                            }
                          }}
                        />
                        {classroom.name}
                      </label>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleSaveQuizSetClasses()}
                    disabled={savingClassIds}
                    style={{
                      padding: '0.35rem 0.75rem',
                      background: '#4f46e5',
                      color: 'white',
                      border: 'none',
                      borderRadius: '0.35rem',
                      cursor: savingClassIds ? 'not-allowed' : 'pointer',
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      opacity: savingClassIds ? 0.7 : 1,
                    }}
                  >
                    {savingClassIds ? 'Saving…' : 'Save class assignment'}
                  </button>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  onClick={() => loadCompletionStats(selectedQuizSet.id)}
                  style={{
                    padding: '0.5rem 1rem',
                    background: '#3b82f6',
                    color: 'white',
                    border: 'none',
                    borderRadius: '0.5rem',
                    cursor: 'pointer',
                    fontSize: '0.875rem',
                  }}
                >
                  📊 View Completion Stats
                </button>
                <button
                  onClick={() => handleTogglePublish(selectedQuizSet)}
                  style={{
                    padding: '0.5rem 1rem',
                    background: selectedQuizSet.isPublished ? '#ef4444' : '#10b981',
                    color: 'white',
                    border: 'none',
                    borderRadius: '0.5rem',
                    cursor: 'pointer',
                    fontSize: '0.875rem',
                  }}
                >
                  {selectedQuizSet.isPublished ? 'Unpublish' : 'Publish'}
                </button>
                <button
                  onClick={() => handleDeleteQuizSet(selectedQuizSet.id)}
                  style={{
                    padding: '0.5rem 1rem',
                    background: '#ef4444',
                    color: 'white',
                    border: 'none',
                    borderRadius: '0.5rem',
                    cursor: 'pointer',
                    fontSize: '0.875rem',
                  }}
                >
                  Delete
                </button>
                <button
                  onClick={() => {
                    setEditingQuestion(null);
    setQuestionForm({
      prompt: '',
      options: ['', '', '', ''],
      correctIndex: 0,
      correctIndices: [],
      explanation: '',
      difficulty: 'medium',
      category: '',
      imageFile: null,
      imageUrl: null,
      pointsPP: 10,
      pointsXP: 10,
      artifactRewards: [],
    });
                    setShowQuestionForm(true);
                  }}
                  style={{
                    padding: '0.5rem 1rem',
                    background: '#4f46e5',
                    color: 'white',
                    border: 'none',
                    borderRadius: '0.5rem',
                    cursor: 'pointer',
                    fontSize: '0.875rem',
                  }}
                >
                  + Add Question
                </button>
                <button
                  onClick={() => {
                    setSourceQuizSetId('');
                    setSourceQuestions([]);
                    setSelectedSourceQuestionIds([]);
                    setShowImportForm(true);
                  }}
                  style={{
                    padding: '0.5rem 1rem',
                    background: '#0ea5e9',
                    color: 'white',
                    border: 'none',
                    borderRadius: '0.5rem',
                    cursor: 'pointer',
                    fontSize: '0.875rem',
                  }}
                >
                  ⤓ Import Questions
                </button>
              </div>
            </div>

            {/* Completion Stats */}
            {showCompletionStats && (
              <div style={{
                marginTop: '1.5rem',
                marginBottom: '1.5rem',
                padding: '1.5rem',
                background: '#f9fafb',
                borderRadius: '0.75rem',
                border: '1px solid #e5e7eb',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                  <h4 style={{ fontSize: '1.125rem', fontWeight: 'bold', color: '#111827' }}>
                    Completion Statistics
                  </h4>
                  <button
                    onClick={() => setShowCompletionStats(false)}
                    style={{
                      padding: '0.25rem 0.5rem',
                      background: '#6b7280',
                      color: 'white',
                      border: 'none',
                      borderRadius: '0.25rem',
                      cursor: 'pointer',
                      fontSize: '0.75rem',
                    }}
                  >
                    Close
                  </button>
                </div>
                
                {loadingStats ? (
                  <div style={{ textAlign: 'center', padding: '2rem', color: '#6b7280' }}>
                    Loading statistics...
                  </div>
                ) : completionStats.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '2rem', color: '#6b7280' }}>
                    No completions yet
                  </div>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
                          <th style={{ padding: '0.75rem', textAlign: 'left', fontWeight: '600', color: '#374151' }}>
                            Player
                          </th>
                          <th style={{ padding: '0.75rem', textAlign: 'center', fontWeight: '600', color: '#374151' }}>
                            Attempts
                          </th>
                          <th style={{ padding: '0.75rem', textAlign: 'center', fontWeight: '600', color: '#374151' }}>
                            Best Score
                          </th>
                          <th style={{ padding: '0.75rem', textAlign: 'center', fontWeight: '600', color: '#374151' }}>
                            Latest Score
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {completionStats.map((stat) => (
                          <tr key={stat.userId} style={{ borderBottom: '1px solid #e5e7eb' }}>
                            <td style={{ padding: '0.75rem', color: '#111827' }}>
                              {stat.displayName}
                            </td>
                            <td style={{ padding: '0.75rem', textAlign: 'center', color: '#374151' }}>
                              {stat.attemptCount}
                            </td>
                            <td style={{ 
                              padding: '0.75rem', 
                              textAlign: 'center',
                              color: stat.bestScore >= 70 ? '#10b981' : stat.bestScore >= 50 ? '#f59e0b' : '#ef4444',
                              fontWeight: '600'
                            }}>
                              {stat.bestScore}%
                            </td>
                            <td style={{ 
                              padding: '0.75rem', 
                              textAlign: 'center',
                              color: stat.latestScore >= 70 ? '#10b981' : stat.latestScore >= 50 ? '#f59e0b' : '#ef4444',
                              fontWeight: '600'
                            }}>
                              {stat.latestScore}%
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* Questions List */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {questions.map((question, index) => (
                <div
                  key={question.id}
                  style={{
                    padding: '1rem',
                    background: 'white',
                    border: '1px solid #e5e7eb',
                    borderRadius: '0.5rem',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: '600', marginBottom: '0.5rem' }}>
                        Q{index + 1}: {question.prompt}
                      </div>
                      <div style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.5rem' }}>
                        Difficulty: {question.difficulty} • Correct: {
                          (() => {
                            const correctIndices = (question as any).correctIndices || 
                              (question.correctIndex !== undefined ? [question.correctIndex] : []);
                            return correctIndices.map((idx: number) => `${String.fromCharCode(65 + idx)}: ${question.options[idx]}`).join(', ');
                          })()
                        }
                      </div>
                      {question.imageUrl && (
                        <div style={{ marginBottom: '0.5rem', position: 'relative' }}>
                          <img
                            src={question.imageUrl}
                            alt="Question"
                            onError={(e) => {
                              console.error('Failed to load question image:', question.imageUrl);
                              e.currentTarget.style.display = 'none';
                              const errorDiv = e.currentTarget.nextElementSibling as HTMLElement;
                              if (errorDiv) errorDiv.style.display = 'block';
                            }}
                            onLoad={(e) => {
                              e.currentTarget.style.display = 'block';
                              const errorDiv = e.currentTarget.nextElementSibling as HTMLElement;
                              if (errorDiv) errorDiv.style.display = 'none';
                            }}
                            style={{ 
                              maxWidth: '200px', 
                              maxHeight: '150px', 
                              borderRadius: '0.5rem',
                              display: 'block'
                            }}
                          />
                          <div style={{
                            display: 'none',
                            padding: '0.5rem',
                            background: '#fee2e2',
                            border: '1px solid #fca5a5',
                            borderRadius: '0.5rem',
                            color: '#991b1b',
                            fontSize: '0.75rem'
                          }}>
                            Image failed to load
                          </div>
                        </div>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: '0.25rem', flexDirection: 'column' }}>
                      <button
                        onClick={() => handleMoveQuestion(question.id, 'up')}
                        disabled={index === 0}
                        style={{
                          padding: '0.25rem 0.5rem',
                          background: index === 0 ? '#e5e7eb' : '#6b7280',
                          color: 'white',
                          border: 'none',
                          borderRadius: '0.25rem',
                          cursor: index === 0 ? 'not-allowed' : 'pointer',
                          fontSize: '0.75rem',
                        }}
                      >
                        ↑
                      </button>
                      <button
                        onClick={() => handleMoveQuestion(question.id, 'down')}
                        disabled={index === questions.length - 1}
                        style={{
                          padding: '0.25rem 0.5rem',
                          background: index === questions.length - 1 ? '#e5e7eb' : '#6b7280',
                          color: 'white',
                          border: 'none',
                          borderRadius: '0.25rem',
                          cursor: index === questions.length - 1 ? 'not-allowed' : 'pointer',
                          fontSize: '0.75rem',
                        }}
                      >
                        ↓
                      </button>
                      <button
                        onClick={() => startEditQuestion(question)}
                        style={{
                          padding: '0.25rem 0.5rem',
                          background: '#4f46e5',
                          color: 'white',
                          border: 'none',
                          borderRadius: '0.25rem',
                          cursor: 'pointer',
                          fontSize: '0.75rem',
                        }}
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDuplicateQuestion(question)}
                        disabled={uploading}
                        style={{
                          padding: '0.25rem 0.5rem',
                          background: '#059669',
                          color: 'white',
                          border: 'none',
                          borderRadius: '0.25rem',
                          cursor: uploading ? 'not-allowed' : 'pointer',
                          fontSize: '0.75rem',
                        }}
                      >
                        Duplicate
                      </button>
                      <button
                        onClick={() => handleDeleteQuestion(question.id)}
                        style={{
                          padding: '0.25rem 0.5rem',
                          background: '#ef4444',
                          color: 'white',
                          border: 'none',
                          borderRadius: '0.25rem',
                          cursor: 'pointer',
                          fontSize: '0.75rem',
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}>
            Select a quiz set to manage questions
          </div>
        )}
      </div>

      {/* Question Form Modal */}
      {showQuestionForm && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
        }}>
          <div style={{
            background: 'white',
            borderRadius: '1rem',
            padding: '2rem',
            maxWidth: '700px',
            width: '90%',
            maxHeight: '90vh',
            overflowY: 'auto',
          }}>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '1rem' }}>
              {editingQuestion ? 'Edit Question' : 'Add Question'}
            </h3>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600' }}>Question Prompt *</label>
              <textarea
                value={questionForm.prompt}
                onChange={(e) => setQuestionForm({ ...questionForm, prompt: e.target.value })}
                style={{ width: '100%', padding: '0.5rem', border: '1px solid #ccc', borderRadius: '0.5rem', minHeight: '80px' }}
                placeholder="Enter the question"
              />
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600' }}>
                Answer options * (at least {MIN_TRAINING_ANSWER_CHOICES} filled; up to {MAX_TRAINING_ANSWER_CHOICES})
              </label>
              {questionForm.options.map((option, index) => (
                <div key={index} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem', alignItems: 'center' }}>
                  <span style={{ 
                    minWidth: '24px', 
                    textAlign: 'center', 
                    fontWeight: '600',
                    color: '#6b7280'
                  }}>
                    {String.fromCharCode(65 + index)}:
                  </span>
                  <input
                    type="text"
                    value={option}
                    onChange={(e) => {
                      const newOptions = [...questionForm.options];
                      newOptions[index] = e.target.value;
                      setQuestionForm({ ...questionForm, options: newOptions });
                    }}
                    style={{ 
                      flex: 1, 
                      padding: '0.75rem', 
                      border: '1px solid #d1d5db', 
                      borderRadius: '0.5rem',
                      fontSize: '1rem'
                    }}
                    placeholder={`Option ${String.fromCharCode(65 + index)}`}
                  />
                  {questionForm.options.length > MIN_TRAINING_ANSWER_CHOICES && (
                    <button
                      type="button"
                      onClick={() => removeOption(index)}
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
                      Remove
                    </button>
                  )}
                </div>
              ))}
              {questionForm.options.length < MAX_TRAINING_ANSWER_CHOICES && (
                <button
                  type="button"
                  onClick={addOption}
                  style={{
                    padding: '0.5rem 1rem',
                    background: '#10b981',
                    color: 'white',
                    border: 'none',
                    borderRadius: '0.5rem',
                    cursor: 'pointer',
                    fontSize: '0.875rem',
                    marginTop: '0.5rem'
                  }}
                >
                  + Add Option
                </button>
              )}
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600' }}>
                Correct Answer(s) * (select all that apply)
              </label>
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '0.5rem',
                padding: '0.75rem',
                border: '1px solid #d1d5db',
                borderRadius: '0.5rem',
                background: '#f9fafb'
              }}>
                {questionForm.options.map((option, index) => {
                  if (!option.trim()) return null;
                  const isChecked = questionForm.correctIndices.includes(index);
                  
                  return (
                    <label
                      key={index}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.75rem',
                        cursor: 'pointer',
                        padding: '0.5rem',
                        borderRadius: '0.375rem',
                        background: isChecked ? '#eef2ff' : 'transparent',
                        border: `1px solid ${isChecked ? '#4f46e5' : 'transparent'}`,
                        transition: 'all 0.2s'
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={(e) => {
                          const newIndices = e.target.checked
                            ? [...questionForm.correctIndices, index]
                            : questionForm.correctIndices.filter(i => i !== index);
                          setQuestionForm({ 
                            ...questionForm, 
                            correctIndices: newIndices,
                            // Update correctIndex for backwards compatibility (use first if only one)
                            correctIndex: newIndices.length === 1 ? newIndices[0] : 0
                          });
                        }}
                        style={{
                          width: '18px',
                          height: '18px',
                          cursor: 'pointer'
                        }}
                      />
                      <span style={{ flex: 1 }}>
                        <strong>{String.fromCharCode(65 + index)}:</strong> {option}
                      </span>
                    </label>
                  );
                })}
              </div>
              {questionForm.correctIndices.length === 0 && (
                <p style={{ fontSize: '0.875rem', color: '#ef4444', marginTop: '0.5rem' }}>
                  Please select at least one correct answer
                </p>
              )}
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600' }}>Difficulty</label>
              <select
                value={questionForm.difficulty}
                onChange={(e) => setQuestionForm({ ...questionForm, difficulty: e.target.value as any })}
                style={{ width: '100%', padding: '0.5rem', border: '1px solid #ccc', borderRadius: '0.5rem' }}
              >
                <option value="easy">Easy (5 PP, 5 XP)</option>
                <option value="medium">Medium (10 PP, 10 XP)</option>
                <option value="hard">Hard (15 PP, 15 XP)</option>
              </select>
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600' }}>Explanation (optional)</label>
              <textarea
                value={questionForm.explanation}
                onChange={(e) => setQuestionForm({ ...questionForm, explanation: e.target.value })}
                style={{ width: '100%', padding: '0.5rem', border: '1px solid #ccc', borderRadius: '0.5rem', minHeight: '80px' }}
                placeholder="Explanation shown after answer"
              />
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600' }}>Image (optional)</label>
              {questionForm.imageUrl && !questionForm.imageFile && (
                <div style={{ marginBottom: '0.5rem', position: 'relative' }}>
                  <div style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.25rem' }}>
                    Current image:
                  </div>
                  <img 
                    src={questionForm.imageUrl} 
                    alt="Current question image"
                    onError={(e) => {
                      console.error('Failed to load current image:', questionForm.imageUrl);
                      e.currentTarget.style.display = 'none';
                      const errorDiv = e.currentTarget.nextElementSibling as HTMLElement;
                      if (errorDiv) errorDiv.style.display = 'block';
                    }}
                    onLoad={(e) => {
                      e.currentTarget.style.display = 'block';
                      const errorDiv = e.currentTarget.nextElementSibling as HTMLElement;
                      if (errorDiv) errorDiv.style.display = 'none';
                    }}
                    style={{ 
                      maxWidth: '200px', 
                      maxHeight: '150px', 
                      borderRadius: '0.5rem',
                      display: 'block',
                      border: '1px solid #e5e7eb'
                    }} 
                  />
                  <div style={{
                    display: 'none',
                    padding: '0.5rem',
                    background: '#fee2e2',
                    border: '1px solid #fca5a5',
                    borderRadius: '0.5rem',
                    color: '#991b1b',
                    fontSize: '0.75rem',
                    maxWidth: '200px'
                  }}>
                    Image failed to load (may need permissions)
                  </div>
                </div>
              )}
              {questionForm.imageFile && (
                <div style={{ marginBottom: '0.5rem' }}>
                  <div style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.25rem' }}>
                    New image selected: {questionForm.imageFile.name}
                  </div>
                  <img 
                    src={URL.createObjectURL(questionForm.imageFile)} 
                    alt="New image preview"
                    style={{ 
                      maxWidth: '200px', 
                      maxHeight: '150px', 
                      borderRadius: '0.5rem',
                      border: '1px solid #10b981'
                    }} 
                  />
                </div>
              )}
              <input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    setQuestionForm({ ...questionForm, imageFile: file, imageUrl: null });
                  }
                }}
                style={{ width: '100%', padding: '0.5rem', border: '1px solid #ccc', borderRadius: '0.5rem' }}
              />
            </div>

            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
              <button
                onClick={() => {
                  setShowQuestionForm(false);
                  setEditingQuestion(null);
    setQuestionForm({
      prompt: '',
      options: ['', '', '', ''],
      correctIndex: 0,
      correctIndices: [],
      explanation: '',
      difficulty: 'medium',
      category: '',
      imageFile: null,
      imageUrl: null,
      pointsPP: 10,
      pointsXP: 10,
      artifactRewards: [],
    });
                }}
                style={{
                  padding: '0.5rem 1rem',
                  background: '#6b7280',
                  color: 'white',
                  border: 'none',
                  borderRadius: '0.5rem',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={editingQuestion ? handleUpdateQuestion : handleAddQuestion}
                disabled={uploading}
                style={{
                  padding: '0.5rem 1rem',
                  background: uploading ? '#9ca3af' : '#4f46e5',
                  color: 'white',
                  border: 'none',
                  borderRadius: '0.5rem',
                  cursor: uploading ? 'not-allowed' : 'pointer',
                }}
              >
                {uploading ? 'Saving...' : editingQuestion ? 'Update' : 'Add'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Import Questions Modal */}
      {showImportForm && selectedQuizSet && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
        }}>
          <div style={{
            background: 'white',
            borderRadius: '1rem',
            padding: '1.5rem',
            maxWidth: '900px',
            width: '92%',
            maxHeight: '90vh',
            overflowY: 'auto',
          }}>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>
              Import Questions into "{selectedQuizSet.title}"
            </h3>
            <p style={{ marginTop: 0, color: '#6b7280', marginBottom: '1rem' }}>
              Select another quiz set, then choose which questions to copy.
            </p>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>Source Quiz Set</label>
              <select
                value={sourceQuizSetId}
                onChange={(e) => handleSourceQuizChange(e.target.value)}
                style={{ width: '100%', padding: '0.6rem', border: '1px solid #d1d5db', borderRadius: '0.5rem' }}
              >
                <option value="">Select source quiz...</option>
                {quizSets
                  .filter(q => q.id !== selectedQuizSet.id)
                  .map(q => (
                    <option key={q.id} value={q.id}>
                      {q.title} ({q.questionCount} questions)
                    </option>
                  ))}
              </select>
            </div>

            {sourceQuizSetId && (
              <div style={{ border: '1px solid #e5e7eb', borderRadius: '0.5rem', padding: '0.75rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                  <strong>Questions ({sourceQuestions.length})</strong>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button
                      onClick={() => setSelectedSourceQuestionIds(sourceQuestions.map(q => q.id))}
                      style={{ padding: '0.25rem 0.5rem', borderRadius: '0.375rem', border: '1px solid #cbd5e1', background: 'white', cursor: 'pointer' }}
                    >
                      Select All
                    </button>
                    <button
                      onClick={() => setSelectedSourceQuestionIds([])}
                      style={{ padding: '0.25rem 0.5rem', borderRadius: '0.375rem', border: '1px solid #cbd5e1', background: 'white', cursor: 'pointer' }}
                    >
                      Clear
                    </button>
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '360px', overflowY: 'auto' }}>
                  {sourceQuestions.map((q, idx) => (
                    <label
                      key={q.id}
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '0.6rem',
                        border: '1px solid #e5e7eb',
                        borderRadius: '0.5rem',
                        padding: '0.6rem',
                        background: selectedSourceQuestionIds.includes(q.id) ? '#eff6ff' : 'white',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={selectedSourceQuestionIds.includes(q.id)}
                        onChange={(e) => toggleSourceQuestion(q.id, e.target.checked)}
                      />
                      <div>
                        <div style={{ fontWeight: 600 }}>Q{idx + 1}: {q.prompt}</div>
                        <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>Difficulty: {q.difficulty}</div>
                      </div>
                    </label>
                  ))}
                  {sourceQuestions.length === 0 && (
                    <div style={{ color: '#6b7280', textAlign: 'center', padding: '1rem' }}>
                      No questions found in this quiz.
                    </div>
                  )}
                </div>
              </div>
            )}

            <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ color: '#6b7280', fontSize: '0.875rem' }}>
                Selected: {selectedSourceQuestionIds.length}
              </div>
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button
                  onClick={resetImportState}
                  disabled={importing}
                  style={{
                    padding: '0.5rem 1rem',
                    background: '#6b7280',
                    color: 'white',
                    border: 'none',
                    borderRadius: '0.5rem',
                    cursor: importing ? 'not-allowed' : 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleImportQuestions}
                  disabled={importing || selectedSourceQuestionIds.length === 0}
                  style={{
                    padding: '0.5rem 1rem',
                    background: importing || selectedSourceQuestionIds.length === 0 ? '#9ca3af' : '#0ea5e9',
                    color: 'white',
                    border: 'none',
                    borderRadius: '0.5rem',
                    cursor: importing || selectedSourceQuestionIds.length === 0 ? 'not-allowed' : 'pointer',
                    fontWeight: 600,
                  }}
                >
                  {importing ? 'Importing...' : `Import ${selectedSourceQuestionIds.length} Question${selectedSourceQuestionIds.length === 1 ? '' : 's'}`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TrainingGroundsAdmin;

