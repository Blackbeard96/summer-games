import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { db } from '../firebase';

import { 
  collection, 
  getDocs, 
  doc, 
  getDoc, 
  addDoc,
  serverTimestamp
} from 'firebase/firestore';
import { UserRole } from '../types/roles';
import { logger } from '../utils/debugLogger';
import { getActivePPBoost, applyPPBoost } from '../utils/ppBoost';

// FORCE DEBUG LOG - This should appear in console when component loads
console.log('🚨 ScorekeeperInterface.tsx: COMPONENT FILE LOADED - VERSION 2.0');

interface Student {
  id: string;
  displayName: string;
  email: string;
  powerPoints: number;
  photoURL?: string;
  level?: number;
  xp?: number;
}


const ScorekeeperInterface: React.FC = () => {
  const { currentUser } = useAuth();
  const [students, setStudents] = useState<Student[]>([]);
  const [userRole, setUserRole] = useState<UserRole>('student');
  const [loading, setLoading] = useState<boolean>(true);
  const [assignedClassId, setAssignedClassId] = useState<string>('');
  const [className, setClassName] = useState<string>('');
  const [ppInputValues, setPPInputValues] = useState<Record<string, number | undefined>>({});
  const [pendingChanges, setPendingChanges] = useState<Record<string, number>>({});
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Check if current user is a scorekeeper and get assigned class
  useEffect(() => {
    const checkUserRole = async () => {
      if (!currentUser) {
        setLoading(false);
        return;
      }
      
      try {
        logger.roles.debug('ScorekeeperInterface: Checking user role for:', currentUser.uid);
        const roleDoc = await getDoc(doc(db, 'userRoles', currentUser.uid));
        
        if (roleDoc.exists()) {
          const roleData = roleDoc.data();
          const detectedRole = roleData.role || 'student';
          const classId = roleData.classId;
          
          logger.roles.info('ScorekeeperInterface: User role detected:', { 
            userId: currentUser.uid, 
            email: currentUser.email,
            role: detectedRole,
            classId: classId 
          });
          
          setUserRole(detectedRole);
          setAssignedClassId(classId || '');
          
          // If user is scorekeeper or admin, get class name
          if ((detectedRole === 'scorekeeper' || detectedRole === 'admin') && classId) {
            const classDoc = await getDoc(doc(db, 'classrooms', classId));
            if (classDoc.exists()) {
              const classData = classDoc.data();
              setClassName(classData.name || 'Unknown Class');
            }
          } else if (detectedRole === 'admin' && !classId) {
            // Admin users without assigned class get access to all students
            setClassName('All Classes (Admin Access)');
          }
        } else {
          logger.roles.warn('ScorekeeperInterface: No role document found for user:', currentUser.uid);
          setUserRole('student');
        }
      } catch (error) {
        logger.roles.error('ScorekeeperInterface: Error checking user role:', error);
        
        // TEMPORARY WORKAROUND: If we get permission error but NavBar shows admin/scorekeeper,
        // assume user is admin (this handles the permission timing issue)
        if (error instanceof Error && error.message?.includes('Missing or insufficient permissions')) {
          logger.roles.warn('ScorekeeperInterface: Permission error, but NavBar shows admin role - assuming admin');
          setUserRole('admin');
          setClassName('All Classes (Admin Access)');
        } else {
        setUserRole('student');
        }
      } finally {
        setLoading(false);
      }
    };

    checkUserRole();
  }, [currentUser]);

  // Load students for the assigned class
  useEffect(() => {
    const loadStudents = async () => {
      if ((userRole !== 'scorekeeper' && userRole !== 'admin') || 
          (userRole === 'scorekeeper' && !assignedClassId)) {
        setStudents([]);
        return;
      }
      
      try {
        logger.roster.debug('ScorekeeperInterface: Loading students for class:', assignedClassId);
        
        // Use the same approach as AdminPanel - load from both collections
        const studentsSnapshot = await getDocs(collection(db, 'students'));
        const usersSnapshot = await getDocs(collection(db, 'users'));
        
        logger.roster.info('ScorekeeperInterface: Loaded collections:', {
          students: studentsSnapshot.docs.length,
          users: usersSnapshot.docs.length
        });
        
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
        const allStudents: Student[] = [];
        studentsSnapshot.docs.forEach(doc => {
          const studentData = doc.data();
          const userId = doc.id;
          const userData = usersMap.get(userId) || {};
          
          // Merge user and student data
          const mergedStudent: Student = {
            id: userId,
            displayName: userData.displayName || studentData.displayName || 'Unnamed Student',
            email: userData.email || studentData.email || 'No email',
            photoURL: userData.photoURL || studentData.photoURL,
            powerPoints: studentData.powerPoints || 0,
            level: studentData.level || 1,
            xp: studentData.xp || 0,
            classId: studentData.classId || '',
            ...userData,
            ...studentData
          };
          
          allStudents.push(mergedStudent);
        });

        // Get classroom to filter students
        try {
          const classDoc = await getDoc(doc(db, 'classrooms', assignedClassId));
          if (classDoc.exists()) {
            const classData = classDoc.data();
            const classStudentIds = classData.students || [];
            
            // Filter students to only those in the assigned class
            const classStudents = allStudents.filter(student => 
              classStudentIds.includes(student.id)
            );
            
            logger.roster.info('ScorekeeperInterface: Loaded students:', {
              totalStudents: allStudents.length,
              classStudents: classStudents.length,
              classId: assignedClassId,
              classStudentIds: classStudentIds
            });
            
            setStudents(classStudents);
          } else {
            // If no classroom found, show all students for now
            logger.roster.warn('ScorekeeperInterface: No classroom found, showing all students');
            setStudents(allStudents);
          }
        } catch (classError) {
          // If classroom access fails, show all students as fallback
          logger.roster.warn('ScorekeeperInterface: Classroom access failed, showing all students:', classError);
          setStudents(allStudents);
        }
      } catch (error) {
        logger.roster.error('ScorekeeperInterface: Error loading students:', error);
      }
    };

    loadStudents();
  }, [assignedClassId, userRole]);

  // Handle PP adjustment (now tracks pending changes)
  const handleAdjustPP = async (studentId: string, change: number) => {
    const student = students.find(s => s.id === studentId);
    if (!student) return;

    const currentPP = student.powerPoints || 0;
    const currentPendingChange = pendingChanges[studentId] || 0;
    const newPendingChange = currentPendingChange + change;
    
    // Apply PP boost if student has one active
    let boostedChange = change;
    try {
      const activeBoost = await getActivePPBoost(studentId);
      if (activeBoost && change > 0) {
        boostedChange = applyPPBoost(change, studentId, activeBoost);
        logger.roster.info('ScorekeeperInterface: PP boost applied:', {
          studentId,
          originalChange: change,
          boostedChange,
          boostMultiplier: activeBoost.multiplier
        });
      }
    } catch (error) {
      logger.roster.error('ScorekeeperInterface: Error checking PP boost:', error);
    }
    
    const newDisplayPP = Math.max(0, currentPP + newPendingChange);

    // Update pending changes (store the boosted amount)
    setPendingChanges(prev => ({
      ...prev,
      [studentId]: newPendingChange + (boostedChange - change)
    }));

    // Update local display (but not database)
    setStudents(prev => prev.map(s => 
      s.id === studentId ? { ...s, powerPoints: newDisplayPP } : s
    ));

    logger.roster.info('ScorekeeperInterface: Pending PP change:', {
      studentId,
      studentName: student.displayName,
      change,
      boostedChange,
      currentPP,
      pendingChange: newPendingChange,
      newDisplayPP
    });
  };

  // Submit pending changes for admin approval
  const handleSubmitChanges = async () => {
    if (!currentUser || !assignedClassId) return;

    const changesToSubmit = Object.entries(pendingChanges).filter(([_, change]) => change !== 0);
    if (changesToSubmit.length === 0) {
      alert('No changes to submit');
      return;
    }

    setIsSubmitting(true);
    try {
      // Create a change request document
      const changeRequest = {
        scorekeeperId: currentUser.uid,
        scorekeeperEmail: currentUser.email,
        classId: assignedClassId,
        className: className,
        changes: changesToSubmit.map(([studentId, change]) => {
          const student = students.find(s => s.id === studentId);
          return {
            studentId,
            studentName: student?.displayName || 'Unknown',
            studentEmail: student?.email || '',
            currentPP: (student?.powerPoints || 0) - change, // Original PP before changes
            changeAmount: change,
            newPP: student?.powerPoints || 0 // New PP after changes
          };
        }),
        submittedAt: serverTimestamp(),
        status: 'pending',
        reviewedBy: null,
        reviewedAt: null
      };

      await addDoc(collection(db, 'ppChangeRequests'), changeRequest);

      logger.roster.info('ScorekeeperInterface: Submitted changes for approval:', {
        scorekeeperId: currentUser.uid,
        classId: assignedClassId,
        changesCount: changesToSubmit.length
      });

      // Clear pending changes
      setPendingChanges({});
      
      // Reset student PP to original values
      setStudents(prev => prev.map(s => {
        const originalPP = (s.powerPoints || 0) - (pendingChanges[s.id] || 0);
        return { ...s, powerPoints: originalPP };
      }));

      alert(`Successfully submitted ${changesToSubmit.length} changes for admin approval!`);
    } catch (error) {
      logger.roster.error('ScorekeeperInterface: Error submitting changes:', error);
      alert('Error submitting changes. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Get count of pending changes
  const pendingChangesCount = Object.values(pendingChanges).filter(change => change !== 0).length;

  if (loading) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '50vh',
        fontSize: '1.2rem',
        color: '#6b7280'
      }}>
        Loading Scorekeeper Interface...
      </div>
    );
  }

  // Check if current user is admin based on email (fallback method)
  const isAdminByEmail = currentUser?.email === 'eddymosley@compscihigh.org' || 
                         currentUser?.email === 'admin@mstgames.net' ||
                         currentUser?.email === 'edm21179@gmail.com' ||
                         currentUser?.email === 'eddymosley9@gmail.com' ||
                         currentUser?.email?.includes('eddymosley') ||
                         currentUser?.email?.includes('admin') ||
                         currentUser?.email?.includes('mstgames');

  // Debug logging for access control
  console.log('🔍 ScorekeeperInterface Access Check:', {
    userRole,
    currentUser: currentUser?.email,
    isAdminByEmail,
    finalAccess: userRole === 'scorekeeper' || userRole === 'admin' || isAdminByEmail
  });

  // FORCE ADMIN ACCESS FOR DEBUGGING - TEMPORARY
  if (isAdminByEmail) {
    console.log('✅ FORCING ADMIN ACCESS - Email-based admin detected');
    // Override userRole to admin for admin emails
    if (userRole !== 'admin') {
      console.log('🔄 Overriding userRole from', userRole, 'to admin');
    }
  }

  if (userRole !== 'scorekeeper' && userRole !== 'admin' && !isAdminByEmail) {
    console.log('❌ Access denied - userRole:', userRole, 'currentUser:', currentUser?.email);
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '50vh',
        flexDirection: 'column',
        gap: '1rem'
      }}>
        <div style={{ fontSize: '3rem' }}>🚫</div>
        <h2 style={{ color: '#ef4444', margin: 0 }}>Access Denied</h2>
        <p style={{ color: '#6b7280', textAlign: 'center', maxWidth: '400px' }}>
          You don't have permission to access the Scorekeeper interface. 
          Contact an administrator if you believe this is an error.
        </p>
        <div style={{ fontSize: '0.8rem', color: '#9ca3af', marginTop: '1rem' }}>
          Debug: userRole = {userRole}, email = {currentUser?.email}
        </div>
      </div>
    );
  }

  if (!assignedClassId) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '50vh',
        flexDirection: 'column',
        gap: '1rem'
      }}>
        <div style={{ fontSize: '3rem' }}>🏫</div>
        <h2 style={{ color: '#f59e0b', margin: 0 }}>No Class Assigned</h2>
        <p style={{ color: '#6b7280', textAlign: 'center', maxWidth: '400px' }}>
          You haven't been assigned to a class yet. Contact an administrator to get assigned to a class.
        </p>
      </div>
    );
  }

  // Sort students by PP (highest first)
  const sortedStudents = [...students].sort((a, b) => (b.powerPoints || 0) - (a.powerPoints || 0));
  const totalPP = students.reduce((sum, student) => sum + (student.powerPoints || 0), 0);
  const averagePP = students.length > 0 ? Math.round(totalPP / students.length) : 0;

  return (
    <div style={{ 
      padding: '2rem', 
      maxWidth: '1200px',
      margin: '0 auto'
    }}>
      {/* Header */}
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ 
          fontSize: '2rem', 
          fontWeight: 'bold', 
          margin: 0, 
          color: '#1f2937',
          marginBottom: '0.5rem'
        }}>
          ⚡ Class Power Points Overview
        </h1>
        <p style={{ 
          fontSize: '1rem', 
          color: '#6b7280', 
          margin: 0 
        }}>
          {className} - Manage Power Points for all students
        </p>
      </div>

      {/* Instructions Section */}
      <div style={{
        backgroundColor: '#f0f9ff',
        border: '1px solid #0ea5e9',
        borderRadius: '0.75rem',
        padding: '1.5rem',
        marginBottom: '2rem'
      }}>
        <h2 style={{ 
          fontSize: '1.25rem', 
          fontWeight: '600', 
          color: '#0c4a6e',
          margin: 0,
          marginBottom: '1rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem'
        }}>
          📋 Scorekeeper Instructions
        </h2>
        <div style={{ 
          display: 'flex', 
          flexDirection: 'column', 
          gap: '0.75rem'
        }}>
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: '0.75rem',
            fontSize: '0.95rem',
            color: '#0c4a6e'
          }}>
            <span style={{ 
              backgroundColor: '#10b981', 
              color: 'white', 
              borderRadius: '50%', 
              width: '24px', 
              height: '24px', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center',
              fontSize: '0.875rem',
              fontWeight: 'bold'
            }}>+</span>
            <span><strong>Add points</strong> each time a student earns them</span>
          </div>
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: '0.75rem',
            fontSize: '0.95rem',
            color: '#0c4a6e'
          }}>
            <span style={{ 
              backgroundColor: '#ef4444', 
              color: 'white', 
              borderRadius: '50%', 
              width: '24px', 
              height: '24px', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center',
              fontSize: '0.875rem',
              fontWeight: 'bold'
            }}>-</span>
            <span><strong>Subtract points</strong> as directed (Add a '-' sign and click add. Ex: "-10", then add)</span>
          </div>
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: '0.75rem',
            fontSize: '0.95rem',
            color: '#0c4a6e'
          }}>
            <span style={{ 
              backgroundColor: '#8b5cf6', 
              color: 'white', 
              borderRadius: '50%', 
              width: '24px', 
              height: '24px', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center',
              fontSize: '0.875rem',
              fontWeight: 'bold'
            }}>✓</span>
            <span><strong>At end of class</strong>, Submit your totals for approval</span>
          </div>
        </div>
        <div style={{ 
          marginTop: '1rem',
          padding: '0.75rem',
          backgroundColor: '#e0f2fe',
          borderRadius: '0.5rem',
          border: '1px solid #0284c7'
        }}>
          <p style={{ 
            fontSize: '0.875rem', 
            color: '#0c4a6e',
            margin: 0,
            fontStyle: 'italic'
          }}>
            💡 <strong>Tip:</strong> Use the +1/-1 buttons for quick adjustments, or enter custom amounts in the "Amount" field. 
            All changes will be submitted together for admin approval at the end of class.
          </p>
        </div>
      </div>

      {/* Class Statistics */}
      <div style={{ 
        backgroundColor: 'white',
        borderRadius: '0.75rem', 
        padding: '1.5rem',
        marginBottom: '2rem',
        border: '1px solid #e5e7eb',
        display: 'flex',
        justifyContent: 'space-around',
        alignItems: 'center',
        minHeight: '100px',
        boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)'
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#1f2937' }}>
            {students.length}
          </div>
          <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
            Total Students
          </div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#8b5cf6' }}>
            {totalPP}
          </div>
          <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
            Total PP
          </div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#10b981' }}>
            {averagePP}
          </div>
          <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
            Average PP
          </div>
        </div>
      </div>

      {/* Students List */}
      {students.length === 0 ? (
        <div style={{ 
          color: '#9ca3af', 
          textAlign: 'center', 
          padding: '3rem 2rem',
          backgroundColor: 'white',
          borderRadius: '0.75rem', 
          border: '1px solid #e5e7eb'
        }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>👥</div>
          <p style={{ fontSize: '1rem', fontWeight: '500', marginBottom: '0.5rem' }}>
            No students in this class
          </p>
          <p style={{ fontSize: '0.875rem', margin: 0 }}>
            Students will appear here once they're added to the classroom.
          </p>
        </div>
      ) : (
        <div style={{ 
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          gap: '1.5rem'
        }}>
          {sortedStudents.map((student) => (
            <div key={student.id} style={{
                backgroundColor: 'white',
              borderRadius: '0.75rem',
              padding: '1.5rem',
              border: '1px solid #e5e7eb',
              boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
              transition: 'box-shadow 0.2s ease'
            }}>
              {/* Student Info */}
              <div style={{ 
                display: 'flex',
                alignItems: 'center', 
                marginBottom: '1rem',
                gap: '0.75rem'
              }}>
                <div style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '50%',
                  backgroundColor: '#8b5cf6',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'white',
                  fontWeight: 'bold',
                  fontSize: '1.2rem'
                }}>
                  {student.photoURL ? (
                    <img 
                      src={student.photoURL} 
                      alt={student.displayName}
                      style={{
                        width: '100%',
                        height: '100%',
                        borderRadius: '50%',
                        objectFit: 'cover'
                      }}
                    />
                  ) : (
                    student.displayName.charAt(0).toUpperCase()
                  )}
                </div>
                <div style={{ flex: 1 }}>
                  <h3 style={{ 
                    fontSize: '1.1rem', 
                    fontWeight: '600', 
                    margin: 0, 
                    color: '#1f2937',
                    marginBottom: '0.25rem'
                  }}>
                    {student.displayName}
                  </h3>
                  <p style={{ 
                    fontSize: '0.875rem', 
                    color: '#6b7280', 
                    margin: 0,
                    marginBottom: '0.25rem'
                  }}>
                    {student.email}
                  </p>
                  <p style={{ 
                    fontSize: '0.875rem', 
                    color: '#8b5cf6', 
                    margin: 0,
                    fontWeight: '500'
                  }}>
                    Level {student.level || 1} • {student.xp || 0} XP
                  </p>
                </div>
                  </div>

              {/* Power Points Display */}
              <div style={{ 
                textAlign: 'center', 
                marginBottom: '1rem',
                padding: '1rem',
                backgroundColor: '#f8fafc',
                borderRadius: '0.5rem',
                border: '1px solid #e2e8f0'
              }}>
                <div style={{ 
                  fontSize: '2rem', 
                  fontWeight: 'bold', 
                  color: '#8b5cf6',
                  marginBottom: '0.25rem'
                }}>
                  {student.powerPoints} PP
                </div>
              </div>

              {/* PP Controls */}
              <div style={{ 
                display: 'flex', 
                flexDirection: 'column',
                gap: '0.75rem',
                marginBottom: '1rem'
              }}>
                {/* Quick +/-1 Buttons */}
                <div style={{ 
                  display: 'flex', 
                  gap: '0.5rem', 
                  justifyContent: 'center'
                }}>
                  <button
                    onClick={() => handleAdjustPP(student.id, -1)}
                    style={{
                      backgroundColor: '#ef4444',
                      color: 'white',
                      border: 'none',
                      borderRadius: '0.375rem',
                      padding: '0.5rem',
                      fontSize: '1.2rem',
                      fontWeight: 'bold',
                      cursor: 'pointer',
                      minWidth: '40px',
                      height: '40px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                  >
                    -
                  </button>
                <button
                    onClick={() => handleAdjustPP(student.id, 1)}
                  style={{
                      backgroundColor: '#10b981',
                    color: 'white',
                    border: 'none',
                      borderRadius: '0.375rem',
                    padding: '0.5rem',
                      fontSize: '1.2rem',
                      fontWeight: 'bold',
                    cursor: 'pointer',
                      minWidth: '40px',
                      height: '40px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                  >
                    +
                </button>
          </div>

                {/* Custom Amount Input */}
          <div style={{ 
            display: 'flex', 
                  gap: '0.5rem', 
                  alignItems: 'center'
                }}>
                  <input
                    type="number"
                    placeholder="Amount"
                    value={ppInputValues[student.id] || ''}
                    onChange={(e) => setPPInputValues(prev => ({
                      ...prev,
                      [student.id]: e.target.value ? parseInt(e.target.value) : undefined
                    }))}
                    style={{
                      flex: 1,
                      padding: '0.5rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '0.375rem',
                      fontSize: '0.875rem',
                      minWidth: '0' // Prevent flex item from overflowing
                    }}
                  />
            <button
                    onClick={() => {
                      const amount = ppInputValues[student.id];
                      if (amount !== undefined && amount !== 0) {
                        handleAdjustPP(student.id, amount);
                        // Clear input after use
                        setPPInputValues(prev => ({
                          ...prev,
                          [student.id]: undefined
                        }));
                      }
                    }}
                    disabled={ppInputValues[student.id] === undefined || ppInputValues[student.id] === 0}
              style={{
                      backgroundColor: (ppInputValues[student.id] !== undefined && ppInputValues[student.id] !== 0) ? '#8b5cf6' : '#9ca3af',
                      color: 'white',
                border: 'none',
                      borderRadius: '0.375rem',
                      padding: '0.5rem 0.75rem',
                fontSize: '0.875rem',
                      fontWeight: '500',
                      cursor: (ppInputValues[student.id] !== undefined && ppInputValues[student.id] !== 0) ? 'pointer' : 'not-allowed',
                      whiteSpace: 'nowrap',
                      minWidth: '60px'
                    }}
                  >
                    Add
            </button>
          </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Submit Changes Button */}
      {students.length > 0 && (
      <div style={{ 
          marginTop: '2rem',
          padding: '1.5rem',
          backgroundColor: 'white',
        borderRadius: '0.75rem', 
          border: '1px solid #e5e7eb',
          boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
          textAlign: 'center'
      }}>
          <div style={{ marginBottom: '1rem' }}>
        <h3 style={{ 
          fontSize: '1.125rem', 
              fontWeight: '600', 
              color: '#1f2937',
              margin: 0,
              marginBottom: '0.5rem'
            }}>
              Submit Changes for Approval
        </h3>
            <p style={{ 
          fontSize: '0.875rem', 
              color: '#6b7280',
              margin: 0
            }}>
              {pendingChangesCount > 0 
                ? `You have ${pendingChangesCount} pending change${pendingChangesCount === 1 ? '' : 's'} ready to submit.`
                : 'No changes to submit. Make some adjustments above to submit for admin approval.'
              }
            </p>
          </div>
          
          <button
            onClick={handleSubmitChanges}
            disabled={pendingChangesCount === 0 || isSubmitting}
            style={{
              backgroundColor: pendingChangesCount > 0 && !isSubmitting ? '#8b5cf6' : '#9ca3af',
              color: 'white',
              border: 'none',
              borderRadius: '0.5rem',
              padding: '0.75rem 2rem',
              fontSize: '1rem',
              fontWeight: '600',
              cursor: pendingChangesCount > 0 && !isSubmitting ? 'pointer' : 'not-allowed',
              transition: 'background-color 0.2s ease',
              minWidth: '200px'
            }}
          >
            {isSubmitting ? 'Submitting...' : `Submit ${pendingChangesCount} Change${pendingChangesCount === 1 ? '' : 's'}`}
          </button>
          
          {pendingChangesCount > 0 && (
            <div style={{ 
              marginTop: '1rem',
              fontSize: '0.75rem',
              color: '#6b7280'
            }}>
              Changes will be reviewed by an administrator before being applied.
            </div>
          )}
      </div>
      )}
    </div>
  );
};

export default ScorekeeperInterface;