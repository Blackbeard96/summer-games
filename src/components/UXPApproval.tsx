import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, where, getDocs, doc, updateDoc, getDoc, writeBatch, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { artifactRequiresUxpStyleApproval } from '../utils/artifactsRequiringStaffApproval';

interface PendingUXPArtifact {
  userId: string;
  userDisplayName: string;
  userEmail: string;
  artifactId: string;
  artifactName: string;
  artifactData: any;
  purchasedAt: Date;
  collectionType: 'users' | 'students';
  artifactKey: string; // The key in the artifacts object/array
  /** Classes the student is enrolled in, sorted by name (empty when on no roster). */
  classNames: string[];
}

const NO_CLASS = 'No class';

/** Profile "use on assignment" sets `pending: true`; Marketplace sets pendingApproval / approvalStatus. */
function isPendingUxPRequest(artifact: Record<string, unknown> | null | undefined): boolean {
  if (!artifact || typeof artifact !== 'object') return false;
  return (
    artifact.pendingApproval === true ||
    artifact.approvalStatus === 'pending' ||
    artifact.pending === true ||
    artifact.status === 'pending'
  );
}

const UXPApproval: React.FC = () => {
  const { currentUser, isAdmin } = useAuth();
  const [pendingArtifacts, setPendingArtifacts] = useState<PendingUXPArtifact[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);
  const [classFilter, setClassFilter] = useState<string>('all');

  useEffect(() => {
    if (!isAdmin) {
      setLoading(false);
      return;
    }
    loadPendingUXPArtifacts();
  }, [isAdmin]);

  const loadPendingUXPArtifacts = async () => {
    setLoading(true);
    try {
      const allPending: Omit<PendingUXPArtifact, 'classNames'>[] = [];

      // Fetch all user info upfront to create a lookup map
      const [usersSnapshot, studentsSnapshot, classroomsSnapshot] = await Promise.all([
        getDocs(collection(db, 'users')),
        getDocs(collection(db, 'students')),
        getDocs(collection(db, 'classrooms')),
      ]);

      const classNamesByStudent = new Map<string, string[]>();
      classroomsSnapshot.docs.forEach((classDoc) => {
        const data = classDoc.data();
        const name = String(data.name || classDoc.id);
        ((data.students as string[]) || []).filter(Boolean).forEach((studentId) => {
          const list = classNamesByStudent.get(studentId) || [];
          if (!list.includes(name)) list.push(name);
          classNamesByStudent.set(studentId, list);
        });
      });
      const classNamesFor = (userId: string) =>
        [...(classNamesByStudent.get(userId) || [])].sort((a, b) => a.localeCompare(b));

      // Create a map of user info from both collections
      const userInfoMap = new Map<string, { displayName: string; email: string }>();
      
      // Process users collection
      usersSnapshot.docs.forEach(doc => {
        const userData = doc.data();
        const displayName = userData.displayName || userData.name || userData.username || null;
        const email = userData.email || null;
        
        if (displayName || email) {
          userInfoMap.set(doc.id, {
            displayName: displayName || `User ${doc.id.substring(0, 8)}`,
            email: email || 'No email'
          });
        }
      });
      
      // Process students collection (students collection takes precedence if both exist)
      studentsSnapshot.docs.forEach(doc => {
        const studentData = doc.data();
        const displayName = studentData.displayName || studentData.name || studentData.username || null;
        const email = studentData.email || null;
        
        // Only update if we have better info or if user wasn't in users collection
        const existing = userInfoMap.get(doc.id);
        if (!existing || (displayName && email)) {
          userInfoMap.set(doc.id, {
            displayName: displayName || existing?.displayName || `User ${doc.id.substring(0, 8)}`,
            email: email || existing?.email || 'No email'
          });
        }
      });

      // Helper function to get user info from map
      const getUserInfo = (userId: string): { displayName: string; email: string } => {
        return userInfoMap.get(userId) || {
          displayName: `User ${userId.substring(0, 8)}`,
          email: 'No email'
        };
      };

      // Query all users to find pending UXP artifacts
      for (const userDoc of usersSnapshot.docs) {
        const userData = userDoc.data();
        const artifacts = userData.artifacts || {};

        // Get user info from map
        const userInfo = getUserInfo(userDoc.id);

        // Check if artifacts is an array
        if (Array.isArray(artifacts)) {
          artifacts.forEach((artifact: any, index: number) => {
            if (artifactRequiresUxpStyleApproval(artifact) && isPendingUxPRequest(artifact)) {
              allPending.push({
                userId: userDoc.id,
                userDisplayName: userInfo.displayName,
                userEmail: userInfo.email,
                artifactId: artifact.id,
                artifactName: artifact.name,
                artifactData: artifact,
                purchasedAt: artifact.purchasedAt?.toDate?.() || artifact.submittedAt?.toDate?.() || new Date(),
                collectionType: 'users',
                artifactKey: `array_${index}`
              });
            }
          });
        } else {
          // Artifacts is an object
          Object.keys(artifacts).forEach(key => {
            if (key.includes('_purchase')) {
              const artifact = artifacts[key];
              if (artifactRequiresUxpStyleApproval(artifact) && isPendingUxPRequest(artifact)) {
                const baseId = key.replace(/_purchase$/i, '');
                allPending.push({
                  userId: userDoc.id,
                  userDisplayName: userInfo.displayName,
                  userEmail: userInfo.email,
                  artifactId: artifact.id || baseId,
                  artifactName: artifact.name,
                  artifactData: artifact,
                  purchasedAt: artifact.purchasedAt?.toDate?.() || artifact.submittedAt?.toDate?.() || new Date(),
                  collectionType: 'users',
                  artifactKey: key
                });
              }
            }
          });
        }
      }

      // Also check students collection
      for (const studentDoc of studentsSnapshot.docs) {
        const studentData = studentDoc.data();
        const artifacts = studentData.artifacts || {};

        // Get user info from map
        const userInfo = getUserInfo(studentDoc.id);

        if (Array.isArray(artifacts)) {
          artifacts.forEach((artifact: any, index: number) => {
            if (artifactRequiresUxpStyleApproval(artifact) && isPendingUxPRequest(artifact)) {
              const exists = allPending.some(
                (p) => p.userId === studentDoc.id && p.artifactKey === `array_${index}`
              );
              if (!exists) {
                allPending.push({
                  userId: studentDoc.id,
                  userDisplayName: userInfo.displayName,
                  userEmail: userInfo.email,
                  artifactId: artifact.id,
                  artifactName: artifact.name,
                  artifactData: artifact,
                  purchasedAt: artifact.purchasedAt?.toDate?.() || artifact.submittedAt?.toDate?.() || new Date(),
                  collectionType: 'students',
                  artifactKey: `array_${index}`
                });
              }
            }
          });
        } else {
          Object.keys(artifacts).forEach((key) => {
            if (key.includes('_purchase')) {
              const artifact = artifacts[key];
              if (artifactRequiresUxpStyleApproval(artifact) && isPendingUxPRequest(artifact)) {
                const baseId = key.replace(/_purchase$/i, '');
                const exists = allPending.some(
                  (p) => p.userId === studentDoc.id && p.artifactKey === key
                );
                if (!exists) {
                  allPending.push({
                    userId: studentDoc.id,
                    userDisplayName: userInfo.displayName,
                    userEmail: userInfo.email,
                    artifactId: artifact.id || baseId,
                    artifactName: artifact.name,
                    artifactData: artifact,
                    purchasedAt: artifact.purchasedAt?.toDate?.() || artifact.submittedAt?.toDate?.() || new Date(),
                    collectionType: 'students',
                    artifactKey: key
                  });
                }
              }
            }
          });
        }
      }

      // Sort by purchase date (newest first)
      allPending.sort((a, b) => b.purchasedAt.getTime() - a.purchasedAt.getTime());

      setPendingArtifacts(allPending.map((p) => ({ ...p, classNames: classNamesFor(p.userId) })));
    } catch (error) {
      console.error('Error loading pending UXP artifacts:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (pending: PendingUXPArtifact) => {
    if (!currentUser || !isAdmin) return;
    
    setProcessing(`${pending.userId}_${pending.artifactKey}`);
    try {
      const batch = writeBatch(db);

      const filterArrayApprove = (arr: unknown[]) => {
        const m = /^array_(\d+)$/.exec(pending.artifactKey);
        if (m) {
          const i = parseInt(m[1], 10);
          if (i >= 0 && i < arr.length) {
            return arr.filter((_, idx) => idx !== i);
          }
        }
        return arr.filter(
          (art: any) =>
            !(
              art?.id === pending.artifactId &&
              artifactRequiresUxpStyleApproval(art) &&
              isPendingUxPRequest(art)
            )
        );
      };

      // Remove artifact from users collection
      const userRef = doc(db, 'users', pending.userId);
      const userDoc = await getDoc(userRef);
      
      if (userDoc.exists()) {
        const userData = userDoc.data();
        const artifacts = userData.artifacts || {};
        
        if (Array.isArray(artifacts)) {
          batch.update(userRef, { artifacts: filterArrayApprove(artifacts) });
        } else {
          const updatedArtifacts = { ...artifacts };
          if (typeof pending.artifactKey === 'string' && pending.artifactKey.endsWith('_purchase')) {
            const base = pending.artifactKey.replace(/_purchase$/i, '');
            delete updatedArtifacts[pending.artifactKey];
            delete updatedArtifacts[base];
          } else {
            delete updatedArtifacts[pending.artifactId];
            delete updatedArtifacts[`${pending.artifactId}_purchase`];
          }
          batch.update(userRef, { artifacts: updatedArtifacts });
        }
      }

      // Remove artifact from students collection
      const studentRef = doc(db, 'students', pending.userId);
      const studentDoc = await getDoc(studentRef);
      
      if (studentDoc.exists()) {
        const studentData = studentDoc.data();
        const artifacts = studentData.artifacts || {};
        let nextArtifacts: Record<string, unknown> | unknown[];

        if (Array.isArray(artifacts)) {
          nextArtifacts = filterArrayApprove(artifacts);
        } else {
          const updatedArtifacts = { ...artifacts };
          if (typeof pending.artifactKey === 'string' && pending.artifactKey.endsWith('_purchase')) {
            const base = pending.artifactKey.replace(/_purchase$/i, '');
            delete updatedArtifacts[pending.artifactKey];
            delete updatedArtifacts[base];
          } else {
            delete updatedArtifacts[pending.artifactId];
            delete updatedArtifacts[`${pending.artifactId}_purchase`];
          }
          nextArtifacts = updatedArtifacts;
        }
        
        const inventory = studentData.inventory || [];
        const updatedInventory = inventory.filter((item: string) => item !== pending.artifactName);
        
        batch.update(studentRef, { 
          artifacts: nextArtifacts,
          inventory: updatedInventory
        });
      }

      await batch.commit();
      
      // Reload pending artifacts
      await loadPendingUXPArtifacts();
      
      alert(`✅ Approved and removed ${pending.artifactName} for ${pending.userDisplayName}`);
    } catch (error) {
      console.error('Error approving UXP artifact:', error);
      alert('❌ Failed to approve artifact. Please try again.');
    } finally {
      setProcessing(null);
    }
  };

  const handleReject = async (pending: PendingUXPArtifact) => {
    if (!currentUser || !isAdmin) return;
    
    setProcessing(pending.userId + '_' + pending.artifactId);
    try {
      const batch = writeBatch(db);

      // Mark as rejected in users collection
      const userRef = doc(db, 'users', pending.userId);
      const userDoc = await getDoc(userRef);
      
      if (userDoc.exists()) {
        const userData = userDoc.data();
        const artifacts = userData.artifacts || {};
        
        if (Array.isArray(artifacts)) {
          const updatedArtifacts = artifacts.map((art: any) => {
            if (
              art?.id === pending.artifactId &&
              artifactRequiresUxpStyleApproval(art) &&
              isPendingUxPRequest(art)
            ) {
              return {
                ...art,
                pending: false,
                pendingApproval: false,
                approvalStatus: 'rejected',
                rejectedAt: new Date(),
                rejectedBy: currentUser.uid
              };
            }
            return art;
          });
          batch.update(userRef, { artifacts: updatedArtifacts });
        } else {
          const updatedArtifacts = { ...artifacts };
          const purchaseKey =
            typeof pending.artifactKey === 'string' && pending.artifactKey.endsWith('_purchase')
              ? pending.artifactKey
              : `${pending.artifactId}_purchase`;
          if (updatedArtifacts[purchaseKey]) {
            updatedArtifacts[purchaseKey] = {
              ...updatedArtifacts[purchaseKey],
              pending: false,
              pendingApproval: false,
              approvalStatus: 'rejected',
              rejectedAt: new Date(),
              rejectedBy: currentUser.uid
            };
          }
          batch.update(userRef, { artifacts: updatedArtifacts });
        }
      }

      // Mark as rejected in students collection
      const studentRef = doc(db, 'students', pending.userId);
      const studentDoc = await getDoc(studentRef);
      
      if (studentDoc.exists()) {
        const studentData = studentDoc.data();
        const artifacts = studentData.artifacts || {};
        if (Array.isArray(artifacts)) {
          const updatedArtifacts = artifacts.map((art: any) => {
            if (
              art?.id === pending.artifactId &&
              artifactRequiresUxpStyleApproval(art) &&
              isPendingUxPRequest(art)
            ) {
              return {
                ...art,
                pending: false,
                pendingApproval: false,
                approvalStatus: 'rejected',
                rejectedAt: new Date(),
                rejectedBy: currentUser.uid
              };
            }
            return art;
          });
          batch.update(studentRef, { artifacts: updatedArtifacts });
        } else {
          const updatedArtifacts = { ...artifacts };
          const purchaseKey =
            typeof pending.artifactKey === 'string' && pending.artifactKey.endsWith('_purchase')
              ? pending.artifactKey
              : `${pending.artifactId}_purchase`;
          if (updatedArtifacts[purchaseKey]) {
            updatedArtifacts[purchaseKey] = {
              ...updatedArtifacts[purchaseKey],
              pending: false,
              pendingApproval: false,
              approvalStatus: 'rejected',
              rejectedAt: new Date(),
              rejectedBy: currentUser.uid
            };
          }
          batch.update(studentRef, { artifacts: updatedArtifacts });
        }
      }

      await batch.commit();
      
      // Reload pending artifacts
      await loadPendingUXPArtifacts();
      
      alert(`❌ Rejected ${pending.artifactName} for ${pending.userDisplayName}`);
    } catch (error) {
      console.error('Error rejecting UXP artifact:', error);
      alert('❌ Failed to reject artifact. Please try again.');
    } finally {
      setProcessing(null);
    }
  };

  // A student on several rosters is listed under their first class (alphabetical) so each request appears once.
  const groups = useMemo(() => {
    const byClass = new Map<string, PendingUXPArtifact[]>();
    pendingArtifacts.forEach((p) => {
      const key = p.classNames[0] || NO_CLASS;
      byClass.set(key, [...(byClass.get(key) || []), p]);
    });
    return Array.from(byClass.entries())
      .map(([className, items]) => ({
        className,
        items: [...items].sort(
          (a, b) =>
            a.userDisplayName.localeCompare(b.userDisplayName) ||
            b.purchasedAt.getTime() - a.purchasedAt.getTime()
        ),
      }))
      .sort((a, b) =>
        a.className === NO_CLASS ? 1 : b.className === NO_CLASS ? -1 : a.className.localeCompare(b.className)
      );
  }, [pendingArtifacts]);

  const visibleGroups = classFilter === 'all' ? groups : groups.filter((g) => g.className === classFilter);

  if (!isAdmin) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <h2>Access Denied</h2>
        <p>You must be an admin to access this page.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <p>Loading pending requests...</p>
      </div>
    );
  }

  return (
    <div style={{ padding: '2rem' }}>
      <h2 style={{ marginBottom: '1.5rem' }}>UXP &amp; Assignment Pass approval</h2>
      <p style={{ marginBottom: '1.5rem', color: '#6b7280' }}>
        Review pending UXP Credit purchases and Assignment Pass uses. Approving removes the item from the player; rejecting
        returns it to their inventory as not pending.
      </p>

      {pendingArtifacts.length === 0 ? (
        <div style={{ 
          padding: '2rem', 
          textAlign: 'center', 
          background: '#f3f4f6', 
          borderRadius: '0.5rem',
          color: '#6b7280'
        }}>
          <p>No pending UXP Credit or Assignment Pass requests.</p>
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
            <label htmlFor="uxp-class-filter" style={{ fontWeight: 600 }}>
              Class
            </label>
            <select
              id="uxp-class-filter"
              value={classFilter}
              onChange={(e) => setClassFilter(e.target.value)}
              style={{ padding: '0.4rem 0.6rem', borderRadius: '0.375rem', border: '1px solid #d1d5db', color: '#111827', background: '#fff' }}
            >
              <option value="all">All classes ({pendingArtifacts.length})</option>
              {groups.map((g) => (
                <option key={g.className} value={g.className}>
                  {g.className} ({g.items.length})
                </option>
              ))}
            </select>
          </div>

          {visibleGroups.length === 0 && (
            <div style={{ padding: '1.5rem', textAlign: 'center', background: '#f3f4f6', borderRadius: '0.5rem', color: '#6b7280' }}>
              No pending requests for this class.
            </div>
          )}

          {visibleGroups.map((group) => (
            <section key={group.className} style={{ marginBottom: '2rem' }}>
              <h3
                style={{
                  margin: '0 0 0.75rem',
                  paddingBottom: '0.4rem',
                  borderBottom: '1px solid rgba(201, 162, 39, 0.4)',
                  display: 'flex',
                  alignItems: 'baseline',
                  gap: '0.5rem',
                }}
              >
                {group.className}
                <span style={{ fontSize: '0.875rem', fontWeight: 500, color: '#9ca3af' }}>
                  {group.items.length} request{group.items.length === 1 ? '' : 's'}
                </span>
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {group.items.map((pending, index) => (
                  <div
                    key={`${pending.userId}_${pending.artifactKey}_${index}`}
                    style={{
                      padding: '1.5rem',
                      background: '#fff',
                      borderRadius: '0.5rem',
                      border: '1px solid #e5e7eb',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: '1rem'
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 'bold', marginBottom: '0.5rem', color: '#111827' }}>
                        {pending.artifactName}
                      </div>
                      <div style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.25rem' }}>
                        <strong>Student:</strong> {pending.userDisplayName} ({pending.userEmail})
                      </div>
                      {pending.classNames.length > 1 && (
                        <div style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.25rem' }}>
                          <strong>Classes:</strong> {pending.classNames.join(', ')}
                        </div>
                      )}
                      <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                        <strong>Purchased:</strong> {pending.purchasedAt.toLocaleString()}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button
                        onClick={() => handleApprove(pending)}
                        disabled={processing === `${pending.userId}_${pending.artifactKey}`}
                        style={{
                          padding: '0.5rem 1rem',
                          background: '#10b981',
                          color: 'white',
                          border: 'none',
                          borderRadius: '0.5rem',
                          cursor: processing === `${pending.userId}_${pending.artifactKey}` ? 'not-allowed' : 'pointer',
                          fontWeight: 'bold',
                          opacity: processing === `${pending.userId}_${pending.artifactKey}` ? 0.5 : 1
                        }}
                      >
                        {processing === `${pending.userId}_${pending.artifactKey}` ? 'Processing...' : 'Approve'}
                      </button>
                      <button
                        onClick={() => handleReject(pending)}
                        disabled={processing === `${pending.userId}_${pending.artifactKey}`}
                        style={{
                          padding: '0.5rem 1rem',
                          background: '#ef4444',
                          color: 'white',
                          border: 'none',
                          borderRadius: '0.5rem',
                          cursor: processing === `${pending.userId}_${pending.artifactKey}` ? 'not-allowed' : 'pointer',
                          fontWeight: 'bold',
                          opacity: processing === `${pending.userId}_${pending.artifactKey}` ? 0.5 : 1
                        }}
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </>
      )}
    </div>
  );
};

export default UXPApproval;


