import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { db } from '../firebase';
import { 
  collection, 
  getDocs, 
  getDoc,
  doc, 
  updateDoc, 
  serverTimestamp,
  query,
  where,
  addDoc
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
  const [ppBoostStatuses, setPpBoostStatuses] = useState<{ [studentId: string]: boolean }>({});
  const isBulkProcessing = processing === 'all';

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
        
        // Check PP boost status for all students in all requests
        const studentIds = new Set<string>();
        requests.forEach(request => {
          request.changes.forEach(change => {
            studentIds.add(change.studentId);
          });
        });
        
        // Load PP boost status for each student
        const boostStatuses: { [studentId: string]: boolean } = {};
        for (const studentId of Array.from(studentIds)) {
          try {
            const activeBoost = await getActivePPBoost(studentId);
            boostStatuses[studentId] = activeBoost !== null;
          } catch (error) {
            console.error(`Error checking PP boost for student ${studentId}:`, error);
            boostStatuses[studentId] = false;
          }
        }
        setPpBoostStatuses(boostStatuses);
      } catch (error) {
        logger.roster.error('PPChangeApproval: Error loading change requests:', error);
      } finally {
        setLoading(false);
      }
    };

    loadChangeRequests();
  }, [isAdmin]);

  const approveRequest = async (request: PPChangeRequest) => {
      if (!currentUser) return { appliedCount: 0, requestId: request.id, className: request.className };
      // Store final PP values for notifications
      const finalPPValues: { [studentId: string]: { originalPP: number; finalPP: number; changeAmount: number } } = {};
      
      // Update student PP values in database
      for (const change of request.changes) {
        // Fetch current PP from database to ensure accuracy (student's PP may have changed since submission)
        const studentRef = doc(db, 'students', change.studentId);
        const studentDoc = await getDoc(studentRef);
        
        if (!studentDoc.exists()) {
          logger.roster.error('PPChangeApproval: Student not found:', change.studentId);
          continue;
        }
        
        const currentPPFromDB = studentDoc.data().powerPoints || 0;
        
        // IMPORTANT: The stored changeAmount is now the original (unboosted) amount
        // We should always apply boost during approval if boost is active
        let changeAmountToApply = change.changeAmount;
        
        // Apply PP boost if student has one active and change is positive
        try {
          const activeBoost = await getActivePPBoost(change.studentId);
          if (activeBoost && change.changeAmount > 0) {
            // Apply boost to the original change amount
            const boostedAmount = applyPPBoost(change.changeAmount, change.studentId, activeBoost);
            changeAmountToApply = boostedAmount;
            logger.roster.info('PPChangeApproval: PP boost applied during approval:', {
              studentId: change.studentId,
              originalChange: change.changeAmount,
              boostedAmount,
              finalPP: currentPPFromDB + boostedAmount
            });
          }
        } catch (error) {
          logger.roster.error('PPChangeApproval: Error checking/applying PP boost:', error);
        }
        
        // Calculate final PP using current database value + change amount
        // CRITICAL: Always use current database PP, not stored currentPP, because
        // the student's PP may have changed between submission and approval
        // This ensures accuracy even if the student's PP changed (e.g., from battles, purchases, etc.)
        const finalPP = Math.max(0, currentPPFromDB + changeAmountToApply);
        
        // Store values for notifications
        finalPPValues[change.studentId] = {
          originalPP: currentPPFromDB,
          finalPP: finalPP,
          changeAmount: changeAmountToApply
        };
        
        logger.roster.info('PPChangeApproval: Updating PP:', {
          studentId: change.studentId,
          studentName: change.studentName,
          currentPPFromDB,
          changeAmountToApply,
          finalPP,
          storedCurrentPP: change.currentPP,
          storedChangeAmount: change.changeAmount,
          storedNewPP: change.newPP
        });
        
        await updateDoc(studentRef, {
          powerPoints: finalPP,
          lastUpdated: serverTimestamp()
        });
      }

      // Update the change request status
      await updateDoc(doc(db, 'ppChangeRequests', request.id), {
        status: 'approved',
        reviewedBy: currentUser.uid,
        reviewedAt: serverTimestamp()
      });

      // Create notifications for students whose PP was changed
      // Use the stored final PP values from the approval loop
      for (const change of request.changes) {
        try {
          const ppData = finalPPValues[change.studentId];
          if (!ppData) {
            logger.roster.error('PPChangeApproval: Missing PP data for notification:', change.studentId);
            continue;
          }

          // Create notification with detailed reward information for modal display
          await addDoc(collection(db, 'students', change.studentId, 'notifications'), {
            type: 'pp_change_approved',
            message: `Your Power Points have been updated by ${ppData.changeAmount > 0 ? '+' : ''}${ppData.changeAmount}. New total: ${ppData.finalPP}`,
            changeAmount: ppData.changeAmount,
            originalPP: ppData.originalPP,
            newTotal: ppData.finalPP,
            scorekeeperName: request.scorekeeperEmail,
            timestamp: serverTimestamp(),
            read: false
          });
        } catch (notificationError) {
          console.error('Error creating PP change notification:', notificationError);
        }
      }

      // Create notification for scorekeeper
      try {
        await addDoc(collection(db, 'students', request.scorekeeperId, 'notifications'), {
          type: 'pp_changes_approved',
          message: `Your PP change request for ${request.className} has been approved!`,
          className: request.className,
          changesCount: request.changes.length,
          timestamp: serverTimestamp(),
          read: false
        });
      } catch (notificationError) {
        console.error('Error creating scorekeeper notification:', notificationError);
      }

      // Remove from local state
      setChangeRequests(prev => prev.filter(r => r.id !== request.id));

      logger.roster.info('PPChangeApproval: Approved change request:', {
        requestId: request.id,
        changesCount: request.changes.length
      });
      return { appliedCount: request.changes.length, requestId: request.id, className: request.className };
  };

  const handleApprove = async (requestId: string) => {
    if (!currentUser) return;

    setProcessing(requestId);
    try {
      const request = changeRequests.find(r => r.id === requestId);
      if (!request) return;
      const result = await approveRequest(request);
      alert(`Approved ${result.appliedCount} changes for ${result.className}`);
    } catch (error) {
      logger.roster.error('PPChangeApproval: Error approving changes:', error);
      alert('Error approving changes. Please try again.');
    } finally {
      setProcessing(null);
    }
  };

  const handleApproveAll = async () => {
    if (!currentUser) return;
    if (changeRequests.length === 0) return;

    const confirmed = window.confirm(
      `Approve all ${changeRequests.length} pending PP change request${changeRequests.length === 1 ? '' : 's'} across all classes?`
    );
    if (!confirmed) return;

    setProcessing('all');
    try {
      const requestsToApprove = [...changeRequests];
      let approvedRequests = 0;
      let approvedChanges = 0;

      for (const request of requestsToApprove) {
        const result = await approveRequest(request);
        approvedRequests += 1;
        approvedChanges += result.appliedCount;
      }

      alert(
        `Approved ${approvedRequests} request${approvedRequests === 1 ? '' : 's'} and ${approvedChanges} student PP change${approvedChanges === 1 ? '' : 's'} across all classes.`
      );
    } catch (error) {
      logger.roster.error('PPChangeApproval: Error approving all changes:', error);
      alert('Error during Approve All. Some requests may remain pending. Please refresh and retry.');
    } finally {
      setProcessing(null);
    }
  };

  const handleReject = async (requestId: string) => {
    if (!currentUser) return;

    setProcessing(requestId);
    try {
      // Find the request object first
      const request = changeRequests.find(r => r.id === requestId);
      if (!request) return;

      // Update the change request status
      await updateDoc(doc(db, 'ppChangeRequests', requestId), {
        status: 'rejected',
        reviewedBy: currentUser.uid,
        reviewedAt: serverTimestamp()
      });

      // Create notification for scorekeeper
      try {
        await addDoc(collection(db, 'students', request.scorekeeperId, 'notifications'), {
          type: 'pp_changes_rejected',
          message: `Your PP change request for ${request.className} has been rejected.`,
          className: request.className,
          changesCount: request.changes.length,
          timestamp: serverTimestamp(),
          read: false
        });
      } catch (notificationError) {
        console.error('Error creating scorekeeper rejection notification:', notificationError);
      }

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
        {changeRequests.length > 0 && (
          <div style={{ marginTop: '1rem' }}>
            <button
              onClick={handleApproveAll}
              disabled={processing !== null}
              style={{
                backgroundColor: processing !== null ? '#9ca3af' : '#059669',
                color: 'white',
                border: 'none',
                borderRadius: '0.5rem',
                padding: '0.625rem 1rem',
                fontSize: '0.875rem',
                fontWeight: '600',
                cursor: processing !== null ? 'not-allowed' : 'pointer'
              }}
            >
              {isBulkProcessing ? 'Approving All...' : `Approve All (${changeRequests.length})`}
            </button>
          </div>
        )}
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
                    disabled={processing !== null}
                    style={{
                      backgroundColor: processing !== null ? '#9ca3af' : '#ef4444',
                      color: 'white',
                      border: 'none',
                      borderRadius: '0.375rem',
                      padding: '0.5rem 1rem',
                      fontSize: '0.875rem',
                      fontWeight: '500',
                      cursor: processing !== null ? 'not-allowed' : 'pointer'
                    }}
                  >
                    {processing === request.id ? 'Processing...' : 'Reject'}
                  </button>
                  <button
                    onClick={() => handleApprove(request.id)}
                    disabled={processing !== null}
                    style={{
                      backgroundColor: processing !== null ? '#9ca3af' : '#10b981',
                      color: 'white',
                      border: 'none',
                      borderRadius: '0.375rem',
                      padding: '0.5rem 1rem',
                      fontSize: '0.875rem',
                      fontWeight: '500',
                      cursor: processing !== null ? 'not-allowed' : 'pointer'
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
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <h4 style={{ 
                          fontSize: '0.875rem', 
                          fontWeight: '600', 
                          color: '#1f2937',
                          margin: 0
                        }}>
                          {change.studentName}
                        </h4>
                        {/* PP Boost Indicator */}
                        {ppBoostStatuses[change.studentId] && change.changeAmount > 0 && (
                          <span
                            style={{
                              background: 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)',
                              color: 'white',
                              padding: '0.125rem 0.375rem',
                              borderRadius: '0.25rem',
                              fontSize: '0.7rem',
                              fontWeight: 'bold',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.25rem',
                              boxShadow: '0 1px 2px rgba(251, 191, 36, 0.3)'
                            }}
                            title="Double PP Boost Active - This student will receive double PP"
                          >
                            ⚡ x2
                          </span>
                        )}
                      </div>
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