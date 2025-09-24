// Class Role System Types

export type UserRole = 'admin' | 'scorekeeper' | 'student';

export interface RolePermissions {
  canModifyPP: boolean;
  canApproveChanges: boolean;
  canAssignRoles: boolean;
  canViewAllStudents: boolean;
  canSubmitPPChanges: boolean;
}

export interface UserRoleData {
  userId: string;
  role: UserRole;
  assignedBy: string;
  assignedAt: Date | any; // Can be Firestore Timestamp or Date
  classId?: string;
  permissions: RolePermissions;
}

export interface PPChangeRequest {
  id: string;
  scorekeeperId: string;
  scorekeeperName: string;
  targetUserId: string;
  targetUserName: string;
  ppChange: number; // positive for add, negative for subtract
  reason: string;
  timestamp: Date | any; // Can be Firestore Timestamp or Date
  status: 'pending' | 'approved' | 'rejected';
  reviewedBy?: string;
  reviewedAt?: Date | any; // Can be Firestore Timestamp or Date
  reviewNotes?: string;
  classId?: string;
}

export interface PPChangeSession {
  id: string;
  scorekeeperId: string;
  scorekeeperName: string;
  changes: PPChangeRequest[];
  totalChanges: number;
  submittedAt: Date | any; // Can be Firestore Timestamp or Date
  status: 'pending' | 'approved' | 'rejected' | 'partially_approved';
  classId?: string;
}

// Role permission definitions
export const ROLE_PERMISSIONS: Record<UserRole, RolePermissions> = {
  admin: {
    canModifyPP: true,
    canApproveChanges: true,
    canAssignRoles: true,
    canViewAllStudents: true,
    canSubmitPPChanges: false // Admins don't need to submit for approval
  },
  scorekeeper: {
    canModifyPP: false, // Can only suggest changes
    canApproveChanges: false,
    canAssignRoles: false,
    canViewAllStudents: true,
    canSubmitPPChanges: true
  },
  student: {
    canModifyPP: false,
    canApproveChanges: false,
    canAssignRoles: false,
    canViewAllStudents: false,
    canSubmitPPChanges: false
  }
};

// Helper functions
export const getUserPermissions = (role: UserRole): RolePermissions => {
  return ROLE_PERMISSIONS[role];
};

export const canUserPerformAction = (role: UserRole, action: keyof RolePermissions): boolean => {
  return ROLE_PERMISSIONS[role][action];
};

export const getRoleDisplayName = (role: UserRole): string => {
  switch (role) {
    case 'admin':
      return 'Administrator';
    case 'scorekeeper':
      return 'Scorekeeper';
    case 'student':
      return 'Student';
    default:
      return 'Unknown';
  }
};

export const getRoleBadgeColor = (role: UserRole): string => {
  switch (role) {
    case 'admin':
      return '#dc2626'; // Red
    case 'scorekeeper':
      return '#059669'; // Green
    case 'student':
      return '#3b82f6'; // Blue
    default:
      return '#6b7280'; // Gray
  }
};
