import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  writeBatch,
  Timestamp,
  increment,
  serverTimestamp,
  addDoc
} from 'firebase/firestore';
import { db } from '../firebase';
import {
  Class,
  Assessment,
  AssessmentGoal,
  AssessmentResult,
  PPLedgerEntry,
  ArtifactReward,
  HabitSubmission,
  HabitDuration,
  HabitSubmissionStatus,
  HabitVerification
} from '../types/assessmentGoals';
import {
  generateGoalId,
  generateResultId,
  computePPChange
} from './assessmentGoals';
import { arrayUnion, runTransaction } from 'firebase/firestore';
import { updateHeroJourneyProgress } from './heroJourneyProgress';

// Artifact lookup data (matches Marketplace.tsx artifacts list)
const ARTIFACT_LOOKUP: { [key: string]: { description: string; icon: string; image: string; category: 'time' | 'protection' | 'food' | 'special'; rarity: 'common' | 'rare' | 'epic' | 'legendary' } } = {
  'checkin-free': { description: 'Skip the next check-in requirement', icon: '🎫', image: '/images/Get-Out-of-Check-in-Free.png', category: 'protection', rarity: 'common' },
  'shield': { description: 'Block the next incoming attack on your vault', icon: '🛡️', image: '/images/Shield Item.jpeg', category: 'protection', rarity: 'common' },
  'health-potion-25': { description: 'Restore 25 HP to your vault health', icon: '🧪', image: '/images/Health Potion - 25.png', category: 'protection', rarity: 'common' },
  'lunch-mosley': { description: 'Enjoy a special lunch with Mr. Mosley', icon: '🍽️', image: 'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?auto=format&fit=facearea&w=256&h=256&facepad=2', category: 'food', rarity: 'legendary' },
  'forge-token': { description: 'Redeem for any custom item you want printed from The Forge (3D Printer)', icon: '🛠️', image: '/images/Forge Token.png', category: 'special', rarity: 'legendary' },
  'uxp-credit-1': { description: 'Credit to be added to any non-assessment assignment', icon: '📕', image: 'https://images.unsplash.com/photo-1481627834876-b7833e8f5570?auto=format&fit=facearea&w=256&h=256&facepad=2', category: 'special', rarity: 'common' },
  'uxp-credit': { description: 'Credit to be added to any non-assessment assignment', icon: '📚', image: 'https://images.unsplash.com/photo-1481627834876-b7833e8f5570?auto=format&fit=facearea&w=256&h=256&facepad=2', category: 'special', rarity: 'common' },
  'uxp-credit-4': { description: 'Enhanced credit to be added to any non-assessment assignment', icon: '📖', image: 'https://images.unsplash.com/photo-1481627834876-b7833e8f5570?auto=format&fit=facearea&w=256&h=256&facepad=2', category: 'special', rarity: 'rare' },
  'double-pp': { description: 'Double any PP you receive for the next 4 hours', icon: '⚡', image: '/images/Double PP.png', category: 'special', rarity: 'epic' },
  'skip-the-line': { description: 'Skip the line and be the next up to use the pass to leave', icon: '🚀', image: '/images/Skip the Line.png', category: 'special', rarity: 'common' },
  'work-extension': { description: 'Complete assignments that were past due and normally would no longer be graded', icon: '📝', image: 'https://images.unsplash.com/photo-1434030216411-0b793f4b4173?auto=format&fit=facearea&w=256&h=256&facepad=2', category: 'special', rarity: 'common' },
  'instant-a': { description: 'Grants an automatic A for the trimester, no matter what your grade may actually be. Limited to one user per class.', icon: '⭐', image: '/images/Instant A.png', category: 'special', rarity: 'legendary' },
  'blaze-ring': { description: 'Adds +1 Level to all Fire Elemental Moves. Equip to a ring slot to activate.', icon: '💍', image: '/images/Blaze Ring.png', category: 'special', rarity: 'epic' },
  'terra-ring': { description: 'Adds +1 Level to all Earth Elemental Moves. Equip to a ring slot to activate.', icon: '💍', image: '/images/Terra Ring.png', category: 'special', rarity: 'epic' },
  'aqua-ring': { description: 'Adds +1 Level to all Water Elemental Moves. Equip to a ring slot to activate.', icon: '💍', image: '/images/Aqua Ring.png', category: 'special', rarity: 'epic' },
  'air-ring': { description: 'Adds +1 Level to all Air Elemental Moves. Equip to a ring slot to activate.', icon: '💍', image: '/images/Air Ring.png', category: 'special', rarity: 'epic' },
  'instant-regrade-pass': { description: 'Allows players to get assignments regraded without coming in person. Lasts for 1 day.', icon: '📋', image: '/images/Instant Regrade Pass.png', category: 'special', rarity: 'common' },
  'captain-helmet': { description: "Captain's Helmet - A rare artifact", icon: '⛑️', image: '', category: 'special', rarity: 'rare' }
};

// ============================================================================
// Classes Collection (using existing 'classrooms' collection)
// ============================================================================

/**
 * Gets a class by ID (from classrooms collection).
 */
export async function getClass(classId: string): Promise<Class | null> {
  const classRef = doc(db, 'classrooms', classId);
  const classDoc = await getDoc(classRef);
  if (!classDoc.exists()) return null;
  const data = classDoc.data();
  // Map classrooms structure to Class interface
  return { 
    id: classDoc.id, 
    name: data.name || '',
    teacherAdminId: '', // Will need to be set separately or inferred
    studentIds: data.students || [],
    createdAt: data.createdAt ? Timestamp.fromDate(data.createdAt.toDate()) : Timestamp.now(),
    updatedAt: Timestamp.now()
  } as Class;
}

