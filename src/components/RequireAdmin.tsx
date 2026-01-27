import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

/**
 * Route guard component that ensures only admin users can access wrapped routes.
 * 
 * Behavior:
 * - If role is loading: shows loading state
 * - If not admin: redirects to home page
 * - If admin: renders children
 * 
 * NOTE: This is a frontend guard only. Backend Firestore security rules must also
 * enforce permissions to prevent unauthorized access via direct API calls.
 * 
 * SECURITY REQUIREMENTS:
 * - Firestore rules must check user role before allowing admin-only operations
 * - Role is stored in: userRoles/{uid}.role OR users/{uid}.role
 * - Admin-only collections (e.g., scorekeeper operations, admin panel data) should
 *   verify request.auth.uid has role='admin' before allowing read/write
 * - See firestore-simplified.rules for backend rule definitions
 * 
 * Example rule pattern:
 *   match /admin/{document=**} {
 *     allow read, write: if request.auth != null && 
 *       get(/databases/$(database)/documents/userRoles/$(request.auth.uid)).data.role == 'admin';
 *   }
 */
interface RequireAdminProps {
  children: React.ReactNode;
}

const RequireAdmin: React.FC<RequireAdminProps> = ({ children }) => {
  const { isAdmin, loadingRole, loading } = useAuth();

  // Show loading state while auth or role is loading
  if (loading || loadingRole) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '50vh',
        flexDirection: 'column',
        gap: '1rem'
      }}>
        <div style={{
          border: '3px solid #f3f4f6',
          borderTop: '3px solid #3b82f6',
          borderRadius: '50%',
          width: '40px',
          height: '40px',
          animation: 'spin 1s linear infinite'
        }} />
        <p style={{ color: '#6b7280', fontSize: '0.875rem' }}>Loading...</p>
        <style>{`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  }

  // Redirect to home if not admin
  if (!isAdmin) {
    console.warn('RequireAdmin: Non-admin user attempted to access admin route');
    return <Navigate to="/home" replace />;
  }

  // Render children if admin
  return <>{children}</>;
};

export default RequireAdmin;

