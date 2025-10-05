/**
 * Tests for Manifest Detection Utility
 * 
 * This file tests the manifest detection utility to ensure it correctly
 * identifies manifests across all possible data storage formats and locations.
 */

import { detectManifest, getManifestInfo } from '../manifestDetection';

describe('Manifest Detection Utility', () => {
  
  describe('detectManifest', () => {
    
    it('should detect manifest object in students collection', () => {
      const manifestData = {
        studentData: {
          manifest: {
            manifestId: 'fire-manifest',
            currentLevel: 1,
            xp: 0
          }
        },
        userProgress: {}
      };
      
      expect(detectManifest(manifestData)).toBe(true);
    });
    
    it('should detect manifest string in students collection', () => {
      const manifestData = {
        studentData: {
          manifest: 'fire-manifest'
        },
        userProgress: {}
      };
      
      expect(detectManifest(manifestData)).toBe(true);
    });
    
    it('should detect manifestationType in students collection', () => {
      const manifestData = {
        studentData: {
          manifestationType: 'Fire'
        },
        userProgress: {}
      };
      
      expect(detectManifest(manifestData)).toBe(true);
    });
    
    it('should detect manifest object in users collection', () => {
      const manifestData = {
        studentData: {},
        userProgress: {
          manifest: {
            manifestId: 'water-manifest',
            currentLevel: 2,
            xp: 100
          }
        }
      };
      
      expect(detectManifest(manifestData)).toBe(true);
    });
    
    it('should detect manifestationType in users collection', () => {
      const manifestData = {
        studentData: {},
        userProgress: {
          manifestationType: 'Water'
        }
      };
      
      expect(detectManifest(manifestData)).toBe(true);
    });
    
    it('should handle legacy manifest strings', () => {
      const manifestData = {
        studentData: {
          manifest: 'Earth'
        },
        userProgress: {}
      };
      
      expect(detectManifest(manifestData)).toBe(true);
    });
    
    it('should reject empty or invalid manifests', () => {
      const testCases = [
        {
          studentData: { manifest: '' },
          userProgress: {}
        },
        {
          studentData: { manifest: 'None' },
          userProgress: {}
        },
        {
          studentData: { manifest: 'none' },
          userProgress: {}
        },
        {
          studentData: { manifestationType: '' },
          userProgress: {}
        },
        {
          studentData: {},
          userProgress: {}
        },
        {
          studentData: { manifest: {} }, // Empty object without manifestId
          userProgress: {}
        }
      ];
      
      testCases.forEach((manifestData, index) => {
        expect(detectManifest(manifestData)).toBe(false);
      });
    });
    
    it('should prioritize students collection over users collection', () => {
      const manifestData = {
        studentData: {
          manifest: {
            manifestId: 'fire-manifest'
          }
        },
        userProgress: {
          manifest: {
            manifestId: 'water-manifest'
          }
        }
      };
      
      expect(detectManifest(manifestData)).toBe(true);
      
      const manifestInfo = getManifestInfo(manifestData);
      expect(manifestInfo?.source).toBe('students_manifest');
    });
  });
  
  describe('getManifestInfo', () => {
    
    it('should return manifest info from students collection', () => {
      const manifestData = {
        studentData: {
          manifest: {
            manifestId: 'fire-manifest'
          }
        },
        userProgress: {}
      };
      
      const manifestInfo = getManifestInfo(manifestData);
      expect(manifestInfo).toEqual({
        manifestId: 'fire-manifest',
        source: 'students_manifest'
      });
    });
    
    it('should return manifestationType info from students collection', () => {
      const manifestData = {
        studentData: {
          manifestationType: 'Fire'
        },
        userProgress: {}
      };
      
      const manifestInfo = getManifestInfo(manifestData);
      expect(manifestInfo).toEqual({
        manifestationType: 'Fire',
        source: 'students_manifestationType'
      });
    });
    
    it('should return null when no manifest is found', () => {
      const manifestData = {
        studentData: {},
        userProgress: {}
      };
      
      const manifestInfo = getManifestInfo(manifestData);
      expect(manifestInfo).toBeNull();
    });
  });
});