/**
 * Gets all classes for a teacher/admin (from classrooms collection).
 * Note: This assumes admin has access to all classrooms. You may need to add teacherAdminId to classrooms.
 */
export async function getClassesByTeacher(teacherAdminId: string): Promise<Class[]> {
  const classesRef = collection(db, 'classrooms');
  const snapshot = await getDocs(classesRef);
  return snapshot.docs.map(doc => {
    const data = doc.data();
    return {
      id: doc.id,
      name: data.name || '',
      teacherAdminId: teacherAdminId,
      studentIds: data.students || [],
      createdAt: data.createdAt ? Timestamp.fromDate(data.createdAt.toDate()) : Timestamp.now(),
      updatedAt: Timestamp.now()
    } as Class;
  });
}

/**
 * Gets all classes a student is enrolled in (from classrooms collection).
 */
export async function getClassesByStudent(studentId: string): Promise<Class[]> {
  const classesRef = collection(db, 'classrooms');
  const q = query(classesRef, where('students', 'array-contains', studentId));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => {
    const data = doc.data();
    return {
      id: doc.id,
      name: data.name || '',
      teacherAdminId: '', // Will need to be inferred or set
      studentIds: data.students || [],
      createdAt: data.createdAt ? Timestamp.fromDate(data.createdAt.toDate()) : Timestamp.now(),
      updatedAt: Timestamp.now()
    } as Class;
  });
}

// ============================================================================
// Assessments Collection
// ============================================================================

/**
 * Creates a new assessment.
 */
export async function createAssessment(assessmentData: Omit<Assessment, 'id'>): Promise<string> {
  const assessmentsRef = collection(db, 'assessments');
  const newAssessmentRef = doc(assessmentsRef);
  const newAssessment: Assessment = {
    id: newAssessmentRef.id,
    ...assessmentData,
    numGoalsSet: 0,
    numGraded: 0,
    numApplied: 0,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now()
  };
  await setDoc(newAssessmentRef, newAssessment);
  return newAssessmentRef.id;
}

/**
 * Gets an assessment by ID.
 */
export async function getAssessment(assessmentId: string): Promise<Assessment | null> {
  const assessmentRef = doc(db, 'assessments', assessmentId);
  const assessmentDoc = await getDoc(assessmentRef);
  if (!assessmentDoc.exists()) return null;
  return { id: assessmentDoc.id, ...assessmentDoc.data() } as Assessment;
}

/**
 * Gets all assessments for a class.
 */
export async function getAssessmentsByClass(classId: string): Promise<Assessment[]> {
  const assessmentsRef = collection(db, 'assessments');
  const q = query(
    assessmentsRef,
    where('classId', '==', classId)
    // Note: orderBy removed to avoid requiring composite index
    // If sorting is needed, sort in-memory after fetching
  );
  const snapshot = await getDocs(q);
  const assessments = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Assessment));
  
  // Sort by date descending in-memory
  assessments.sort((a, b) => {
    const dateA = a.date?.toMillis?.() || 0;
    const dateB = b.date?.toMillis?.() || 0;
    return dateB - dateA;
  });
  
  return assessments;
}

/**
 * Updates an assessment.
 */
export async function updateAssessment(
  assessmentId: string,
  updates: Partial<Assessment>
): Promise<void> {
  const assessmentRef = doc(db, 'assessments', assessmentId);
  await updateDoc(assessmentRef, {
    ...updates,
    updatedAt: Timestamp.now()
  });
}

/**
 * Locks an assessment (prevents students from changing goals).
 */
export async function lockAssessment(assessmentId: string): Promise<void> {
  await updateAssessment(assessmentId, { isLocked: true });
}

/**
 * Unlocks an assessment.
 */
export async function unlockAssessment(assessmentId: string): Promise<void> {
  await updateAssessment(assessmentId, { isLocked: false });
}

/**
 * Deletes an assessment and optionally related data (goals, results).
 * WARNING: This is a destructive operation. Related goals and results will also be deleted.
 */
export async function deleteAssessment(
  assessmentId: string,
  deleteRelated: boolean = true
): Promise<void> {
  const assessmentRef = doc(db, 'assessments', assessmentId);
  
  if (deleteRelated) {
    // Delete all related goals
    const goalsRef = collection(db, 'assessmentGoals');
    const goalsQuery = query(goalsRef, where('assessmentId', '==', assessmentId));
    const goalsSnapshot = await getDocs(goalsQuery);
    const deleteGoalsPromises = goalsSnapshot.docs.map(goalDoc => deleteDoc(goalDoc.ref));
    
    // Delete all related results
    const resultsRef = collection(db, 'assessmentResults');
    const resultsQuery = query(resultsRef, where('assessmentId', '==', assessmentId));
    const resultsSnapshot = await getDocs(resultsQuery);
    const deleteResultsPromises = resultsSnapshot.docs.map(resultDoc => deleteDoc(resultDoc.ref));
    
    // Delete all related ledger entries
    const ledgerRef = collection(db, 'ppLedger');
    const ledgerQuery = query(ledgerRef, where('assessmentId', '==', assessmentId));
    const ledgerSnapshot = await getDocs(ledgerQuery);
    const deleteLedgerPromises = ledgerSnapshot.docs.map(ledgerDoc => deleteDoc(ledgerDoc.ref));
    
    // Delete everything in parallel
    await Promise.all([
      deleteDoc(assessmentRef),
      ...deleteGoalsPromises,
      ...deleteResultsPromises,
      ...deleteLedgerPromises
    ]);
  } else {
    // Only delete the assessment document
    await deleteDoc(assessmentRef);
  }
}

