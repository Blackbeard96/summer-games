/**
 * Test Account Manager V2
 * 
 * Full-featured test account management interface with:
 * - Create multiple test accounts
 * - Assign phase presets
 * - Switch between accounts
 * - Reset accounts to phase preset
 * - Duplicate accounts
 * - Deactivate/activate accounts
 */

import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { 
  createTestAccount, 
  getAllTestAccounts, 
  resetTestAccount, 
  duplicateTestAccount,
  updateTestAccount,
  getTestAccount,
  migrateExistingTestAccount,
  fixAllTestAccountManifestSkills,
  TestAccount
} from '../utils/testAccountService';
import { TEST_PHASE_PRESETS, getPresetKeys, getPreset } from '../utils/testAccountPresets';

interface TestAccountManagerV2Props {
  isOpen: boolean;
  onClose: () => void;
}

const TestAccountManagerV2: React.FC<TestAccountManagerV2Props> = ({ isOpen, onClose }) => {
  const { currentUser, switchToTestAccount, switchToAdmin, currentRole, activeTestAccountId, isAdmin } = useAuth();
  const [loading, setLoading] = useState(false);
  const [testAccounts, setTestAccounts] = useState<TestAccount[]>([]);
  const [filteredAccounts, setFilteredAccounts] = useState<TestAccount[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterPhase, setFilterPhase] = useState<string>('all');
  const [showCreateForm, setShowCreateForm] = useState(false);
  
  // Create form state
  const [newLabel, setNewLabel] = useState('');
  const [newPhaseKey, setNewPhaseKey] = useState('phase_1_new');
  const [newNotes, setNewNotes] = useState('');

  useEffect(() => {
    if (isOpen && isAdmin) {
      loadTestAccounts();
      // Check if test-account-001 exists and needs migration
      checkAndMigrateLegacyAccount();
    }
  }, [isOpen, isAdmin]);

  const checkAndMigrateLegacyAccount = async () => {
    if (!currentUser) return;
    
    try {
      // Check if test-account-001 exists in users/students but not in testAccounts
      const { doc, getDoc } = await import('firebase/firestore');
      const { db } = await import('../firebase');
      
      const userRef = doc(db, 'users', 'test-account-001');
      const userDoc = await getDoc(userRef);
      
      if (userDoc.exists()) {
        // Check if it's already in testAccounts
        const existing = await getTestAccount('test-account-001');
        if (!existing) {
          // Offer to migrate
          if (window.confirm('Found legacy test-account-001. Would you like to migrate it to the new system?\n\nThis will create a metadata entry for it.')) {
            await migrateExistingTestAccount(
              'test-account-001',
              'Legacy Test Account (Phase 1)',
              'phase_1_new',
              currentUser.uid
            );
            alert('✅ Migrated test-account-001 to new system!');
            await loadTestAccounts();
          }
        }
      }
    } catch (error) {
      console.error('Error checking legacy account:', error);
    }
  };

  useEffect(() => {
    // Filter accounts based on search and phase
    let filtered = testAccounts;
    
    if (searchTerm) {
      filtered = filtered.filter(account => 
        account.label.toLowerCase().includes(searchTerm.toLowerCase()) ||
        account.id.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }
    
    if (filterPhase !== 'all') {
      filtered = filtered.filter(account => account.phaseKey === filterPhase);
    }
    
    setFilteredAccounts(filtered);
  }, [testAccounts, searchTerm, filterPhase]);

  const loadTestAccounts = async () => {
    setLoading(true);
    try {
      const accounts = await getAllTestAccounts();
      setTestAccounts(accounts);
    } catch (error) {
      console.error('Error loading test accounts:', error);
      alert('❌ Failed to load test accounts: ' + (error instanceof Error ? error.message : 'Unknown error'));
    } finally {
      setLoading(false);
    }
  };

  const handleCreateAccount = async () => {
    if (!currentUser) {
      alert('❌ You must be logged in to create test accounts');
      return;
    }

    if (!newLabel.trim()) {
      alert('❌ Please enter a label for the test account');
      return;
    }

    setLoading(true);
    try {
      const result = await createTestAccount(
        newLabel.trim(),
        newPhaseKey,
        newNotes.trim() || undefined,
        currentUser.uid
      );
      
      alert(`✅ Created test account: ${result.testAccountId} (${getPreset(newPhaseKey)?.label || newPhaseKey})`);
      
      // Reset form
      setNewLabel('');
      setNewPhaseKey('phase_1_new');
      setNewNotes('');
      setShowCreateForm(false);
      
      // Reload accounts
      await loadTestAccounts();
    } catch (error) {
      console.error('Error creating test account:', error);
      alert('❌ Failed to create test account: ' + (error instanceof Error ? error.message : 'Unknown error'));
    } finally {
      setLoading(false);
    }
  };

  const handleSwitchToAccount = async (testAccountId: string) => {
    setLoading(true);
    try {
      await switchToTestAccount(testAccountId);
      alert(`✅ Switched to test account: ${testAccountId}\n\nYou can now test the student experience. Use "Return to Admin" to switch back.`);
      onClose();
    } catch (error) {
      console.error('Error switching to test account:', error);
      alert('❌ Failed to switch to test account: ' + (error instanceof Error ? error.message : 'Unknown error'));
    } finally {
      setLoading(false);
    }
  };

  const handleResetAccount = async (testAccountId: string) => {
    if (!currentUser) return;
    
    if (!window.confirm(`Are you sure you want to reset ${testAccountId} to its original phase preset? This will overwrite all current progress.`)) {
      return;
    }

    setLoading(true);
    try {
      await resetTestAccount(testAccountId, currentUser.uid);
      alert(`✅ Reset test account: ${testAccountId}`);
      await loadTestAccounts();
    } catch (error) {
      console.error('Error resetting test account:', error);
      alert('❌ Failed to reset test account: ' + (error instanceof Error ? error.message : 'Unknown error'));
    } finally {
      setLoading(false);
    }
  };

  const handleFixManifestSkills = async () => {
    if (!currentUser) return;
    
    if (!window.confirm('This will fix manifest skills for ALL test accounts based on their manifest type. Continue?')) {
      return;
    }

    setLoading(true);
    try {
      const result = await fixAllTestAccountManifestSkills();
      alert(`✅ Fixed manifest skills for ${result.fixed} test accounts${result.errors > 0 ? `\n⚠️ ${result.errors} errors occurred` : ''}`);
      await loadTestAccounts();
    } catch (error) {
      console.error('Error fixing manifest skills:', error);
      alert('❌ Failed to fix manifest skills: ' + (error instanceof Error ? error.message : 'Unknown error'));
    } finally {
      setLoading(false);
    }
  };

  const handleDuplicateAccount = async (testAccountId: string) => {
    if (!currentUser) return;
    
    const sourceAccount = testAccounts.find(a => a.id === testAccountId);
    if (!sourceAccount) return;

    const newLabel = `${sourceAccount.label} (Copy)`;
    
    setLoading(true);
    try {
      const result = await duplicateTestAccount(testAccountId, newLabel, currentUser.uid);
      alert(`✅ Duplicated test account: ${result.testAccountId}`);
      await loadTestAccounts();
    } catch (error) {
      console.error('Error duplicating test account:', error);
      alert('❌ Failed to duplicate test account: ' + (error instanceof Error ? error.message : 'Unknown error'));
    } finally {
      setLoading(false);
    }
  };

  const handleToggleActive = async (testAccountId: string, isActive: boolean) => {
    if (!currentUser) return;

    setLoading(true);
    try {
      await updateTestAccount(testAccountId, { isActive: !isActive });
      await loadTestAccounts();
    } catch (error) {
      console.error('Error updating test account:', error);
      alert('❌ Failed to update test account: ' + (error instanceof Error ? error.message : 'Unknown error'));
    } finally {
      setLoading(false);
    }
  };

  const handleReturnToAdmin = async () => {
    setLoading(true);
    try {
      switchToAdmin();
      alert('✅ Switched back to admin account!');
      onClose();
    } catch (error) {
      console.error('Error switching to admin:', error);
      alert('❌ Failed to switch to admin: ' + (error instanceof Error ? error.message : 'Unknown error'));
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  if (!isAdmin) {
    return (
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0,0,0,0.8)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 2000
      }}>
        <div style={{
          background: 'white',
          padding: '2rem',
          borderRadius: '1rem',
          maxWidth: '500px',
          width: '90%',
          textAlign: 'center'
        }}>
          <h2 style={{ color: '#dc2626', marginBottom: '1rem' }}>❌ Access Denied</h2>
          <p style={{ color: '#6b7280', marginBottom: '1.5rem' }}>
            Only administrators can access the Test Account Manager.
          </p>
          <button
            onClick={onClose}
            style={{
              background: '#6b7280',
              color: 'white',
              border: 'none',
              borderRadius: '0.5rem',
              padding: '0.75rem 1.5rem',
              cursor: 'pointer',
              fontSize: '1rem'
            }}
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  const presetKeys = getPresetKeys();
  const currentAccount = activeTestAccountId ? testAccounts.find(a => a.id === activeTestAccountId) : null;

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0,0,0,0.8)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 2000,
      padding: '1rem',
      overflow: 'auto'
    }}>
      <div style={{
        background: 'white',
        padding: '2rem',
        borderRadius: '1rem',
        maxWidth: '1200px',
        width: '100%',
        maxHeight: '90vh',
        overflow: 'auto',
        color: '#1f2937'
      }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
          <div>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#1f2937', margin: 0 }}>
              🧪 Test Account Manager
            </h2>
            {currentRole === 'test' && currentAccount && (
              <div style={{
                marginTop: '0.5rem',
                padding: '0.5rem 1rem',
                background: '#fef3c7',
                border: '1px solid #f59e0b',
                borderRadius: '0.5rem',
                display: 'inline-block'
              }}>
                <strong style={{ color: '#92400e' }}>
                  TEST MODE: {currentAccount.id} — {currentAccount.label}
                </strong>
                <button
                  onClick={handleReturnToAdmin}
                  style={{
                    marginLeft: '1rem',
                    background: '#f59e0b',
                    color: 'white',
                    border: 'none',
                    borderRadius: '0.25rem',
                    padding: '0.25rem 0.75rem',
                    cursor: 'pointer',
                    fontSize: '0.875rem'
                  }}
                >
                  Return to Admin
                </button>
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            style={{
              background: '#6b7280',
              color: 'white',
              border: 'none',
              borderRadius: '0.5rem',
              padding: '0.5rem 1rem',
              cursor: 'pointer'
            }}
          >
            Close
          </button>
        </div>

        {/* Create Form */}
        {showCreateForm && (
          <div style={{
            background: '#f3f4f6',
            padding: '1.5rem',
            borderRadius: '0.5rem',
            marginBottom: '2rem',
            border: '1px solid #d1d5db'
          }}>
            <h3 style={{ marginBottom: '1rem', color: '#1f2937' }}>Create New Test Account</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                  Label:
                </label>
                <input
                  type="text"
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  placeholder="e.g., Phase 1 — New Player"
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    borderRadius: '0.375rem',
                    border: '1px solid #d1d5db',
                    fontSize: '1rem'
                  }}
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                  Phase Preset:
                </label>
                <select
                  value={newPhaseKey}
                  onChange={(e) => setNewPhaseKey(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    borderRadius: '0.375rem',
                    border: '1px solid #d1d5db',
                    fontSize: '1rem'
                  }}
                >
                  {presetKeys.map(key => {
                    const preset = getPreset(key);
                    return (
                      <option key={key} value={key}>
                        {preset?.label || key}
                      </option>
                    );
                  })}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                  Notes (optional):
                </label>
                <textarea
                  value={newNotes}
                  onChange={(e) => setNewNotes(e.target.value)}
                  placeholder="Optional notes about this test account"
                  rows={3}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    borderRadius: '0.375rem',
                    border: '1px solid #d1d5db',
                    fontSize: '1rem',
                    fontFamily: 'inherit'
                  }}
                />
              </div>
              <div style={{ display: 'flex', gap: '1rem' }}>
                <button
                  onClick={handleCreateAccount}
                  disabled={loading}
                  style={{
                    background: '#10b981',
                    color: 'white',
                    border: 'none',
                    borderRadius: '0.5rem',
                    padding: '0.75rem 1.5rem',
                    cursor: loading ? 'not-allowed' : 'pointer',
                    fontSize: '1rem',
                    opacity: loading ? 0.6 : 1
                  }}
                >
                  {loading ? '⏳ Creating...' : '✅ Create Test Account'}
                </button>
                <button
                  onClick={() => {
                    setShowCreateForm(false);
                    setNewLabel('');
                    setNewPhaseKey('phase_1_new');
                    setNewNotes('');
                  }}
                  style={{
                    background: '#6b7280',
                    color: 'white',
                    border: 'none',
                    borderRadius: '0.5rem',
                    padding: '0.75rem 1.5rem',
                    cursor: 'pointer',
                    fontSize: '1rem'
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Filters and Actions */}
        <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <button
            onClick={() => setShowCreateForm(!showCreateForm)}
            style={{
              background: '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: '0.5rem',
              padding: '0.75rem 1.5rem',
              cursor: 'pointer',
              fontSize: '1rem'
            }}
          >
            {showCreateForm ? '❌ Cancel' : '➕ Create Test Account'}
          </button>
          <button
            onClick={handleFixManifestSkills}
            disabled={loading}
            style={{
              background: '#f59e0b',
              color: 'white',
              border: 'none',
              borderRadius: '0.5rem',
              padding: '0.75rem 1.5rem',
              cursor: loading ? 'not-allowed' : 'pointer',
              fontSize: '1rem',
              opacity: loading ? 0.6 : 1
            }}
            title="Fix manifest skills for all test accounts based on their manifest type"
          >
            {loading ? '⏳ Fixing...' : '🔧 Fix Manifest Skills'}
          </button>
          <input
            type="text"
            placeholder="Search by label or ID..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              flex: 1,
              minWidth: '200px',
              padding: '0.75rem',
              borderRadius: '0.375rem',
              border: '1px solid #d1d5db',
              fontSize: '1rem'
            }}
          />
          <select
            value={filterPhase}
            onChange={(e) => setFilterPhase(e.target.value)}
            style={{
              padding: '0.75rem',
              borderRadius: '0.375rem',
              border: '1px solid #d1d5db',
              fontSize: '1rem'
            }}
          >
            <option value="all">All Phases</option>
            {presetKeys.map(key => {
              const preset = getPreset(key);
              return (
                <option key={key} value={key}>
                  {preset?.label || key}
                </option>
              );
            })}
          </select>
        </div>

        {/* Test Accounts List */}
        {loading && testAccounts.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '2rem', color: '#6b7280' }}>
            ⏳ Loading test accounts...
          </div>
        ) : filteredAccounts.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '2rem', color: '#6b7280' }}>
            {testAccounts.length === 0 
              ? 'No test accounts found. Create your first test account above!'
              : 'No test accounts match your search/filter criteria.'}
          </div>
        ) : (
          <div style={{ display: 'grid', gap: '1rem' }}>
            {filteredAccounts.map(account => {
              const preset = getPreset(account.phaseKey);
              const isActive = account.id === activeTestAccountId;
              
              return (
                <div
                  key={account.id}
                  style={{
                    border: isActive ? '2px solid #10b981' : '1px solid #d1d5db',
                    borderRadius: '0.5rem',
                    padding: '1.5rem',
                    background: isActive ? '#f0fdf4' : 'white'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                        <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 'bold', color: '#1f2937' }}>
                          {account.label}
                        </h3>
                        {isActive && (
                          <span style={{
                            background: '#10b981',
                            color: 'white',
                            padding: '0.25rem 0.75rem',
                            borderRadius: '0.25rem',
                            fontSize: '0.875rem',
                            fontWeight: 'bold'
                          }}>
                            ACTIVE
                          </span>
                        )}
                        {!account.isActive && (
                          <span style={{
                            background: '#6b7280',
                            color: 'white',
                            padding: '0.25rem 0.75rem',
                            borderRadius: '0.25rem',
                            fontSize: '0.875rem'
                          }}>
                            INACTIVE
                          </span>
                        )}
                      </div>
                      <div style={{ color: '#6b7280', fontSize: '0.875rem', marginBottom: '0.5rem' }}>
                        <strong>ID:</strong> {account.id}
                      </div>
                      <div style={{ color: '#6b7280', fontSize: '0.875rem', marginBottom: '0.5rem' }}>
                        <strong>Phase:</strong> {preset?.label || account.phaseKey}
                      </div>
                      {account.notes && (
                        <div style={{ color: '#6b7280', fontSize: '0.875rem', marginTop: '0.5rem', fontStyle: 'italic' }}>
                          {account.notes}
                        </div>
                      )}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', alignItems: 'flex-end' }}>
                      {isActive ? (
                        <button
                          onClick={handleReturnToAdmin}
                          style={{
                            background: '#f59e0b',
                            color: 'white',
                            border: 'none',
                            borderRadius: '0.375rem',
                            padding: '0.5rem 1rem',
                            cursor: 'pointer',
                            fontSize: '0.875rem',
                            whiteSpace: 'nowrap'
                          }}
                        >
                          Return to Admin
                        </button>
                      ) : (
                        <button
                          onClick={() => handleSwitchToAccount(account.id)}
                          disabled={loading || !account.isActive}
                          style={{
                            background: account.isActive ? '#3b82f6' : '#9ca3af',
                            color: 'white',
                            border: 'none',
                            borderRadius: '0.375rem',
                            padding: '0.5rem 1rem',
                            cursor: account.isActive && !loading ? 'pointer' : 'not-allowed',
                            fontSize: '0.875rem',
                            whiteSpace: 'nowrap',
                            opacity: account.isActive && !loading ? 1 : 0.6
                          }}
                        >
                          Switch
                        </button>
                      )}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <button
                      onClick={() => handleResetAccount(account.id)}
                      disabled={loading}
                      style={{
                        background: '#f59e0b',
                        color: 'white',
                        border: 'none',
                        borderRadius: '0.375rem',
                        padding: '0.5rem 1rem',
                        cursor: loading ? 'not-allowed' : 'pointer',
                        fontSize: '0.875rem',
                        opacity: loading ? 0.6 : 1
                      }}
                    >
                      🔄 Reset to Phase
                    </button>
                    <button
                      onClick={() => handleDuplicateAccount(account.id)}
                      disabled={loading}
                      style={{
                        background: '#8b5cf6',
                        color: 'white',
                        border: 'none',
                        borderRadius: '0.375rem',
                        padding: '0.5rem 1rem',
                        cursor: loading ? 'not-allowed' : 'pointer',
                        fontSize: '0.875rem',
                        opacity: loading ? 0.6 : 1
                      }}
                    >
                      📋 Duplicate
                    </button>
                    <button
                      onClick={() => handleToggleActive(account.id, account.isActive)}
                      disabled={loading}
                      style={{
                        background: account.isActive ? '#dc2626' : '#10b981',
                        color: 'white',
                        border: 'none',
                        borderRadius: '0.375rem',
                        padding: '0.5rem 1rem',
                        cursor: loading ? 'not-allowed' : 'pointer',
                        fontSize: '0.875rem',
                        opacity: loading ? 0.6 : 1
                      }}
                    >
                      {account.isActive ? '🚫 Deactivate' : '✅ Activate'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default TestAccountManagerV2;

