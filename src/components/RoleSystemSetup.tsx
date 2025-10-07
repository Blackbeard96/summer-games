import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { db } from '../firebase';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { UserRole, UserRoleData } from '../types/roles';

const RoleSystemSetup: React.FC = () => {
  const { currentUser } = useAuth();
  const [currentRole, setCurrentRole] = useState<UserRole>('student');
  const [isSetup, setIsSetup] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [setting, setSetting] = useState<boolean>(false);

  useEffect(() => {
    const checkCurrentRole = async () => {
      if (!currentUser) {
        setLoading(false);
        return;
      }

      try {
        const roleDoc = await getDoc(doc(db, 'userRoles', currentUser.uid));
        if (roleDoc.exists()) {
          const roleData = roleDoc.data();
          setCurrentRole(roleData.role || 'student');
          setIsSetup(true);
        } else {
          setCurrentRole('student');
          setIsSetup(false);
        }
      } catch (error) {
        console.error('Error checking current role:', error);
      } finally {
        setLoading(false);
      }
    };

    checkCurrentRole();
  }, [currentUser]);

  const handleSetupAdmin = async () => {
    if (!currentUser) return;

    setSetting(true);
    
    try {
      const roleData: UserRoleData = {
        userId: currentUser.uid,
        role: 'admin',
        assignedBy: 'system_setup',
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

      setCurrentRole('admin');
      setIsSetup(true);
      
      alert('🎉 Successfully set up as Administrator! You now have full access to the role management system.');
      
    } catch (error) {
      console.error('Error setting up admin role:', error);
      alert('❌ Failed to setup admin role. Please try again.');
    } finally {
      setSetting(false);
    }
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
        <div>Checking Role System Setup...</div>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <div style={{ 
        padding: '2rem', 
        textAlign: 'center',
        backgroundColor: 'white',
        borderRadius: '0.75rem',
        boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
        border: '2px solid #f59e0b'
      }}>
        <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>🔐</div>
        <h3 style={{ color: '#92400e', marginBottom: '1rem' }}>Please Log In</h3>
        <p style={{ color: '#a16207' }}>
          You need to be logged in to set up the role system.
        </p>
      </div>
    );
  }

  if (isSetup) {
    return (
      <div style={{ 
        padding: '2rem', 
        textAlign: 'center',
        backgroundColor: 'white',
        borderRadius: '0.75rem',
        boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
        border: '2px solid #10b981'
      }}>
        <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>✅</div>
        <h3 style={{ color: '#065f46', marginBottom: '1rem' }}>Role System Ready!</h3>
        <p style={{ color: '#047857', marginBottom: '1rem' }}>
          Your current role: <strong style={{ 
            backgroundColor: currentRole === 'admin' ? '#dc2626' : currentRole === 'scorekeeper' ? '#059669' : '#3b82f6',
            color: 'white',
            padding: '0.25rem 0.5rem',
            borderRadius: '0.25rem',
            fontSize: '0.875rem'
          }}>
            {currentRole === 'admin' ? 'Administrator' : currentRole === 'scorekeeper' ? 'Scorekeeper' : 'Student'}
          </strong>
        </p>
        <p style={{ color: '#047857', fontSize: '0.875rem' }}>
          {currentRole === 'admin' 
            ? 'You have full access to all role management features.'
            : currentRole === 'scorekeeper'
            ? 'You can manage Power Points for students.'
            : 'You have standard student permissions.'
          }
        </p>
      </div>
    );
  }

  return (
    <div style={{ 
      backgroundColor: 'white', 
      borderRadius: '0.75rem', 
      padding: '2rem', 
      boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
      border: '2px solid #3b82f6',
      textAlign: 'center'
    }}>
      {/* Header */}
      <div style={{ marginBottom: '2rem' }}>
        <h2 style={{ 
          fontSize: '1.75rem', 
          fontWeight: 'bold', 
          color: '#1e40af',
          marginBottom: '0.5rem'
        }}>
          🚀 Role System Setup
        </h2>
        <p style={{ color: '#6b7280', fontSize: '0.875rem' }}>
          Initialize the Class Role System and set yourself as the first Administrator
        </p>
      </div>

      {/* Current User Info */}
      <div style={{ 
        backgroundColor: '#f0f9ff', 
        borderRadius: '0.75rem', 
        padding: '1.5rem',
        marginBottom: '2rem',
        border: '1px solid #bfdbfe'
      }}>
        <h3 style={{ 
          fontSize: '1.125rem', 
          fontWeight: 'bold', 
          marginBottom: '1rem',
          color: '#1e40af'
        }}>
          👤 Current User
        </h3>
        <div style={{ marginBottom: '0.5rem' }}>
          <strong>Name:</strong> {currentUser.displayName || 'Not Set'}
        </div>
        <div style={{ marginBottom: '0.5rem' }}>
          <strong>Email:</strong> {currentUser.email}
        </div>
        <div>
          <strong>Current Role:</strong> <span style={{ color: '#6b7280' }}>Student (Default)</span>
        </div>
      </div>

      {/* Setup Instructions */}
      <div style={{ 
        backgroundColor: '#fef3c7', 
        borderRadius: '0.75rem', 
        padding: '1.5rem',
        marginBottom: '2rem',
        border: '1px solid #fbbf24',
        textAlign: 'left'
      }}>
        <h3 style={{ 
          fontSize: '1.125rem', 
          fontWeight: 'bold', 
          marginBottom: '1rem',
          color: '#92400e',
          textAlign: 'center'
        }}>
          📋 What This Does
        </h3>
        <ul style={{ 
          color: '#92400e', 
          fontSize: '0.875rem', 
          lineHeight: '1.6',
          paddingLeft: '1.5rem',
          margin: 0
        }}>
          <li>Sets you as the first Administrator with full permissions</li>
          <li>Enables you to assign Scorekeeper roles to students</li>
          <li>Allows you to approve/reject PP change requests</li>
          <li>Gives you access to all role management features</li>
          <li>Creates the foundation for the classroom role system</li>
        </ul>
      </div>

      {/* Setup Button */}
      <button
        onClick={handleSetupAdmin}
        disabled={setting}
        style={{
          backgroundColor: setting ? '#6b7280' : '#1d4ed8',
          color: 'white',
          border: 'none',
          padding: '1rem 2rem',
          borderRadius: '0.75rem',
          fontSize: '1rem',
          fontWeight: 'bold',
          cursor: setting ? 'not-allowed' : 'pointer',
          transition: 'all 0.2s',
          width: '100%',
          marginBottom: '1rem'
        }}
        onMouseEnter={(e) => {
          if (!setting) {
            e.currentTarget.style.backgroundColor = '#1e40af';
            e.currentTarget.style.transform = 'translateY(-2px)';
          }
        }}
        onMouseLeave={(e) => {
          if (!setting) {
            e.currentTarget.style.backgroundColor = '#1d4ed8';
            e.currentTarget.style.transform = 'translateY(0)';
          }
        }}
      >
        {setting ? '⏳ Setting Up...' : '🔑 Set Me as Administrator'}
      </button>

      {/* Warning */}
      <p style={{ 
        fontSize: '0.75rem', 
        color: '#6b7280',
        fontStyle: 'italic',
        textAlign: 'center'
      }}>
        ⚠️ Only run this once to set up the first administrator. Additional admins can be assigned later through the Role Manager.
      </p>
    </div>
  );
};

export default RoleSystemSetup;