// ============================================================================
// Assessment Goals Collection
// ============================================================================

/**
 * Creates or updates a student's goal for an assessment.
 */
export async function setAssessmentGoal(
  assessmentId: string,
  studentId: string,
  goalScore: number | undefined,
  classId: string,
  evidence?: string | null,
  textGoal?: string
): Promise<void> {
  const goalId = generateGoalId(assessmentId, studentId);
  const goalRef = doc(db, 'assessmentGoals', goalId);
  
  // Check if goal already exists to determine if we should increment numGoalsSet
  const existingGoal = await getDoc(goalRef);
  const isNewGoal = !existingGoal.exists();
  
  const goalData: AssessmentGoal = {
    id: goalId,
    assessmentId,
    classId,
    studentId,
    ...(goalScore !== undefined && { goalScore }),
    ...(textGoal !== undefined && { textGoal }),
    evidence: evidence || null,
    createdAt: existingGoal.exists() ? existingGoal.data().createdAt : Timestamp.now(),
    updatedAt: Timestamp.now(),
    locked: false
  };
  
  await setDoc(goalRef, goalData);
  
  // Increment numGoalsSet on assessment only if this is a new goal
  if (isNewGoal) {
    const assessmentRef = doc(db, 'assessments', assessmentId);
    await updateDoc(assessmentRef, {
      numGoalsSet: increment(1)
    });
  }
}

/**
 * Gets a student's goal for an assessment.
 */
export async function getAssessmentGoal(
  assessmentId: string,
  studentId: string
): Promise<AssessmentGoal | null> {
  const goalId = generateGoalId(assessmentId, studentId);
  const goalRef = doc(db, 'assessmentGoals', goalId);
  const goalDoc = await getDoc(goalRef);
  if (!goalDoc.exists()) return null;
  return { id: goalDoc.id, ...goalDoc.data() } as AssessmentGoal;
}

/**
 * Gets all goals for an assessment.
 */
export async function getGoalsByAssessment(assessmentId: string): Promise<AssessmentGoal[]> {
  const goalsRef = collection(db, 'assessmentGoals');
  const q = query(goalsRef, where('assessmentId', '==', assessmentId));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as AssessmentGoal));
}

/**
 * Deletes a student's goal (if allowed).
 */
export async function deleteAssessmentGoal(assessmentId: string, studentId: string): Promise<void> {
  const goalId = generateGoalId(assessmentId, studentId);
  const goalRef = doc(db, 'assessmentGoals', goalId);
  await deleteDoc(goalRef);
}

// ============================================================================
// Assessment Results Collection
// ============================================================================

/**
 * Creates or updates an assessment result (admin only).
 */
export async function setAssessmentResult(
  assessmentId: string,
  studentId: string,
  actualScore: number,
  gradedBy: string
): Promise<void> {
  const resultId = generateResultId(assessmentId, studentId);
  const resultRef = doc(db, 'assessmentResults', resultId);
  
  // Get goal and assessment to compute PP change
  const [goal, assessment] = await Promise.all([
    getAssessmentGoal(assessmentId, studentId),
    getAssessment(assessmentId)
  ]);
  
  if (!assessment) {
    throw new Error('Assessment not found');
  }
  
  let computedDelta: number | undefined;
  let computedAbsDiff: number | undefined;
  let outcome: 'hit' | 'miss' | 'exceed' | undefined;
  let ppChange: number | undefined;
  
  let artifactsGranted: ArtifactReward[] | undefined;
  
  if (goal && goal.goalScore !== undefined && assessment.type !== 'story-goal') {
    // Only compute PP change for numeric goals (not Story Goals which are text-based)
    const computation = computePPChange(goal.goalScore, actualScore, assessment);
    computedDelta = computation.delta;
    computedAbsDiff = computation.absDiff;
    outcome = computation.outcome;
    ppChange = computation.ppChange;
    artifactsGranted = computation.artifactsGranted;
  } else if (goal && assessment.type === 'story-goal') {
    // For Story Goals, we might want to handle completion differently
    // For now, we'll skip numeric computation - Story Goals completion is handled via Hero's Journey
    // If you want to add PP rewards for Story Goals, you can add that logic here
  }
  
  const resultData: any = {
    id: resultId,
    assessmentId,
    studentId,
    actualScore,
    gradedBy,
    gradedAt: Timestamp.now(),
    computedDelta,
    computedAbsDiff,
    outcome,
    ppChange,
    applied: false
  };
  
  // Only include artifactsGranted if it exists and has items
  if (artifactsGranted && artifactsGranted.length > 0) {
    resultData.artifactsGranted = artifactsGranted;
    console.log(`💾 Saving result with ${artifactsGranted.length} artifact(s) for student ${studentId}:`, artifactsGranted);
  } else {
    console.log(`ℹ️ No artifacts to save for student ${studentId} (artifactsGranted:`, artifactsGranted, ')');
  }
  
  await setDoc(resultRef, resultData);
  console.log(`✅ Result saved for student ${studentId} with data:`, {
    actualScore,
    ppChange,
    outcome,
    hasArtifactsGranted: !!resultData.artifactsGranted,
    artifactsCount: resultData.artifactsGranted?.length || 0
  });
  
  // Increment numGraded on assessment
  const assessmentRef = doc(db, 'assessments', assessmentId);
  await updateDoc(assessmentRef, {
    numGraded: increment(1),
    gradingStatus: 'graded' as const
  });
}

/**
 * Gets an assessment result.
 */
