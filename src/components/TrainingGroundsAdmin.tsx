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
  getTrainingGroundsClassDisplayOrder,
  saveTrainingGroundsClassDisplayOrder,
  saveQuizSetSortOrders,
  isTrainingQuizArchived,
  setQuizSetsArchived,
} from '../utils/trainingGroundsService';
import { TrainingQuizSet, TrainingQuestion, DEFAULT_REWARDS } from '../types/trainingGrounds';
import { getAvailableArtifacts } from '../utils/artifactCompensation';
import { exportTrainingGroundCFUsToCSV } from '../utils/exportTrainingGroundCFUsToCSV';
import SkillPicker from './skills/SkillPicker';
import SkillChip from './skills/SkillChip';
import { listAcademicSkills } from '../utils/academicSkillService';
import { AcademicSkill } from '../types/academicSkills';

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
  const [savingPlayerCompletions, setSavingPlayerCompletions] = useState(false);
  const [exportingCsv, setExportingCsv] = useState(false);
  const [csvTopicFilter, setCsvTopicFilter] = useState('');
  const [classDisplayOrder, setClassDisplayOrder] = useState<string[]>([]);
  const [savingClassOrder, setSavingClassOrder] = useState(false);
  const [savingQuizOrder, setSavingQuizOrder] = useState(false);
  const [showArchivedQuizSets, setShowArchivedQuizSets] = useState(false);
  const [savingArchive, setSavingArchive] = useState(false);
  const [bulkSelectedQuizIds, setBulkSelectedQuizIds] = useState<string[]>([]);

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
    skillIds: [] as string[],
  });
  const [editSkillIds, setEditSkillIds] = useState<string[]>([]);
  const [savingSkillIds, setSavingSkillIds] = useState(false);
  const [skillCatalog, setSkillCatalog] = useState<AcademicSkill[]>([]);

  useEffect(() => {
    loadQuizSets();
    loadClassrooms();
    loadArtifacts();
    loadClassDisplayOrder();
    listAcademicSkills({ activeOnly: true })
      .then(setSkillCatalog)
      .catch((e) => console.warn('Could not load skill catalog', e));
  }, []);

  const loadClassDisplayOrder = async () => {
    try {
      const order = await getTrainingGroundsClassDisplayOrder();
      setClassDisplayOrder(order);
    } catch (e) {
      console.warn('Could not load class display order', e);
    }
  };

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
      setEditSkillIds(Array.isArray(selectedQuizSet.skillIds) ? [...selectedQuizSet.skillIds] : []);
    } else {
      setEditClassIds([]);
      setEditSkillIds([]);
    }
  }, [selectedQuizSet?.id, (selectedQuizSet?.classIds || []).join(','), (selectedQuizSet?.skillIds || []).join(',')]);

  const sortedQuizSetsForAdmin = useMemo(
    () =>
      sortQuizSetsForAdminByClass(
        quizSets.filter((q) => (showArchivedQuizSets ? isTrainingQuizArchived(q) : !isTrainingQuizArchived(q))),
        classrooms,
        classDisplayOrder
      ),
    [quizSets, classrooms, classDisplayOrder, showArchivedQuizSets]
  );

  const archivedQuizSetCount = useMemo(
    () => quizSets.filter((q) => isTrainingQuizArchived(q)).length,
    [quizSets]
  );

  /** All classrooms in display order (custom order first, then A–Z). */
  const orderedClassroomsForPanel = useMemo(() => {
    const byId = new Map(classrooms.map((c) => [c.id, c]));
    const seen = new Set<string>();
    const ordered: Array<{ id: string; name: string }> = [];
    for (const id of classDisplayOrder) {
      const c = byId.get(id);
      if (c && !seen.has(id)) {
        ordered.push(c);
        seen.add(id);
      }
    }
    [...classrooms]
      .sort((a, b) => a.name.localeCompare(b.name))
      .forEach((c) => {
        if (!seen.has(c.id)) {
          ordered.push(c);
          seen.add(c.id);
        }
      });
    return ordered;
  }, [classrooms, classDisplayOrder]);

  const classRank = (id: string) => {
    const idx = orderedClassroomsForPanel.findIndex((c) => c.id === id);
    return idx >= 0 ? idx : 99_000;
  };

  const classLabelsForQuiz = (quiz: TrainingQuizSet): string => {
    const ids = assignedClassIdsForQuiz(quiz);
    if (ids.length === 0) return 'Unassigned';
    return [...ids]
      .sort((a, b) => {
        const d = classRank(a) - classRank(b);
        if (d !== 0) return d;
        const na = classrooms.find((c) => c.id === a)?.name?.trim() || a;
        const nb = classrooms.find((c) => c.id === b)?.name?.trim() || b;
        return na.localeCompare(nb);
      })
      .map((id) => classrooms.find((c) => c.id === id)?.name?.trim() || id)
      .join(' · ');
  };

  const sectionHeaderKeyForQuiz = (quiz: TrainingQuizSet): string => {
    const ids = assignedClassIdsForQuiz(quiz);
    if (ids.length === 0) return '__unassigned';
    return [...ids]
      .sort((a, b) => {
        const d = classRank(a) - classRank(b);
        if (d !== 0) return d;
        const na = classrooms.find((c) => c.id === a)?.name?.trim() || a;
        const nb = classrooms.find((c) => c.id === b)?.name?.trim() || b;
        return na.localeCompare(nb);
      })
      .map((id) => classrooms.find((c) => c.id === id)?.name?.trim() || id)
      .join(' | ');
  };

  const persistClassOrder = async (nextIds: string[]) => {
    setClassDisplayOrder(nextIds);
    setSavingClassOrder(true);
    try {
      await saveTrainingGroundsClassDisplayOrder(nextIds);
    } catch (e) {
      console.error('Failed to save class order', e);
      alert('Failed to save class order');
      await loadClassDisplayOrder();
    } finally {
      setSavingClassOrder(false);
    }
  };

  const moveClassInOrder = (classId: string, direction: -1 | 1) => {
    const list = orderedClassroomsForPanel.map((c) => c.id);
    const i = list.indexOf(classId);
    const j = i + direction;
    if (i < 0 || j < 0 || j >= list.length) return;
    const next = [...list];
    [next[i], next[j]] = [next[j], next[i]];
    void persistClassOrder(next);
  };

  const moveQuizInSection = async (quizId: string, direction: -1 | 1) => {
    const quiz = sortedQuizSetsForAdmin.find((q) => q.id === quizId);
    if (!quiz) return;
    const section = sectionHeaderKeyForQuiz(quiz);
    const sectionQuizzes = sortedQuizSetsForAdmin.filter(
      (q) => sectionHeaderKeyForQuiz(q) === section
    );
    const i = sectionQuizzes.findIndex((q) => q.id === quizId);
    const j = i + direction;
    if (i < 0 || j < 0 || j >= sectionQuizzes.length) return;
    const reordered = [...sectionQuizzes];
    [reordered[i], reordered[j]] = [reordered[j], reordered[i]];
    const orderedIds = reordered.map((q) => q.id);
    setSavingQuizOrder(true);
    try {
      await saveQuizSetSortOrders(orderedIds);
      setQuizSets((prev) =>
        prev.map((q) => {
          const idx = orderedIds.indexOf(q.id);
          return idx >= 0 ? { ...q, sortOrder: idx } : q;
        })
      );
    } catch (e) {
      console.error('Failed to save assignment order', e);
      alert('Failed to save assignment order');
      await loadQuizSets();
    } finally {
      setSavingQuizOrder(false);
    }
  };

  const loadQuizSets = async (opts?: { quiet?: boolean }) => {
    try {
      if (!opts?.quiet) setLoading(true);
      const all = await getAllQuizSets(true, { includeArchived: true });
      setQuizSets(all);
    } catch (error) {
      console.error('Error loading quiz sets:', error);
      alert('Failed to load quiz sets');
    } finally {
      if (!opts?.quiet) setLoading(false);
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

  const csvDateStamp = () => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  const sanitizeFilePart = (value: string) =>
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 50) || 'all';

  const matchesTopicFilter = (question: TrainingQuestion, quizSet: TrainingQuizSet, filter: string) => {
    const f = filter.trim().toLowerCase();
    if (!f) return true;
    const questionTopic = (question.category || '').toLowerCase();
    const setTitle = (quizSet.title || '').toLowerCase();
    const setTags = (quizSet.tags || []).join(' ').toLowerCase();
    return questionTopic.includes(f) || setTitle.includes(f) || setTags.includes(f);
  };

  const buildExportFileName = (base: string, topicFilter: string) => {
    const topicPart = topicFilter.trim() ? `-${sanitizeFilePart(topicFilter)}` : '';
    return `training-ground-cfus-${sanitizeFilePart(base)}${topicPart}-${csvDateStamp()}.csv`;
  };

  const handleExportSelectedQuizCsv = async () => {
    if (!selectedQuizSet) {
      alert('Select a quiz set first.');
      return;
    }
    setExportingCsv(true);
    try {
      const setQuestions = await getQuestions(selectedQuizSet.id);
      const filtered = setQuestions.filter((q) => matchesTopicFilter(q, selectedQuizSet, csvTopicFilter));
      if (filtered.length === 0) {
        alert('No questions matched the selected filter.');
        return;
      }
      exportTrainingGroundCFUsToCSV(
        filtered.map((q) => ({
          ...q,
          quizSetTitle: selectedQuizSet.title,
          tags: selectedQuizSet.tags || [],
        })),
        buildExportFileName(selectedQuizSet.title, csvTopicFilter)
      );
    } catch (error) {
      console.error('Error exporting selected quiz CSV:', error);
      alert('Failed to export selected quiz CSV.');
    } finally {
      setExportingCsv(false);
    }
  };

  const handleExportAllCsv = async () => {
    setExportingCsv(true);
    try {
      const allSets = await getAllQuizSets(true);
      const allRows: Array<TrainingQuestion & { quizSetTitle: string; tags: string[] }> = [];
      for (const quizSet of allSets) {
        const setQuestions = await getQuestions(quizSet.id);
        setQuestions.forEach((q) => {
          if (!matchesTopicFilter(q, quizSet, csvTopicFilter)) return;
          allRows.push({
            ...q,
            quizSetTitle: quizSet.title,
            tags: quizSet.tags || [],
          });
        });
      }
      if (allRows.length === 0) {
        alert('No CFUs found for the selected filter.');
        return;
      }
      exportTrainingGroundCFUsToCSV(allRows, buildExportFileName('all', csvTopicFilter));
    } catch (error) {
      console.error('Error exporting all CFUs CSV:', error);
      alert('Failed to export all CFUs CSV.');
    } finally {
      setExportingCsv(false);
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
        playerCompletionsEnabled: true,
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

  const handleSaveQuizSetSkills = async () => {
    if (!selectedQuizSet) return;
    setSavingSkillIds(true);
    try {
      await updateQuizSet(selectedQuizSet.id, { skillIds: editSkillIds });
      await loadQuizSets();
      const refreshed = await getDoc(doc(db, 'trainingQuizSets', selectedQuizSet.id));
      if (refreshed.exists()) {
        setSelectedQuizSet({ id: refreshed.id, ...refreshed.data() } as TrainingQuizSet);
      }
      alert('CFU skills saved. These are topical tags — question-level skills drive mastery scoring.');
    } catch (error) {
      console.error('Error updating CFU skills:', error);
      alert('Failed to save CFU skills');
    } finally {
      setSavingSkillIds(false);
    }
  };

  const emptyQuestionForm = () => ({
    prompt: '',
    options: ['', '', '', ''],
    correctIndex: 0,
    correctIndices: [] as number[],
    explanation: '',
    difficulty: 'medium' as 'easy' | 'medium' | 'hard',
    category: '',
    imageFile: null as File | null,
    imageUrl: null as string | null,
    pointsPP: 10,
    pointsXP: 10,
    artifactRewards: [] as string[],
    skillIds: [] as string[],
  });

  const handleSetPlayerCompletionsEnabled = async (enabled: boolean) => {
    if (!selectedQuizSet || savingPlayerCompletions) return;
    setSavingPlayerCompletions(true);
    try {
      await updateQuizSet(selectedQuizSet.id, { playerCompletionsEnabled: enabled });
      await loadQuizSets();
      const refreshed = await getDoc(doc(db, 'trainingQuizSets', selectedQuizSet.id));
      if (refreshed.exists()) {
        setSelectedQuizSet({ id: refreshed.id, ...refreshed.data() } as TrainingQuizSet);
      }
    } catch (error) {
      console.error('Error updating completions toggle:', error);
      alert('Failed to update student completion setting');
    } finally {
      setSavingPlayerCompletions(false);
    }
  };

  const handleTogglePublish = async (quizSet: TrainingQuizSet) => {
    const turningOn = !quizSet.isPublished;
    if (turningOn && isTrainingQuizArchived(quizSet)) {
      alert('Unarchive this problem set before publishing.');
      return;
    }
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

  const handleToggleArchive = async (quizSet: TrainingQuizSet) => {
    await handleBulkArchiveOrRestore([quizSet.id], !isTrainingQuizArchived(quizSet));
  };

  const handleBulkArchiveOrRestore = async (quizIds: string[], archiving: boolean) => {
    if (savingArchive || quizIds.length === 0) return;
    const uniqueIds = Array.from(new Set(quizIds));
    const msg = archiving
      ? uniqueIds.length === 1
        ? `Move this problem set to the Archived folder?\n\nIt will leave the Active list and stay hidden from players. You can still import its questions into new CFUs.`
        : `Move ${uniqueIds.length} problem sets to the Archived folder?\n\nThey will leave the Active list and stay hidden from players. You can still import their questions into new CFUs.`
      : uniqueIds.length === 1
        ? 'Restore this problem set to the Active list?'
        : `Restore ${uniqueIds.length} problem sets to the Active list?`;
    if (!window.confirm(msg)) return;
    setSavingArchive(true);
    try {
      // Optimistic UI: leave Active list immediately
      setQuizSets((prev) =>
        prev.map((q) =>
          uniqueIds.includes(q.id)
            ? {
                ...q,
                isArchived: archiving,
                ...(archiving
                  ? { isPublished: false, playerCompletionsEnabled: false }
                  : {}),
              }
            : q
        )
      );
      setBulkSelectedQuizIds([]);
      if (selectedQuizSet && uniqueIds.includes(selectedQuizSet.id)) {
        if (archiving && !showArchivedQuizSets) setSelectedQuizSet(null);
        else if (!archiving && showArchivedQuizSets) setSelectedQuizSet(null);
      }

      await setQuizSetsArchived(uniqueIds, archiving);
      await loadQuizSets({ quiet: true });

      if (archiving && !showArchivedQuizSets) {
        alert(
          uniqueIds.length === 1
            ? 'Moved to Archived folder. Open the Archived tab to view or restore it.'
            : `Moved ${uniqueIds.length} problem sets to the Archived folder.`
        );
      }
    } catch (error) {
      console.error('Error updating archive state:', error);
      alert('Failed to update archive state');
      await loadQuizSets({ quiet: true });
    } finally {
      setSavingArchive(false);
    }
  };

  const toggleBulkQuizSelection = (quizId: string, checked: boolean) => {
    setBulkSelectedQuizIds((prev) => {
      if (checked) return prev.includes(quizId) ? prev : [...prev, quizId];
      return prev.filter((id) => id !== quizId);
    });
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
      questionData.skillIds = Array.isArray(questionForm.skillIds) ? questionForm.skillIds : [];
      
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
      setQuestionForm(emptyQuestionForm());
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
      updateData.skillIds = Array.isArray(questionForm.skillIds) ? questionForm.skillIds : [];
      
      await updateQuestion(selectedQuizSet.id, editingQuestion.id, updateData);

      alert('Question updated successfully!');
      setEditingQuestion(null);
      setShowQuestionForm(false);
      setQuestionForm(emptyQuestionForm());
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
      skillIds: Array.isArray(question.skillIds) ? [...question.skillIds] : [],
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
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <input
            type="text"
            placeholder="Filter by topic/category"
            value={csvTopicFilter}
            onChange={(e) => setCsvTopicFilter(e.target.value)}
            style={{
              padding: '0.45rem 0.6rem',
              border: '1px solid #d1d5db',
              borderRadius: '0.5rem',
              minWidth: '190px',
              fontSize: '0.8rem',
            }}
          />
          <button
            type="button"
            onClick={() => void handleExportAllCsv()}
            disabled={exportingCsv}
            style={{
              padding: '0.5rem 0.9rem',
              background: exportingCsv ? '#9ca3af' : '#0ea5e9',
              color: 'white',
              border: 'none',
              borderRadius: '0.5rem',
              cursor: exportingCsv ? 'not-allowed' : 'pointer',
              fontWeight: 600,
              fontSize: '0.82rem',
            }}
          >
            {exportingCsv ? 'Exporting…' : '⬇ Export All CSV'}
          </button>
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
            Active CFUs show here for players. Archived stays in a folder for question reuse only.
          </p>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '0.35rem',
              marginBottom: '0.75rem',
            }}
          >
            <button
              type="button"
              onClick={() => {
                setShowArchivedQuizSets(false);
                setSelectedQuizSet(null);
                setBulkSelectedQuizIds([]);
              }}
              style={{
                padding: '0.45rem 0.5rem',
                fontSize: '0.78rem',
                fontWeight: 700,
                border: '1px solid #d1d5db',
                borderRadius: '0.4rem',
                cursor: 'pointer',
                background: !showArchivedQuizSets ? '#4f46e5' : 'white',
                color: !showArchivedQuizSets ? 'white' : '#000000',
              }}
            >
              Active ({quizSets.filter((q) => !isTrainingQuizArchived(q)).length})
            </button>
            <button
              type="button"
              onClick={() => {
                setShowArchivedQuizSets(true);
                setSelectedQuizSet(null);
                setBulkSelectedQuizIds([]);
              }}
              style={{
                padding: '0.45rem 0.5rem',
                fontSize: '0.78rem',
                fontWeight: 700,
                border: '1px solid #d1d5db',
                borderRadius: '0.4rem',
                cursor: 'pointer',
                background: showArchivedQuizSets ? '#4f46e5' : 'white',
                color: showArchivedQuizSets ? 'white' : '#000000',
              }}
            >
              Archived ({archivedQuizSetCount})
            </button>
          </div>

          {showArchivedQuizSets && (
            <p style={{ fontSize: '0.72rem', color: '#000000', margin: '0 0 0.75rem' }}>
              Archived folder — hidden from players and the Active list. Import Questions can still use these.
            </p>
          )}

          {sortedQuizSetsForAdmin.length > 0 && (
            <div
              style={{
                marginBottom: '0.75rem',
                padding: '0.55rem 0.65rem',
                background: bulkSelectedQuizIds.length > 0 ? '#eef2ff' : '#f9fafb',
                border: '1px solid #e5e7eb',
                borderRadius: '0.5rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.4rem',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '0.5rem',
                  flexWrap: 'wrap',
                }}
              >
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                    fontSize: '0.75rem',
                    color: '#000000',
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={
                      sortedQuizSetsForAdmin.length > 0 &&
                      sortedQuizSetsForAdmin.every((q) => bulkSelectedQuizIds.includes(q.id))
                    }
                    onChange={(e) => {
                      if (e.target.checked) {
                        setBulkSelectedQuizIds(sortedQuizSetsForAdmin.map((q) => q.id));
                      } else {
                        setBulkSelectedQuizIds([]);
                      }
                    }}
                  />
                  Select all visible
                </label>
                <span style={{ fontSize: '0.72rem', color: '#000000' }}>
                  {bulkSelectedQuizIds.length} selected
                </span>
              </div>
              <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  disabled={savingArchive || bulkSelectedQuizIds.length === 0}
                  onClick={() =>
                    void handleBulkArchiveOrRestore(bulkSelectedQuizIds, !showArchivedQuizSets)
                  }
                  style={{
                    padding: '0.3rem 0.55rem',
                    fontSize: '0.72rem',
                    fontWeight: 600,
                    border: 'none',
                    borderRadius: '0.35rem',
                    background:
                      savingArchive || bulkSelectedQuizIds.length === 0
                        ? '#9ca3af'
                        : showArchivedQuizSets
                          ? '#10b981'
                          : '#6b7280',
                    color: 'white',
                    cursor:
                      savingArchive || bulkSelectedQuizIds.length === 0
                        ? 'not-allowed'
                        : 'pointer',
                  }}
                >
                  {savingArchive
                    ? 'Saving…'
                    : showArchivedQuizSets
                      ? `Restore to Active (${bulkSelectedQuizIds.length})`
                      : `Move to Archived (${bulkSelectedQuizIds.length})`}
                </button>
                {bulkSelectedQuizIds.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setBulkSelectedQuizIds([])}
                    style={{
                      padding: '0.3rem 0.55rem',
                      fontSize: '0.72rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '0.35rem',
                      background: 'white',
                      color: '#000000',
                      cursor: 'pointer',
                    }}
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
          )}

          {orderedClassroomsForPanel.length > 0 && !showArchivedQuizSets && (
            <div
              style={{
                marginBottom: '0.85rem',
                padding: '0.65rem',
                background: '#f9fafb',
                border: '1px solid #e5e7eb',
                borderRadius: '0.5rem',
              }}
            >
              <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#000000', marginBottom: '0.35rem' }}>
                Class section order
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                {orderedClassroomsForPanel.map((classroom, index) => (
                  <div
                    key={classroom.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '0.35rem',
                      fontSize: '0.78rem',
                      color: '#000000',
                      background: 'white',
                      border: '1px solid #e5e7eb',
                      borderRadius: '0.35rem',
                      padding: '0.3rem 0.4rem',
                    }}
                  >
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {classroom.name}
                    </span>
                    <span style={{ display: 'flex', gap: '0.2rem', flexShrink: 0 }}>
                      <button
                        type="button"
                        title="Move class up"
                        disabled={savingClassOrder || index === 0}
                        onClick={(e) => {
                          e.stopPropagation();
                          moveClassInOrder(classroom.id, -1);
                        }}
                        style={{
                          padding: '0.1rem 0.35rem',
                          fontSize: '0.7rem',
                          border: '1px solid #d1d5db',
                          borderRadius: '0.25rem',
                          background: index === 0 ? '#f3f4f6' : 'white',
                          color: '#000000',
                          cursor: index === 0 || savingClassOrder ? 'not-allowed' : 'pointer',
                        }}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        title="Move class down"
                        disabled={savingClassOrder || index === orderedClassroomsForPanel.length - 1}
                        onClick={(e) => {
                          e.stopPropagation();
                          moveClassInOrder(classroom.id, 1);
                        }}
                        style={{
                          padding: '0.1rem 0.35rem',
                          fontSize: '0.7rem',
                          border: '1px solid #d1d5db',
                          borderRadius: '0.25rem',
                          background:
                            index === orderedClassroomsForPanel.length - 1 ? '#f3f4f6' : 'white',
                          color: '#000000',
                          cursor:
                            index === orderedClassroomsForPanel.length - 1 || savingClassOrder
                              ? 'not-allowed'
                              : 'pointer',
                        }}
                      >
                        ↓
                      </button>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {sortedQuizSetsForAdmin.length === 0 && (
              <div
                style={{
                  padding: '0.85rem',
                  fontSize: '0.8rem',
                  color: '#6b7280',
                  background: '#f9fafb',
                  border: '1px dashed #d1d5db',
                  borderRadius: '0.5rem',
                }}
              >
                {showArchivedQuizSets
                  ? 'Archived folder is empty.'
                  : 'No active problem sets. Open the Archived tab to restore or import from old CFUs.'}
              </div>
            )}
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
                const sectionQuizzes = sortedQuizSetsForAdmin.filter(
                  (q) => sectionHeaderKeyForQuiz(q) === section
                );
                const sectionIndex = sectionQuizzes.findIndex((q) => q.id === quizSet.id);
                nodes.push(
                  <div
                    key={quizSet.id}
                    onClick={() => setSelectedQuizSet(quizSet)}
                    style={{
                      padding: '1rem',
                      paddingLeft: '0.7rem',
                      background:
                        bulkSelectedQuizIds.includes(quizSet.id)
                          ? '#f5f3ff'
                          : selectedQuizSet?.id === quizSet.id
                            ? '#eef2ff'
                            : 'white',
                      border: `2px solid ${
                        selectedQuizSet?.id === quizSet.id
                          ? '#4f46e5'
                          : bulkSelectedQuizIds.includes(quizSet.id)
                            ? '#a5b4fc'
                            : '#e5e7eb'
                      }`,
                      borderRadius: '0.5rem',
                      cursor: 'pointer',
                      position: 'relative',
                      display: 'flex',
                      gap: '0.45rem',
                      alignItems: 'flex-start',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={bulkSelectedQuizIds.includes(quizSet.id)}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => toggleBulkQuizSelection(quizSet.id, e.target.checked)}
                      title="Select for bulk archive"
                      style={{ marginTop: '0.2rem', flexShrink: 0 }}
                    />
                    <div style={{ flex: 1, minWidth: 0, position: 'relative' }}>
                    <div
                      style={{
                        position: 'absolute',
                        top: '0',
                        right: '0',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.15rem',
                      }}
                    >
                      <button
                        type="button"
                        title="Move assignment up in this class"
                        disabled={savingQuizOrder || sectionIndex <= 0}
                        onClick={(e) => {
                          e.stopPropagation();
                          void moveQuizInSection(quizSet.id, -1);
                        }}
                        style={{
                          padding: '0.05rem 0.3rem',
                          fontSize: '0.65rem',
                          lineHeight: 1.2,
                          border: '1px solid #d1d5db',
                          borderRadius: '0.2rem',
                          background: sectionIndex <= 0 ? '#f3f4f6' : 'white',
                          color: '#000000',
                          cursor: sectionIndex <= 0 || savingQuizOrder ? 'not-allowed' : 'pointer',
                        }}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        title="Move assignment down in this class"
                        disabled={savingQuizOrder || sectionIndex >= sectionQuizzes.length - 1}
                        onClick={(e) => {
                          e.stopPropagation();
                          void moveQuizInSection(quizSet.id, 1);
                        }}
                        style={{
                          padding: '0.05rem 0.3rem',
                          fontSize: '0.65rem',
                          lineHeight: 1.2,
                          border: '1px solid #d1d5db',
                          borderRadius: '0.2rem',
                          background:
                            sectionIndex >= sectionQuizzes.length - 1 ? '#f3f4f6' : 'white',
                          color: '#000000',
                          cursor:
                            sectionIndex >= sectionQuizzes.length - 1 || savingQuizOrder
                              ? 'not-allowed'
                              : 'pointer',
                        }}
                      >
                        ↓
                      </button>
                    </div>
                    <div style={{ fontWeight: '600', marginBottom: '0.25rem', paddingRight: '1.5rem' }}>
                      {quizSet.title}
                    </div>
                    <div style={{ fontSize: '0.72rem', color: '#4f46e6', marginBottom: '0.25rem' }}>
                      {classLabelsForQuiz(quizSet)}
                    </div>
                    <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                      {quizSet.questionCount} questions
                      {isTrainingQuizArchived(quizSet)
                        ? ' • Archived'
                        : quizSet.isPublished
                          ? ' • Published'
                          : ' • Draft'}
                      {!isTrainingQuizArchived(quizSet) &&
                      quizSet.playerCompletionsEnabled === false
                        ? ' • Completions off'
                        : ''}
                    </div>
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

                <div
                  style={{
                    marginTop: '0.75rem',
                    padding: '0.75rem',
                    background: '#0e1420',
                    borderRadius: '0.5rem',
                    border: '1px solid rgba(212,168,79,0.4)',
                    color: '#f4f0e6',
                  }}
                >
                  <SkillPicker
                    selectedIds={editSkillIds}
                    onChange={setEditSkillIds}
                    label="Skills Assessed (CFU topics)"
                  />
                  <p style={{ margin: '0.35rem 0 0.65rem', fontSize: '0.75rem', color: '#9ca3af' }}>
                    CFU-level tags organize topics and suggest skills for questions. Mastery scoring uses question tags.
                  </p>
                  <button
                    type="button"
                    onClick={() => void handleSaveQuizSetSkills()}
                    disabled={savingSkillIds}
                    style={{
                      padding: '0.35rem 0.75rem',
                      background: '#6d3ef2',
                      color: 'white',
                      border: 'none',
                      borderRadius: '0.35rem',
                      cursor: savingSkillIds ? 'not-allowed' : 'pointer',
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      opacity: savingSkillIds ? 0.7 : 1,
                    }}
                  >
                    {savingSkillIds ? 'Saving…' : 'Save CFU skills'}
                  </button>
                </div>

                <div
                  style={{
                    marginTop: '0.75rem',
                    padding: '0.75rem',
                    background: '#fffbeb',
                    borderRadius: '0.5rem',
                    border: '1px solid #fcd34d',
                  }}
                >
                  <div style={{ fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.35rem', color: '#78350f' }}>
                    Student completions (Training Grounds)
                  </div>
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '0.5rem',
                      fontSize: '0.85rem',
                      color: '#374151',
                      cursor: savingPlayerCompletions ? 'wait' : 'pointer',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={selectedQuizSet.playerCompletionsEnabled !== false}
                      disabled={savingPlayerCompletions}
                      onChange={(e) => void handleSetPlayerCompletionsEnabled(e.target.checked)}
                      style={{ marginTop: '0.15rem' }}
                    />
                    <span>
                      <strong>Accept solo quiz completions</strong> — students still see this CFU when published, but
                      cannot start or retry until this is checked again.
                    </span>
                  </label>
                  {savingPlayerCompletions && (
                    <div style={{ fontSize: '0.72rem', color: '#92400e', marginTop: '0.35rem' }}>Saving…</div>
                  )}
                </div>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => void handleExportSelectedQuizCsv()}
                  disabled={exportingCsv}
                  style={{
                    padding: '0.5rem 1rem',
                    background: exportingCsv ? '#9ca3af' : '#0ea5e9',
                    color: 'white',
                    border: 'none',
                    borderRadius: '0.5rem',
                    cursor: exportingCsv ? 'not-allowed' : 'pointer',
                    fontSize: '0.875rem',
                  }}
                >
                  {exportingCsv ? 'Exporting…' : '⬇ Export CSV'}
                </button>
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
                  disabled={isTrainingQuizArchived(selectedQuizSet)}
                  style={{
                    padding: '0.5rem 1rem',
                    background: isTrainingQuizArchived(selectedQuizSet)
                      ? '#9ca3af'
                      : selectedQuizSet.isPublished
                        ? '#ef4444'
                        : '#10b981',
                    color: 'white',
                    border: 'none',
                    borderRadius: '0.5rem',
                    cursor: isTrainingQuizArchived(selectedQuizSet) ? 'not-allowed' : 'pointer',
                    fontSize: '0.875rem',
                  }}
                >
                  {selectedQuizSet.isPublished ? 'Unpublish' : 'Publish'}
                </button>
                <button
                  onClick={() => void handleToggleArchive(selectedQuizSet)}
                  disabled={savingArchive}
                  style={{
                    padding: '0.5rem 1rem',
                    background: savingArchive
                      ? '#9ca3af'
                      : isTrainingQuizArchived(selectedQuizSet)
                        ? '#10b981'
                        : '#6b7280',
                    color: 'white',
                    border: 'none',
                    borderRadius: '0.5rem',
                    cursor: savingArchive ? 'not-allowed' : 'pointer',
                    fontSize: '0.875rem',
                  }}
                >
                  {savingArchive
                    ? 'Saving…'
                    : isTrainingQuizArchived(selectedQuizSet)
                      ? 'Restore to Active'
                      : 'Move to Archived'}
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
                    setQuestionForm(emptyQuestionForm());
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
                      {Array.isArray(question.skillIds) && question.skillIds.length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem', marginBottom: '0.5rem' }}>
                          <span style={{ fontSize: '0.75rem', color: '#6b7280', marginRight: '0.25rem' }}>Skills:</span>
                          {question.skillIds.map((sid) => {
                            const skill = skillCatalog.find((s) => s.id === sid);
                            return (
                              <SkillChip
                                key={sid}
                                skill={skill || { name: sid }}
                              />
                            );
                          })}
                        </div>
                      )}
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
              <SkillPicker
                selectedIds={questionForm.skillIds}
                onChange={(ids) => setQuestionForm({ ...questionForm, skillIds: ids })}
                suggestedIds={editSkillIds}
                label="Skills Assessed"
              />
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
                  setQuestionForm(emptyQuestionForm());
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
              Select another quiz set (including archived), then choose which questions to copy.
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
                  .filter((q) => q.id !== selectedQuizSet.id)
                  .slice()
                  .sort((a, b) => {
                    const aa = isTrainingQuizArchived(a) ? 1 : 0;
                    const ba = isTrainingQuizArchived(b) ? 1 : 0;
                    if (aa !== ba) return aa - ba;
                    return (a.title || '').localeCompare(b.title || '');
                  })
                  .map((q) => (
                    <option key={q.id} value={q.id}>
                      {isTrainingQuizArchived(q) ? '[Archived] ' : ''}
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

