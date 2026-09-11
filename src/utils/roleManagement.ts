import { db } from '../firebase';
import { doc, setDoc, getDoc } from 'firebase/firestore';

/**
 * Set a user's role in the userRoles collection
 * @param userId - The user's UID
 * @param role - The role to assign ('student', 'scorekeeper', 'admin')
 * @param classId - Optional class ID for scorekeepers
 */
export const setUserRole = async (userId: string, role: 'student' | 'scorekeeper' | 'admin', classId?: string) => {
  try {
    const roleData: any = {
      role,
      updatedAt: new Date()
    };
    
    if (classId) {
      roleData.classId = classId;
    }
    
    await setDoc(doc(db, 'userRoles', userId), roleData);
    console.log(`✅ Successfully set role '${role}' for user ${userId}`);
    return true;
  } catch (error) {
    console.error('❌ Error setting user role:', error);
    return false;
  }
};

/**
 * Get a user's role from the userRoles collection
 * @param userId - The user's UID
 * @returns Promise<{role: string, classId?: string} | null>
 */
export const getUserRole = async (userId: string) => {
  try {
    const roleDoc = await getDoc(doc(db, 'userRoles', userId));
    if (roleDoc.exists()) {
      return roleDoc.data();
    }
    return null;
  } catch (error) {
    console.error('❌ Error getting user role:', error);
    return null;
  }
};

/**
 * Check if a user is a scorekeeper
 * @param userId - The user's UID
 * @returns Promise<boolean>
 */
export const isUserScorekeeper = async (userId: string) => {
  const roleData = await getUserRole(userId);
  return roleData?.role === 'scorekeeper' || 
         (roleData?.roles && Array.isArray(roleData.roles) && roleData.roles.includes('scorekeeper'));
};

/**
 * Check if a user is an admin
 * @param userId - The user's UID
 * @param userEmail - Optional user email for fallback check
 * @returns Promise<boolean>
 */
export const isUserAdmin = async (userId: string, userEmail?: string | null): Promise<boolean> => {
  try {
    // First check the userRoles collection
    const roleData = await getUserRole(userId);
    const hasAdminRole = roleData?.role === 'admin' || 
                         (roleData?.roles && Array.isArray(roleData?.roles) && roleData.roles.includes('admin'));
    
    if (hasAdminRole) {
      return true;
    }
    
    // Fallback: Check specific admin email - Only Yondaime has access
    if (userEmail) {
      // Only Yondaime's email is allowed
      if (userEmail === 'edm21179@gmail.com') {
        return true;
      }
    }
    
    return false;
  } catch (error) {
    console.error('Error checking admin status:', error);
    // On error, fall back to email check only - Only Yondaime has access
    if (userEmail) {
      // Only Yondaime's email is allowed
      if (userEmail === 'edm21179@gmail.com') {
        return true;
      }
    }
    return false;
  }
};

/**
 * Check if a user can end a live event session (stricter than isUserAdmin).
 * Only the designated session-ender can see "End Session" in the UI.
 * All other users (including other admins) see only "Leave Live Event".
 */
export const canEndLiveEventSession = (userEmail?: string | null): boolean => {
  return userEmail === 'edm21179@gmail.com';
};

/**
 * Helper function to set up common roles for testing
 */
export const setupTestRoles = async () => {
  console.log('🔧 Setting up test roles...');
  
  // You can add specific user IDs here for testing
  const testScorekeepers: string[] = [
    // Add user IDs here as needed
  ];
  
  for (const userId of testScorekeepers) {
    await setUserRole(userId, 'scorekeeper');
  }
  
  console.log('✅ Test roles setup complete');
};

type RoleDoc = {
  role?: string;
  roles?: string[];
  classId?: string;
  classIds?: string[];
  assignedBy?: string;
  assignedAt?: unknown;
  permissions?: Record<string, boolean>;
  userId?: string;
  [key: string]: unknown;
};

/**
 * Assign a player as scorekeeper for a specific class (supports multi-class).
 * Does not demote existing admins — adds scorekeeper access via roles + classIds.
 */