export async function getAssessmentResult(
  assessmentId: string,
  studentId: string
): Promise<AssessmentResult | null> {
  const resultId = generateResultId(assessmentId, studentId);
  const resultRef = doc(db, 'assessmentResults', resultId);
  const resultDoc = await getDoc(resultRef);
  if (!resultDoc.exists()) return null;
  return { id: resultDoc.id, ...resultDoc.data() } as AssessmentResult;
}

/**
 * Gets all results for an assessment.
 */
export async function getResultsByAssessment(assessmentId: string): Promise<AssessmentResult[]> {
  const resultsRef = collection(db, 'assessmentResults');
  const q = query(resultsRef, where('assessmentId', '==', assessmentId));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as AssessmentResult));
}

// ============================================================================
// PP Ledger Collection
// ============================================================================

/**
 * Creates a PP ledger entry.
 */
export async function createPPLedgerEntry(
  studentId: string,
  sourceId: string,
  amount: number,
  notes?: string,
  assessmentId?: string,
  goalScore?: number,
  actualScore?: number,
  outcome?: 'hit' | 'miss' | 'exceed'
): Promise<string> {
  const ledgerRef = collection(db, 'ppLedger');
  const newEntryRef = doc(ledgerRef);
  
  const entry: PPLedgerEntry = {
    id: newEntryRef.id,
    studentId,
    sourceType: 'assessmentGoal',
    sourceId,
    amount,
    createdAt: Timestamp.now(),
    notes,
    assessmentId,
    goalScore,
    actualScore,
    outcome
  };
  
  await setDoc(newEntryRef, entry);
  return newEntryRef.id;
}

/**
 * Gets PP ledger entries for a student.
 */
export async function getPPLedgerEntriesByStudent(studentId: string): Promise<PPLedgerEntry[]> {
  const ledgerRef = collection(db, 'ppLedger');
  const q = query(
    ledgerRef,
    where('studentId', '==', studentId),
    orderBy('createdAt', 'desc')
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as PPLedgerEntry));
}

/**
 * Gets PP ledger entries for an assessment.
 */
export async function getPPLedgerEntriesByAssessment(assessmentId: string): Promise<PPLedgerEntry[]> {
  const ledgerRef = collection(db, 'ppLedger');
  const q = query(
    ledgerRef,
    where('assessmentId', '==', assessmentId),
    orderBy('createdAt', 'desc')
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as PPLedgerEntry));
}

// ============================================================================
// Apply PP Changes (Idempotent)
// ============================================================================

/**
 * Applies PP changes for all unapplied results in an assessment.
 * This function is idempotent and uses transactions to ensure safety.
 */
