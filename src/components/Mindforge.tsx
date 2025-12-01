import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useBattle } from '../context/BattleContext';
import { doc, getDoc, updateDoc, addDoc, collection, serverTimestamp, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import BattleEngine from './BattleEngine';
import { trackMoveUsage } from '../utils/manifestTracking';
import { getActivePPBoost, applyPPBoost } from '../utils/ppBoost';

interface MindforgeProps {
  onBack: () => void;
}

interface Question {
  id: string;
  question: string;
  type: 'multiple-choice' | 'short-answer' | 'true-false';
  options?: string[];
  correctAnswer: string;
  topic?: string;
  unit?: string;
  difficulty: 'standard' | 'advanced' | 'exam';
  class: 'graphic-design' | 'ux-ui-design';
}

interface MindforgeStats {
  questionsAsked: number;
  correctAnswers: number;
  currentStreak: number;
  longestStreak: number;
  accuracy: number;
  dailyPPEarned: number;
}

// Sample questions - in production, these would come from a database
const SAMPLE_QUESTIONS: Question[] = [
  // UX/UI Design Questions
  {
    id: 'ux1',
    question: 'What is the primary purpose of a user interface?',
    type: 'multiple-choice',
    options: ['To look pretty', 'To facilitate user interaction with a system', 'To store data', 'To process information'],
    correctAnswer: 'To facilitate user interaction with a system',
    topic: 'UX/UI Design',
    unit: 'Unit 1',
    difficulty: 'standard',
    class: 'ux-ui-design'
  },
  {
    id: 'ux2',
    question: 'What does UX stand for?',
    type: 'multiple-choice',
    options: ['User Experience', 'User Extension', 'User Exchange', 'User Execution'],
    correctAnswer: 'User Experience',
    topic: 'UX/UI Design',
    unit: 'Unit 1',
    difficulty: 'standard',
    class: 'ux-ui-design'
  },
  {
    id: 'ux3',
    question: 'What is a wireframe in UX/UI design?',
    type: 'multiple-choice',
    options: ['A final design mockup', 'A low-fidelity visual guide for layout', 'A color palette', 'A font selection'],
    correctAnswer: 'A low-fidelity visual guide for layout',
    topic: 'UX/UI Design',
    unit: 'Unit 2',
    difficulty: 'standard',
    class: 'ux-ui-design'
  },
  {
    id: 'ux4',
    question: 'True or False: Accessibility should be considered from the beginning of the design process.',
    type: 'true-false',
    correctAnswer: 'True',
    topic: 'UX/UI Design',
    unit: 'Unit 2',
    difficulty: 'standard',
    class: 'ux-ui-design'
  },
  {
    id: 'ux5',
    question: 'Explain the difference between UI and UX design.',
    type: 'short-answer',
    correctAnswer: 'UI (User Interface) focuses on the visual design and interactive elements, while UX (User Experience) focuses on the overall experience and usability of the product.',
    topic: 'UX/UI Design',
    unit: 'Unit 1',
    difficulty: 'advanced',
    class: 'ux-ui-design'
  },
  {
    id: 'ux6',
    question: 'What is the purpose of user personas in UX design?',
    type: 'multiple-choice',
    options: ['To decorate presentations', 'To represent target users and guide design decisions', 'To track user behavior', 'To store user data'],
    correctAnswer: 'To represent target users and guide design decisions',
    topic: 'UX/UI Design',
    unit: 'Unit 3',
    difficulty: 'advanced',
    class: 'ux-ui-design'
  },
  // Graphic Design Questions
  {
    id: 'gd1',
    question: 'What are the primary colors in the RGB color model?',
    type: 'multiple-choice',
    options: ['Red, Yellow, Blue', 'Red, Green, Blue', 'Cyan, Magenta, Yellow', 'Orange, Green, Purple'],
    correctAnswer: 'Red, Green, Blue',
    topic: 'Graphic Design',
    unit: 'Unit 1',
    difficulty: 'standard',
    class: 'graphic-design'
  },
  {
    id: 'gd2',
    question: 'What is the rule of thirds in graphic design?',
    type: 'multiple-choice',
    options: ['A color theory principle', 'A composition guideline dividing an image into nine equal parts', 'A typography rule', 'A printing technique'],
    correctAnswer: 'A composition guideline dividing an image into nine equal parts',
    topic: 'Graphic Design',
    unit: 'Unit 1',
    difficulty: 'standard',
    class: 'graphic-design'
  },
  {
    id: 'gd3',
    question: 'What does CMYK stand for?',
    type: 'multiple-choice',
    options: ['Color Model Yellow Key', 'Cyan Magenta Yellow Key', 'Color Mix Yellow Key', 'Creative Media Yellow Key'],
    correctAnswer: 'Cyan Magenta Yellow Key',
    topic: 'Graphic Design',
    unit: 'Unit 1',
    difficulty: 'standard',
    class: 'graphic-design'
  },
  {
    id: 'gd4',
    question: 'True or False: Serif fonts are generally easier to read in print than sans-serif fonts.',
    type: 'true-false',
    correctAnswer: 'True',
    topic: 'Graphic Design',
    unit: 'Unit 2',
    difficulty: 'standard',
    class: 'graphic-design'
  },
  {
    id: 'gd5',
    question: 'Explain the difference between vector and raster graphics.',
    type: 'short-answer',
    correctAnswer: 'Vector graphics use mathematical equations and can be scaled infinitely without quality loss, while raster graphics use pixels and can lose quality when scaled up.',
    topic: 'Graphic Design',
    unit: 'Unit 2',
    difficulty: 'advanced',
    class: 'graphic-design'
  },
  {
    id: 'gd6',
    question: 'What is negative space in graphic design?',
    type: 'multiple-choice',
    options: ['Dark colors', 'The empty space around and between design elements', 'Inverted images', 'Background layers'],
    correctAnswer: 'The empty space around and between design elements',
    topic: 'Graphic Design',
    unit: 'Unit 3',
    difficulty: 'advanced',
    class: 'graphic-design'
  }
];

const Mindforge: React.FC<MindforgeProps> = ({ onBack }) => {
  const { currentUser } = useAuth();
  const { vault, moves, syncVaultPP } = useBattle();
  const [selectedClass, setSelectedClass] = useState<'graphic-design' | 'ux-ui-design' | null>(null);
  const [selectedDifficulty, setSelectedDifficulty] = useState<'standard' | 'advanced' | 'exam'>('standard');
  const [showBattle, setShowBattle] = useState(false);
  const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null);
  const [displayedQuestion, setDisplayedQuestion] = useState<Question | null>(null); // Question with shuffled options
  const [selectedAnswer, setSelectedAnswer] = useState<string>('');
  const [timeRemaining, setTimeRemaining] = useState<number>(45);
  const [questionAnswered, setQuestionAnswered] = useState(false);
  const [answerResult, setAnswerResult] = useState<'correct' | 'incorrect' | null>(null);
  const [waitingForQuestion, setWaitingForQuestion] = useState(false);
  const [canUseMove, setCanUseMove] = useState(false);
  const [currentQuestionAnswerResult, setCurrentQuestionAnswerResult] = useState<'correct' | 'incorrect' | null>(null);
  const [stats, setStats] = useState<MindforgeStats>({
    questionsAsked: 0,
    correctAnswers: 0,
    currentStreak: 0,
    longestStreak: 0,
    accuracy: 0,
    dailyPPEarned: 0
  });
  const [opponent, setOpponent] = useState<any>(null);
  const [battleResult, setBattleResult] = useState<'victory' | 'defeat' | 'escape' | null>(null);
  const [showResultsModal, setShowResultsModal] = useState(false);
  const [battleResults, setBattleResults] = useState<{
    result: 'victory' | 'defeat' | 'escape';
    rewards: { pp: number; xp: number; tmShards: number; originalPP?: number };
    stats: MindforgeStats;
  } | null>(null);
  const [battleLog, setBattleLog] = useState<string[]>(['Welcome to Mindforge Battle!']);
  const [completedTopics, setCompletedTopics] = useState<Set<string>>(new Set());
  const [questionBank, setQuestionBank] = useState<Question[]>([]);
  const [questionQueue, setQuestionQueue] = useState<Question[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [previousQuestionId, setPreviousQuestionId] = useState<string | null>(null); // Track previous question
  const [questionsLoading, setQuestionsLoading] = useState(false);
  // Track how many times each difficulty level has been completed, per class
  const [levelCompletions, setLevelCompletions] = useState<{
    'graphic-design'?: {
      standard?: number;
      advanced?: number;
      exam?: number;
    };
    'ux-ui-design'?: {
      standard?: number;
      advanced?: number;
      exam?: number;
    };
  }>({});

  // Load questions from Firestore
  useEffect(() => {
    const loadQuestions = async () => {
      if (!selectedClass) return;
      
      setQuestionsLoading(true);
      try {
        // Simple query with just class filter - no orderBy to avoid index requirement
        const q = query(
          collection(db, 'mindforgeQuestions'),
          where('class', '==', selectedClass)
        );
        const snapshot = await getDocs(q);
        const loadedQuestions = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as Question[];
        
        setQuestionBank(loadedQuestions);
      } catch (error) {
        console.error('Error loading questions:', error);
        // Fallback to sample questions if Firestore fails
        setQuestionBank(SAMPLE_QUESTIONS.filter(q => q.class === selectedClass));
      } finally {
        setQuestionsLoading(false);
      }
    };
    
    loadQuestions();
  }, [selectedClass]);

  // Load daily PP earned and streak data
  useEffect(() => {
    const loadDailyStats = async () => {
      if (!currentUser) return;
      
      try {
        const userRef = doc(db, 'students', currentUser.uid);
        const userDoc = await getDoc(userRef);
        
        if (userDoc.exists()) {
          const userData = userDoc.data();
          const mindforgeStats = userData.mindforgeStats || {};
          const today = new Date().toDateString();
          
          if (mindforgeStats.lastPlayedDate === today) {
            // Load stats from today, including current streak for continuity
            setStats(prev => ({
              ...prev,
              dailyPPEarned: mindforgeStats.dailyPPEarned || 0,
              questionsAsked: mindforgeStats.questionsAsked || 0,
              correctAnswers: mindforgeStats.correctAnswers || 0,
              longestStreak: mindforgeStats.longestStreak || 0,
              // Preserve currentStreak if last session ended successfully
              // This allows streak to continue across sessions
              currentStreak: mindforgeStats.currentStreak || 0
            }));
          } else {
            // New day - reset daily stats but keep overall longest streak
            // We'll load longest streak from all-time, but reset daily counters
            setStats(prev => ({
              ...prev,
              dailyPPEarned: 0,
              questionsAsked: 0,
              correctAnswers: 0,
              currentStreak: 0, // New day starts with fresh streak
              longestStreak: Math.max(prev.longestStreak, mindforgeStats.longestStreak || 0) // Keep best ever
            }));
          }
          
          // Load level completions (class-specific)
          const completions = mindforgeStats.levelCompletions || {};
          setLevelCompletions({
            'graphic-design': completions['graphic-design'] || {
              standard: 0,
              advanced: 0,
              exam: 0
            },
            'ux-ui-design': completions['ux-ui-design'] || {
              standard: 0,
              advanced: 0,
              exam: 0
            }
          });
          
          // Load completed topics
          const topics = userData.mindforgeCompletedTopics || [];
          setCompletedTopics(new Set(topics));
        }
      } catch (error) {
        console.error('Error loading Mindforge stats:', error);
      }
    };
    
    loadDailyStats();
  }, [currentUser]);

  // Timer for questions
  useEffect(() => {
    if (displayedQuestion && !questionAnswered && timeRemaining > 0) {
      const timer = setTimeout(() => {
        setTimeRemaining(prev => prev - 1);
      }, 1000);
      return () => clearTimeout(timer);
    } else if (timeRemaining === 0 && !questionAnswered) {
      handleAnswerSubmit(''); // Timeout
    }
  }, [displayedQuestion, timeRemaining, questionAnswered]);

  // Shuffle array function
  const shuffleArray = <T,>(array: T[]): T[] => {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  };

  const getQuestionCount = (difficulty: 'standard' | 'advanced' | 'exam'): number => {
    // Map difficulty to question count ranges
    const ranges = {
      'standard': { min: 3, max: 6 },   // Easy: 3-6 questions
      'advanced': { min: 5, max: 10 },  // Medium: 5-10 questions
      'exam': { min: 10, max: 20 }      // Hard: 10-20 questions
    };
    
    const range = ranges[difficulty];
    return Math.floor(Math.random() * (range.max - range.min + 1)) + range.min;
  };

  // Check if questions are available for a specific class + difficulty
  const hasQuestionsForDifficulty = (classType: 'graphic-design' | 'ux-ui-design' | null, difficulty: 'standard' | 'advanced' | 'exam'): boolean => {
    if (!classType || questionBank.length === 0) {
      return false;
    }
    
    // Filter questions by difficulty
    // For exam mode, we need questions specifically marked as 'exam' difficulty
    // For other difficulties, filter by that specific difficulty
    let filtered = questionBank;
    if (difficulty === 'exam') {
      // Exam mode requires questions specifically marked as 'exam'
      filtered = filtered.filter(q => q.difficulty === 'exam');
    } else {
      filtered = filtered.filter(q => q.difficulty === difficulty);
    }
    
    return filtered.length > 0;
  };

  const initializeQuestionQueue = (): Question[] => {
    if (!selectedClass || questionBank.length === 0) {
      return [];
    }
    
    // Filter questions by difficulty
    // For exam mode, we need questions specifically marked as 'exam' difficulty
    // For other difficulties, filter by that specific difficulty
    let filtered = questionBank;
    if (selectedDifficulty === 'exam') {
      filtered = filtered.filter(q => q.difficulty === 'exam');
    } else {
      filtered = filtered.filter(q => q.difficulty === selectedDifficulty);
    }
    
    // Don't fall back to other difficulties - return empty if no questions match
    if (filtered.length === 0) {
      return [];
    }
    
    // Get question count for this difficulty
    const questionCount = getQuestionCount(selectedDifficulty);
    
    // Shuffle and take the required number
    const shuffled = shuffleArray(filtered);
    return shuffled.slice(0, Math.min(questionCount, shuffled.length));
  };

  const getNextQuestion = (): Question | null => {
    if (questionQueue.length === 0 || currentQuestionIndex >= questionQueue.length) {
      return null;
    }
    
    let question = questionQueue[currentQuestionIndex];
    let attempts = 0;
    const maxAttempts = questionQueue.length;
    
    // If this is the same question as the previous one, try to find a different one
    while (question.id === previousQuestionId && attempts < maxAttempts) {
      // Try next question in queue (wrap around if needed)
      const nextIndex = (currentQuestionIndex + attempts + 1) % questionQueue.length;
      question = questionQueue[nextIndex];
      attempts++;
    }
    
    // If still the same question and we have more than one question, shuffle the queue
    if (question.id === previousQuestionId && questionQueue.length > 1) {
      // Get all questions except the previous one
      const otherQuestions = questionQueue.filter(q => q.id !== previousQuestionId);
      if (otherQuestions.length > 0) {
        question = otherQuestions[Math.floor(Math.random() * otherQuestions.length)];
      }
    }
    
    return question;
  };

  // Shuffle options for multiple-choice questions
  const shuffleQuestionOptions = (question: Question): Question => {
    if (question.type === 'multiple-choice' && question.options && question.options.length > 0) {
      // Create array of option indices
      const indices = question.options.map((_, i) => i);
      const shuffledIndices = shuffleArray(indices);
      
      // Create shuffled options array
      const shuffledOptions = shuffledIndices.map(i => question.options![i]);
      
      // Find which index the correct answer is at in the original array
      const correctAnswerIndex = question.options.findIndex(opt => opt === question.correctAnswer);
      
      // Find the new position of the correct answer in shuffled array
      const newCorrectAnswerIndex = shuffledIndices.indexOf(correctAnswerIndex);
      const shuffledCorrectAnswer = shuffledOptions[newCorrectAnswerIndex];
      
      return {
        ...question,
        options: shuffledOptions,
        correctAnswer: shuffledCorrectAnswer || question.correctAnswer
      };
    }
    return question;
  };

  const startBattle = () => {
    if (!selectedClass) {
      alert('Please select a class first!');
      return;
    }
    
    if (questionBank.length === 0) {
      alert('No questions available for this class. Please contact an administrator.');
      return;
    }
    
    // Initialize question queue
    const queue = initializeQuestionQueue();
    if (queue.length === 0) {
      alert('No questions available for the selected difficulty. Please try a different difficulty.');
      return;
    }
    
    setQuestionQueue(queue);
    setCurrentQuestionIndex(0); // Reset question index
    
    // Create AI opponent based on difficulty
    const opponentStats = {
      standard: { level: 5, powerPoints: 100, shieldStrength: 20 },
      advanced: { level: 10, powerPoints: 200, shieldStrength: 40 },
      exam: { level: 15, powerPoints: 300, shieldStrength: 60 }
    };
    
    const opponentData = opponentStats[selectedDifficulty];
    setOpponent({
      id: 'mindforge-opponent',
      name: `Mindforge ${selectedDifficulty.charAt(0).toUpperCase() + selectedDifficulty.slice(1)} Opponent`,
      currentPP: opponentData.powerPoints,
      maxPP: opponentData.powerPoints,
      shieldStrength: opponentData.shieldStrength,
      maxShieldStrength: opponentData.shieldStrength,
      level: opponentData.level
    });
    
    // Reset per-battle stats, but preserve daily stats and current streak
    // This allows streak to continue across battles if player keeps getting questions right
    setStats(prev => ({
      ...prev,
      // Keep current streak - it will continue if player gets questions right
      // Only reset if they get a question wrong (handled in handleAnswerSubmit)
      questionsAsked: 0,
      correctAnswers: 0,
      accuracy: 0
      // Keep: currentStreak, longestStreak, dailyPPEarned
    }));
    
    // Initialize battle log for new battle
    setBattleLog(['Welcome to Mindforge Battle!']); // Removed instruction message - not needed during battle
    
    setShowBattle(true);
    setWaitingForQuestion(true);
    
    // Load first question directly from the queue (not from state to avoid race condition)
    if (queue.length > 0) {
      const firstQuestion = queue[0];
      const shuffledFirstQuestion = shuffleQuestionOptions(firstQuestion);
      setCurrentQuestion(firstQuestion);
      setDisplayedQuestion(shuffledFirstQuestion);
      setPreviousQuestionId(firstQuestion.id);
      setSelectedAnswer('');
      setQuestionAnswered(false);
      setAnswerResult(null);
      setTimeRemaining(45);
    }
  };

  const loadNextQuestion = () => {
    // Safety check: don't load if battle hasn't started
    if (!showBattle) {
      return;
    }
    
    // Check if we've answered all questions
    if (questionQueue.length > 0 && currentQuestionIndex >= questionQueue.length) {
      // All questions answered - battle ends
      handleBattleEnd('victory');
      return;
    }
    
    const question = getNextQuestion();
    if (!question) {
      // No question available - this shouldn't happen if queue is set correctly
      if (questionQueue.length === 0) {
        // Queue is empty - battle can't proceed
        alert('No questions available. Please try again.');
        setShowBattle(false);
        return;
      }
      // If we have a queue but no question at this index, all questions are done
      handleBattleEnd('victory');
      return;
    }
    
    // Shuffle options for multiple-choice questions
    const shuffledQuestion = shuffleQuestionOptions(question);
    
    // Load the question - clear all previous answer states
    setCurrentQuestion(question); // Keep original for tracking
    setDisplayedQuestion(shuffledQuestion); // Use shuffled version for display
    setPreviousQuestionId(question.id); // Track this question to avoid repeats
    setSelectedAnswer('');
    setQuestionAnswered(false);
    setAnswerResult(null);
    setCurrentQuestionAnswerResult(null); // Clear previous answer result
    setCanUseMove(false); // Don't allow moves until question is answered
    setWaitingForQuestion(true); // Show question
    setTimeRemaining(45);
  };

  const handleAnswerSubmit = async (answer: string = '') => {
    if (!displayedQuestion || !currentQuestion || questionAnswered) return;
    
    // Check against displayed question's correct answer (which is shuffled for multiple choice)
    const isCorrect = answer.toLowerCase().trim() === displayedQuestion.correctAnswer.toLowerCase().trim() ||
                     (displayedQuestion.type === 'short-answer' && 
                      displayedQuestion.correctAnswer.toLowerCase().includes(answer.toLowerCase().trim()));
    
    setQuestionAnswered(true);
    const result: 'correct' | 'incorrect' = isCorrect ? 'correct' : 'incorrect';
    setAnswerResult(result);
    setCurrentQuestionAnswerResult(result); // Store the result for the current question
    
    // Update stats
    const newQuestionsAsked = stats.questionsAsked + 1;
    const newCorrectAnswers = isCorrect ? stats.correctAnswers + 1 : stats.correctAnswers;
    const newCurrentStreak = isCorrect ? stats.currentStreak + 1 : 0;
    const newLongestStreak = Math.max(stats.longestStreak, newCurrentStreak);
    const newAccuracy = newCorrectAnswers / newQuestionsAsked;
    
    setStats({
      questionsAsked: newQuestionsAsked,
      correctAnswers: newCorrectAnswers,
      currentStreak: newCurrentStreak,
      longestStreak: newLongestStreak,
      accuracy: newAccuracy,
      dailyPPEarned: stats.dailyPPEarned
    });
    
    // Wait a moment to show result, then allow move selection
    setTimeout(() => {
      setCanUseMove(true);
      setWaitingForQuestion(false);
      // Keep questionAnswered as true so they can't answer again
      // Don't load next question yet - wait for move to be executed
    }, 2000);
  };

  const handleMoveExecuted = () => {
    // After move is executed, clear everything and move to next question
    setCanUseMove(false);
    setAnswerResult(null); // Clear the displayed result
    setCurrentQuestionAnswerResult(null); // Clear the stored result
    setQuestionAnswered(false);
    setSelectedAnswer('');
    
    // Increment question index and check if we've completed all questions
    setCurrentQuestionIndex(prev => {
      const nextIndex = prev + 1;
      
      // Check if we've answered all questions
      if (questionQueue.length > 0 && nextIndex >= questionQueue.length) {
        // All questions answered - battle ends
        // Use minimal delay for smooth transition
        setTimeout(() => {
          handleBattleEnd('victory');
        }, 300);
        return nextIndex;
      }
      
      // Load next question immediately (no delay needed)
      setWaitingForQuestion(true); // Show question area
      loadNextQuestion(); // Load next question immediately
      
      return nextIndex;
    });
  };

  const calculateRewards = (victory: boolean): { pp: number; xp: number; tmShards: number } => {
    const Q = stats.questionsAsked;
    const C = stats.correctAnswers;
    const accuracy = Q > 0 ? C / Q : 0;
    const streakMax = stats.longestStreak;
    
    const difficultyMultipliers = {
      standard: 1.0,
      advanced: 1.3,
      exam: 1.6
    };
    const difficultyMultiplier = difficultyMultipliers[selectedDifficulty];
    
    // Check how many times this level has been completed for the selected class
    const classCompletions = (selectedClass && levelCompletions[selectedClass]) || {};
    const completionCount = classCompletions[selectedDifficulty] || 0;
    
    // PP Calculation
    let pp = 0;
    if (victory) {
      if (completionCount < 3) {
        // Full PP rewards for first 3 completions
        const basePP = 30;
        pp = basePP * accuracy * difficultyMultiplier;
        
        // Win Bonus
        pp += 15;
        
        // Streak Bonus
        if (streakMax > 3) {
          pp += (streakMax - 3) * 2;
        }
        
        // Daily Cap (300 PP)
        const remainingDailyPP = 300 - stats.dailyPPEarned;
        pp = Math.min(pp, remainingDailyPP);
      } else {
        // After 3 completions, cap PP at 10 per completion
        pp = 10;
        
        // Still apply daily cap
        const remainingDailyPP = 300 - stats.dailyPPEarned;
        pp = Math.min(pp, remainingDailyPP);
      }
    }
    
    // XP Calculation (always give XP)
    const baseXP = 20;
    let xp = baseXP * accuracy * difficultyMultiplier;
    
    // Truth Metal Shards (TM Shards)
    // Standard difficulty victory: 1 TM Shard (only on first win)
    // Defeat: 0 TM Shards (regardless of difficulty)
    let tmShards = 0;
    if (victory && selectedDifficulty === 'standard' && completionCount === 0) {
      tmShards = 1; // Only give TM Shard on first completion
    }
    
    return {
      pp: Math.round(pp),
      xp: Math.round(xp),
      tmShards
    };
  };

  // Get opponent image based on difficulty
  const getOpponentImageForModal = (difficulty: 'standard' | 'advanced' | 'exam'): string | null => {
    if (difficulty === 'standard') {
      return '/images/Standard Mind Forge Bot.png';
    } else if (difficulty === 'advanced') {
      return '/images/Advanced Mind Forge Bot.png';
    }
    return null; // Exam mode uses default
  };

  const handleBattleEnd = async (result: 'victory' | 'defeat' | 'escape') => {
    setBattleResult(result);
    setShowBattle(false);
    
    if (!currentUser) return;
    
    const rewards = calculateRewards(result === 'victory');
    const newDailyPP = stats.dailyPPEarned + rewards.pp;
    
    try {
      // Update user stats
      const userRef = doc(db, 'students', currentUser.uid);
      const userDoc = await getDoc(userRef);
      
      if (userDoc.exists()) {
        const userData = userDoc.data();
        const currentPP = userData.powerPoints || 0;
        const currentXP = userData.xp || 0;
        const currentTruthMetal = Math.floor(userData.truthMetal || 0);
        
        // Convert TM Shards to Truth Metal (1 TM Shard = 1 Truth Metal)
        const truthMetalEarned = rewards.tmShards;
        const newTruthMetal = currentTruthMetal + truthMetalEarned;
        
        // Update level completion count if victory (class-specific)
        const newLevelCompletions = { ...levelCompletions };
        if (result === 'victory' && selectedClass) {
          const classCompletions = newLevelCompletions[selectedClass] || {
            standard: 0,
            advanced: 0,
            exam: 0
          };
          const currentCount = classCompletions[selectedDifficulty] || 0;
          newLevelCompletions[selectedClass] = {
            ...classCompletions,
            [selectedDifficulty]: currentCount + 1
          };
          setLevelCompletions(newLevelCompletions);
        }
        
        // Apply PP boost if active
        const originalPP = rewards.pp;
        let finalPP = rewards.pp;
        try {
          const activeBoost = await getActivePPBoost(currentUser.uid);
          if (activeBoost) {
            finalPP = applyPPBoost(rewards.pp, currentUser.uid, activeBoost);
            console.log(`⚡ PP Boost applied to Mindforge reward: ${rewards.pp} → ${finalPP}`);
          }
        } catch (error) {
          console.error('Error applying PP boost to Mindforge reward:', error);
        }
        
        // Update PP, XP, and Truth Metal
        await updateDoc(userRef, {
          powerPoints: currentPP + finalPP,
          xp: currentXP + rewards.xp,
          truthMetal: newTruthMetal, // Add TM Shards to Truth Metal currency
          mindforgeStats: {
            lastPlayedDate: new Date().toDateString(),
            dailyPPEarned: newDailyPP,
            questionsAsked: stats.questionsAsked,
            correctAnswers: stats.correctAnswers,
            currentStreak: stats.currentStreak, // Save current streak for next session
            longestStreak: stats.longestStreak,
            levelCompletions: newLevelCompletions, // Save level completion counts
            totalMatches: (userData.mindforgeStats?.totalMatches || 0) + 1
          }
        });
        
        // Record battle
        await addDoc(collection(db, 'mindforgeBattles'), {
          userId: currentUser.uid,
          class: selectedClass,
          difficulty: selectedDifficulty,
          result: result,
          questionsAsked: stats.questionsAsked,
          correctAnswers: stats.correctAnswers,
          accuracy: stats.accuracy,
          longestStreak: stats.longestStreak,
          rewards: {
            pp: rewards.pp,
            xp: rewards.xp,
            tmShards: rewards.tmShards
          },
          timestamp: serverTimestamp()
        });
        
        // Sync vault PP
        await syncVaultPP();
        
        // Show results modal instead of alert
        setBattleResults({
          result,
          rewards: {
            ...rewards,
            pp: finalPP,
            originalPP: originalPP !== finalPP ? originalPP : undefined
          },
          stats: { ...stats }
        });
        setShowResultsModal(true);
      }
    } catch (error) {
      console.error('Error recording Mindforge battle:', error);
    }
  };

  if (showBattle && opponent) {
    return (
      <div style={{
        backgroundImage: 'url("/images/Mind Forge BKG.png")',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
        backgroundAttachment: 'fixed',
        minHeight: '100vh',
        padding: '2rem',
        position: 'relative'
      }}>
        {/* Semi-transparent overlay for better text readability */}
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(15, 23, 42, 0.2)', // Lighter overlay so background is more visible
          zIndex: 0
        }} />
        
        {/* Content container */}
        <div style={{ position: 'relative', zIndex: 1 }}>
        <div style={{
          background: 'rgba(59, 130, 246, 0.9)', // Blue with transparency
          color: 'white',
          padding: '1rem',
          borderRadius: '0.75rem',
          marginBottom: '1rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          boxShadow: '0 4px 6px rgba(0, 0, 0, 0.3)'
        }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.25rem' }}>🧠 Mindforge Battle</h3>
            <p style={{ margin: '0.25rem 0 0 0', opacity: 0.9 }}>
              Difficulty: {selectedDifficulty.toUpperCase()} • Questions: {stats.questionsAsked} • Accuracy: {Math.round(stats.accuracy * 100)}% • Streak: {stats.currentStreak}
            </p>
          </div>
          <button
            onClick={() => {
              setShowBattle(false);
              setOpponent(null);
            }}
            style={{
              background: 'rgba(255, 255, 255, 0.2)',
              border: '1px solid rgba(255, 255, 255, 0.3)',
              color: 'white',
              padding: '0.5rem 1rem',
              borderRadius: '0.5rem',
              cursor: 'pointer',
              fontSize: '0.875rem'
            }}
          >
            Exit Battle
          </button>
        </div>
        
        {/* Question Display - Show before each turn */}
        {waitingForQuestion && displayedQuestion && !questionAnswered && (
          <div style={{
            background: 'rgba(255, 255, 255, 0.95)', // White with slight transparency
            borderRadius: '0.75rem',
            padding: '2rem',
            marginBottom: '1rem',
            boxShadow: '0 4px 6px rgba(0, 0, 0, 0.3)',
            backdropFilter: 'blur(10px)' // Blur effect for glassmorphism
          }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '1rem'
            }}>
              <h3 style={{ margin: 0, fontSize: '1.25rem', color: '#1f2937' }}>
                {displayedQuestion.question}
              </h3>
              <div style={{
                background: timeRemaining <= 10 ? '#ef4444' : '#3b82f6',
                color: 'white',
                padding: '0.5rem 1rem',
                borderRadius: '0.5rem',
                fontSize: '1.25rem',
                fontWeight: 'bold'
              }}>
                {timeRemaining}s
              </div>
            </div>
            
            {displayedQuestion.type === 'multiple-choice' && displayedQuestion.options && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {displayedQuestion.options.map((option, index) => (
                  <button
                    key={index}
                    onClick={() => setSelectedAnswer(option)}
                    style={{
                      background: selectedAnswer === option ? '#3b82f6' : '#f3f4f6',
                      color: selectedAnswer === option ? 'white' : '#1f2937',
                      border: `2px solid ${selectedAnswer === option ? '#3b82f6' : '#e5e7eb'}`,
                      padding: '1rem',
                      borderRadius: '0.5rem',
                      cursor: 'pointer',
                      fontSize: '1rem',
                      textAlign: 'left',
                      transition: 'all 0.2s'
                    }}
                  >
                    {option}
                  </button>
                ))}
              </div>
            )}
            
            {displayedQuestion.type === 'true-false' && (
              <div style={{ display: 'flex', gap: '1rem' }}>
                <button
                  onClick={() => setSelectedAnswer('True')}
                  style={{
                    background: selectedAnswer === 'True' ? '#3b82f6' : '#f3f4f6',
                    color: selectedAnswer === 'True' ? 'white' : '#1f2937',
                    border: `2px solid ${selectedAnswer === 'True' ? '#3b82f6' : '#e5e7eb'}`,
                    padding: '1rem 2rem',
                    borderRadius: '0.5rem',
                    cursor: 'pointer',
                    fontSize: '1rem',
                    fontWeight: 'bold',
                    flex: 1
                  }}
                >
                  True
                </button>
                <button
                  onClick={() => setSelectedAnswer('False')}
                  style={{
                    background: selectedAnswer === 'False' ? '#3b82f6' : '#f3f4f6',
                    color: selectedAnswer === 'False' ? 'white' : '#1f2937',
                    border: `2px solid ${selectedAnswer === 'False' ? '#3b82f6' : '#e5e7eb'}`,
                    padding: '1rem 2rem',
                    borderRadius: '0.5rem',
                    cursor: 'pointer',
                    fontSize: '1rem',
                    fontWeight: 'bold',
                    flex: 1
                  }}
                >
                  False
                </button>
              </div>
            )}
            
            {displayedQuestion.type === 'short-answer' && (
              <div>
                <textarea
                  value={selectedAnswer}
                  onChange={(e) => setSelectedAnswer(e.target.value)}
                  placeholder="Type your answer here..."
                  style={{
                    width: '100%',
                    minHeight: '100px',
                    padding: '1rem',
                    borderRadius: '0.5rem',
                    border: '2px solid #e5e7eb',
                    fontSize: '1rem',
                    fontFamily: 'inherit'
                  }}
                />
              </div>
            )}
            
            <button
              onClick={() => handleAnswerSubmit(selectedAnswer)}
              disabled={!selectedAnswer || questionAnswered}
              style={{
                marginTop: '1rem',
                background: selectedAnswer && !questionAnswered ? '#3b82f6' : '#9ca3af',
                color: 'white',
                border: 'none',
                padding: '0.75rem 2rem',
                borderRadius: '0.5rem',
                fontSize: '1rem',
                fontWeight: 'bold',
                cursor: selectedAnswer && !questionAnswered ? 'pointer' : 'not-allowed',
                width: '100%'
              }}
            >
              Submit Answer
            </button>
          </div>
        )}
        
        {/* Answer Result Display */}
        {answerResult && (
          <div style={{
            background: answerResult === 'correct' ? '#d1fae5' : '#fee2e2',
            border: `2px solid ${answerResult === 'correct' ? '#3b82f6' : '#ef4444'}`,
            borderRadius: '0.75rem',
            padding: '1.5rem',
            marginBottom: '1rem',
            textAlign: 'center'
          }}>
            <div style={{
              fontSize: '3rem',
              marginBottom: '0.5rem'
            }}>
              {answerResult === 'correct' ? '✅' : '❌'}
            </div>
            <h3 style={{
              fontSize: '1.5rem',
              fontWeight: 'bold',
              color: answerResult === 'correct' ? '#2563eb' : '#dc2626',
              marginBottom: '0.5rem'
            }}>
              {answerResult === 'correct' ? 'Correct!' : 'Incorrect'}
            </h3>
            <p style={{
              color: answerResult === 'correct' ? '#065f46' : '#991b1b',
              margin: 0
            }}>
              {answerResult === 'correct' 
                ? 'Your move fires successfully!'
                : 'Your move fails. Opponent gets a counter hit!'}
            </p>
          </div>
        )}
        
        {!waitingForQuestion && canUseMove && currentQuestionAnswerResult !== null && (
          <BattleEngine 
            onBattleEnd={handleBattleEnd}
            opponent={opponent}
            mindforgeMode={true}
            questionCorrect={currentQuestionAnswerResult === 'correct'}
            onMoveExecuted={handleMoveExecuted}
            initialBattleLog={battleLog} // Pass current log to continue from
            onOpponentUpdate={(updatedOpponent) => {
              // Update Mindforge's opponent state when BattleEngine updates it
              setOpponent(updatedOpponent);
            }}
            onBattleLogUpdate={(log) => {
              // Update Mindforge's battle log state - append new entries instead of replacing
              setBattleLog(prevLog => {
                // Only add new entries that aren't already in the log
                const newEntries = log.filter(entry => !prevLog.includes(entry));
                return [...prevLog, ...newEntries];
              });
            }}
          />
        )}
        
        {!waitingForQuestion && !canUseMove && answerResult && (
          <div style={{
            background: '#f3f4f6',
            borderRadius: '0.75rem',
            padding: '2rem',
            textAlign: 'center',
            color: '#6b7280'
          }}>
            <p>Waiting for next turn...</p>
          </div>
        )}

        {/* Battle Log - Always visible, even during questions */}
        {showBattle && battleLog.length > 0 && (
          <div style={{
            background: 'rgba(31, 41, 55, 0.9)', // Dark grey with transparency
            borderRadius: '0.75rem',
            padding: '1rem',
            marginTop: '1rem',
            maxHeight: '200px',
            overflowY: 'auto',
            border: '2px solid rgba(251, 191, 36, 0.5)', // Gold border to match theme
            boxShadow: '0 4px 6px rgba(0, 0, 0, 0.3)',
            backdropFilter: 'blur(10px)'
          }}>
            <div style={{ 
              fontSize: '0.875rem', 
              fontWeight: 'bold', 
              marginBottom: '0.75rem', 
              textAlign: 'center',
              color: '#fbbf24',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem'
            }}>
              📜 BATTLE LOG
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              {battleLog.map((logEntry, index) => (
                <div 
                  key={index}
                  style={{
                    padding: '0.375rem 0.5rem',
                    borderRadius: '0.25rem',
                    backgroundColor: logEntry.includes('⚔️') ? 'rgba(239, 68, 68, 0.2)' :
                                     logEntry.includes('💰') ? 'rgba(245, 158, 11, 0.2)' :
                                     logEntry.includes('🛡️') ? 'rgba(59, 130, 246, 0.2)' :
                                     logEntry.includes('💚') ? 'rgba(34, 197, 94, 0.2)' :
                                     logEntry.includes('✅') || logEntry.includes('Correct') ? 'rgba(34, 197, 94, 0.2)' :
                                     logEntry.includes('❌') || logEntry.includes('Incorrect') || logEntry.includes('wrong') ? 'rgba(239, 68, 68, 0.2)' :
                                     logEntry.includes('attacked') ? 'rgba(239, 68, 68, 0.2)' :
                                     'rgba(107, 114, 128, 0.2)',
                    borderLeft: logEntry.includes('⚔️') ? '3px solid #ef4444' :
                               logEntry.includes('💰') ? '3px solid #f59e0b' :
                               logEntry.includes('🛡️') ? '3px solid #3b82f6' :
                               logEntry.includes('💚') ? '3px solid #22c55e' :
                               logEntry.includes('✅') || logEntry.includes('Correct') ? '3px solid #22c55e' :
                               logEntry.includes('❌') || logEntry.includes('Incorrect') || logEntry.includes('wrong') ? '3px solid #ef4444' :
                               logEntry.includes('attacked') ? '3px solid #ef4444' :
                               '3px solid #6b7280',
                    color: '#e5e7eb',
                    fontSize: '0.8125rem',
                    wordWrap: 'break-word'
                  }}
                >
                  {logEntry}
                </div>
              ))}
            </div>
          </div>
        )}
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: '2rem' }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '2rem'
      }}>
        <div>
          <h2 style={{
            fontSize: '2rem',
            fontWeight: 'bold',
            background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            marginBottom: '0.5rem'
          }}>
            🧠 Mindforge
          </h2>
          <p style={{ color: '#6b7280', fontSize: '1rem' }}>
            Turn knowledge into power
          </p>
        </div>
        <button
          onClick={onBack}
          style={{
            background: 'linear-gradient(135deg, #6b7280 0%, #4b5563 100%)',
            color: 'white',
            border: 'none',
            padding: '0.75rem 1.5rem',
            borderRadius: '0.5rem',
            cursor: 'pointer',
            fontSize: '0.875rem',
            fontWeight: '500'
          }}
        >
          ← Back to Modes
        </button>
      </div>

      {/* Mindforge Info Banner */}
      <div style={{
        background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
        color: 'white',
        padding: '2rem',
        borderRadius: '0.75rem',
        marginBottom: '2rem',
        textAlign: 'center'
      }}>
        <div style={{ fontSize: '3rem', marginBottom: '0.5rem' }}>🧠</div>
        <h3 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>
          Mindforge: Study-Powered Battle
        </h3>
        <p style={{ fontSize: '1rem', opacity: 0.9, margin: 0, lineHeight: '1.6' }}>
          Face off against an opponent while answering questions from your classes. Each correct answer charges your Manifest and Elemental moves, fuels your Generator, and lets you strike. Wrong answers leave you exposed — your attacks fizzle, and your opponent can punish your mistakes.
        </p>
        <p style={{ fontSize: '0.875rem', opacity: 0.8, marginTop: '1rem', fontStyle: 'italic' }}>
          Select your class to begin answering questions from your course material
        </p>
      </div>

      {/* Class Selection */}
      <div style={{ marginBottom: '2rem' }}>
        <h3 style={{
          fontSize: '1.5rem',
          fontWeight: 'bold',
          marginBottom: '1rem',
          color: '#374151'
        }}>
          Select Your Class
        </h3>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: '1rem',
          marginBottom: '2rem'
        }}>
          {([
            { id: 'graphic-design' as const, name: 'Graphic Design', icon: '🎨', description: 'Learn design principles, color theory, and visual composition' },
            { id: 'ux-ui-design' as const, name: 'UX/UI Design', icon: '💡', description: 'Master user experience and interface design concepts' }
          ]).map((classOption) => {
            const isSelected = selectedClass === classOption.id;
            
            return (
              <div
                key={classOption.id}
                onClick={() => setSelectedClass(classOption.id)}
                style={{
                  background: isSelected ? '#3b82f6' : 'white',
                  border: `2px solid ${isSelected ? '#3b82f6' : '#e5e7eb'}`,
                  borderRadius: '0.75rem',
                  padding: '2rem',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  transform: isSelected ? 'scale(1.02)' : 'scale(1)',
                  boxShadow: isSelected ? '0 4px 12px rgba(59, 130, 246, 0.3)' : '0 2px 4px rgba(0,0,0,0.1)'
                }}
              >
                <div style={{
                  fontSize: '3rem',
                  marginBottom: '0.5rem',
                  textAlign: 'center'
                }}>
                  {classOption.icon}
                </div>
                <h4 style={{
                  fontSize: '1.25rem',
                  fontWeight: 'bold',
                  color: isSelected ? 'white' : '#374151',
                  marginBottom: '0.5rem',
                  textAlign: 'center'
                }}>
                  {classOption.name}
                </h4>
                <p style={{
                  fontSize: '0.875rem',
                  color: isSelected ? 'rgba(255,255,255,0.9)' : '#6b7280',
                  margin: 0,
                  textAlign: 'center'
                }}>
                  {classOption.description}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Difficulty Selection */}
      {selectedClass && (
        <div style={{ marginBottom: '2rem' }}>
          <h3 style={{
            fontSize: '1.5rem',
            fontWeight: 'bold',
            marginBottom: '1rem',
            color: '#374151'
          }}>
            Select Difficulty
          </h3>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '1rem'
        }}>
          {(['standard', 'advanced', 'exam'] as const).map((difficulty) => {
            const difficultyInfo = {
              standard: { name: 'Standard', color: '#3b82f6', multiplier: '1.0x' },
              advanced: { name: 'Advanced', color: '#f59e0b', multiplier: '1.3x' },
              exam: { name: 'Exam Mode', color: '#ef4444', multiplier: '1.6x' }
            };
            
            const info = difficultyInfo[difficulty];
            const isSelected = selectedDifficulty === difficulty;
            // Get completion count for the selected class and difficulty
            const classCompletions = selectedClass ? (levelCompletions[selectedClass] || {}) : {};
            const completionCount = classCompletions[difficulty] || 0;
            const isCompleted = completionCount > 0;
            const hasMaxPPRewards = completionCount >= 3; // After 3, PP is capped at 10
            const hasQuestions = hasQuestionsForDifficulty(selectedClass, difficulty);
            
            return (
              <div
                key={difficulty}
                onClick={() => {
                  if (hasQuestions) {
                    setSelectedDifficulty(difficulty);
                  }
                }}
                style={{
                  background: isSelected ? info.color : 'white',
                  border: `2px solid ${info.color}`,
                  borderRadius: '0.75rem',
                  padding: '1.5rem',
                  cursor: hasQuestions ? 'pointer' : 'not-allowed',
                  transition: 'all 0.2s',
                  transform: isSelected ? 'scale(1.02)' : 'scale(1)',
                  boxShadow: isSelected ? `0 4px 12px ${info.color}40` : '0 2px 4px rgba(0,0,0,0.1)',
                  position: 'relative',
                  opacity: hasQuestions ? 1 : 0.5
                }}
              >
                {/* Completion Badge */}
                {isCompleted && (
                  <div style={{
                    position: 'absolute',
                    top: '0.5rem',
                    right: '0.5rem',
                    background: '#10b981',
                    color: 'white',
                    borderRadius: '50%',
                    width: '28px',
                    height: '28px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '1rem',
                    fontWeight: 'bold',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
                    zIndex: 10
                  }}>
                    ✓
                  </div>
                )}
                
                <h4 style={{
                  fontSize: '1.25rem',
                  fontWeight: 'bold',
                  color: isSelected ? 'white' : info.color,
                  marginBottom: '0.5rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem'
                }}>
                  {info.name}
                  {isCompleted && (
                    <span style={{ fontSize: '0.875rem', opacity: 0.8, fontWeight: 'normal' }}>
                      ({completionCount}×)
                    </span>
                  )}
                </h4>
                <p style={{
                  fontSize: '0.875rem',
                  color: isSelected ? 'rgba(255,255,255,0.9)' : '#6b7280',
                  margin: 0
                }}>
                  Reward Multiplier: {info.multiplier}
                </p>
                {hasMaxPPRewards && (
                  <p style={{ 
                    fontSize: '0.75rem', 
                    color: isSelected ? '#fbbf24' : '#f59e0b',
                    marginTop: '0.5rem',
                    fontWeight: 'bold',
                    fontStyle: 'italic'
                  }}>
                    ⚠ PP capped at 10 per completion
                  </p>
                )}
                {difficulty === 'standard' && (
                  <p style={{ fontSize: '0.75rem', color: isSelected ? 'rgba(255,255,255,0.8)' : '#9ca3af', marginTop: '0.5rem' }}>
                    Regular class questions
                  </p>
                )}
                {difficulty === 'advanced' && (
                  <p style={{ fontSize: '0.75rem', color: isSelected ? 'rgba(255,255,255,0.8)' : '#9ca3af', marginTop: '0.5rem' }}>
                    Harder, multi-step questions
                  </p>
                )}
                {difficulty === 'exam' && (
                  <p style={{ fontSize: '0.75rem', color: isSelected ? 'rgba(255,255,255,0.8)' : '#9ca3af', marginTop: '0.5rem' }}>
                    Mixed difficulty, best rewards
                  </p>
                )}
                {!hasQuestions && (
                  <p style={{ 
                    fontSize: '0.875rem', 
                    color: isSelected ? 'rgba(255,255,255,0.9)' : '#ef4444',
                    marginTop: '0.75rem',
                    fontWeight: 'bold',
                    textAlign: 'center',
                    padding: '0.5rem',
                    background: isSelected ? 'rgba(255,255,255,0.2)' : '#fee2e2',
                    borderRadius: '0.5rem'
                  }}>
                    This Level is Unavailable at the Moment
                  </p>
                )}
              </div>
            );
          })}
        </div>
        </div>
      )}

      {/* Stats Display */}
      <div style={{
        background: 'white',
        borderRadius: '0.75rem',
        padding: '1.5rem',
        marginBottom: '2rem',
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
      }}>
        <h3 style={{
          fontSize: '1.25rem',
          fontWeight: 'bold',
          marginBottom: '1rem',
          color: '#374151'
        }}>
          Today's Progress
        </h3>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: '1rem'
        }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#3b82f6' }}>
              {stats.questionsAsked}
            </div>
            <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>Questions</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#3b82f6' }}>
              {Math.round(stats.accuracy * 100)}%
            </div>
            <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>Accuracy</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#3b82f6' }}>
              {stats.longestStreak}
            </div>
            <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>Best Streak</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#3b82f6' }}>
              {stats.dailyPPEarned}/300
            </div>
            <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>Daily PP</div>
          </div>
        </div>
      </div>

      {/* Start Button */}
      <div style={{ textAlign: 'center' }}>
        <button
          onClick={startBattle}
          disabled={!selectedClass || !hasQuestionsForDifficulty(selectedClass, selectedDifficulty)}
          style={{
            background: (selectedClass && hasQuestionsForDifficulty(selectedClass, selectedDifficulty))
              ? 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)' 
              : 'linear-gradient(135deg, #9ca3af 0%, #6b7280 100%)',
            color: 'white',
            border: 'none',
            padding: '1rem 3rem',
            borderRadius: '0.75rem',
            fontSize: '1.25rem',
            fontWeight: 'bold',
            cursor: (selectedClass && hasQuestionsForDifficulty(selectedClass, selectedDifficulty)) ? 'pointer' : 'not-allowed',
            boxShadow: (selectedClass && hasQuestionsForDifficulty(selectedClass, selectedDifficulty))
              ? '0 4px 12px rgba(59, 130, 246, 0.3)' 
              : '0 2px 4px rgba(0,0,0,0.1)',
            transition: 'all 0.2s',
            opacity: (selectedClass && hasQuestionsForDifficulty(selectedClass, selectedDifficulty)) ? 1 : 0.6
          }}
          onMouseEnter={(e) => {
            if (selectedClass && hasQuestionsForDifficulty(selectedClass, selectedDifficulty)) {
              e.currentTarget.style.transform = 'scale(1.05)';
              e.currentTarget.style.boxShadow = '0 6px 16px rgba(59, 130, 246, 0.4)';
            }
          }}
          onMouseLeave={(e) => {
            if (selectedClass && hasQuestionsForDifficulty(selectedClass, selectedDifficulty)) {
              e.currentTarget.style.transform = 'scale(1)';
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(59, 130, 246, 0.3)';
            }
          }}
        >
          🧠 {!selectedClass 
            ? 'Select a Class First' 
            : !hasQuestionsForDifficulty(selectedClass, selectedDifficulty)
            ? 'This Level is Unavailable'
            : 'Enter Mindforge'}
        </button>
      </div>

      {/* Battle Results Modal */}
      {showResultsModal && battleResults && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.8)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10000,
          padding: '2rem'
        }}>
          <div style={{
            background: 'white',
            borderRadius: '1rem',
            padding: '2rem',
            maxWidth: '800px',
            width: '100%',
            maxHeight: '90vh',
            overflowY: 'auto',
            boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
            position: 'relative'
          }}>
            {/* Close button */}
            <button
              onClick={() => {
                setShowResultsModal(false);
                setBattleResults(null);
              }}
              style={{
                position: 'absolute',
                top: '1rem',
                right: '1rem',
                background: '#ef4444',
                color: 'white',
                border: 'none',
                borderRadius: '50%',
                width: '32px',
                height: '32px',
                cursor: 'pointer',
                fontSize: '1.25rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 'bold'
              }}
            >
              ×
            </button>

            <div style={{ display: 'flex', gap: '2rem', alignItems: 'flex-start' }}>
              {/* Opponent Image */}
              <div style={{ flex: '0 0 300px' }}>
                {getOpponentImageForModal(selectedDifficulty) ? (
                  <img
                    src={getOpponentImageForModal(selectedDifficulty)!}
                    alt="Opponent"
                    style={{
                      width: '100%',
                      height: 'auto',
                      borderRadius: '0.5rem',
                      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)'
                    }}
                  />
                ) : (
                  <div style={{
                    width: '100%',
                    aspectRatio: '1',
                    background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                    borderRadius: '0.5rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '4rem',
                    color: 'white',
                    fontWeight: 'bold'
                  }}>
                    {opponent?.name?.[0]?.toUpperCase() || 'M'}
                  </div>
                )}
                <div style={{
                  marginTop: '1rem',
                  textAlign: 'center',
                  fontSize: '1.1rem',
                  fontWeight: 'bold',
                  color: '#374151'
                }}>
                  {opponent?.name || 'Mindforge Opponent'}
                </div>
                <div style={{
                  marginTop: '0.5rem',
                  textAlign: 'center',
                  fontSize: '0.875rem',
                  color: '#6b7280'
                }}>
                  {selectedDifficulty.charAt(0).toUpperCase() + selectedDifficulty.slice(1)} Difficulty
                </div>
              </div>

              {/* Battle Results */}
              <div style={{ flex: 1 }}>
                <h2 style={{
                  fontSize: '2rem',
                  fontWeight: 'bold',
                  marginBottom: '1rem',
                  color: battleResults.result === 'victory' ? '#059669' : '#dc2626',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem'
                }}>
                  {battleResults.result === 'victory' ? '🎉 Victory!' : battleResults.result === 'defeat' ? '💀 Defeat' : '🏃 Escaped'}
                </h2>

                {/* Battle Statistics */}
                <div style={{
                  background: '#f9fafb',
                  borderRadius: '0.5rem',
                  padding: '1.5rem',
                  marginBottom: '1.5rem'
                }}>
                  <h3 style={{
                    fontSize: '1.25rem',
                    fontWeight: 'bold',
                    marginBottom: '1rem',
                    color: '#374151'
                  }}>
                    Battle Statistics
                  </h3>
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(2, 1fr)',
                    gap: '1rem'
                  }}>
                    <div>
                      <div style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.25rem' }}>Questions Asked</div>
                      <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#1f2937' }}>
                        {battleResults.stats.questionsAsked}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.25rem' }}>Correct Answers</div>
                      <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#059669' }}>
                        {battleResults.stats.correctAnswers}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.25rem' }}>Accuracy</div>
                      <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#3b82f6' }}>
                        {Math.round(battleResults.stats.accuracy * 100)}%
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.25rem' }}>Longest Streak</div>
                      <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#f59e0b' }}>
                        {battleResults.stats.longestStreak}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Rewards */}
                <div style={{
                  background: battleResults.result === 'victory' 
                    ? 'linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%)'
                    : 'linear-gradient(135deg, #fee2e2 0%, #fecaca 100%)',
                  borderRadius: '0.5rem',
                  padding: '1.5rem',
                  marginBottom: '1.5rem',
                  border: `2px solid ${battleResults.result === 'victory' ? '#059669' : '#dc2626'}`
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
                    gap: '1.5rem',
                    flexWrap: 'wrap'
                  }}>
                    <div style={{
                      background: '#fbbf24',
                      color: '#1f2937',
                      padding: '1rem',
                      borderRadius: '0.5rem',
                      minWidth: '120px',
                      textAlign: 'center'
                    }}>
                      <div style={{ fontSize: '0.875rem', marginBottom: '0.25rem', opacity: 0.8 }}>Power Points</div>
                      <div style={{ fontSize: '1.75rem', fontWeight: 'bold', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.25rem' }}>
                        {battleResults.rewards.originalPP && battleResults.rewards.originalPP !== battleResults.rewards.pp ? (
                          <>
                            <div style={{ fontSize: '0.875rem', opacity: 0.7, textDecoration: 'line-through' }}>
                              {battleResults.rewards.originalPP}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                              <span>+{battleResults.rewards.pp}</span>
                              <span style={{ fontSize: '1rem', color: '#f59e0b', fontWeight: 'bold' }}>×2</span>
                            </div>
                            <div style={{ fontSize: '0.75rem', marginTop: '0.25rem', color: '#059669', fontWeight: 'bold' }}>
                              ⚡ Double PP Boost!
                            </div>
                          </>
                        ) : (
                          <span>+{battleResults.rewards.pp}</span>
                        )}
                      </div>
                    </div>
                    <div style={{
                      background: '#3b82f6',
                      color: 'white',
                      padding: '1rem',
                      borderRadius: '0.5rem',
                      minWidth: '120px',
                      textAlign: 'center'
                    }}>
                      <div style={{ fontSize: '0.875rem', marginBottom: '0.25rem', opacity: 0.9 }}>Experience</div>
                      <div style={{ fontSize: '1.75rem', fontWeight: 'bold' }}>+{battleResults.rewards.xp}</div>
                    </div>
                    {battleResults.rewards.tmShards > 0 && (
                      <div style={{
                        background: 'linear-gradient(135deg, #9ca3af 0%, #6b7280 100%)',
                        color: 'white',
                        padding: '1rem',
                        borderRadius: '0.5rem',
                        minWidth: '120px',
                        textAlign: 'center',
                        border: '1px solid #4b5563',
                        boxShadow: '0 1px 2px rgba(0,0,0,0.2)'
                      }}>
                        <div style={{ fontSize: '0.875rem', marginBottom: '0.25rem', opacity: 0.9 }}>TM Shards</div>
                        <div style={{ fontSize: '1.75rem', fontWeight: 'bold' }}>+{battleResults.rewards.tmShards}</div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Close Button */}
                <button
                  onClick={() => {
                    setShowResultsModal(false);
                    setBattleResults(null);
                  }}
                  style={{
                    width: '100%',
                    background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                    color: 'white',
                    border: 'none',
                    padding: '1rem',
                    borderRadius: '0.5rem',
                    fontSize: '1.125rem',
                    fontWeight: 'bold',
                    cursor: 'pointer',
                    boxShadow: '0 4px 12px rgba(59, 130, 246, 0.3)',
                    transition: 'all 0.2s'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'scale(1.02)';
                    e.currentTarget.style.boxShadow = '0 6px 16px rgba(59, 130, 246, 0.4)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'scale(1)';
                    e.currentTarget.style.boxShadow = '0 4px 12px rgba(59, 130, 246, 0.3)';
                  }}
                >
                  Continue
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Mindforge;

