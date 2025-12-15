import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '../firebase';
import { collection, doc, getDocs, getDoc, addDoc, updateDoc, deleteDoc, onSnapshot, query, where, serverTimestamp } from 'firebase/firestore';
import { getLevelFromXP } from '../utils/leveling';
import OAuthSetupModal from './OAuthSetupModal';
import StudentListItem from './StudentListItem';
import { useGoogleLogin } from '@react-oauth/google';
import SearchBar from './SearchBar';
import { searchStudents } from '../utils/searchUtils';
import { useAuth } from '../context/AuthContext';
import InSessionBattle from './InSessionBattle';

// Classroom interface
interface Classroom {
  id: string;
  name: string;
  description?: string;
  maxStudents?: number;
  students: string[];
}

// Google Classroom API types
interface GoogleClassroomCourse {
  id: string;
  name: string;
  description?: string;
  section?: string;
  ownerId: string;
  creationTime: string;
  updateTime: string;
  enrollmentCode: string;
  courseState: string;
  alternateLink: string;
  teacherGroupEmail: string;
  courseGroupEmail: string;
  guardiansEnabled: boolean;
  calendarId: string;
}

interface GoogleClassroomStudent {
  profile: {
    id: string;
    name: {
      givenName: string;
      familyName: string;
      fullName: string;
    };
    emailAddress: string;
    permissions: Array<{
      permission: string;
    }>;
    photoUrl?: string;
    verifiedTeacher: boolean;
  };
  courseId: string;
  courseWorkId?: string;
  id: string;
  userId: string;
  creationTime: string;
  updateTime: string;
  state: string;
  late: boolean;
  draftGrade?: number;
  assignedGrade?: number;
  alternateLink: string;
  courseWorkType: string;
  assignmentSubmission?: {
    attachments: Array<{
      driveFile?: {
        driveFile: {
          id: string;
          title: string;
          alternateLink: string;
        };
        shareMode: string;
      };
      youTubeVideo?: {
        id: string;
        title: string;
        alternateLink: string;
        thumbnailUrl: string;
      };
      form?: {
        formUrl: string;
        responseUrl: string;
        title: string;
        thumbnailUrl: string;
      };
      link?: {
        url: string;
        title: string;
        thumbnailUrl: string;
      };
    }>;
  };
}

interface Classroom {
  id: string;
  name: string;
  description?: string;
  students: string[];
  createdAt: Date;
  maxStudents?: number;
}

interface Student {
  id: string;
  displayName: string;
  email: string;
  photoURL?: string;
  level: number;
  xp: number;
  powerPoints?: number;
}