export const assignScorekeeperToClass = async (
  userId: string,
  classId: string,
  assignedBy: string
): Promise<{ ok: boolean; error?: string }> => {
  if (!userId || !classId) {
    return { ok: false, error: 'Missing user or class.' };
  }
  try {
    const roleRef = doc(db, 'userRoles', userId);
    const snap = await getDoc(roleRef);
    const existing = (snap.exists() ? snap.data() : {}) as RoleDoc;
    const currentClassIds = Array.isArray(existing.classIds)
      ? [...existing.classIds]
      : existing.classId
        ? [existing.classId]
        : [];
    if (!currentClassIds.includes(classId)) {
      currentClassIds.push(classId);
    }

    const isAdmin =
      existing.role === 'admin' ||
      (Array.isArray(existing.roles) && existing.roles.includes('admin'));
    const nextRoles = new Set<string>(Array.isArray(existing.roles) ? existing.roles : []);
    nextRoles.add('scorekeeper');
    if (isAdmin) nextRoles.add('admin');

    await setDoc(
      roleRef,
      {
        ...existing,
        userId,
        role: isAdmin ? 'admin' : 'scorekeeper',
        roles: Array.from(nextRoles),
        classIds: currentClassIds,
        classId: currentClassIds[0] || classId,
        assignedBy,
        assignedAt: new Date(),
        permissions: isAdmin
          ? {
              canModifyPP: true,
              canApproveChanges: true,
              canAssignRoles: true,
              canViewAllStudents: true,
              canSubmitPPChanges: true,
            }
          : {
              canModifyPP: false,
              canApproveChanges: false,
              canAssignRoles: false,
              canViewAllStudents: true,
              canSubmitPPChanges: true,
            },
      },
      { merge: true }
    );
    return { ok: true };
  } catch (error) {
    console.error('assignScorekeeperToClass failed:', error);
    return { ok: false, error: error instanceof Error ? error.message : 'Failed to assign scorekeeper' };
  }
};

/**
 * Remove scorekeeper access for a specific class. If no classes remain and the user
 * is not an admin, role returns to student.
 */
export const removeScorekeeperFromClass = async (
  userId: string,
  classId: string,
  assignedBy: string
): Promise<{ ok: boolean; error?: string }> => {
  if (!userId || !classId) {
    return { ok: false, error: 'Missing user or class.' };
  }
  try {
    const roleRef = doc(db, 'userRoles', userId);
    const snap = await getDoc(roleRef);
    if (!snap.exists()) {
      return { ok: true };
    }
    const existing = snap.data() as RoleDoc;
    const currentClassIds = Array.isArray(existing.classIds)
      ? [...existing.classIds]
      : existing.classId
        ? [existing.classId]
        : [];
    const updatedClassIds = currentClassIds.filter((id) => id !== classId);
    const isAdmin =
      existing.role === 'admin' ||
      (Array.isArray(existing.roles) && existing.roles.includes('admin'));

    if (updatedClassIds.length === 0 && !isAdmin) {
      const nextRoles = (Array.isArray(existing.roles) ? existing.roles : []).filter(
        (r) => r !== 'scorekeeper'
      );
      await setDoc(
        roleRef,
        {
          ...existing,
          userId,
          role: 'student',
          roles: nextRoles,
          classIds: [],
          classId: null,
          assignedBy,
          assignedAt: new Date(),
          permissions: {
            canModifyPP: false,
            canApproveChanges: false,
            canAssignRoles: false,
            canViewAllStudents: false,
            canSubmitPPChanges: false,
          },
        },
        { merge: true }
      );
    } else {
      const nextRoles = new Set<string>(Array.isArray(existing.roles) ? existing.roles : []);
      if (updatedClassIds.length === 0) {
        nextRoles.delete('scorekeeper');
      } else {
        nextRoles.add('scorekeeper');
      }
      if (isAdmin) nextRoles.add('admin');
      await setDoc(
        roleRef,
        {
          ...existing,
          userId,
          role: isAdmin ? 'admin' : updatedClassIds.length > 0 ? 'scorekeeper' : existing.role || 'student',
          roles: Array.from(nextRoles),
          classIds: updatedClassIds,
          classId: updatedClassIds[0] || null,
          assignedBy,
          assignedAt: new Date(),
        },
        { merge: true }
      );
    }
    return { ok: true };
  } catch (error) {
    console.error('removeScorekeeperFromClass failed:', error);
    return { ok: false, error: error instanceof Error ? error.message : 'Failed to remove scorekeeper' };
  }
};

/** Whether this user is a scorekeeper for the given class. */
export const isScorekeeperForClass = (roleData: RoleDoc | null | undefined, classId: string): boolean => {
  if (!roleData || !classId) return false;
  const isSk =
    roleData.role === 'scorekeeper' ||
    (Array.isArray(roleData.roles) && roleData.roles.includes('scorekeeper'));
  if (!isSk && roleData.role !== 'admin') return false;
  const ids = Array.isArray(roleData.classIds)
    ? roleData.classIds
    : roleData.classId
      ? [roleData.classId]
      : [];
  // Admins with empty classIds historically mean all classes
  if (roleData.role === 'admin' || (Array.isArray(roleData.roles) && roleData.roles.includes('admin'))) {
    if (ids.length === 0) return true;
  }
  return ids.includes(classId);
};