export async function applyAssessmentResults(assessmentId: string): Promise<{
  success: boolean;
  appliedCount: number;
  errors: string[];
}> {
  const errors: string[] = [];
  let appliedCount = 0;
  
  // Get all results that haven't been applied yet
  const results = await getResultsByAssessment(assessmentId);
  const unappliedResults = results.filter(r => !r.applied && r.ppChange !== undefined);
  
  console.log(`📊 Applying assessment results for ${assessmentId}:`, {
    totalResults: results.length,
    unappliedResults: unappliedResults.length,
    resultsWithArtifacts: unappliedResults.filter(r => r.artifactsGranted && r.artifactsGranted.length > 0).length
  });
  
  if (unappliedResults.length === 0) {
    return { success: true, appliedCount: 0, errors: [] };
  }
  
  // Get assessment data once for all notifications
  const assessmentRef = doc(db, 'assessments', assessmentId);
  const assessmentDoc = await getDoc(assessmentRef);
  const assessmentData = assessmentDoc.exists() ? assessmentDoc.data() : null;
  const assessmentTitle = assessmentData?.title || 'Assessment';
  const assessmentMaxScore = assessmentData?.maxScore || 100;
  
  // Process each result in a transaction
  for (const result of unappliedResults) {
    try {
      // Use a batch to ensure atomicity
      const batch = writeBatch(db);
      
      // Check if already applied (double-check)
      const resultRef = doc(db, 'assessmentResults', result.id);
      const resultDoc = await getDoc(resultRef);
      if (!resultDoc.exists() || resultDoc.data().applied) {
        console.log(`⏭️ Skipping result ${result.id} - already applied`);
        continue; // Skip if already applied
      }
      
      // Get the full result data from the document (includes artifactsGranted)
      const resultData = resultDoc.data();
      
      // Get goal to calculate goal score for notification
      const goalRef = doc(db, 'assessmentGoals', `${assessmentId}_${result.studentId}`);
      const goalDoc = await getDoc(goalRef);
      const goalScore = goalDoc.exists() ? goalDoc.data().goalScore : (result.actualScore - (result.computedDelta || 0));
      
      if (result.ppChange === undefined || result.ppChange === 0) {
        // Mark as applied even if no change
        batch.update(resultRef, {
          applied: true,
          appliedAt: Timestamp.now()
        });
        await batch.commit();
        appliedCount++;
        continue;
      }
      
      // Get student and user refs
      const studentRef = doc(db, 'students', result.studentId);
      const userRef = doc(db, 'users', result.studentId);
      
      // Read student data BEFORE batch operations to get current artifacts
      const studentDoc = await getDoc(studentRef);
      const studentData = studentDoc.exists() ? studentDoc.data() : {};
      const currentArtifacts = studentData.artifacts || {};
      const updatedArtifacts = { ...currentArtifacts };
      
      // Grant artifacts if any (read from result document)
      // Check both result.artifactsGranted and the resultDoc data
      // Also check if it's an array or needs to be parsed
      let artifactsGranted: ArtifactReward[] = [];
      
      if (result.artifactsGranted) {
        artifactsGranted = Array.isArray(result.artifactsGranted) 
          ? result.artifactsGranted 
          : [];
      } else if (resultData?.artifactsGranted) {
        artifactsGranted = Array.isArray(resultData.artifactsGranted)
          ? resultData.artifactsGranted
          : [];
      }
      
      console.log(`📦 Processing result for student ${result.studentId}:`, {
        resultId: result.id,
        hasArtifactsInResult: !!result.artifactsGranted,
        hasArtifactsInDoc: !!resultData?.artifactsGranted,
        artifactsGranted: artifactsGranted,
        artifactsCount: artifactsGranted.length,
        artifactsGrantedType: typeof artifactsGranted,
        isArray: Array.isArray(artifactsGranted),
        resultDataKeys: Object.keys(resultData || {}),
        resultKeys: Object.keys(result)
      });
      
      if (artifactsGranted.length > 0) {
        console.log(`🎁 Granting ${artifactsGranted.length} artifact(s) to student ${result.studentId}:`, artifactsGranted);
        
        // Grant each artifact with quantity
        artifactsGranted.forEach(artifactReward => {
          if (!artifactReward.artifactId || !artifactReward.artifactName) {
            console.warn(`⚠️ Invalid artifact reward:`, artifactReward);
            return;
          }
          
          const artifactId = artifactReward.artifactId;
          const quantity = artifactReward.quantity || 1;
          
          console.log(`  → Granting artifact: ${artifactId} (${artifactReward.artifactName}) x${quantity}`);
          
          // Mark artifact as owned
          updatedArtifacts[artifactId] = true;
          
          // Store artifact metadata
          updatedArtifacts[`${artifactId}_purchase`] = {
            id: artifactId,
            name: artifactReward.artifactName,
            obtainedAt: Timestamp.now(),
            fromAssessment: assessmentId,
            quantity: quantity
          };
        });
        
        console.log(`📝 Updated artifacts object for ${result.studentId}:`, {
          artifactKeys: Object.keys(updatedArtifacts).filter(k => !k.includes('_purchase')),
          purchaseKeys: Object.keys(updatedArtifacts).filter(k => k.includes('_purchase'))
        });
        
        // Update student with artifacts
        batch.update(studentRef, {
          powerPoints: increment(result.ppChange),
          artifacts: updatedArtifacts
        });
      } else {
        console.log(`ℹ️ No artifacts to grant for student ${result.studentId}`);
        // Update student PP only (no artifacts)
        batch.update(studentRef, {
          powerPoints: increment(result.ppChange)
        });
      }
      
      // Update users collection PP and artifacts to keep in sync
      const userDoc = await getDoc(userRef);
      if (userDoc.exists()) {
        const userData = userDoc.data();
        const usersArtifacts = userData.artifacts || [];
        
        // If we have artifacts to grant, add them to the users collection artifacts array
        if (artifactsGranted.length > 0) {
          // Create artifact objects for the users collection (array format)
          const newArtifacts: any[] = [];
          
          artifactsGranted.forEach(artifactReward => {
            if (!artifactReward.artifactId || !artifactReward.artifactName) {
              return;
            }
            
            const quantity = artifactReward.quantity || 1;
            
            // Look up artifact details
            const artifactDetails = ARTIFACT_LOOKUP[artifactReward.artifactId] || {
              description: artifactReward.artifactName,
              icon: '🎁',
              image: '',
              category: 'special' as const,
              rarity: 'common' as const
            };
            
            // Create artifact object in the format expected by users collection
            // This matches the format used in Marketplace.tsx
            for (let i = 0; i < quantity; i++) {
              newArtifacts.push({
                id: artifactReward.artifactId,
                name: artifactReward.artifactName,
                description: artifactDetails.description,
                price: 0, // Assessment rewards don't have a price
                icon: artifactDetails.icon,
                image: artifactDetails.image,
                category: artifactDetails.category,
                rarity: artifactDetails.rarity,
                purchasedAt: Timestamp.now().toDate(),
                used: false,
                fromAssessment: assessmentId // Track that this came from an assessment
              });
            }
          });
          
          // Merge with existing artifacts array
          const updatedUsersArtifacts = Array.isArray(usersArtifacts) 
            ? [...usersArtifacts, ...newArtifacts]
            : newArtifacts;
          
          console.log(`📦 Updating users collection artifacts for ${result.studentId}:`, {
            existingCount: Array.isArray(usersArtifacts) ? usersArtifacts.length : 0,
            newCount: newArtifacts.length,
            totalCount: updatedUsersArtifacts.length
          });
          
          batch.update(userRef, {
            powerPoints: increment(result.ppChange),
            artifacts: updatedUsersArtifacts
          });
        } else {
          // No artifacts, just update PP
          batch.update(userRef, {
            powerPoints: increment(result.ppChange)
          });
        }
      } else {
        // User doc doesn't exist, but we should still try to update PP if possible
        // (though this is unlikely)
        console.warn(`⚠️ User document ${result.studentId} does not exist in users collection`);
      }
      
      // Update vault PP if vault exists
      const vaultRef = doc(db, 'vaults', result.studentId);
      const vaultDoc = await getDoc(vaultRef);
      if (vaultDoc.exists()) {
        batch.update(vaultRef, {
          currentPP: increment(result.ppChange)
        });
      }
      
      // Create ledger entry
      const ledgerRef = doc(collection(db, 'ppLedger'));
      const ledgerEntry: PPLedgerEntry = {
        id: ledgerRef.id,
        studentId: result.studentId,
        sourceType: 'assessmentGoal',
        sourceId: assessmentId,
        amount: result.ppChange,
        createdAt: Timestamp.now(),
        notes: result.outcome 
          ? `${result.outcome === 'hit' ? 'Hit' : result.outcome === 'exceed' ? 'Exceeded' : 'Missed'} goal (${result.computedAbsDiff} points ${result.outcome === 'miss' ? 'off' : 'difference'})`
          : 'Assessment goal result',
        assessmentId: result.assessmentId,
        goalScore: result.computedDelta !== undefined ? (result.actualScore - result.computedDelta) : undefined,
        actualScore: result.actualScore,
        outcome: result.outcome
      };
      batch.set(ledgerRef, ledgerEntry);
      
      // Mark result as applied
      batch.update(resultRef, {
        applied: true,
        appliedAt: Timestamp.now()
      });
      
      // Commit batch
      try {
        await batch.commit();
        console.log(`✅ Successfully committed batch for student ${result.studentId}`);
        
        // Verify artifacts were saved by reading back the student document
        if (artifactsGranted.length > 0) {
          const verifyStudentDoc = await getDoc(studentRef);
          const verifyStudentData = verifyStudentDoc.exists() ? verifyStudentDoc.data() : {};
          const verifyArtifacts = verifyStudentData.artifacts || {};
          
          console.log(`🔍 Verifying artifacts for ${result.studentId}:`, {
            expectedArtifacts: artifactsGranted.map(a => a.artifactId),
            actualArtifactKeys: Object.keys(verifyArtifacts).filter(k => !k.includes('_purchase')),
            allArtifactKeys: Object.keys(verifyArtifacts)
          });
          
          // Check each artifact was granted
          artifactsGranted.forEach(artifactReward => {
            const artifactId = artifactReward.artifactId;
            const isGranted = verifyArtifacts[artifactId] === true;
            const hasPurchaseData = !!verifyArtifacts[`${artifactId}_purchase`];
            
            if (!isGranted || !hasPurchaseData) {
              console.error(`❌ Artifact ${artifactId} was NOT properly granted to ${result.studentId}!`, {
                isGranted,
                hasPurchaseData,
                verifyArtifacts
              });
            } else {
              console.log(`✅ Verified artifact ${artifactId} was granted to ${result.studentId}`);
            }
          });
        }
      } catch (batchError: any) {
        console.error(`❌ Batch commit failed for student ${result.studentId}:`, batchError);
        throw batchError; // Re-throw to be caught by outer try-catch
      }
      
      // Create notification for student after PP is updated
      try {
        const artifactsText = artifactsGranted.length > 0
          ? `\n\n🎁 Artifacts Earned:\n${artifactsGranted.map(a => `• ${a.artifactName}${a.quantity && a.quantity > 1 ? ` (x${a.quantity})` : ''}`).join('\n')}`
          : '';
        
        const outcomeText = result.outcome === 'hit' ? 'Hit' : result.outcome === 'exceed' ? 'Exceeded' : 'Missed';
        const ppText = result.ppChange > 0 
          ? `+${result.ppChange} PP` 
          : result.ppChange < 0 
            ? `${result.ppChange} PP` 
            : '0 PP';
        
        await addDoc(collection(db, 'students', result.studentId, 'notifications'), {
          type: 'assessment_goal_result',
          message: `Assessment Goal Result: ${assessmentTitle}\n\nGoal: ${goalScore} / ${assessmentMaxScore}\nActual: ${result.actualScore} / ${assessmentMaxScore}\nOutcome: ${outcomeText} your goal\nPP Change: ${ppText}${artifactsText}`,
          assessmentId: assessmentId,
          assessmentTitle: assessmentTitle,
          goalScore: goalScore,
          actualScore: result.actualScore,
          maxScore: assessmentMaxScore,
          outcome: result.outcome,
          ppChange: result.ppChange,
          artifactsGranted: artifactsGranted,
          timestamp: serverTimestamp(),
          read: false
        });
      } catch (notificationError) {
        console.error('Error creating assessment result notification:', notificationError);
        // Don't fail the whole operation if notification fails
      }
      
      console.log(`✅ Applied rewards for student ${result.studentId}:`, {
        ppChange: result.ppChange,
        artifactsCount: artifactsGranted.length,
        artifacts: artifactsGranted.map(a => a.artifactName)
      });

      // Update Hero's Journey progress if this is a Story Goal and the student succeeded
      if (assessmentData?.type === 'story-goal' && 
          (result.outcome === 'hit' || result.outcome === 'exceed')) {
        try {
          // Get the full assessment object
          const fullAssessment: Assessment = {
            id: assessmentId,
            ...assessmentData
          } as Assessment;

          await updateHeroJourneyProgress(result.studentId, fullAssessment);
          console.log(`✅ Updated Hero's Journey progress for student ${result.studentId}`);
        } catch (journeyError: any) {
          console.error(`⚠️ Failed to update Hero's Journey progress for student ${result.studentId}:`, journeyError);
          // Don't fail the whole operation if journey update fails
          // Just log the error
        }
      }
      
      appliedCount++;
      
    } catch (error: any) {
      const errorMsg = `Failed to apply result for student ${result.studentId}: ${error.message}`;
      console.error(errorMsg, error);
      errors.push(errorMsg);
    }
  }
  
  // Update assessment numApplied count
  if (appliedCount > 0) {
    const assessmentRef = doc(db, 'assessments', assessmentId);
    await updateDoc(assessmentRef, {
      numApplied: increment(appliedCount)
    });
  }
  
  return {
    success: errors.length === 0,
    appliedCount,
    errors
  };
}

