import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { db } from '../firebase';
import { 
  collection, 
  getDocs, 
  doc, 
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
  addDoc,
  writeBatch
} from 'firebase/firestore';
import { UserRole, UserRoleData, getRoleDisplayName, getRoleBadgeColor } from '../types/roles';
import StudentListItem from './StudentListItem';
import { logger } from '../utils/debugLogger';

interface Student {
  id: string;
  displayName: string;
  email: string;
  photoURL?: string;
  powerPoints?: number;
  xp?: number;
}

interface StudentWithRole extends Student {
  role: UserRole;
  assignedBy?: string;
  assignedAt?: Date;
  assignedClasses?: string[]; // New field for multi-class scorekeeper assignments
  allClasses?: string[]; // All classes the student is enrolled in
}

interface ClassInfo {
  id: string;
  name: string;
  studentCount: number;
}

const RoleManager: React.FC = () => {
  logger.roles.debug('Component initialized');
  
  // Firefox-specific detection and handling
  const isFirefox = typeof navigator !== 'undefined' && navigator.userAgent.toLowerCase().includes('firefox');
  if (isFirefox) {
    logger.roles.info('🦊 Firefox browser detected - applying compatibility measures');
  }
  
  const { currentUser } = useAuth();
  const [allStudents, setAllStudents] = useState<Student[]>([]);
  const [filteredStudents, setFilteredStudents] = useState<StudentWithRole[]>([]);
  const [availableClasses, setAvailableClasses] = useState<ClassInfo[]>([]);
  const [selectedClass, setSelectedClass] = useState<string>('');
  const [userRole, setUserRole] = useState<UserRole>('student');
  const [loading, setLoading] = useState<boolean>(true);
  const [assigning, setAssigning] = useState<string>('');

  // Debugging function for roster updates
  const debugRosterState = () => {
    logger.roster.info('=== ROSTER DEBUG STATE ===', {
      selectedClass,
      allStudents: allStudents.length,
      filteredStudents: filteredStudents.length,
      availableClasses: availableClasses.length,
      currentUser: currentUser?.email,
      userRole,
      loading,
      assigning
    });
    
    if (selectedClass) {
      logger.roster.info('Selected class details:', {
        classId: selectedClass,
        className: availableClasses.find(c => c.id === selectedClass)?.name
      });
    }
    
    logger.roster.info('All students:', allStudents.map(s => ({ id: s.id, name: s.displayName, email: s.email })));
    logger.roster.info('Filtered students:', filteredStudents.map(s => ({ id: s.id, name: s.displayName, role: s.role })));
    logger.roster.info('Available classes:', availableClasses);
  };

  // Make debug function available globally for console access
  React.useEffect(() => {
    (window as any).debugRoster = debugRosterState;
    // Enable roster debugging by default and clear console
    console.clear();
    logger.debugRosterOnly();
    console.log('%c🎯 ROLE MANAGER LOADED - Roster debugging enabled!', 'color: #10b981; font-size: 16px; font-weight: bold');
    console.log('%c📝 Available commands: debugRoster() or click "Debug Console" button', 'color: #6b7280');
    
    // Immediately run debug to show current state
    setTimeout(() => {
      debugRosterState();
    }, 1000);
  }, []);

  logger.roles.debug('Current state:', { 
    currentUser: !!currentUser, 
    allStudents: allStudents.length, 
    filteredStudents: filteredStudents.length,
    selectedClass,
    userRole,
    loading
  });

  // Check user role and auto-assign admin if needed
  useEffect(() => {
    logger.roles.debug('checkUserRole useEffect triggered');
    
    const checkUserRole = async () => {
      if (!currentUser) {
        logger.roles.debug('No current user');
        return;
      }
      
      try {
        const roleDoc = await getDoc(doc(db, 'userRoles', currentUser.uid));
        if (roleDoc.exists()) {
          const roleData = roleDoc.data();
          setUserRole(roleData.role || 'student');
        } else {
          logger.roles.info('No role found, setting as admin and creating record');
          setUserRole('admin');
          
          // Auto-create admin role
          const roleData: UserRoleData = {
            userId: currentUser.uid,
            role: 'admin',
            assignedBy: 'system_auto_detect',
            assignedAt: new Date(),
            permissions: {
              canModifyPP: true,
              canApproveChanges: true,
              canAssignRoles: true,
              canViewAllStudents: true,
              canSubmitPPChanges: false
            }
          };

          await setDoc(doc(db, 'userRoles', currentUser.uid), {
            ...roleData,
            assignedAt: serverTimestamp()
          });
        }
      } catch (error) {
        console.error('RoleManager: Error checking user role:', error);
        setUserRole('admin'); // Assume admin if error
      } finally {
        setLoading(false);
      }
    };

    checkUserRole();
  }, [currentUser]);

  // Load all students (exactly like ClassroomManagement)
  useEffect(() => {
    logger.roster.debug('loadAllStudents useEffect triggered', { currentUser: !!currentUser, userRole });
    
    if (!currentUser || userRole !== 'admin') {
      logger.roster.debug('Skipping student load - not admin or no user');
      return;
    }

    const loadAllStudents = async () => {
      try {
        logger.roster.info('Loading all students...');
        
        // Firefox-specific delay to ensure Firestore is ready
        if (isFirefox) {
          await new Promise(resolve => setTimeout(resolve, 100));
          logger.roster.debug('Firefox: Applied startup delay for Firestore readiness');
        }
        
        // EXACT same logic as ClassroomManagement fetchData function
        const usersSnapshot = await getDocs(collection(db, 'users'));
        const studentsSnapshot = await getDocs(collection(db, 'students'));
        
        console.log('RoleManager: Users collection size:', usersSnapshot.docs.length);
        console.log('RoleManager: Students collection size:', studentsSnapshot.docs.length);
        
        // Create a map of user data from the 'users' collection
        const usersMap = new Map();
        usersSnapshot.docs.forEach(doc => {
          const userData = doc.data();
          usersMap.set(doc.id, {
            id: doc.id,
            displayName: userData.displayName || 'Unnamed Student',
            email: userData.email || 'No email',
            photoURL: userData.photoURL,
            createdAt: userData.createdAt,
            lastLogin: userData.lastLogin,
            ...userData
          });
        });
        
        // Merge with student data from 'students' collection
        const studentsMap = new Map();
        studentsSnapshot.docs.forEach(doc => {
          const studentData = doc.data();
          const userId = doc.id;
          const userData = usersMap.get(userId) || {};
          
          const mergedData = {
            id: userId,
            ...userData,
            ...studentData,
            displayName: studentData.displayName || userData.displayName || 'Unnamed Student',
            email: studentData.email || userData.email || 'No email',
            photoURL: studentData.photoURL || userData.photoURL,
            xp: studentData.xp || 0,
            powerPoints: studentData.powerPoints || 0,
            challenges: studentData.challenges || {},
          };
          
          studentsMap.set(userId, mergedData);
        });
        
        // Add any users that don't have student records yet
        usersMap.forEach((userData, userId) => {
          if (!studentsMap.has(userId)) {
            console.log('RoleManager: Adding user without student record:', userId, userData);
            studentsMap.set(userId, {
              ...userData,
              xp: 0,
              powerPoints: 0,
              challenges: {}
            });
          }
        });
        
        const studentsData = Array.from(studentsMap.values());
        console.log('RoleManager: Loaded all students:', studentsData.length);
        setAllStudents(studentsData);
        
      } catch (error) {
        console.error('RoleManager: Error loading all students:', error);
      }
    };

    loadAllStudents();
  }, [currentUser, userRole]);

  // Load available classes
  useEffect(() => {
    if (!currentUser || userRole !== 'admin') return;

    const loadClasses = async () => {
      try {
        console.log('RoleManager: Loading classrooms...');
        const classroomsSnapshot = await getDocs(collection(db, 'classrooms'));
        
        const classes = classroomsSnapshot.docs.map(doc => {
          const classroom = doc.data();
          return {
            id: doc.id,
            name: classroom.name || doc.id,
            studentCount: (classroom.students || []).length
          };
        });
        
        console.log('RoleManager: Found classes:', classes);
        console.log('RoleManager: Class details:', classes.map(c => ({ id: c.id, name: c.name, count: c.studentCount })));
        setAvailableClasses(classes);
        
        // Auto-select first class
        if (classes.length > 0 && !selectedClass) {
          setSelectedClass(classes[0].id);
        }
        
      } catch (error) {
        console.error('RoleManager: Error loading classes:', error);
      }
    };

    loadClasses();
  }, [currentUser, userRole]);

  // Filter students when class or students change
  useEffect(() => {
    logger.roster.info('🔄 useEffect triggered - filtering students', {
      selectedClass,
      allStudentsCount: allStudents.length,
      hasSelectedClass: !!selectedClass
    });
    
    if (!selectedClass || allStudents.length === 0) {
      logger.roster.warn('Clearing filtered students:', {
        reason: !selectedClass ? 'No class selected' : 'No students loaded',
        selectedClass,
        allStudentsCount: allStudents.length
      });
      setFilteredStudents([]);
      return;
    }

    const filterStudents = async () => {
      try {
        logger.roster.info('Filtering students for classroom:', selectedClass);
        logger.roster.info('Available students to filter from:', allStudents.length);
        
        // Get classroom data
        const classroomDoc = await getDoc(doc(db, 'classrooms', selectedClass));
        if (!classroomDoc.exists()) {
          logger.roster.error('Classroom document not found for ID:', selectedClass);
          
          // List all available classrooms for comparison
          const allClassrooms = await getDocs(collection(db, 'classrooms'));
          logger.roster.info('Available classroom documents:');
          allClassrooms.docs.forEach(doc => {
            logger.roster.info(`Classroom: ID="${doc.id}", Name="${doc.data().name}", Students=${doc.data().students?.length || 0}`);
          });
          
          setFilteredStudents([]);
          return;
        }

        const classroomData = classroomDoc.data();
        const studentIds = classroomData.students || [];
        logger.roster.info('Student IDs in classroom:', studentIds);
        logger.roster.info('Number of student IDs:', studentIds.length);

        // Filter students (same as ClassroomManagement getStudentById approach)
        const classroomStudents = allStudents.filter(student => 
          studentIds.includes(student.id)
        );
        
        logger.roster.info('Filtered students count:', classroomStudents.length);
        logger.roster.debug('Filtered student details:', classroomStudents.map(s => ({ id: s.id, name: s.displayName })));

        // Get roles (with error handling for permissions)
        let rolesMap = new Map<string, UserRoleData>();
        
        try {
          logger.roster.debug('Attempting to load user roles...');
          const rolesSnapshot = await getDocs(collection(db, 'userRoles'));
          logger.roster.info('Successfully loaded roles:', rolesSnapshot.docs.length);
          
          rolesSnapshot.docs.forEach(doc => {
            const roleData = doc.data() as UserRoleData;
            rolesMap.set(doc.id, {
              ...roleData,
              assignedAt: roleData.assignedAt && typeof roleData.assignedAt === 'object' && 'toDate' in roleData.assignedAt 
                ? (roleData.assignedAt as any).toDate() 
                : roleData.assignedAt instanceof Date 
                ? roleData.assignedAt 
                : new Date()
            });
          });
        } catch (roleError) {
          logger.roster.warn('Could not load user roles (permission issue), using default student role for all:', roleError);
          // Continue without roles - all students will be assigned 'student' role by default
        }

        // Add roles to students
        const studentsWithRoles: StudentWithRole[] = classroomStudents.map(student => {
          const roleData = rolesMap.get(student.id);
          
          // Find all classes this student is enrolled in
          // For now, we'll get this from the classroom data
          const enrolledClasses: string[] = []; // Will be populated when we have classroom data

          // Get assigned scorekeeper classes (from classIds array or legacy classId)
          const assignedClasses = roleData?.classIds || 
            (roleData?.classId ? [roleData.classId] : []);

          return {
            ...student,
            role: roleData?.role || 'student',
            assignedBy: roleData?.assignedBy,
            assignedAt: roleData?.assignedAt,
            assignedClasses: assignedClasses,
            allClasses: enrolledClasses
          };
        });

        logger.roster.info('Final students with roles:', studentsWithRoles.length);
        logger.roster.debug('Students with role assignments:', studentsWithRoles.map(s => ({ 
          id: s.id, 
          name: s.displayName, 
          role: s.role,
          assignedAt: s.assignedAt 
        })));
        setFilteredStudents(studentsWithRoles);
        
      } catch (error) {
        logger.roster.error('Error filtering students:', error);
        setFilteredStudents([]);
      }
    };

    filterStudents();
  }, [selectedClass, allStudents]);

  const handleAssignRole = async (studentId: string, newRole: UserRole, targetClassId?: string) => {
    if (!currentUser || userRole !== 'admin') return;

    setAssigning(studentId);
    const classId = targetClassId || selectedClass;
    logger.roles.info(`Assigning role ${newRole} to student ${studentId} for class ${classId}`, { isFirefox });

    try {
      // Firefox-specific delay for Firestore operations
      if (isFirefox) {
        await new Promise(resolve => setTimeout(resolve, 50));
        logger.roles.debug('Firefox: Applied delay before role assignment');
      }

      // Get current role data to handle multi-class assignments
      const currentRoleDoc = await getDoc(doc(db, 'userRoles', studentId));
      let roleData: UserRoleData;

      if (currentRoleDoc.exists()) {
        const existingData = currentRoleDoc.data() as UserRoleData;
        const currentClassIds = existingData.classIds || (existingData.classId ? [existingData.classId] : []);
        
        if (newRole === 'scorekeeper') {
          // Add the class to assigned classes if not already there
          if (!currentClassIds.includes(classId)) {
            currentClassIds.push(classId);
          }
          roleData = {
            ...existingData,
            role: 'scorekeeper',
            classIds: currentClassIds,
            assignedBy: currentUser.uid,
            assignedAt: new Date(),
            permissions: {
              canModifyPP: false,
              canApproveChanges: false,
              canAssignRoles: false,
              canViewAllStudents: true,
              canSubmitPPChanges: true
            }
          };
        } else if (newRole === 'student') {
          // Remove the class from assigned classes
          const updatedClassIds = currentClassIds.filter(id => id !== classId);
          if (updatedClassIds.length === 0) {
            // If no classes left, set role to student
            roleData = {
              ...existingData,
              role: 'student',
              classIds: [],
              assignedBy: currentUser.uid,
              assignedAt: new Date(),
              permissions: {
                canModifyPP: false,
                canApproveChanges: false,
                canAssignRoles: false,
                canViewAllStudents: false,
                canSubmitPPChanges: false
              }
            };
          } else {
            // Update with remaining classes
            roleData = {
              ...existingData,
              classIds: updatedClassIds,
              assignedBy: currentUser.uid,
              assignedAt: new Date()
            };
          }
        } else {
          // Admin role - single class assignment
          roleData = {
            ...existingData,
            role: newRole,
            classId: classId,
            assignedBy: currentUser.uid,
            assignedAt: new Date(),
            permissions: {
              canModifyPP: newRole === 'admin',
              canApproveChanges: newRole === 'admin',
              canAssignRoles: newRole === 'admin',
              canViewAllStudents: newRole === 'admin' || newRole === 'scorekeeper',
              canSubmitPPChanges: newRole === 'scorekeeper' as UserRole as UserRole
            }
          };
        }
      } else {
        // Create new role document
        roleData = {
          userId: studentId,
          role: newRole,
          assignedBy: currentUser.uid,
          assignedAt: new Date(),
          classId: newRole === 'admin' ? classId : undefined,
          classIds: newRole === 'scorekeeper' ? [classId] : undefined,
          permissions: {
            canModifyPP: newRole === 'admin',
            canApproveChanges: newRole === 'admin',
            canAssignRoles: newRole === 'admin',
            canViewAllStudents: newRole === 'admin' || newRole === 'scorekeeper',
            canSubmitPPChanges: newRole === 'scorekeeper' as UserRole
          }
        };
      }

      await setDoc(doc(db, 'userRoles', studentId), {
        ...roleData,
        assignedAt: serverTimestamp()
      });

      // Update local state
      setFilteredStudents(prev => prev.map(student => 
        student.id === studentId 
          ? { 
              ...student, 
              role: roleData.role, 
              assignedBy: currentUser.uid,
              assignedAt: new Date(),
              assignedClasses: roleData.classIds || []
            }
          : student
      ));

      // Create notification
      try {
        const student = filteredStudents.find(s => s.id === studentId);
        if (student) {
          await addDoc(collection(db, 'students', studentId, 'notifications'), {
            type: 'role_assigned',
            message: `You have been assigned the role of ${getRoleDisplayName(newRole)}${newRole === 'scorekeeper' ? '. You can now manage Power Points for other students.' : '.'}`,
            role: newRole,
            assignedBy: currentUser.displayName || currentUser.email,
            timestamp: serverTimestamp(),
            read: false
          });
        }
      } catch (notificationError) {
        console.error('Error creating notification:', notificationError);
      }

      alert(`✅ Successfully assigned ${getRoleDisplayName(newRole)} role!`);
      
    } catch (error) {
      console.error('Error assigning role:', error);
      alert('❌ Failed to assign role. Please try again.');
    } finally {
      setAssigning('');
    }
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  if (loading) {
    return (
      <div style={{ 
        padding: '2rem', 
        textAlign: 'center',
        backgroundColor: 'white',
        borderRadius: '0.75rem',
        boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)'
      }}>
        <div style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>⏳</div>
        <div>Loading Role Manager...</div>
      </div>
    );
  }

  if (userRole !== 'admin') {
    return (
      <div style={{ 
        padding: '2rem', 
        textAlign: 'center',
        backgroundColor: 'white',
        borderRadius: '0.75rem',
        boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
        border: '2px solid #dc2626'
      }}>
        <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>🔒</div>
        <h3 style={{ color: '#dc2626', marginBottom: '1rem' }}>Admin Access Required</h3>
        <p style={{ color: '#7f1d1d' }}>
          You need Administrator permissions to manage user roles.
        </p>
      </div>
    );
  }

  const roleStats = {
    admin: filteredStudents.filter(s => s.role === 'admin').length,
    scorekeeper: filteredStudents.filter(s => s.role === 'scorekeeper').length,
    student: filteredStudents.filter(s => s.role === 'student').length
  };

  return (
    <div style={{ 
      backgroundColor: 'white', 
      borderRadius: '0.75rem', 
      padding: '2rem', 
      boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
      border: '2px solid #7c3aed'
    }}>
      {/* Header */}
      <div style={{ marginBottom: '2rem', textAlign: 'center' }}>
        <h2 style={{ 
          fontSize: '1.75rem', 
          fontWeight: 'bold', 
          color: '#7c3aed',
          marginBottom: '0.5rem'
        }}>
          👥 Role Manager
        </h2>
        <p style={{ color: '#6b7280', fontSize: '0.875rem' }}>
          Assign and manage user roles in your classroom
        </p>
      </div>

      {/* Class Selection */}
      <div style={{ 
        backgroundColor: '#f0f9ff', 
        borderRadius: '0.75rem', 
        padding: '1.5rem',
        marginBottom: '2rem',
        border: '1px solid #bfdbfe'
      }}>
        <h3 style={{ 
          fontSize: '1.25rem', 
          fontWeight: 'bold', 
          marginBottom: '1rem',
          color: '#1e40af'
        }}>
          🏫 Select Class
        </h3>
        
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: '1rem', 
          marginBottom: '1rem',
          flexWrap: 'wrap'
        }}>
          <select
            value={selectedClass}
            onChange={(e) => setSelectedClass(e.target.value)}
            style={{
              padding: '0.75rem',
              borderRadius: '0.5rem',
              border: '1px solid #d1d5db',
              fontSize: '0.875rem',
              backgroundColor: 'white',
              minWidth: '200px'
            }}
          >
            <option value="">Choose a class...</option>
            {availableClasses.map(classInfo => (
              <option key={classInfo.id} value={classInfo.id}>
                {classInfo.name} ({classInfo.studentCount} students)
              </option>
            ))}
          </select>
          
          <button
            onClick={() => window.location.reload()}
            style={{
              backgroundColor: '#7c3aed',
              color: 'white',
              border: 'none',
              padding: '0.75rem 1rem',
              borderRadius: '0.5rem',
              fontSize: '0.875rem',
              fontWeight: 'bold',
              cursor: 'pointer'
            }}
          >
            🔄 Refresh Data
          </button>
          
          <button
            onClick={() => {
              debugRosterState();
              logger.roster.info('Debug function also available in console as: debugRoster()');
            }}
            style={{
              backgroundColor: '#dc2626',
              color: 'white',
              border: 'none',
              padding: '0.75rem 1rem',
              borderRadius: '0.5rem',
              fontSize: '0.875rem',
              fontWeight: 'bold',
              cursor: 'pointer'
            }}
          >
            🔍 Debug Console
          </button>
        </div>
        
        {selectedClass && (
          <div style={{ 
            padding: '0.75rem', 
            backgroundColor: '#dcfce7', 
            borderRadius: '0.5rem',
            border: '1px solid #bbf7d0'
          }}>
            <div style={{ fontSize: '0.875rem', color: '#166534', fontWeight: 'bold' }}>
              Selected: {availableClasses.find(c => c.id === selectedClass)?.name || selectedClass}
            </div>
            <div style={{ fontSize: '0.75rem', color: '#166534', marginTop: '0.25rem' }}>
              All Students: {allStudents.length} | In Class: {filteredStudents.length}
            </div>
          </div>
        )}
      </div>

      {/* Role Statistics */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', 
        gap: '1rem',
        marginBottom: '2rem'
      }}>
        <div style={{
          backgroundColor: '#fef2f2',
          border: '2px solid #fecaca',
          borderRadius: '0.75rem',
          padding: '1rem',
          textAlign: 'center'
        }}>
          <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#dc2626' }}>
            {roleStats.admin}
          </div>
          <div style={{ fontSize: '0.875rem', color: '#7f1d1d', fontWeight: 'bold' }}>
            Administrators
          </div>
        </div>
        
        <div style={{
          backgroundColor: '#f0fdf4',
          border: '2px solid #bbf7d0',
          borderRadius: '0.75rem',
          padding: '1rem',
          textAlign: 'center'
        }}>
          <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#059669' }}>
            {roleStats.scorekeeper}
          </div>
          <div style={{ fontSize: '0.875rem', color: '#065f46', fontWeight: 'bold' }}>
            Scorekeepers
          </div>
        </div>
        
        <div style={{
          backgroundColor: '#eff6ff',
          border: '2px solid #bfdbfe',
          borderRadius: '0.75rem',
          padding: '1rem',
          textAlign: 'center'
        }}>
          <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#3b82f6' }}>
            {roleStats.student}
          </div>
          <div style={{ fontSize: '0.875rem', color: '#1e40af', fontWeight: 'bold' }}>
            Students
          </div>
        </div>
      </div>

      {/* Students List */}
      {!selectedClass ? (
        <div style={{ 
          textAlign: 'center', 
          padding: '3rem',
          backgroundColor: '#fef3c7',
          borderRadius: '0.75rem',
          border: '2px dashed #fbbf24'
        }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🏫</div>
          <h3 style={{ color: '#92400e', marginBottom: '0.5rem' }}>Select a Class</h3>
          <p style={{ color: '#a16207' }}>Choose a class from the dropdown above to view and manage student roles.</p>
        </div>
      ) : (
        <div style={{ marginBottom: '2rem' }}>
          <h3 style={{ 
            fontSize: '1.25rem', 
            fontWeight: 'bold', 
            marginBottom: '1rem',
            color: '#374151'
          }}>
            👨‍🎓 Students in {availableClasses.find(c => c.id === selectedClass)?.name || selectedClass} ({filteredStudents.length})
          </h3>
        
          {filteredStudents.length === 0 ? (
            <div style={{ 
              textAlign: 'center', 
              padding: '2rem',
              backgroundColor: '#f9fafb',
              borderRadius: '0.75rem',
              border: '2px dashed #d1d5db'
            }}>
              <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>👥</div>
              <p style={{ color: '#6b7280' }}>No students found in this classroom.</p>
              <p style={{ color: '#9ca3af', fontSize: '0.875rem' }}>
                Check the Classroom Management tab to add students to this class.
              </p>
            </div>
          ) : (
            <div style={{ display: 'grid', gap: '1rem', maxHeight: '500px', overflowY: 'auto' }}>
              {filteredStudents.map(student => (
                <StudentListItem
                  key={student.id}
                  student={student}
                  showPowerPoints={true}
                  showLevel={false}
                  compact={false}
                  additionalContent={
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                      {/* Current Role Badge */}
                      <span style={{
                        backgroundColor: getRoleBadgeColor(student.role),
                        color: 'white',
                        padding: '0.5rem 1rem',
                        borderRadius: '1rem',
                        fontSize: '0.875rem',
                        fontWeight: 'bold'
                      }}>
                        {getRoleDisplayName(student.role)}
                      </span>
                      
                      {/* Role Assignment Buttons */}
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        {(() => {
                          // Show Student button if:
                          // 1. Student is a scorekeeper in the current class (to remove from this class), OR
                          // 2. Student is an admin (to demote to student)
                          const isScorekeeperInCurrentClass = student.assignedClasses && student.assignedClasses.includes(selectedClass);
                          const shouldShowStudentButton = (student.role === 'scorekeeper' && isScorekeeperInCurrentClass) || student.role === 'admin';
                          
                          return shouldShowStudentButton && (
                            <button
                              onClick={() => handleAssignRole(student.id, 'student')}
                              disabled={assigning === student.id}
                              style={{
                                backgroundColor: '#3b82f6',
                                color: 'white',
                                border: 'none',
                                padding: '0.5rem 0.75rem',
                                borderRadius: '0.5rem',
                                fontSize: '0.75rem',
                                fontWeight: 'bold',
                                cursor: assigning === student.id ? 'not-allowed' : 'pointer',
                                opacity: assigning === student.id ? 0.5 : 1
                              }}
                              aria-label={`Remove ${student.displayName} from scorekeeper role in this class`}
                            >
                              {assigning === student.id ? '⏳' : '👨‍🎓'} Student
                            </button>
                          );
                        })()}
                        
                        {(() => {
                          // Show Scorekeeper button if:
                          // 1. Student is not a scorekeeper at all, OR
                          // 2. Student is a scorekeeper but not assigned to the current class
                          const isScorekeeperInCurrentClass = student.assignedClasses && student.assignedClasses.includes(selectedClass);
                          const shouldShowScorekeeperButton = student.role !== 'scorekeeper' || !isScorekeeperInCurrentClass;
                          
                          return shouldShowScorekeeperButton && (
                            <button
                              onClick={() => handleAssignRole(student.id, 'scorekeeper')}
                              disabled={assigning === student.id}
                              style={{
                                backgroundColor: '#059669',
                                color: 'white',
                                border: 'none',
                                padding: '0.5rem 0.75rem',
                                borderRadius: '0.5rem',
                                fontSize: '0.75rem',
                                fontWeight: 'bold',
                                cursor: assigning === student.id ? 'not-allowed' : 'pointer',
                                opacity: assigning === student.id ? 0.5 : 1
                              }}
                              aria-label={`Assign ${student.displayName} as scorekeeper`}
                            >
                              {assigning === student.id ? '⏳' : '📊'} Scorekeeper
                            </button>
                          );
                        })()}
                      </div>
                      
                      {/* Multi-Class Scorekeeper Info */}
                      {student.role === 'scorekeeper' && student.assignedClasses && student.assignedClasses.length > 0 && (
                        <div style={{ 
                          fontSize: '0.75rem', 
                          color: '#059669',
                          fontWeight: '500'
                        }}>
                          Scorekeeper in {student.assignedClasses.length} class{student.assignedClasses.length > 1 ? 'es' : ''}
                        </div>
                      )}
                      
                      {student.assignedAt && student.assignedBy && (
                        <div style={{ 
                          fontSize: '0.75rem', 
                          color: '#9ca3af',
                          fontStyle: 'italic'
                        }}>
                          Role assigned {formatDate(student.assignedAt)}
                        </div>
                      )}
                    </div>
                  }
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Instructions */}
      <div style={{ 
        backgroundColor: '#dbeafe', 
        borderRadius: '0.75rem', 
        padding: '1.5rem',
        border: '1px solid #3b82f6'
      }}>
        <h3 style={{ 
          fontSize: '1.125rem', 
          fontWeight: 'bold', 
          marginBottom: '1rem',
          color: '#1e40af'
        }}>
          📖 How to Use
        </h3>
        <ol style={{ 
          color: '#1e40af', 
          fontSize: '0.875rem', 
          lineHeight: '1.6',
          paddingLeft: '1.5rem'
        }}>
          <li>Select a class from the dropdown above</li>
          <li>View all students enrolled in that class</li>
          <li>Click "📊 Scorekeeper" to assign scorekeeper role</li>
          <li>Scorekeepers can then submit PP changes for approval</li>
          <li>Use "PP Approval" tab to review scorekeeper submissions</li>
        </ol>
      </div>
    </div>
  );
};

export default RoleManager;
