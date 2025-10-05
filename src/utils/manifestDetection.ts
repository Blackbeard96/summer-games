/**
 * Enhanced Manifest Detection Utility
 * 
 * This utility provides consistent manifest detection across the application
 * by checking all possible locations and data formats where manifests might be stored.
 */

export interface ManifestData {
  studentData?: any;
  userProgress?: any;
}

/**
 * Comprehensive manifest detection function that checks all possible locations
 * and data formats where manifests might be stored.
 * 
 * @param manifestData - Object containing studentData and userProgress
 * @returns boolean indicating whether a valid manifest is detected
 */
export const detectManifest = (manifestData: ManifestData): boolean => {
  const { studentData, userProgress } = manifestData;
  
  // Check students collection manifest object
  if (studentData?.manifest) {
    if (typeof studentData.manifest === 'object' && studentData.manifest.manifestId) {
      return true;
    }
    if (typeof studentData.manifest === 'string' && studentData.manifest.length > 0) {
      return true;
    }
  }
  
  // Check students collection manifestationType string
  if (studentData?.manifestationType && 
      typeof studentData.manifestationType === 'string' && 
      studentData.manifestationType.length > 0) {
    return true;
  }
  
  // Check users collection manifest object
  if (userProgress?.manifest) {
    if (typeof userProgress.manifest === 'object' && userProgress.manifest.manifestId) {
      return true;
    }
    if (typeof userProgress.manifest === 'string' && userProgress.manifest.length > 0) {
      return true;
    }
  }
  
  // Check users collection manifestationType string
  if (userProgress?.manifestationType && 
      typeof userProgress.manifestationType === 'string' && 
      userProgress.manifestationType.length > 0) {
    return true;
  }
  
  // Check legacy manifest field in students collection
  if (studentData?.manifest && 
      studentData.manifest !== 'None' && 
      studentData.manifest !== 'none') {
    return true;
  }
  
  // Check legacy manifest field in users collection
  if (userProgress?.manifest && 
      userProgress.manifest !== 'None' && 
      userProgress.manifest !== 'none') {
    return true;
  }
  
  return false;
};

/**
 * Get manifest information in a standardized format
 * 
 * @param manifestData - Object containing studentData and userProgress
 * @returns object with manifest information or null if no manifest found
 */
export const getManifestInfo = (manifestData: ManifestData): {
  manifestId?: string;
  manifestationType?: string;
  source: 'students_manifest' | 'students_manifestationType' | 'users_manifest' | 'users_manifestationType' | 'legacy_students' | 'legacy_users';
} | null => {
  const { studentData, userProgress } = manifestData;
  
  // Check students collection manifest object
  if (studentData?.manifest) {
    if (typeof studentData.manifest === 'object' && studentData.manifest.manifestId) {
      return {
        manifestId: studentData.manifest.manifestId,
        source: 'students_manifest'
      };
    }
    if (typeof studentData.manifest === 'string' && studentData.manifest.length > 0) {
      return {
        manifestId: studentData.manifest,
        source: 'students_manifest'
      };
    }
  }
  
  // Check students collection manifestationType string
  if (studentData?.manifestationType && 
      typeof studentData.manifestationType === 'string' && 
      studentData.manifestationType.length > 0) {
    return {
      manifestationType: studentData.manifestationType,
      source: 'students_manifestationType'
    };
  }
  
  // Check users collection manifest object
  if (userProgress?.manifest) {
    if (typeof userProgress.manifest === 'object' && userProgress.manifest.manifestId) {
      return {
        manifestId: userProgress.manifest.manifestId,
        source: 'users_manifest'
      };
    }
    if (typeof userProgress.manifest === 'string' && userProgress.manifest.length > 0) {
      return {
        manifestId: userProgress.manifest,
        source: 'users_manifest'
      };
    }
  }
  
  // Check users collection manifestationType string
  if (userProgress?.manifestationType && 
      typeof userProgress.manifestationType === 'string' && 
      userProgress.manifestationType.length > 0) {
    return {
      manifestationType: userProgress.manifestationType,
      source: 'users_manifestationType'
    };
  }
  
  // Check legacy manifest field in students collection
  if (studentData?.manifest && 
      studentData.manifest !== 'None' && 
      studentData.manifest !== 'none') {
    return {
      manifestId: studentData.manifest,
      source: 'legacy_students'
    };
  }
  
  // Check legacy manifest field in users collection
  if (userProgress?.manifest && 
      userProgress.manifest !== 'None' && 
      userProgress.manifest !== 'none') {
    return {
      manifestId: userProgress.manifest,
      source: 'legacy_users'
    };
  }
  
  return null;
};

/**
 * Log detailed manifest detection information for debugging
 * 
 * @param manifestData - Object containing studentData and userProgress
 * @param context - Context string for logging (e.g., 'ChapterTracker', 'ChapterDetail')
 */
export const logManifestDetection = (manifestData: ManifestData, context: string): void => {
  const { studentData, userProgress } = manifestData;
  const hasManifest = detectManifest(manifestData);
  const manifestInfo = getManifestInfo(manifestData);
  
  console.log(`${context}: Enhanced manifest detection result:`, {
    hasManifest,
    manifestInfo,
    studentDataManifest: studentData?.manifest,
    studentDataManifestType: typeof studentData?.manifest,
    studentDataManifestationType: studentData?.manifestationType,
    userProgressManifest: userProgress?.manifest,
    userProgressManifestType: typeof userProgress?.manifest,
    userProgressManifestationType: userProgress?.manifestationType
  });
};
