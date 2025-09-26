import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { db } from '../firebase';
import { 
  collection, 
  getDocs, 
  doc, 
  updateDoc, 
  serverTimestamp,
  query,
  where
} from 'firebase/firestore';
import { logger } from '../utils/debugLogger';
import { getActivePPBoost, applyPPBoost } from '../utils/ppBoost';

interface PPChangeRequest {
  id: string;
  scorekeeperId: string;
  scorekeeperEmail: string;
  classId: string;
  className: string;
  changes: Array<{
    studentId: string;
    studentName: string;
    studentEmail: string;
    currentPP: number;
    changeAmount: number;
    newPP: number;
  }>;
  submittedAt: any;
  status: 'pending' | 'approved' | 'rejected';
  reviewedBy: string | null;
  reviewedAt: any;
}

const PPChangeApproval: React.FC = () => {
  const { currentUser } = useAuth();
  const [changeRequests, setChangeRequests] = useState<PPChangeRequest[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [processing, setProcessing] = useState<string | null>(null);

  // Check if current user is admin
  const isAdmin = currentUser?.email === 'eddymosley@compscihigh.org' || 
                  currentUser?.email === 'admin@mstgames.net' ||
                  currentUser?.email === 'edm21179@gmail.com' ||
                  currentUser?.email?.includes('eddymosley') ||
                  currentUser?.email?.includes('admin') ||
                  currentUser?.email?.includes('mstgames');

  useEffect(() => {
    if (!isAdmin) {
      setLoading(false);
      return;
    }

    const loadChangeRequests = async () => {
      try {
        const q = query(
          collection(db, 'ppChangeRequests'),
          where('status', '==', 'pending')
        );
        
        const snapshot = await getDocs(q);
        const requests = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as PPChangeRequest[];

        // Sort by submittedAt in descending order (most recent first)
        requests.sort((a, b) => {
          const aTime = a.submittedAt?.toDate?.() || new Date(0);
          const bTime = b.submittedAt?.toDate?.() || new Date(0);
          return bTime.getTime() - aTime.getTime();
        });

        setChangeRequests(requests);
        logger.roster.info('PPChangeApproval: Loaded change requests:', requests.length);
      } catch (error) {
        logger.roster.error('PPChangeApproval: Error loading change requests:', error);
      } finally {
        setLoading(false);
      }
    };

    loadChangeRequests();
  }, [isAdmin]);

  const handleApprove = async (requestId: string) => {
    if (!currentUser) return;

    setProcessing(requestId);
    try {
      const request = changeRequests.find(r => r.id === requestId);
      if (!request) return;

      // Update student PP values in database
      for (const change of request.changes) {
        // Apply PP boost if student has one active
        let finalPP = change.newPP;
        try {
          const activeBoost = await getActivePPBoost(change.studentId);
          if (activeBoost && change.changeAmount > 0) {
            const boostedAmount = applyPPBoost(change.changeAmount, change.studentId, activeBoost);
            finalPP = change.currentPP + boostedAmount;
            logger.roster.info('PPChangeApproval: PP boost applied:', {
              studentId: change.studentId,
              originalChange: change.changeAmount,
              boostedAmount,
              finalPP
            });
          }
        } catch (error) {
          logger.roster.error('PPChangeApproval: Error applying PP boost:', error);
        }
        
        await updateDoc(doc(db, 'students', change.studentId), {
          powerPoints: finalPP,
          lastUpdated: serverTimestamp()
        });
      }

      // Update the change request status
      await updateDoc(doc(db, 'ppChangeRequests', requestId), {
        status: 'approved',
        reviewedBy: currentUser.uid,
        reviewedAt: serverTimestamp()
      });

      // Remove from local state
      setChangeRequests(prev => prev.filter(r => r.id !== requestId));

      logger.roster.info('PPChangeApproval: Approved change request:', {
        requestId,
        changesCount: request.changes.length
      });

      alert(`Approved ${request.changes.length} changes for ${request.className}`);
    } catch (error) {
      logger.roster.error('PPChangeApproval: Error approving changes:', error);
      alert('Error approving changes. Please try again.');
    } finally {
      setProcessing(null);
    }
  };

  const handleReject = async (requestId: string) => {
    if (!currentUser) return;

    setProcessing(requestId);
    try {
      // Update the change request status
      await updateDoc(doc(db, 'ppChangeRequests', requestId), {
        status: 'rejected',
        reviewedBy: currentUser.uid,
        reviewedAt: serverTimestamp()
      });

      // Remove from local state
      setChangeRequests(prev => prev.filter(r => r.id !== requestId));

      logger.roster.info('PPChangeApproval: Rejected change request:', requestId);
      alert('Changes rejected and will not be applied.');
    } catch (error) {
      logger.roster.error('PPChangeApproval: Error rejecting changes:', error);
      alert('Error rejecting changes. Please try again.');
    } finally {
      setProcessing(null);
    }
  };

  if (!isAdmin) {
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
          You don't have permission to access the PP Change Approval interface.
        </p>
      </div>
    );
  }

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
        Loading change requests...
      </div>
    );
  }

  return (
    <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ 
          fontSize: '2rem', 
          fontWeight: 'bold', 
          color: '#1f2937',
          margin: 0,
          marginBottom: '0.5rem'
        }}>
          📋 PP Change Approval
        </h1>
        <p style={{ 
          fontSize: '1rem', 
          color: '#6b7280',
          margin: 0
        }}>
          Review and approve Power Point changes submitted by scorekeepers.
        </p>
      </div>

      {changeRequests.length === 0 ? (
        <div style={{ 
          textAlign: 'center', 
          padding: '3rem 2rem',
          backgroundColor: 'white',
          borderRadius: '0.75rem',
          border: '1px solid #e5e7eb'
        }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>✅</div>
          <h3 style={{ 
            fontSize: '1.25rem', 
            fontWeight: '600', 
            color: '#1f2937',
            margin: 0,
            marginBottom: '0.5rem'
          }}>
            No Pending Changes
          </h3>
          <p style={{ 
            fontSize: '0.875rem', 
            color: '#6b7280',
            margin: 0
          }}>
            All change requests have been reviewed.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {changeRequests.map((request) => (
            <div key={request.id} style={{
              backgroundColor: 'white',
              borderRadius: '0.75rem',
              padding: '1.5rem',
              border: '1px solid #e5e7eb',
              boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)'
            }}>
              {/* Request Header */}
              <div style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'flex-start',
                marginBottom: '1rem'
              }}>
                <div>
                  <h3 style={{ 
                    fontSize: '1.125rem', 
                    fontWeight: '600', 
                    color: '#1f2937',
                    margin: 0,
                    marginBottom: '0.25rem'
                  }}>
                    {request.className}
                  </h3>
                  <p style={{ 
                    fontSize: '0.875rem', 
                    color: '#6b7280',
                    margin: 0
                  }}>
                    Submitted by: {request.scorekeeperEmail}
                  </p>
                  <p style={{ 
                    fontSize: '0.875rem', 
                    color: '#6b7280',
                    margin: 0
                  }}>
                    {request.changes.length} change{request.changes.length === 1 ? '' : 's'}
                  </p>
                </div>
                <div style={{ 
                  display: 'flex', 
                  gap: '0.5rem'
                }}>
                  <button
                    onClick={() => handleReject(request.id)}
                    disabled={processing === request.id}
                    style={{
                      backgroundColor: processing === request.id ? '#9ca3af' : '#ef4444',
                      color: 'white',
                      border: 'none',
                      borderRadius: '0.375rem',
                      padding: '0.5rem 1rem',
                      fontSize: '0.875rem',
                      fontWeight: '500',
                      cursor: processing === request.id ? 'not-allowed' : 'pointer'
                    }}
                  >
                    {processing === request.id ? 'Processing...' : 'Reject'}
                  </button>
                  <button
                    onClick={() => handleApprove(request.id)}
                    disabled={processing === request.id}
                    style={{
                      backgroundColor: processing === request.id ? '#9ca3af' : '#10b981',
                      color: 'white',
                      border: 'none',
                      borderRadius: '0.375rem',
                      padding: '0.5rem 1rem',
                      fontSize: '0.875rem',
                      fontWeight: '500',
                      cursor: processing === request.id ? 'not-allowed' : 'pointer'
                    }}
                  >
                    {processing === request.id ? 'Processing...' : 'Approve'}
                  </button>
                </div>
              </div>

              {/* Changes List */}
              <div style={{ 
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
                gap: '1rem'
              }}>
                {request.changes.map((change, index) => (
                  <div key={index} style={{
                    backgroundColor: '#f8fafc',
                    borderRadius: '0.5rem',
                    padding: '1rem',
                    border: '1px solid #e2e8f0'
                  }}>
                    <div style={{ 
                      display: 'flex', 
                      justifyContent: 'space-between', 
                      alignItems: 'center',
                      marginBottom: '0.5rem'
                    }}>
                      <h4 style={{ 
                        fontSize: '0.875rem', 
                        fontWeight: '600', 
                        color: '#1f2937',
                        margin: 0
                      }}>
                        {change.studentName}
                      </h4>
                      <span style={{
                        backgroundColor: change.changeAmount > 0 ? '#dcfce7' : '#fef2f2',
                        color: change.changeAmount > 0 ? '#166534' : '#dc2626',
                        padding: '0.125rem 0.375rem',
                        borderRadius: '0.25rem',
                        fontSize: '0.75rem',
                        fontWeight: '500'
                      }}>
                        {change.changeAmount > 0 ? '+' : ''}{change.changeAmount}
                      </span>
                    </div>
                    <p style={{ 
                      fontSize: '0.75rem', 
                      color: '#6b7280',
                      margin: 0,
                      marginBottom: '0.25rem'
                    }}>
                      {change.studentEmail}
                    </p>
                    <div style={{ 
                      display: 'flex', 
                      justifyContent: 'space-between',
                      fontSize: '0.75rem',
                      color: '#6b7280'
                    }}>
                      <span>Current: {change.currentPP} PP</span>
                      <span>→</span>
                      <span style={{ fontWeight: '500', color: '#1f2937' }}>
                        {change.newPP} PP
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default PPChangeApproval;