const ClassroomManagement: React.FC = () => {
  const { currentUser, isAdmin: isAdminFromAuth } = useAuth();
  const navigate = useNavigate();
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [filteredStudents, setFilteredStudents] = useState<Student[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showAddStudentsModal, setShowAddStudentsModal] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [newClassroom, setNewClassroom] = useState({ name: '', description: '', maxStudents: 30 });
  const [selectedStudents, setSelectedStudents] = useState<string[]>([]);
  const [ppAmount, setPPAmount] = useState<{ [studentId: string]: number | undefined }>({});
  
  // Google Classroom import states
  const [showGoogleImportModal, setShowGoogleImportModal] = useState(false);
  const [googleImportTargetClassroom, setGoogleImportTargetClassroom] = useState<string | null>(null);
  const [googleCourses, setGoogleCourses] = useState<GoogleClassroomCourse[]>([]);
  const [selectedCourse, setSelectedCourse] = useState<string>('');
  const [googleStudents, setGoogleStudents] = useState<GoogleClassroomStudent[]>([]);
  const [importingStudents, setImportingStudents] = useState(false);
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0 });
  const [googleAuthToken, setGoogleAuthToken] = useState<string>('');
  const [showOAuthSetupModal, setShowOAuthSetupModal] = useState(false);
  const [showClassPPView, setShowClassPPView] = useState<string | null>(null);
  
  // In Session states
  const [inSessionActive, setInSessionActive] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionClassId, setSessionClassId] = useState<string | null>(null);
  const [sessionClassName, setSessionClassName] = useState<string>('');
  const [isAdmin, setIsAdmin] = useState(false);

  // Check if user is admin
  useEffect(() => {
    const checkAdminStatus = async () => {
      if (!currentUser) {
        console.log('[ClassroomManagement] No current user, setting isAdmin to false');
        setIsAdmin(false);
        return;
      }
      
      // First check AuthContext's isAdmin function (email-based)
      const isAdminFromAuthContext = isAdminFromAuth();
      
      // Also check email-based admin directly (as additional check)
      const isAdminByEmail = currentUser.email === 'eddymosley@compscihigh.org' || 
                             currentUser.email === 'admin@mstgames.net' ||
                             currentUser.email === 'edm21179@gmail.com' ||
                             currentUser.email === 'eddymosley9@gmail.com' ||
                             currentUser.email?.includes('eddymosley') ||
                             currentUser.email?.includes('admin') ||
                             currentUser.email?.includes('mstgames');
      
      try {
        const roleDoc = await getDoc(doc(db, 'userRoles', currentUser.uid));
        if (roleDoc.exists()) {
          const roleData = roleDoc.data();
          const hasAdminRole = roleData.role === 'admin' || 
                             (roleData.roles && Array.isArray(roleData.roles) && roleData.roles.includes('admin'));
          console.log('[ClassroomManagement] Admin check results:', {
            userId: currentUser.uid,
            email: currentUser.email,
            role: roleData.role,
            roles: roleData.roles,
            hasAdminRole,
            isAdminByEmail: !!isAdminByEmail,
            isAdminFromAuthContext
          });
          // Use any of: role-based admin OR email-based admin OR AuthContext admin check
          setIsAdmin(hasAdminRole || !!isAdminByEmail || isAdminFromAuthContext);
        } else {
          // No role document, use email check or AuthContext
          console.log('[ClassroomManagement] No userRoles document, using email/AuthContext check:', {
            userId: currentUser.uid,
            email: currentUser.email,
            isAdminByEmail: !!isAdminByEmail,
            isAdminFromAuthContext
          });
          setIsAdmin(!!isAdminByEmail || isAdminFromAuthContext);
        }
      } catch (error) {
        console.error('[ClassroomManagement] Error checking admin status:', error);
        // On error, fall back to email check or AuthContext
        console.log('[ClassroomManagement] Error occurred, falling back to email/AuthContext check:', {
          email: currentUser.email,
          isAdminByEmail: !!isAdminByEmail,
          isAdminFromAuthContext
        });
        setIsAdmin(!!isAdminByEmail || isAdminFromAuthContext);
      }
    };
    
    checkAdminStatus();
  }, [currentUser, isAdminFromAuth]);

  // Fetch classrooms and students
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        // Fetch classrooms
        const classroomsSnapshot = await getDocs(collection(db, 'classrooms'));
        const classroomsData: Classroom[] = classroomsSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        } as Classroom));
        setClassrooms(classroomsData);

        // Fetch all users (same logic as AdminPanel)
        const usersSnapshot = await getDocs(collection(db, 'users'));
        const studentsSnapshot = await getDocs(collection(db, 'students'));
        
        console.log('ClassroomManagement: Users collection size:', usersSnapshot.docs.length);
        console.log('ClassroomManagement: Students collection size:', studentsSnapshot.docs.length);
        
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
            console.log('ClassroomManagement: Adding user without student record:', userId, userData);
            studentsMap.set(userId, {
              ...userData,
              xp: 0,
              powerPoints: 0,
              challenges: {}
            });
          }
        });
        
        const studentsData: Student[] = Array.from(studentsMap.values()).map(user => {
          const calculatedLevel = getLevelFromXP(user.xp || 0);
          
          return {
            id: user.id,
            displayName: user.displayName || user.email?.split('@')[0] || 'Unknown',
            email: user.email || '',
            photoURL: user.photoURL,
            level: calculatedLevel,
            xp: user.xp || 0,
            powerPoints: user.powerPoints || 0
          };
        });
        
        console.log('ClassroomManagement: Fetched students:', studentsData.length);
        console.log('ClassroomManagement: Sample students:', studentsData.slice(0, 5));
        
        setStudents(studentsData);
      } catch (error) {
        console.error('Error fetching data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();

    // Set up real-time listener for classrooms
    const unsubscribe = onSnapshot(collection(db, 'classrooms'), (snapshot) => {
      const classroomsData: Classroom[] = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as Classroom));
      setClassrooms(classroomsData);
    }, (error) => {
      // Suppress Firestore internal assertion errors (known issue)
      if (error instanceof Error && 
          (error.message?.includes('INTERNAL ASSERTION FAILED') || 
           error.message?.includes('Unexpected state'))) {
        return;
      }
      console.error('Error listening to classrooms:', error);
    });

    return () => unsubscribe();
  }, []);

  // Filter students based on search query
  useEffect(() => {
    const filtered = searchStudents(students, searchQuery);
    setFilteredStudents(filtered);
  }, [students, searchQuery]);

  // Search handlers
  const handleSearch = (query: string) => {
    setSearchQuery(query);
  };

  const handleClearSearch = () => {
    setSearchQuery('');
  };

  const createClassroom = async () => {
    if (!newClassroom.name.trim()) return;

    try {
      // Create the classroom
      const classroomRef = await addDoc(collection(db, 'classrooms'), {
        name: newClassroom.name.trim(),
        description: newClassroom.description.trim(),
        maxStudents: newClassroom.maxStudents,
        students: [],
        createdAt: new Date()
      });

      const newClassroomId = classroomRef.id;

      // Automatically add all admins as scorekeepers for this new class
      try {
        // Find all users with admin role
        const userRolesQuery = query(
          collection(db, 'userRoles'),
          where('role', '==', 'admin')
        );
        const adminRolesSnapshot = await getDocs(userRolesQuery);
        
        // Update each admin's role to include scorekeeper permissions for this class
        const updatePromises = adminRolesSnapshot.docs.map(async (adminRoleDoc) => {
          const adminRoleData = adminRoleDoc.data();
          const adminId = adminRoleDoc.id;
          
          // Get existing classIds or create new array
          const existingClassIds = adminRoleData.classIds || [];
          
          // Add new classId if not already present
          if (!existingClassIds.includes(newClassroomId)) {
            const updatedClassIds = [...existingClassIds, newClassroomId];
            
            // Update the admin's role document to include scorekeeper classIds
            await updateDoc(doc(db, 'userRoles', adminId), {
              classIds: updatedClassIds,
              // Keep existing role as admin, but add scorekeeper permissions
              permissions: {
                ...adminRoleData.permissions,
                canViewAllStudents: true,
                canSubmitPPChanges: true
              }
            });
            
            console.log(`✅ Added admin ${adminId} as scorekeeper for class ${newClassroomId}`);
          }
        });
        
        await Promise.all(updatePromises);
        console.log(`✅ All admins automatically added as scorekeepers for new class: ${newClassroom.name.trim()}`);
      } catch (adminUpdateError) {
        console.error('Error adding admins as scorekeepers:', adminUpdateError);
        // Don't fail the classroom creation if admin update fails
      }

      setNewClassroom({ name: '', description: '', maxStudents: 30 });
      setShowCreateModal(false);
    } catch (error) {
      console.error('Error creating classroom:', error);
      alert('Failed to create classroom. Please try again.');
    }
  };

  const addStudentsToClassroom = async (classroomId: string) => {
    if (selectedStudents.length === 0) return;

    try {
      const classroomRef = doc(db, 'classrooms', classroomId);
      const classroom = classrooms.find(c => c.id === classroomId);
      
      if (!classroom) return;

      const updatedStudents = Array.from(new Set([...classroom.students, ...selectedStudents]));
      
      await updateDoc(classroomRef, {
        students: updatedStudents
      });

      setSelectedStudents([]);
      setShowAddStudentsModal(null);
    } catch (error) {
      console.error('Error adding students to classroom:', error);
      alert('Failed to add students to classroom. Please try again.');
    }
  };

  const removeStudentFromClassroom = async (classroomId: string, studentId: string) => {
    try {
      const classroomRef = doc(db, 'classrooms', classroomId);
      const classroom = classrooms.find(c => c.id === classroomId);
      
      if (!classroom) return;

      const updatedStudents = classroom.students.filter(id => id !== studentId);
      
      await updateDoc(classroomRef, {
        students: updatedStudents
      });
    } catch (error) {
      console.error('Error removing student from classroom:', error);
      alert('Failed to remove student from classroom. Please try again.');
    }
  };

  const deleteClassroom = async (classroomId: string) => {
    try {
      await deleteDoc(doc(db, 'classrooms', classroomId));
      setShowDeleteConfirm(null);
    } catch (error) {
      console.error('Error deleting classroom:', error);
      alert('Failed to delete classroom. Please try again.');
    }
  };

  const getStudentById = (studentId: string) => {
    return students.find(student => student.id === studentId);
  };

  // Helper function to check which classrooms a student is enrolled in
  const getStudentClassrooms = (studentId: string) => {
    return classrooms.filter(classroom => classroom.students.includes(studentId));
  };

  const getAvailableStudents = (classroomId: string) => {
    const classroom = classrooms.find(c => c.id === classroomId);
    if (!classroom) {
      console.log('ClassroomManagement: No classroom found, returning all students:', students.length);
      return students;
    }
    
    const availableStudents = students.filter(student => !classroom.students.includes(student.id));
    console.log('ClassroomManagement: Available students for classroom', classroomId, ':', availableStudents.length);
    console.log('ClassroomManagement: Classroom students:', classroom.students.length);
    console.log('ClassroomManagement: Total students:', students.length);
    
    // Debug: Check if JB is in the students list and which classrooms he's in
    const jbStudent = students.find(s => s.displayName === 'JB' || s.email?.includes('jeremiah.mejiacuello26'));
    if (jbStudent) {
      console.log('ClassroomManagement: JB student found:', jbStudent);
      console.log('ClassroomManagement: JB is in classrooms:', classrooms.filter(c => c.students.includes(jbStudent.id)).map(c => c.name));
      console.log('ClassroomManagement: JB is available for classroom', classroomId, ':', !classroom.students.includes(jbStudent.id));
    } else {
      console.log('ClassroomManagement: JB student NOT found in students list');
    }
    
    return availableStudents;
  };

  const clearOAuthCache = () => {
    localStorage.removeItem('google_oauth_token');
    localStorage.removeItem('google_oauth_token_expiry');
    setGoogleAuthToken('');
    console.log('OAuth cache cleared');
  };

  // Add/subtract Power Points
  const adjustPowerPoints = async (studentId: string, delta: number) => {
    const student = students.find(s => s.id === studentId);
    if (!student) return;
    const newPP = Math.max(0, (student.powerPoints || 0) + delta);
    const studentRef = doc(db, 'students', studentId);
    await updateDoc(studentRef, { powerPoints: newPP });
    setStudents(prev =>
      prev.map(s =>
        s.id === studentId ? { ...s, powerPoints: newPP } : s
      )
    );
  };

  // Set Power Points to absolute value
  const setPowerPoints = async (studentId: string, amount: number) => {
    console.log('Setting PP for student:', studentId, 'to amount:', amount);
    const student = students.find(s => s.id === studentId);
    if (!student) {
      console.log('Student not found:', studentId);
      return;
    }
    const newPP = Math.max(0, amount);
    console.log('New PP value:', newPP);
    const studentRef = doc(db, 'students', studentId);
    await updateDoc(studentRef, { powerPoints: newPP });
    setStudents(prev =>
      prev.map(s =>
        s.id === studentId ? { ...s, powerPoints: newPP } : s
      )
    );
    console.log('PP updated successfully');
  };

  // Google Classroom API functions
  const googleLogin = useGoogleLogin({
    scope: 'https://www.googleapis.com/auth/classroom.courses.readonly https://www.googleapis.com/auth/classroom.rosters.readonly',
    onSuccess: async (tokenResponse) => {
      console.log('Google OAuth successful:', tokenResponse);
      setGoogleAuthToken(tokenResponse.access_token);
      localStorage.setItem('google_oauth_token', tokenResponse.access_token);
      localStorage.setItem('google_oauth_token_expiry', (new Date().getTime() + (tokenResponse.expires_in * 1000)).toString());
      
      // Fetch courses immediately after successful login
      await fetchGoogleCoursesWithToken(tokenResponse.access_token);
    },
    onError: (error) => {
      console.error('Google OAuth error:', error);
      setShowOAuthSetupModal(true);
    },
    flow: 'implicit',
  });

  const authenticateGoogle = async () => {
    try {
      // Check if we already have a valid token
      const existingToken = localStorage.getItem('google_oauth_token');
      const tokenExpiry = localStorage.getItem('google_oauth_token_expiry');
      
      if (existingToken && tokenExpiry && new Date().getTime() < parseInt(tokenExpiry)) {
        console.log('Using existing OAuth token');
        setGoogleAuthToken(existingToken);
        return existingToken;
      }
      
      // If no valid token, trigger Google login
      console.log('No valid token found, triggering Google login...');
      googleLogin();
      return null;
    } catch (error) {
      console.error('Google authentication error:', error);
      return null;
    }
  };

  const fetchGoogleCoursesWithToken = async (token: string) => {
    try {
      console.log('Fetching Google Classroom courses with token');
      
      const response = await fetch('https://classroom.googleapis.com/v1/courses', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      console.log('API Response status:', response.status);
      
      if (response.ok) {
        const data = await response.json();
        console.log('Google Classroom courses:', data);
        setGoogleCourses(data.courses || []);
      } else {
        const errorData = await response.text();
        console.error('Failed to fetch courses:', errorData);
        setShowOAuthSetupModal(true);
      }
    } catch (error) {
      console.error('Error fetching Google Classroom courses:', error);
      setShowOAuthSetupModal(true);
    }
  };

  const fetchGoogleCourses = async () => {
    if (!googleAuthToken) {
      const token = await authenticateGoogle();
      if (!token) return;
    }

    // If using demo token, show demo data
    if (googleAuthToken === 'demo-token') {
      console.log('Showing demo Google Classroom courses');
      setGoogleCourses([
        {
          id: 'demo-course-1',
          name: 'Computer Science Fundamentals',
          description: 'Introduction to programming and computer science concepts',
          section: 'CS101',
          ownerId: 'demo-teacher-1',
          creationTime: new Date().toISOString(),
          updateTime: new Date().toISOString(),
          enrollmentCode: 'demo-abc123',
          courseState: 'ACTIVE',
          alternateLink: 'https://classroom.google.com/c/demo-course-1',
          teacherGroupEmail: 'cs101@demo.com',
          courseGroupEmail: 'cs101-students@demo.com',
          guardiansEnabled: false,
          calendarId: 'demo-calendar-1'
        },
        {
          id: 'demo-course-2',
          name: 'Advanced Mathematics',
          description: 'Advanced mathematical concepts and problem solving',
          section: 'MATH201',
          ownerId: 'demo-teacher-2',
          creationTime: new Date().toISOString(),
          updateTime: new Date().toISOString(),
          enrollmentCode: 'demo-def456',
          courseState: 'ACTIVE',
          alternateLink: 'https://classroom.google.com/c/demo-course-2',
          teacherGroupEmail: 'math201@demo.com',
          courseGroupEmail: 'math201-students@demo.com',
          guardiansEnabled: true,
          calendarId: 'demo-calendar-2'
        },
        {
          id: 'demo-course-3',
          name: 'English Literature',
          description: 'Exploring classic and contemporary literature',
          section: 'ENG301',
          ownerId: 'demo-teacher-3',
          creationTime: new Date().toISOString(),
          updateTime: new Date().toISOString(),
          enrollmentCode: 'demo-ghi789',
          courseState: 'ACTIVE',
          alternateLink: 'https://classroom.google.com/c/demo-course-3',
          teacherGroupEmail: 'eng301@demo.com',
          courseGroupEmail: 'eng301-students@demo.com',
          guardiansEnabled: false,
          calendarId: 'demo-calendar-3'
        }
      ]);
      return;
    }

    try {
      console.log('Fetching Google Classroom courses with OAuth token');
      
      // Use the new function with the current token
      await fetchGoogleCoursesWithToken(googleAuthToken);
    } catch (error) {
      console.error('Error fetching Google Classroom courses:', error);
      setShowOAuthSetupModal(true);
    }
  };

    const fetchGoogleStudents = async (courseId: string) => {
      if (!googleAuthToken) {
        const token = await authenticateGoogle();
        if (!token) return;
      }

      // If using demo token, show demo students
      if (googleAuthToken === 'demo-token') {
        console.log('Showing demo students for course:', courseId);
        setGoogleStudents([
          {
            profile: {
              id: 'demo-student-1',
              name: { givenName: 'John', familyName: 'Doe', fullName: 'John Doe' },
              emailAddress: 'john.doe@student.com',
              permissions: [{ permission: 'STUDENT' }],
              photoUrl: 'https://ui-avatars.com/api/?name=John+Doe&background=4f46e5&color=fff&size=32',
              verifiedTeacher: false
            },
            courseId: courseId,
            id: 'demo-enrollment-1',
            userId: 'demo-student-1',
            creationTime: new Date().toISOString(),
            updateTime: new Date().toISOString(),
            state: 'ACTIVE',
            late: false,
            alternateLink: `https://classroom.google.com/c/${courseId}/user/demo-student-1`,
            courseWorkType: 'ASSIGNMENT'
          },
          {
            profile: {
              id: 'demo-student-2',
              name: { givenName: 'Jane', familyName: 'Smith', fullName: 'Jane Smith' },
              emailAddress: 'jane.smith@student.com',
              permissions: [{ permission: 'STUDENT' }],
              photoUrl: 'https://ui-avatars.com/api/?name=Jane+Smith&background=10b981&color=fff&size=32',
              verifiedTeacher: false
            },
            courseId: courseId,
            id: 'demo-enrollment-2',
            userId: 'demo-student-2',
            creationTime: new Date().toISOString(),
            updateTime: new Date().toISOString(),
            state: 'ACTIVE',
            late: false,
            alternateLink: `https://classroom.google.com/c/${courseId}/user/demo-student-2`,
            courseWorkType: 'ASSIGNMENT'
          },
          {
            profile: {
              id: 'demo-student-3',
              name: { givenName: 'Mike', familyName: 'Johnson', fullName: 'Mike Johnson' },
              emailAddress: 'mike.johnson@student.com',
              permissions: [{ permission: 'STUDENT' }],
              photoUrl: 'https://ui-avatars.com/api/?name=Mike+Johnson&background=f59e0b&color=fff&size=32',
              verifiedTeacher: false
            },
            courseId: courseId,
            id: 'demo-enrollment-3',
            userId: 'demo-student-3',
            creationTime: new Date().toISOString(),
            updateTime: new Date().toISOString(),
            state: 'ACTIVE',
            late: false,
            alternateLink: `https://classroom.google.com/c/${courseId}/user/demo-student-3`,
            courseWorkType: 'ASSIGNMENT'
          }
        ]);
        return;
      }

      try {
        console.log('Fetching students for course:', courseId);
        
        // Real Google Classroom API call with OAuth token
        const response = await fetch(`https://classroom.googleapis.com/v1/courses/${courseId}/students`, {
          headers: {
            'Authorization': `Bearer ${googleAuthToken}`,
            'Content-Type': 'application/json'
          }
        });
        console.log('Students API Response status:', response.status);
        
        if (response.ok) {
          const data = await response.json();
          console.log('Google Classroom students response:', data);
          
          if (data.students && data.students.length > 0) {
            setGoogleStudents(data.students);
          } else {
            setGoogleStudents([]);
            alert('No students found in this Google Classroom course.');
          }
        } else {
          const errorData = await response.text();
          console.error('Google Classroom students API error:', response.status, errorData);
          
          if (response.status === 403) {
            alert('Access denied to course students. Please check OAuth permissions.');
          } else if (response.status === 404) {
            alert('Course not found or you don\'t have access to it.');
          } else {
            alert(`Error fetching students: ${response.status} - ${errorData}`);
          }
          
          setGoogleStudents([]);
        }
      } catch (error) {
        console.error('Error fetching Google students:', error);
        alert('Network error when fetching students. Please try again.');
        setGoogleStudents([]);
      }
    };

    const importGoogleStudents = async (classroomId: string) => {
      if (!selectedCourse || googleStudents.length === 0) return;

      setImportingStudents(true);
      setImportProgress({ current: 0, total: googleStudents.length });

      try {
        console.log('Looking for classroom with ID:', classroomId);
        console.log('Available classrooms:', classrooms.map(c => ({ id: c.id, name: c.name })));
        
        let classroom = classrooms.find(c => c.id === classroomId);
        if (!classroom) {
          console.error('Classroom not found! Available IDs:', classrooms.map(c => c.id));
          console.log('Attempting to refresh classrooms data...');
          
                     // Try to refresh classrooms data  
          const classroomsSnapshot = await getDocs(collection(db, 'classrooms'));
          const refreshedClassrooms: Classroom[] = classroomsSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          } as Classroom));
          setClassrooms(refreshedClassrooms);
          classroom = refreshedClassrooms.find(c => c.id === classroomId);
          
          if (!classroom) {
            throw new Error(`Classroom not found with ID: ${classroomId}. Please refresh the page and try again.`);
          }
        }

        console.log('Found classroom:', classroom);

        // Filter out students that are already in the classroom
        const newStudents = googleStudents.filter(googleStudent => 
          !classroom!.students.includes(googleStudent.profile.id)
        );

        // Add students to the classroom
        for (let i = 0; i < newStudents.length; i++) {
          const googleStudent = newStudents[i];
          
          try {
            console.log(`Processing student ${i + 1}/${newStudents.length}: ${googleStudent.profile.name.fullName}`);
            
            // Check if student already exists in our system
            const existingStudent = students.find(s => s.email === googleStudent.profile.emailAddress);
            
            if (!existingStudent) {
              console.log(`Creating new student account for: ${googleStudent.profile.emailAddress}`);
              
              // Create new student account
              const newStudentData = {
                displayName: googleStudent.profile.name.fullName,
                email: googleStudent.profile.emailAddress,
                photoURL: googleStudent.profile.photoUrl,
                xp: 0,
                powerPoints: 0,
                createdAt: new Date()
              };

              // Add to users collection
              const userRef = await addDoc(collection(db, 'users'), newStudentData);
              console.log(`Created user document: ${userRef.id}`);
              
              // Add to students collection
              await addDoc(collection(db, 'students'), {
                ...newStudentData,
                userId: userRef.id
              });
              console.log(`Created student document for user: ${userRef.id}`);

                          // Add to classroom
            await updateDoc(doc(db, 'classrooms', classroomId), {
              students: [...classroom!.students, userRef.id]
            });
              console.log(`Added student ${userRef.id} to classroom ${classroomId}`);
            } else {
              console.log(`Found existing student: ${existingStudent.email}`);
                          // Add existing student to classroom if not already there
            if (!classroom!.students.includes(existingStudent.id)) {
              await updateDoc(doc(db, 'classrooms', classroomId), {
                students: [...classroom!.students, existingStudent.id]
              });
                console.log(`Added existing student ${existingStudent.id} to classroom ${classroomId}`);
              } else {
                console.log(`Student ${existingStudent.id} already in classroom`);
              }
            }

            setImportProgress({ current: i + 1, total: newStudents.length });
          } catch (studentError) {
            console.error(`Error processing student ${googleStudent.profile.name.fullName}:`, studentError);
            // Continue with next student instead of failing completely
          }
        }

        // Reset Google import state and refresh data
        setGoogleImportTargetClassroom(null);
        setShowGoogleImportModal(false);
        window.location.reload();
      } catch (error) {
        console.error('Error importing students:', error);
        
        // More detailed error message
        let errorMessage = 'Error importing students. ';
        if (error instanceof Error) {
          errorMessage += `Details: ${error.message}`;
        } else {
          errorMessage += 'Please try again.';
        }
        
        alert(errorMessage);
      } finally {
        setImportingStudents(false);
        setImportProgress({ current: 0, total: 0 });
      }
    };

  // If session is active, show the battle interface
  if (inSessionActive && sessionId && sessionClassId) {
    const classStudents = students
      .filter(s => {
        const classroom = classrooms.find(c => c.id === sessionClassId);
        return classroom?.students.includes(s.id);
      })
      .map(s => ({
        ...s,
        powerPoints: s.powerPoints || 0 // Ensure powerPoints is always a number
      }));
    
    return (
      <InSessionBattle
        sessionId={sessionId}
        classId={sessionClassId}
        className={sessionClassName}
        students={classStudents}
        onEndSession={() => {
          setInSessionActive(false);
          setSessionId(null);
          setSessionClassId(null);
          setSessionClassName('');
        }}
      />
    );
  }

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '2rem', color: '#6b7280' }}>
        Loading classroom data...
      </div>
    );
  }

  return (
    <div style={{
      background: '#f8fafc',
      borderRadius: '0.75rem',
      padding: '2rem',
      minHeight: '300px',
      color: '#374151',
      border: '1px solid #e5e7eb',
      marginBottom: '2rem'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>
            🏫 Classroom Management
          </h2>
          <p style={{ fontSize: '1.125rem', color: '#6b7280' }}>
            Create and manage classrooms, add students, and organize your learning environment.
          </p>
          
          {/* Debug Panel - Remove this after debugging */}
          <div style={{ 
            backgroundColor: '#fef3c7', 
            border: '1px solid #f59e0b', 
            borderRadius: '0.5rem', 
            padding: '1rem', 
            marginTop: '1rem',
            fontSize: '0.875rem'
          }}>
            <h4 style={{ margin: '0 0 0.5rem 0', color: '#92400e' }}>🔍 Debug Info</h4>
            <div style={{ color: '#92400e' }}>
              <div>Total Students: {students.length}</div>
              <div>Total Classrooms: {classrooms.length}</div>
              {(() => {
                const jbStudent = students.find(s => s.displayName === 'JB' || s.email?.includes('jeremiah.mejiacuello26'));
                if (jbStudent) {
                  const jbClassrooms = getStudentClassrooms(jbStudent.id);
                  return (
                    <div>
                      <div>JB Student Found: ✅</div>
                      <div>JB ID: {jbStudent.id}</div>
                      <div>JB Email: {jbStudent.email}</div>
                      <div>JB Enrolled in {jbClassrooms.length} classroom(s): {jbClassrooms.map(c => c.name).join(', ') || 'None'}</div>
                    </div>
                  );
                } else {
                  return <div>JB Student: ❌ Not found</div>;
                }
              })()}
            </div>
          </div>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          style={{
            backgroundColor: '#10b981',
            color: 'white',
            border: 'none',
            borderRadius: '0.5rem',
            padding: '0.75rem 1.5rem',
            fontWeight: 'bold',
            cursor: 'pointer',
            fontSize: '0.875rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}
        >
          ➕ Create Classroom
        </button>
      </div>

      {/* Classrooms Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '1.5rem' }}>
        {classrooms.map((classroom) => (
          <div key={classroom.id} style={{
            backgroundColor: 'white',
            borderRadius: '0.75rem',
            padding: '1.5rem',
            border: '1px solid #e5e7eb',
            boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
              <div>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#1f2937', margin: '0 0 0.5rem 0' }}>
                  {classroom.name}
                </h3>
                {classroom.description && (
                  <p style={{ color: '#6b7280', fontSize: '0.875rem', margin: 0 }}>
                    {classroom.description}
                  </p>
                )}
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <button
                  onClick={async () => {
                    if (!isAdmin) {
                      alert('Only administrators can start In Session battles.');
                      return;
                    }
                    
                    try {
                      // Get students for this classroom
                      const classStudents = classroom.students
                        .map(studentId => students.find(s => s.id === studentId))
                        .filter(Boolean) as Student[];
                      
                      if (classStudents.length === 0) {
                        alert('No students in this classroom. Add students before starting a session.');
                        return;
                      }
                      
                      // Helper function to remove undefined values (Firestore doesn't allow undefined)
                      const removeUndefined = (obj: any): any => {
                        if (obj === null || obj === undefined) {
                          return null;
                        }
                        if (Array.isArray(obj)) {
                          return obj.map(item => removeUndefined(item));
                        }
                        if (typeof obj === 'object' && obj.constructor === Object) {
                          const cleaned: any = {};
                          for (const key in obj) {
                            if (obj.hasOwnProperty(key) && obj[key] !== undefined) {
                              cleaned[key] = removeUndefined(obj[key]);
                            }
                          }
                          return cleaned;
                        }
                        return obj;
                      };

                      // Create a new session room
                      // Start with empty players array - students must join manually
                      const sessionData = {
                        classId: classroom.id,
                        className: classroom.name,
                        teacherId: currentUser?.uid || '',
                        status: 'active',
                        players: [], // Start empty - students join via notification button
                        activeViewers: [currentUser?.uid || ''], // Initialize with teacher/admin who started the session
                        createdAt: serverTimestamp(),
                        startedAt: serverTimestamp(),
                        battleLog: ['📚 In Session Battle Started!']
                      };
                      
                      // Remove any undefined values before saving
                      const cleanedSessionData = removeUndefined(sessionData);
                      const sessionRef = await addDoc(collection(db, 'inSessionRooms'), cleanedSessionData);
                        // Navigate to the session view
                        navigate(`/in-session/${sessionRef.id}`);
                    } catch (error) {
                      // Suppress Firestore internal assertion errors (known issue)
                      if (error instanceof Error && 
                          (error.message?.includes('INTERNAL ASSERTION FAILED') || 
                           error.message?.includes('Unexpected state'))) {
                        // Still try to navigate if we have a session ID
                        console.warn('Firestore internal assertion error (suppressed):', error);
                        return;
                      }
                      console.error('Error starting session:', error);
                      alert('Failed to start session. Please try again.');
                    }
                  }}
                  disabled={!isAdmin}
                  style={{
                    background: isAdmin 
                      ? 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)' 
                      : 'linear-gradient(135deg, #9ca3af 0%, #6b7280 100%)',
                    color: 'white',
                    border: 'none',
                    borderRadius: '0.375rem',
                    padding: '0.5rem 0.75rem',
                    fontSize: '0.75rem',
                    cursor: isAdmin ? 'pointer' : 'not-allowed',
                    fontWeight: '500',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.25rem',
                    boxShadow: isAdmin ? '0 2px 4px rgba(139, 92, 246, 0.3)' : 'none',
                    whiteSpace: 'nowrap',
                    opacity: isAdmin ? 1 : 0.6
                  }}
                  title={isAdmin ? "Start an In Session battle for this class" : "Only administrators can start In Session battles"}
                >
                  📚 Start In Session
                </button>
                <button
                  onClick={() => setShowAddStudentsModal(classroom.id)}
                  style={{
                    backgroundColor: '#3b82f6',
                    color: 'white',
                    border: 'none',
                    borderRadius: '0.375rem',
                    padding: '0.5rem 0.75rem',
                    fontSize: '0.75rem',
                    cursor: 'pointer',
                    fontWeight: '500',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.25rem',
                    whiteSpace: 'nowrap'
                  }}
                >
                  👥 Add Students
                </button>
                <button
                  onClick={() => setShowClassPPView(classroom.id)}
                  style={{
                    backgroundColor: '#8b5cf6',
                    color: 'white',
                    border: 'none',
                    borderRadius: '0.375rem',
                    padding: '0.5rem 0.75rem',
                    fontSize: '0.75rem',
                    cursor: 'pointer',
                    fontWeight: '500',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.25rem',
                    whiteSpace: 'nowrap'
                  }}
                >
                  ⚡ View PP
                </button>
                <button
                  onClick={() => {
                    setGoogleImportTargetClassroom(classroom.id);
                    setShowGoogleImportModal(true);
                    fetchGoogleCourses();
                  }}
                  style={{
                    backgroundColor: '#f59e0b',
                    color: 'white',
                    border: 'none',
                    borderRadius: '0.375rem',
                    padding: '0.5rem 0.75rem',
                    fontSize: '0.75rem',
                    cursor: 'pointer',
                    fontWeight: '500',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.25rem',
                    whiteSpace: 'nowrap'
                  }}
                >
                  📚 Import from Google
                </button>
                <button
                  onClick={() => setShowOAuthSetupModal(true)}
                  style={{
                    backgroundColor: 'transparent',
                    color: '#6b7280',
                    border: '1px solid #d1d5db',
                    borderRadius: '0.375rem',
                    padding: '0.5rem 0.75rem',
                    fontSize: '0.75rem',
                    cursor: 'pointer',
                    fontWeight: '500',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.25rem',
                    whiteSpace: 'nowrap'
                  }}
                  title="OAuth Setup Help"
                >
                  ⚙️ OAuth Help
                </button>
                <button
                  onClick={() => setShowDeleteConfirm(classroom.id)}
                  style={{
                    backgroundColor: '#dc2626',
                    color: 'white',
                    border: 'none',
                    borderRadius: '0.375rem',
                    padding: '0.5rem 0.75rem',
                    fontSize: '0.75rem',
                    cursor: 'pointer',
                    fontWeight: '500',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.25rem',
                    whiteSpace: 'nowrap'
                  }}
                >
                  🗑️ Delete
                </button>
              </div>
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <span style={{
                backgroundColor: '#f3f4f6',
                color: '#374151',
                padding: '0.25rem 0.75rem',
                borderRadius: '1rem',
                fontSize: '0.75rem',
                fontWeight: '500'
              }}>
                {classroom.students.length}/{classroom.maxStudents || '∞'} Students
              </span>
            </div>

            {/* Students List */}
            <div>
              <h4 style={{ fontSize: '1rem', fontWeight: '600', color: '#374151', marginBottom: '0.75rem' }}>
                Students
              </h4>
              {classroom.students.length === 0 ? (
                <p style={{ color: '#9ca3af', fontSize: '0.875rem', fontStyle: 'italic' }}>
                  No students enrolled yet
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {classroom.students.map((studentId) => {
                    const student = getStudentById(studentId);
                    if (!student) return null;

                    return (
                      <StudentListItem
                        key={studentId}
                        student={student}
                        showPowerPoints={true}
                        showLevel={true}
                        onAdjustPowerPoints={adjustPowerPoints}
                        onSetPowerPoints={(studentId, amount) => {
                          setPowerPoints(studentId, amount);
                          setPPAmount(prev => ({ ...prev, [studentId]: undefined }));
                        }}
                        ppInputValue={ppAmount[student.id]}
                        onPPInputChange={(studentId, value) => setPPAmount(prev => ({ 
                          ...prev, 
                          [studentId]: value 
                        }))}
                        compact={true}
                        additionalContent={
                          <button
                            onClick={() => removeStudentFromClassroom(classroom.id, studentId)}
                            style={{
                              backgroundColor: '#fef2f2',
                              color: '#dc2626',
                              border: '1px solid #fecaca',
                              borderRadius: '0.25rem',
                              padding: '0.25rem 0.5rem',
                              fontSize: '0.75rem',
                              cursor: 'pointer'
                            }}
                            aria-label={`Remove ${student.displayName} from classroom`}
                          >
                            Remove
                          </button>
                        }
                      />
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {classrooms.length === 0 && (
        <div style={{ textAlign: 'center', padding: '3rem', color: '#9ca3af' }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🏫</div>
          <h3 style={{ fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>
            No Classrooms Yet
          </h3>
          <p style={{ fontSize: '1rem' }}>
            Create your first classroom to start organizing students.
          </p>
        </div>
      )}

      {/* Create Classroom Modal */}
      {showCreateModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '0.75rem',
            padding: '2rem',
            maxWidth: '500px',
            width: '90%',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)'
          }}>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '1.5rem' }}>
              Create New Classroom
            </h3>
            
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600' }}>
                Classroom Name *
              </label>
              <input
                type="text"
                value={newClassroom.name}
                onChange={(e) => setNewClassroom({ ...newClassroom, name: e.target.value })}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '0.375rem',
                  fontSize: '0.875rem'
                }}
                placeholder="Enter classroom name"
              />
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600' }}>
                Description
              </label>
              <textarea
                value={newClassroom.description}
                onChange={(e) => setNewClassroom({ ...newClassroom, description: e.target.value })}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '0.375rem',
                  fontSize: '0.875rem',
                  minHeight: '80px',
                  resize: 'vertical'
                }}
                placeholder="Enter classroom description (optional)"
              />
            </div>

            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600' }}>
                Maximum Students
              </label>
              <input
                type="number"
                value={newClassroom.maxStudents}
                onChange={(e) => setNewClassroom({ ...newClassroom, maxStudents: parseInt(e.target.value) || 30 })}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '0.375rem',
                  fontSize: '0.875rem'
                }}
                placeholder="30"
                min="1"
              />
            </div>

            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowCreateModal(false)}
                style={{
                  backgroundColor: '#6b7280',
                  color: 'white',
                  border: 'none',
                  padding: '0.75rem 1.5rem',
                  borderRadius: '0.5rem',
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                  fontWeight: '600'
                }}
              >
                Cancel
              </button>
              <button
                onClick={createClassroom}
                disabled={!newClassroom.name.trim()}
                style={{
                  backgroundColor: newClassroom.name.trim() ? '#10b981' : '#9ca3af',
                  color: 'white',
                  border: 'none',
                  padding: '0.75rem 1.5rem',
                  borderRadius: '0.5rem',
                  cursor: newClassroom.name.trim() ? 'pointer' : 'not-allowed',
                  fontSize: '0.875rem',
                  fontWeight: '600'
                }}
              >
                Create Classroom
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Students Modal */}
      {showAddStudentsModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '1rem'
        }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '0.75rem',
            padding: '2rem',
            maxWidth: '700px',
            width: '100%',
            height: '80vh',
            maxHeight: '600px',
            minHeight: '500px',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)'
          }}>
            <div style={{ marginBottom: '1.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                <h3 style={{ fontSize: '1.5rem', fontWeight: 'bold', margin: 0, color: '#1f2937' }}>
                  Add Students to Classroom
                </h3>
                <button
                  onClick={() => {
                    // Refresh students data (same logic as main fetch)
                    const fetchData = async () => {
                      try {
                        const usersSnapshot = await getDocs(collection(db, 'users'));
                        const studentsSnapshot = await getDocs(collection(db, 'students'));
                        
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
                            studentsMap.set(userId, {
                              ...userData,
                              xp: 0,
                              powerPoints: 0,
                              challenges: {}
                            });
                          }
                        });
                        
                        const studentsData: Student[] = Array.from(studentsMap.values()).map(user => {
                          const calculatedLevel = getLevelFromXP(user.xp || 0);
                          
                          return {
                            id: user.id,
                            displayName: user.displayName || user.email?.split('@')[0] || 'Unknown',
                            email: user.email || '',
                            photoURL: user.photoURL,
                            level: calculatedLevel,
                            xp: user.xp || 0,
                            powerPoints: user.powerPoints || 0
                          };
                        });
                        
                        console.log('ClassroomManagement: Refreshed students:', studentsData.length);
                        setStudents(studentsData);
                      } catch (error) {
                        console.error('Error refreshing students:', error);
                      }
                    };
                    fetchData();
                  }}
                  style={{
                    backgroundColor: '#3b82f6',
                    color: 'white',
                    border: 'none',
                    borderRadius: '0.375rem',
                    padding: '0.5rem 0.75rem',
                    fontSize: '0.75rem',
                    cursor: 'pointer',
                    fontWeight: '500',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.25rem'
                  }}
                >
                  🔄 Refresh
                </button>
              </div>
              <p style={{ fontSize: '0.875rem', color: '#6b7280', margin: 0 }}>
                Select students to add to this classroom. You can scroll to see all available students.
              </p>
              
              {/* Search Bar for Add Students Modal */}
              <div style={{ marginTop: '1rem' }}>
                <SearchBar
                  placeholder="Search students by name or email..."
                  onSearch={handleSearch}
                  onClear={handleClearSearch}
                  style={{ maxWidth: '100%' }}
                />
                {searchQuery && (
                  <div style={{ 
                    marginTop: '0.5rem', 
                    fontSize: '0.75rem', 
                    color: '#6b7280' 
                  }}>
                    Showing {getAvailableStudents(showAddStudentsModal).filter(student => 
                      searchStudents([student], searchQuery).length > 0
                    ).length} of {getAvailableStudents(showAddStudentsModal).length} available students
                  </div>
                )}
              </div>
              {getAvailableStudents(showAddStudentsModal).length > 5 && (
                <div style={{ 
                  fontSize: '0.75rem', 
                  color: '#9ca3af', 
                  marginTop: '0.5rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.25rem'
                }}>
                  <span>📜</span>
                  <span>Scroll down to see more students</span>
                </div>
              )}
            </div>
            
            <div style={{ 
              flex: 1, 
              overflowY: 'auto', 
              overflowX: 'hidden',
              marginBottom: '1.5rem',
              border: '1px solid #e5e7eb',
              borderRadius: '0.5rem',
              backgroundColor: '#f9fafb',
              minHeight: '300px',
              maxHeight: '400px',
              scrollbarWidth: 'thin',
              scrollbarColor: '#cbd5e1 #f1f5f9'
            }}>
              {getAvailableStudents(showAddStudentsModal).length === 0 ? (
                <div style={{ 
                  color: '#9ca3af', 
                  textAlign: 'center', 
                  padding: '3rem 2rem',
                  backgroundColor: 'white',
                  margin: '1rem',
                  borderRadius: '0.5rem',
                  border: '1px solid #e5e7eb'
                }}>
                  <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>👥</div>
                  <p style={{ fontSize: '1rem', fontWeight: '500', marginBottom: '0.5rem' }}>
                    All students are already enrolled
                  </p>
                  <p style={{ fontSize: '0.875rem', margin: 0 }}>
                    There are no available students to add to this classroom.
                  </p>
                </div>
              ) : (
                <div style={{ 
                  display: 'flex', 
                  flexDirection: 'column', 
                  gap: '0.5rem',
                  padding: '1rem'
                }}>
                  {getAvailableStudents(showAddStudentsModal).filter(student => 
                    searchStudents([student], searchQuery).length > 0
                  ).map((student) => (
                    <label key={student.id} style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.75rem',
                      padding: '1rem',
                      border: '1px solid #e5e7eb',
                      borderRadius: '0.5rem',
                      cursor: 'pointer',
                      backgroundColor: selectedStudents.includes(student.id) ? '#eff6ff' : 'white',
                      transition: 'all 0.2s ease',
                      boxShadow: selectedStudents.includes(student.id) ? '0 2px 4px rgba(59, 130, 246, 0.1)' : '0 1px 2px rgba(0, 0, 0, 0.05)'
                    }}
                    onMouseEnter={(e) => {
                      if (!selectedStudents.includes(student.id)) {
                        e.currentTarget.style.backgroundColor = '#f8fafc';
                        e.currentTarget.style.borderColor = '#d1d5db';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!selectedStudents.includes(student.id)) {
                        e.currentTarget.style.backgroundColor = 'white';
                        e.currentTarget.style.borderColor = '#e5e7eb';
                      }
                    }}>
                      <input
                        type="checkbox"
                        checked={selectedStudents.includes(student.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedStudents([...selectedStudents, student.id]);
                          } else {
                            setSelectedStudents(selectedStudents.filter(id => id !== student.id));
                          }
                        }}
                        style={{ 
                          margin: 0,
                          width: '18px',
                          height: '18px',
                          accentColor: '#3b82f6'
                        }}
                      />
                      <img
                        src={student.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(student.displayName)}&background=4f46e5&color=fff&size=40`}
                        alt={student.displayName}
                        style={{
                          width: '40px',
                          height: '40px',
                          borderRadius: '50%',
                          objectFit: 'cover',
                          border: '2px solid #e5e7eb'
                        }}
                      />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '1rem', fontWeight: '600', color: '#1f2937', marginBottom: '0.25rem' }}>
                          {student.displayName}
                        </div>
                        <div style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.25rem' }}>
                          {student.email}
                        </div>
                        <div style={{ 
                          display: 'flex', 
                          gap: '1rem',
                          fontSize: '0.75rem',
                          color: '#9ca3af'
                        }}>
                          <span>Level {student.level}</span>
                          <span>•</span>
                          <span>{student.xp} XP</span>
                          <span>•</span>
                          <span>{student.powerPoints || 0} PP</span>
                        </div>
                      </div>
                      {selectedStudents.includes(student.id) && (
                        <div style={{
                          color: '#3b82f6',
                          fontSize: '1.25rem',
                          fontWeight: 'bold'
                        }}>
                          ✓
                        </div>
                      )}
                    </label>
                  ))}
                </div>
              )}
            </div>

            <div style={{ 
              display: 'flex', 
              gap: '1rem', 
              justifyContent: 'space-between',
              alignItems: 'center',
              paddingTop: '1rem',
              borderTop: '1px solid #e5e7eb'
            }}>
              <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                {selectedStudents.length > 0 && (
                  <span>
                    {selectedStudents.length} student{selectedStudents.length !== 1 ? 's' : ''} selected
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', gap: '1rem' }}>
                <button
                  onClick={() => {
                    setShowAddStudentsModal(null);
                    setSelectedStudents([]);
                  }}
                  style={{
                    backgroundColor: '#6b7280',
                    color: 'white',
                    border: 'none',
                    padding: '0.75rem 1.5rem',
                    borderRadius: '0.5rem',
                    cursor: 'pointer',
                    fontSize: '0.875rem',
                    fontWeight: '600',
                    transition: 'all 0.2s ease'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#4b5563';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = '#6b7280';
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={() => addStudentsToClassroom(showAddStudentsModal)}
                  disabled={selectedStudents.length === 0}
                  style={{
                    backgroundColor: selectedStudents.length > 0 ? '#3b82f6' : '#9ca3af',
                    color: 'white',
                    border: 'none',
                    padding: '0.75rem 1.5rem',
                    borderRadius: '0.5rem',
                    cursor: selectedStudents.length > 0 ? 'pointer' : 'not-allowed',
                    fontSize: '0.875rem',
                    fontWeight: '600',
                    transition: 'all 0.2s ease',
                    opacity: selectedStudents.length > 0 ? 1 : 0.6
                  }}
                  onMouseEnter={(e) => {
                    if (selectedStudents.length > 0) {
                      e.currentTarget.style.backgroundColor = '#2563eb';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (selectedStudents.length > 0) {
                      e.currentTarget.style.backgroundColor = '#3b82f6';
                    }
                  }}
                >
                  Add {selectedStudents.length} Student{selectedStudents.length !== 1 ? 's' : ''}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '0.75rem',
            padding: '2rem',
            maxWidth: '400px',
            width: '90%',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
            textAlign: 'center'
          }}>
            <div style={{
              fontSize: '3rem',
              marginBottom: '1rem'
            }}>
              ⚠️
            </div>
            
            <h3 style={{
              fontSize: '1.25rem',
              fontWeight: 'bold',
              color: '#1f2937',
              marginBottom: '1rem'
            }}>
              Delete Classroom
            </h3>
            
            <p style={{
              color: '#6b7280',
              marginBottom: '1.5rem',
              lineHeight: '1.5'
            }}>
              Are you sure you want to delete this classroom? This action cannot be undone.
            </p>
            
            <p style={{
              color: '#dc2626',
              fontSize: '0.875rem',
              marginBottom: '1.5rem',
              fontStyle: 'italic'
            }}>
              All students will be removed from this classroom.
            </p>
            
            <div style={{
              display: 'flex',
              gap: '1rem',
              justifyContent: 'center'
            }}>
              <button
                onClick={() => setShowDeleteConfirm(null)}
                style={{
                  backgroundColor: '#6b7280',
                  color: 'white',
                  border: 'none',
                  padding: '0.75rem 1.5rem',
                  borderRadius: '0.5rem',
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                  fontWeight: '600'
                }}
              >
                Cancel
              </button>
              
              <button
                onClick={() => deleteClassroom(showDeleteConfirm)}
                style={{
                  backgroundColor: '#dc2626',
                  color: 'white',
                  border: 'none',
                  padding: '0.75rem 1.5rem',
                  borderRadius: '0.5rem',
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                  fontWeight: '600'
                }}
              >
                Delete Classroom
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Google Classroom Import Modal */}
      {showGoogleImportModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '0.75rem',
            padding: '2rem',
            maxWidth: '800px',
            width: '90%',
            maxHeight: '90vh',
            overflow: 'auto',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)'
          }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '1.5rem'
            }}>
              <h3 style={{
                fontSize: '1.5rem',
                fontWeight: 'bold',
                color: '#1f2937',
                margin: 0
              }}>
                📚 Import from Google Classroom
              </h3>
              <button
                onClick={() => {
                  setShowGoogleImportModal(false);
                  setSelectedCourse('');
                  setGoogleStudents([]);
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '1.5rem',
                  cursor: 'pointer',
                  color: '#6b7280',
                  padding: '0.25rem'
                }}
              >
                ×
              </button>
            </div>

            {/* Step 1: Select Course */}
            <div style={{ marginBottom: '2rem' }}>
              <h4 style={{
                fontSize: '1.125rem',
                fontWeight: '600',
                color: '#374151',
                marginBottom: '1rem'
              }}>
                Step 1: Select a Google Classroom Course
              </h4>
              
              {googleCourses.length === 0 ? (
                <div style={{
                  backgroundColor: '#f3f4f6',
                  padding: '1rem',
                  borderRadius: '0.5rem',
                  textAlign: 'center',
                  color: '#6b7280'
                }}>
                  <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🔍</div>
                  <p>Loading Google Classroom courses...</p>
                  <button
                    onClick={fetchGoogleCourses}
                    style={{
                      backgroundColor: '#3b82f6',
                      color: 'white',
                      border: 'none',
                      borderRadius: '0.375rem',
                      padding: '0.5rem 1rem',
                      cursor: 'pointer',
                      fontSize: '0.875rem',
                      fontWeight: '500',
                      marginTop: '0.5rem'
                    }}
                  >
                    Refresh Courses
                  </button>
                </div>
              ) : (
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
                  gap: '1rem'
                }}>
                  {googleCourses.map((course) => (
                    <div
                      key={course.id}
                      onClick={() => {
                        setSelectedCourse(course.id);
                        fetchGoogleStudents(course.id);
                      }}
                      style={{
                        border: selectedCourse === course.id ? '2px solid #3b82f6' : '1px solid #e5e7eb',
                        borderRadius: '0.5rem',
                        padding: '1rem',
                        cursor: 'pointer',
                        backgroundColor: selectedCourse === course.id ? '#eff6ff' : 'white',
                        transition: 'all 0.2s'
                      }}
                    >
                      <h5 style={{
                        fontSize: '1rem',
                        fontWeight: '600',
                        color: '#1f2937',
                        margin: '0 0 0.5rem 0'
                      }}>
                        {course.name}
                      </h5>
                      {course.section && (
                        <p style={{
                          fontSize: '0.875rem',
                          color: '#6b7280',
                          margin: '0 0 0.5rem 0'
                        }}>
                          Section: {course.section}
                        </p>
                      )}
                      {course.description && (
                        <p style={{
                          fontSize: '0.875rem',
                          color: '#6b7280',
                          margin: 0,
                          lineHeight: '1.4'
                        }}>
                          {course.description}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Step 2: Review Students */}
            {selectedCourse && (
              <div style={{ marginBottom: '2rem' }}>
                <h4 style={{
                  fontSize: '1.125rem',
                  fontWeight: '600',
                  color: '#374151',
                  marginBottom: '1rem'
                }}>
                  Step 2: Review Students to Import
                </h4>
                
                {googleStudents.length === 0 ? (
                  <div style={{
                    backgroundColor: '#f3f4f6',
                    padding: '1rem',
                    borderRadius: '0.5rem',
                    textAlign: 'center',
                    color: '#6b7280'
                  }}>
                    <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>👥</div>
                    <p>Loading students from selected course...</p>
                  </div>
                ) : (
                  <div style={{
                    backgroundColor: '#f9fafb',
                    borderRadius: '0.5rem',
                    padding: '1rem',
                    maxHeight: '300px',
                    overflow: 'auto'
                  }}>
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
                      gap: '0.75rem'
                    }}>
                      {googleStudents.map((student) => (
                        <div key={student.profile.id} style={{
                          backgroundColor: 'white',
                          borderRadius: '0.375rem',
                          padding: '0.75rem',
                          border: '1px solid #e5e7eb',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.75rem'
                        }}>
                          <img
                            src={student.profile.photoUrl || `https://ui-avatars.com/api/?name=${student.profile.name.fullName}&background=4f46e5&color=fff&size=32`}
                            alt={student.profile.name.fullName}
                            style={{
                              width: '32px',
                              height: '32px',
                              borderRadius: '50%',
                              objectFit: 'cover'
                            }}
                          />
                          <div>
                            <div style={{
                              fontSize: '0.875rem',
                              fontWeight: '500',
                              color: '#1f2937'
                            }}>
                              {student.profile.name.fullName}
                            </div>
                            <div style={{
                              fontSize: '0.75rem',
                              color: '#6b7280'
                            }}>
                              {student.profile.emailAddress}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Import Progress */}
            {importingStudents && (
              <div style={{
                backgroundColor: '#f0f9ff',
                border: '1px solid #0ea5e9',
                borderRadius: '0.5rem',
                padding: '1rem',
                marginBottom: '1.5rem'
              }}>
                <h4 style={{
                  fontSize: '1rem',
                  fontWeight: '600',
                  color: '#0ea5e9',
                  margin: '0 0 0.5rem 0'
                }}>
                  Importing Students...
                </h4>
                <div style={{
                  backgroundColor: '#e0f2fe',
                  borderRadius: '0.25rem',
                  height: '8px',
                  marginBottom: '0.5rem'
                }}>
                  <div style={{
                    backgroundColor: '#0ea5e9',
                    height: '100%',
                    borderRadius: '0.25rem',
                    width: `${(importProgress.current / importProgress.total) * 100}%`,
                    transition: 'width 0.3s ease'
                  }} />
                </div>
                <p style={{
                  fontSize: '0.875rem',
                  color: '#0ea5e9',
                  margin: 0
                }}>
                  {importProgress.current} of {importProgress.total} students imported
                </p>
              </div>
            )}

            {/* Action Buttons */}
            <div style={{
              display: 'flex',
              gap: '1rem',
              justifyContent: 'flex-end'
            }}>
              <button
                onClick={() => {
                  setShowGoogleImportModal(false);
                  setGoogleImportTargetClassroom(null);
                  setSelectedCourse('');
                  setGoogleStudents([]);
                }}
                style={{
                  backgroundColor: '#6b7280',
                  color: 'white',
                  border: 'none',
                  padding: '0.75rem 1.5rem',
                  borderRadius: '0.5rem',
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                  fontWeight: '600'
                }}
              >
                Cancel
              </button>
              
              {selectedCourse && googleStudents.length > 0 && !importingStudents && (
                <button
                  onClick={() => importGoogleStudents(googleImportTargetClassroom || '')}
                  style={{
                    backgroundColor: '#10b981',
                    color: 'white',
                    border: 'none',
                    padding: '0.75rem 1.5rem',
                    borderRadius: '0.5rem',
                    cursor: 'pointer',
                    fontSize: '0.875rem',
                    fontWeight: '600'
                  }}
                >
                  Import {googleStudents.length} Students
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Class Power Points View Modal */}
      {showClassPPView && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '0.5rem'
        }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '0.75rem',
            padding: '1.5rem',
            width: '95vw',
            height: '95vh',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)'
          }}>
            <div style={{ marginBottom: '1.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <h3 style={{ fontSize: '1.5rem', fontWeight: 'bold', margin: 0, color: '#1f2937' }}>
                  ⚡ Class Power Points Overview
                </h3>
                <button
                  onClick={() => setShowClassPPView(null)}
                  style={{
                    background: 'none',
                    border: 'none',
                    fontSize: '1.5rem',
                    cursor: 'pointer',
                    color: '#6b7280',
                    padding: '0.25rem'
                  }}
                >
                  ×
                </button>
              </div>
              <p style={{ fontSize: '0.875rem', color: '#6b7280', margin: 0 }}>
                {classrooms.find(c => c.id === showClassPPView)?.name} - Manage Power Points for all students
              </p>
            </div>
            
            {/* Search Bar for PP View Modal */}
            <div style={{ marginBottom: '1rem' }}>
              <SearchBar
                placeholder="Search students by name or email..."
                onSearch={handleSearch}
                onClear={handleClearSearch}
                style={{ maxWidth: '400px' }}
              />
              {searchQuery && (
                <div style={{ 
                  marginTop: '0.5rem', 
                  fontSize: '0.875rem', 
                  color: '#6b7280' 
                }}>
                  Showing {(() => {
                    const classroom = classrooms.find(c => c.id === showClassPPView);
                    if (!classroom) return 0;
                    const classStudents = classroom.students.map(studentId => 
                      students.find(s => s.id === studentId)
                    ).filter(Boolean) as Student[];
                    return classStudents.filter(student => 
                      searchStudents([student], searchQuery).length > 0
                    ).length;
                  })()} of {(() => {
                    const classroom = classrooms.find(c => c.id === showClassPPView);
                    if (!classroom) return 0;
                    return classroom.students.length;
                  })()} students
                </div>
              )}
            </div>
            
            <div style={{ 
              flex: 1, 
              overflowY: 'auto', 
              overflowX: 'hidden',
              marginBottom: '1.5rem',
              border: '1px solid #e5e7eb',
              borderRadius: '0.5rem',
              backgroundColor: '#f9fafb'
            }}>
              {(() => {
                const classroom = classrooms.find(c => c.id === showClassPPView);
                if (!classroom) return null;
                
                const classStudents = classroom.students.map(studentId => 
                  students.find(s => s.id === studentId)
                ).filter(Boolean) as Student[];
                
                if (classStudents.length === 0) {
                  return (
                    <div style={{ 
                      color: '#9ca3af', 
                      textAlign: 'center', 
                      padding: '3rem 2rem',
                      backgroundColor: 'white',
                      margin: '1rem',
                      borderRadius: '0.5rem',
                      border: '1px solid #e5e7eb'
                    }}>
                      <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>👥</div>
                      <p style={{ fontSize: '1rem', fontWeight: '500', marginBottom: '0.5rem' }}>
                        No students in this class
                      </p>
                      <p style={{ fontSize: '0.875rem', margin: 0 }}>
                        Add students to this classroom to manage their Power Points.
                      </p>
                    </div>
                  );
                }
                
                // Filter and sort students by PP (highest first)
                const filteredClassStudents = searchStudents(classStudents, searchQuery);
                const sortedStudents = [...filteredClassStudents].sort((a, b) => (b.powerPoints || 0) - (a.powerPoints || 0));
                const totalPP = classStudents.reduce((sum, student) => sum + (student.powerPoints || 0), 0);
                const averagePP = classStudents.length > 0 ? Math.round(totalPP / classStudents.length) : 0;
                
                return (
                  <div style={{ padding: '1rem' }}>
                    {/* Class Statistics */}
                    <div style={{
                      backgroundColor: 'white',
                      borderRadius: '0.5rem',
                      padding: '1rem',
                      marginBottom: '1rem',
                      border: '1px solid #e5e7eb',
                      display: 'flex',
                      justifyContent: 'space-around',
                      alignItems: 'center',
                      minHeight: '80px'
                    }}>
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#1f2937' }}>
                          {classStudents.length}
                        </div>
                        <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                          Total Students
                        </div>
                      </div>
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#8b5cf6' }}>
                          {totalPP}
                        </div>
                        <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                          Total PP
                        </div>
                      </div>
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#10b981' }}>
                          {averagePP}
                        </div>
                        <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                          Average PP
                        </div>
                      </div>
                    </div>
                    
                    {/* Students List */}
                    <div style={{ 
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                      gap: '1rem',
                      maxHeight: 'calc(95vh - 200px)',
                      overflowY: 'auto',
                      paddingRight: '0.5rem'
                    }}>
                      {sortedStudents.map((student, index) => (
                        <div key={student.id} style={{
                          backgroundColor: 'white',
                          borderRadius: '0.5rem',
                          padding: '0.75rem',
                          border: '1px solid #e5e7eb',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.75rem',
                          position: 'relative',
                          minHeight: '120px'
                        }}>
                          {/* Rank Badge */}
                          <div style={{
                            position: 'absolute',
                            top: '0.5rem',
                            right: '0.5rem',
                            backgroundColor: index === 0 ? '#fbbf24' : index === 1 ? '#9ca3af' : index === 2 ? '#f59e0b' : '#e5e7eb',
                            color: index < 3 ? 'white' : '#6b7280',
                            borderRadius: '50%',
                            width: '24px',
                            height: '24px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '0.75rem',
                            fontWeight: 'bold'
                          }}>
                            {index + 1}
                          </div>
                          
                          <img
                            src={student.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(student.displayName)}&background=4f46e5&color=fff&size=40`}
                            alt={student.displayName}
                            style={{
                              width: '40px',
                              height: '40px',
                              borderRadius: '50%',
                              objectFit: 'cover',
                              border: '2px solid #e5e7eb'
                            }}
                          />
                          
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: '1rem', fontWeight: '600', color: '#1f2937', marginBottom: '0.25rem' }}>
                              {student.displayName}
                            </div>
                            <div style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.5rem' }}>
                              {student.email}
                            </div>
                            <div style={{ 
                              display: 'flex', 
                              gap: '1rem',
                              fontSize: '0.75rem',
                              color: '#9ca3af',
                              marginBottom: '0.5rem'
                            }}>
                              <span>Level {student.level}</span>
                              <span>•</span>
                              <span>{student.xp} XP</span>
                            </div>
                            
                            {/* PP Management */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                              <span style={{ 
                                fontSize: '1rem', 
                                fontWeight: 'bold', 
                                color: '#8b5cf6',
                                minWidth: '60px'
                              }}>
                                {student.powerPoints || 0} PP
                              </span>
                              <div style={{ display: 'flex', gap: '0.25rem' }}>
                                <button
                                  onClick={() => adjustPowerPoints(student.id, 1)}
                                  style={{
                                    backgroundColor: '#10b981',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '0.25rem',
                                    padding: '0.25rem 0.5rem',
                                    cursor: 'pointer',
                                    fontSize: '0.75rem',
                                    fontWeight: '500'
                                  }}
                                >
                                  +
                                </button>
                                <button
                                  onClick={() => adjustPowerPoints(student.id, -1)}
                                  style={{
                                    backgroundColor: '#dc2626',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '0.25rem',
                                    padding: '0.25rem 0.5rem',
                                    cursor: 'pointer',
                                    fontSize: '0.75rem',
                                    fontWeight: '500'
                                  }}
                                >
                                  -
                                </button>
                              </div>
                              <input
                                type="number"
                                value={ppAmount[student.id] || ''}
                                onChange={(e) => {
                                  const value = e.target.value;
                                  const numValue = value === '' ? undefined : parseInt(value);
                                  setPPAmount(prev => ({ 
                                    ...prev, 
                                    [student.id]: numValue
                                  }));
                                }}
                                onKeyPress={(e) => {
                                  if (e.key === 'Enter') {
                                    const amount = ppAmount[student.id];
                                    if (amount !== undefined && amount >= 0) {
                                      setPowerPoints(student.id, amount);
                                      setPPAmount(prev => ({ ...prev, [student.id]: undefined }));
                                    }
                                  }
                                }}
                                style={{
                                  width: '60px',
                                  padding: '0.25rem 0.5rem',
                                  border: '1px solid #d1d5db',
                                  borderRadius: '0.25rem',
                                  fontSize: '0.75rem',
                                  textAlign: 'center'
                                }}
                                placeholder="Set"
                              />
                              <button
                                onClick={() => {
                                  const amount = ppAmount[student.id];
                                  if (amount !== undefined && amount >= 0) {
                                    setPowerPoints(student.id, amount);
                                    setPPAmount(prev => ({ ...prev, [student.id]: undefined }));
                                  }
                                }}
                                disabled={ppAmount[student.id] === undefined}
                                style={{
                                  backgroundColor: ppAmount[student.id] !== undefined ? '#3b82f6' : '#9ca3af',
                                  color: 'white',
                                  border: 'none',
                                  borderRadius: '0.25rem',
                                  padding: '0.25rem 0.5rem',
                                  cursor: ppAmount[student.id] !== undefined ? 'pointer' : 'not-allowed',
                                  fontSize: '0.75rem',
                                  fontWeight: '500'
                                }}
                              >
                                Set
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </div>
            
            <div style={{ 
              display: 'flex', 
              gap: '1rem', 
              justifyContent: 'flex-end',
              paddingTop: '1rem',
              borderTop: '1px solid #e5e7eb'
            }}>
              <button
                onClick={() => setShowClassPPView(null)}
                style={{
                  backgroundColor: '#6b7280',
                  color: 'white',
                  border: 'none',
                  padding: '0.75rem 1.5rem',
                  borderRadius: '0.5rem',
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                  fontWeight: '600'
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* OAuth Setup Modal */}
      <OAuthSetupModal
        isOpen={showOAuthSetupModal}
        onClose={() => setShowOAuthSetupModal(false)}
        clientId="281092791460-085tqid3jq8e9llqdmlps0f5d6c835n5.apps.googleusercontent.com"
      />
    </div>
  );
};

export default ClassroomManagement; 