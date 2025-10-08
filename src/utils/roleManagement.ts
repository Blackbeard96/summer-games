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