// ============================================================================
// Habit Submissions Collection
// ============================================================================

/**
 * Generate habit submission ID (same format as goalId/resultId)
 */
function generateHabitSubmissionId(assessmentId: string, studentId: string): string {
  return `${assessmentId}_${studentId}`;
}

/**
 * Creates a habit submission (student commits to a habit)
 */
export async function createHabitSubmission(
  assessmentId: string,
  studentId: string,
  classId: string,
  habitText: string,
  duration: HabitDuration,
  evidence?: string | null
): Promise<void> {
  const submissionId = generateHabitSubmissionId(assessmentId, studentId);
  const submissionRef = doc(db, 'habitSubmissions', submissionId);
  
  const startAt = Timestamp.now();
  const startDate = startAt.toDate();
  
  // Import helper functions dynamically to avoid circular dependency
  const { calculateEndDate, getRequiredCheckIns } = await import('./habitSubmissions');
  const endDate = calculateEndDate(startDate, duration);
  const endAt = Timestamp.fromDate(endDate);
  const requiredCheckIns = getRequiredCheckIns(duration);
  
  const submissionData: any = {
    id: submissionId,
    assessmentId,
    classId,
    studentId,
    habitText: habitText.trim(),
    duration,
    startAt,
    endAt,
    status: 'IN_PROGRESS', // Default status when created
    // Legacy check-in fields (kept for backward compatibility)
    checkIns: {},
    requiredCheckIns,
    checkInCount: 0,
    rewardApplied: false,
    consequenceApplied: false,
    // New status-based fields
    evidence: evidence || null,
    // verification is optional and should not be included if undefined
    ppImpact: 0, // Will be computed when status changes
    applied: false,
    appliedAt: null,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now()
  };
  
  // Only include verification if it has a value (don't include undefined)
  // verification will be set later when the habit is verified
  
  await setDoc(submissionRef, submissionData);
  
  // Increment numGoalsSet on assessment (reusing existing field)
  const assessmentRef = doc(db, 'assessments', assessmentId);
  await updateDoc(assessmentRef, {
    numGoalsSet: increment(1)
  });
}

/**
 * Gets a student's habit submission for an assessment
 */
export async function getHabitSubmission(
  assessmentId: string,
  studentId: string
): Promise<HabitSubmission | null> {
  const submissionId = generateHabitSubmissionId(assessmentId, studentId);
  const submissionRef = doc(db, 'habitSubmissions', submissionId);
  const submissionDoc = await getDoc(submissionRef);
  if (!submissionDoc.exists()) return null;
  return { id: submissionDoc.id, ...submissionDoc.data() } as HabitSubmission;
}

/**
 * Updates an existing habit submission goal (allows editing habit text and duration)
 * This is separate from the status/verification update function
 */
export async function updateHabitSubmissionGoal(
  assessmentId: string,
  studentId: string,
  habitText: string,
  duration: HabitDuration,
  evidence?: string | null
): Promise<void> {
  const submissionId = generateHabitSubmissionId(assessmentId, studentId);
  const submissionRef = doc(db, 'habitSubmissions', submissionId);
  const submissionDoc = await getDoc(submissionRef);
  
  if (!submissionDoc.exists()) {
    throw new Error('Habit submission not found');
  }
  
  const existingSubmission = submissionDoc.data() as HabitSubmission;
  
  // Recalculate end date and required check-ins if duration changed
  let endAt = existingSubmission.endAt;
  let requiredCheckIns = existingSubmission.requiredCheckIns;
  
  if (duration !== existingSubmission.duration) {
    const startDate = existingSubmission.startAt.toDate();
    const { calculateEndDate, getRequiredCheckIns } = await import('./habitSubmissions');
    const endDate = calculateEndDate(startDate, duration);
    endAt = Timestamp.fromDate(endDate);
    requiredCheckIns = getRequiredCheckIns(duration);
  }
  
  await updateDoc(submissionRef, {
    habitText: habitText.trim(),
    duration,
    endAt,
    requiredCheckIns,
    evidence: evidence !== undefined ? evidence : existingSubmission.evidence,
    updatedAt: Timestamp.now()
  });
}

/**
 * Gets all habit submissions for an assessment
 */
export async function getHabitSubmissionsByAssessment(assessmentId: string): Promise<HabitSubmission[]> {
  const submissionsRef = collection(db, 'habitSubmissions');
  const q = query(submissionsRef, where('assessmentId', '==', assessmentId));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as HabitSubmission));
}

/**
 * Records a check-in for a habit submission (idempotent - one per day)
 */
export async function checkInHabit(
  assessmentId: string,
  studentId: string
): Promise<void> {
  const submissionId = generateHabitSubmissionId(assessmentId, studentId);
  const submissionRef = doc(db, 'habitSubmissions', submissionId);
  
  // Use transaction to ensure idempotency
  await runTransaction(db, async (transaction) => {
    const submissionDoc = await transaction.get(submissionRef);
    if (!submissionDoc.exists()) {
      throw new Error('Habit submission not found');
    }
    
    const submission = submissionDoc.data() as HabitSubmission;
    
    // Check if already completed or failed
    if (submission.status !== 'active') {
      throw new Error(`Habit submission is ${submission.status}`);
    }
    
    // Check eligibility
    const { canCheckIn, getDateKey } = await import('./habitSubmissions');
    const now = new Date();
    const todayKey = getDateKey(now);
    
    if (!canCheckIn(submission.duration, submission.checkIns || {}, submission.endAt)) {
      throw new Error('Cannot check in at this time');
    }
    
    // Add check-in
    const updatedCheckIns = {
      ...submission.checkIns,
      [todayKey]: Timestamp.now()
    };
    
    const newCheckInCount = Object.keys(updatedCheckIns).length;
    
    transaction.update(submissionRef, {
      checkIns: updatedCheckIns,
      checkInCount: newCheckInCount,
      updatedAt: Timestamp.now()
    });
  });
}

/**
 * Finalizes a habit submission (called when time expires or manually)
 * Checks completion status and applies rewards/consequences
 */
export async function finalizeHabitSubmission(
  assessmentId: string,
  studentId: string
): Promise<{ completed: boolean; rewardApplied: boolean; consequenceApplied: boolean }> {
  const submissionId = generateHabitSubmissionId(assessmentId, studentId);
  const submissionRef = doc(db, 'habitSubmissions', submissionId);
  const assessmentRef = doc(db, 'assessments', assessmentId);
  
  return runTransaction(db, async (transaction) => {
    const [submissionDoc, assessmentDoc] = await Promise.all([
      transaction.get(submissionRef),
      transaction.get(assessmentRef)
    ]);
    
    if (!submissionDoc.exists()) {
      throw new Error('Habit submission not found');
    }
    if (!assessmentDoc.exists()) {
      throw new Error('Assessment not found');
    }
    
    const submission = submissionDoc.data() as HabitSubmission;
    const assessment = assessmentDoc.data() as Assessment;
    
    // Only finalize if still active
    if (submission.status !== 'active') {
      return {
        completed: submission.status === 'completed',
        rewardApplied: submission.rewardApplied || false,
        consequenceApplied: submission.consequenceApplied || false
      };
    }
    
    // Check completion (with defaults for legacy compatibility)
    const checkInCount = submission.checkInCount ?? 0;
    const requiredCheckIns = submission.requiredCheckIns ?? 0;
    const completed = checkInCount >= requiredCheckIns;
    const newStatus: HabitSubmissionStatus = completed ? 'completed' : 'failed';
    
    // Apply rewards/consequences (idempotent)
    let rewardApplied = submission.rewardApplied || false;
    let consequenceApplied = submission.consequenceApplied || false;
    
    if (completed && !rewardApplied && assessment.habitsConfig) {
      const { defaultRewardPP, defaultRewardXP } = assessment.habitsConfig;
      // TODO: Apply PP/XP rewards (integrate with existing reward system)
      rewardApplied = true;
    }
    
    if (!completed && !consequenceApplied && assessment.habitsConfig) {
      const { defaultConsequencePP, defaultConsequenceXP } = assessment.habitsConfig;
      // TODO: Apply PP/XP penalties (integrate with existing penalty system)
      consequenceApplied = true;
    }
    
    // Update submission
    transaction.update(submissionRef, {
      status: newStatus,
      resolvedAt: Timestamp.now(),
      rewardApplied,
      consequenceApplied,
      updatedAt: Timestamp.now()
    });
    
    return {
      completed,
      rewardApplied,
      consequenceApplied
    };
  });
}

/**
 * Updates a habit submission with status, evidence, and verification
 */
export async function updateHabitSubmission(
  assessmentId: string,
  studentId: string,
  updates: {
    status?: HabitSubmissionStatus;
    evidence?: string | null;
    verification?: HabitVerification;
    ppImpact?: number;
  }
): Promise<void> {
  const submissionId = generateHabitSubmissionId(assessmentId, studentId);
  const submissionRef = doc(db, 'habitSubmissions', submissionId);
  
  const updateData: any = {
    ...updates,
    updatedAt: Timestamp.now()
  };
  
  // If ppImpact is calculated from status, include it
  if (updates.status && !updates.ppImpact) {
    const { computeHabitImpact } = await import('./habitRewards');
    updateData.ppImpact = computeHabitImpact(updates.status);
  }
  
  await updateDoc(submissionRef, updateData);
}

/**
 * Applies PP impact for a specific habit submission (idempotent)
 */
export async function applyHabitPP(
  assessmentId: string,
  studentId: string
): Promise<{ success: boolean; error?: string }> {
  const submissionId = generateHabitSubmissionId(assessmentId, studentId);
  const submissionRef = doc(db, 'habitSubmissions', submissionId);
  const studentRef = doc(db, 'students', studentId);
  const userRef = doc(db, 'users', studentId);
  
  return runTransaction(db, async (transaction) => {
    // Read habit submission
    const submissionDoc = await transaction.get(submissionRef);
    if (!submissionDoc.exists()) {
      throw new Error('Habit submission not found');
    }
    
    const submission = submissionDoc.data() as HabitSubmission;
    
    // Check if already applied (idempotent)
    if (submission.applied === true) {
      return { success: true }; // Already applied, return success
    }
    
    // Verify status and verification
    if (!submission.ppImpact || submission.ppImpact === 0) {
      return { success: false, error: 'PP impact is zero or not set' };
    }
    
    if (!submission.verification) {
      return { success: false, error: 'Verification is required' };
    }
    
    // Read student and user docs
    const [studentDoc, userDoc] = await Promise.all([
      transaction.get(studentRef),
      transaction.get(userRef)
    ]);
    
    if (!studentDoc.exists()) {
      throw new Error('Student document not found');
    }
    
    // Update PP balance
    const ppChange = submission.ppImpact || 0;
    
    // Update student PP
    transaction.update(studentRef, {
      powerPoints: increment(ppChange)
    });
    
    // Update user PP (keep in sync)
    if (userDoc.exists()) {
      transaction.update(userRef, {
        powerPoints: increment(ppChange)
      });
    }
    
    // Mark habit as applied
    transaction.update(submissionRef, {
      applied: true,
      appliedAt: Timestamp.now(),
      appliedStatus: 'APPLIED',
      updatedAt: Timestamp.now()
    });
    
    return { success: true };
  });
}

