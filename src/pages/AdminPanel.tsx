import React, { useEffect, useState } from 'react';
import { db, storage } from '../firebase';
import { collection, getDocs, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { ref, deleteObject } from 'firebase/storage';

interface ChallengeData {
  completed?: boolean;
  file?: string;
}

interface Student {
  id: string;
  displayName?: string;
  email?: string;
  xp?: number;
  powerPoints?: number;
  challenges?: { [name: string]: ChallengeData };
  photoURL?: string; // Added for profile pictures
}

const AdminPanel: React.FC = () => {
  const [students, setStudents] = useState<Student[]>([]);
  const [editingStudent, setEditingStudent] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ displayName: '', email: '' });
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<{ studentId: string; challenge: string } | null>(null);
  const [ppAmount, setPPAmount] = useState<{ [studentId: string]: number }>({});
  const [selected, setSelected] = useState<string[]>([]);
  const [batchPP, setBatchPP] = useState(1);

  useEffect(() => {
    const fetchStudents = async () => {
      const snapshot = await getDocs(collection(db, 'students'));
      const list = snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() })) as Student[];
      setStudents(list);
    };
    fetchStudents();
  }, []);

  const toggleChallengeCompletion = async (studentId: string, challenge: string) => {
    const studentRef = doc(db, 'students', studentId);
    const student = students.find(s => s.id === studentId);
    if (!student || !student.challenges) return;
    const completed = student.challenges[challenge]?.completed;
    const updatedChallenges = {
      ...student.challenges,
      [challenge]: {
        ...student.challenges[challenge],
        completed: !completed
      }
    };
    const xpChange = !completed ? 10 : -10;
    const ppChange = !completed ? 5 : -5;
    const newXP = (student.xp || 0) + xpChange;
    const newPP = (student.powerPoints || 0) + ppChange;

    await updateDoc(studentRef, {
      challenges: updatedChallenges,
      xp: newXP,
      powerPoints: newPP
    });

    setStudents(prev =>
      prev.map(s =>
        s.id === studentId
          ? { ...s, challenges: updatedChallenges, xp: newXP, powerPoints: newPP }
          : s
      )
    );
  };

  const deleteSubmission = async (studentId: string, challenge: string) => {
    const student = students.find(s => s.id === studentId);
    if (!student || !student.challenges || !student.challenges[challenge]?.file) return;

    try {
      // Delete file from Firebase Storage
      const fileUrl = student.challenges[challenge].file!;
      const fileRef = ref(storage, fileUrl);
      await deleteObject(fileRef);

      // Update Firestore document
      const studentRef = doc(db, 'students', studentId);
      const updatedChallenges = {
        ...student.challenges,
        [challenge]: {
          completed: false,
          file: undefined
        }
      };
      
      // Recalculate XP and Power Points
      const xpChange = -10; // Remove points for completed challenge
      const ppChange = -5;
      const newXP = Math.max(0, (student.xp || 0) + xpChange);
      const newPP = Math.max(0, (student.powerPoints || 0) + ppChange);

      await updateDoc(studentRef, {
        challenges: updatedChallenges,
        xp: newXP,
        powerPoints: newPP
      });

      // Update local state
      setStudents(prev =>
        prev.map(s =>
          s.id === studentId
            ? { ...s, challenges: updatedChallenges, xp: newXP, powerPoints: newPP }
            : s
        )
      );

      setShowDeleteConfirm(null);
    } catch (error) {
      console.error('Error deleting submission:', error);
      alert('Failed to delete submission. Please try again.');
    }
  };

  const startEditing = (student: Student) => {
    setEditingStudent(student.id);
    setEditForm({
      displayName: student.displayName || '',
      email: student.email || ''
    });
  };

  const saveEdit = async (studentId: string) => {
    try {
      const studentRef = doc(db, 'students', studentId);
      await updateDoc(studentRef, {
        displayName: editForm.displayName,
        email: editForm.email
      });

      setStudents(prev =>
        prev.map(s =>
          s.id === studentId
            ? { ...s, displayName: editForm.displayName, email: editForm.email }
            : s
        )
      );

      setEditingStudent(null);
      setEditForm({ displayName: '', email: '' });
    } catch (error) {
      console.error('Error updating student:', error);
      alert('Failed to update student info. Please try again.');
    }
  };

  const cancelEdit = () => {
    setEditingStudent(null);
    setEditForm({ displayName: '', email: '' });
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

  // Batch Power Points adjustment
  const adjustBatchPowerPoints = async (delta: number) => {
    const updates = selected.map(async studentId => {
      const student = students.find(s => s.id === studentId);
      if (!student) return;
      const newPP = Math.max(0, (student.powerPoints || 0) + delta);
      const studentRef = doc(db, 'students', studentId);
      await updateDoc(studentRef, { powerPoints: newPP });
      return { id: studentId, newPP };
    });
    const results = await Promise.all(updates);
    setStudents(prev =>
      prev.map(s => {
        const found = results.find(r => r && r.id === s.id);
        return found ? { ...s, powerPoints: found.newPP } : s;
      })
    );
    setSelected([]);
  };

  const toggleSelect = (studentId: string) => {
    setSelected(prev => prev.includes(studentId) ? prev.filter(id => id !== studentId) : [...prev, studentId]);
  };
  const selectAll = () => {
    setSelected(students.map(s => s.id));
  };
  const deselectAll = () => {
    setSelected([]);
  };

  return (
    <div style={{ padding: '1.5rem', maxWidth: '1200px', margin: '0 auto' }}>
      <h1 style={{ fontSize: '2rem', fontWeight: 'bold', marginBottom: '2rem', color: '#1f2937' }}>
        Admin Panel
      </h1>
      
      {/* Batch Power Points Action Bar */}
      {selected.length > 0 && (
        <div style={{
          background: '#fbbf24',
          color: '#1f2937',
          padding: '1rem',
          borderRadius: '0.5rem',
          marginBottom: '1.5rem',
          display: 'flex',
          alignItems: 'center',
          gap: '1rem',
          justifyContent: 'space-between',
          boxShadow: '0 1px 3px 0 rgba(0,0,0,0.07)'
        }}>
          <span style={{ fontWeight: 'bold' }}>{selected.length} selected</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <input
              type="number"
              min={1}
              value={batchPP}
              onChange={e => setBatchPP(Math.max(1, Number(e.target.value)))}
              style={{ width: 50, padding: '2px 4px', border: '1px solid #d1d5db', borderRadius: 4 }}
            />
            <button
              onClick={() => adjustBatchPowerPoints(batchPP)}
              style={{ backgroundColor: '#10b981', color: 'white', border: 'none', borderRadius: 4, padding: '4px 12px', fontWeight: 'bold', cursor: 'pointer' }}
            >
              + Power Points
            </button>
            <button
              onClick={() => adjustBatchPowerPoints(-batchPP)}
              style={{ backgroundColor: '#dc2626', color: 'white', border: 'none', borderRadius: 4, padding: '4px 12px', fontWeight: 'bold', cursor: 'pointer' }}
            >
              – Power Points
            </button>
            <button
              onClick={deselectAll}
              style={{ backgroundColor: '#6b7280', color: 'white', border: 'none', borderRadius: 4, padding: '4px 12px', fontWeight: 'bold', cursor: 'pointer' }}
            >
              Deselect All
            </button>
          </div>
        </div>
      )}
      <div style={{ marginBottom: '1rem' }}>
        <button
          onClick={selectAll}
          style={{ backgroundColor: '#3b82f6', color: 'white', border: 'none', borderRadius: 4, padding: '4px 12px', fontWeight: 'bold', cursor: 'pointer', marginRight: 8 }}
        >
          Select All
        </button>
        <button
          onClick={deselectAll}
          style={{ backgroundColor: '#6b7280', color: 'white', border: 'none', borderRadius: 4, padding: '4px 12px', fontWeight: 'bold', cursor: 'pointer' }}
        >
          Deselect All
        </button>
      </div>
      
      {students.map(student => (
        <div key={student.id} style={{ 
          marginBottom: '2rem', 
          border: '1px solid #e5e7eb', 
          borderRadius: '0.5rem',
          padding: '1.5rem',
          backgroundColor: 'white',
          boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <input
                type="checkbox"
                checked={selected.includes(student.id)}
                onChange={() => toggleSelect(student.id)}
                style={{ width: 18, height: 18 }}
              />
              <img
                src={student.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(student.displayName || student.email || 'Student')}&background=4f46e5&color=fff&size=48`}
                alt="Avatar"
                style={{ width: 48, height: 48, borderRadius: '50%', objectFit: 'cover', border: '2px solid #e5e7eb' }}
              />
              {editingStudent === student.id ? (
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                  <input
                    type="text"
                    value={editForm.displayName}
                    onChange={(e) => setEditForm(prev => ({ ...prev, displayName: e.target.value }))}
                    style={{ padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '0.25rem' }}
                    placeholder="Display Name"
                  />
                  <input
                    type="email"
                    value={editForm.email}
                    onChange={(e) => setEditForm(prev => ({ ...prev, email: e.target.value }))}
                    style={{ padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '0.25rem' }}
                    placeholder="Email"
                  />
                  <button
                    onClick={() => saveEdit(student.id)}
                    style={{
                      backgroundColor: '#10b981',
                      color: 'white',
                      padding: '0.5rem 1rem',
                      border: 'none',
                      borderRadius: '0.25rem',
                      cursor: 'pointer'
                    }}
                  >
                    Save
                  </button>
                  <button
                    onClick={cancelEdit}
                    style={{
                      backgroundColor: '#6b7280',
                      color: 'white',
                      padding: '0.5rem 1rem',
                      border: 'none',
                      borderRadius: '0.25rem',
                      cursor: 'pointer'
                    }}
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <div>
                  <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>
                    {student.displayName || 'Unnamed Student'}
                  </h2>
                  <p style={{ color: '#6b7280', marginBottom: '0.5rem' }}>
                    {student.email || 'No email'}
                  </p>
                  <p style={{ fontWeight: 'bold' }}>
                    XP: {student.xp || 0} | Power Points: {student.powerPoints || 0}
                    <span style={{ marginLeft: 8, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <input
                        type="number"
                        min={1}
                        value={ppAmount[student.id] ?? 1}
                        onChange={e => setPPAmount(prev => ({ ...prev, [student.id]: Math.max(1, Number(e.target.value)) }))}
                        style={{ width: 40, marginLeft: 8, marginRight: 4, padding: '2px 4px', border: '1px solid #d1d5db', borderRadius: 4 }}
                      />
                      <button
                        onClick={() => adjustPowerPoints(student.id, (ppAmount[student.id] ?? 1))}
                        style={{ backgroundColor: '#10b981', color: 'white', border: 'none', borderRadius: 4, padding: '2px 8px', marginRight: 2, cursor: 'pointer', fontWeight: 'bold' }}
                        title="Add Power Points"
                      >
                        +
                      </button>
                      <button
                        onClick={() => adjustPowerPoints(student.id, -(ppAmount[student.id] ?? 1))}
                        style={{ backgroundColor: '#dc2626', color: 'white', border: 'none', borderRadius: 4, padding: '2px 8px', cursor: 'pointer', fontWeight: 'bold' }}
                        title="Subtract Power Points"
                      >
                        –
                      </button>
                    </span>
                  </p>
                  <button
                    onClick={() => startEditing(student)}
                    style={{
                      backgroundColor: '#3b82f6',
                      color: 'white',
                      padding: '0.25rem 0.75rem',
                      border: 'none',
                      borderRadius: '0.25rem',
                      cursor: 'pointer',
                      fontSize: '0.875rem',
                      marginTop: '0.5rem'
                    }}
                  >
                    Edit Info
                  </button>
                </div>
              )}
            </div>
          </div>

          <div style={{ marginTop: '1rem' }}>
            <h3 style={{ fontSize: '1.125rem', fontWeight: 'bold', marginBottom: '1rem' }}>Challenges</h3>
            <div style={{ display: 'grid', gap: '0.75rem' }}>
              {student.challenges && Object.entries(student.challenges).map(([name, data]) => (
                <div key={name} style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '1rem',
                  padding: '0.75rem',
                  border: '1px solid #e5e7eb',
                  borderRadius: '0.25rem',
                  backgroundColor: data.completed ? '#f0fdf4' : '#fefefe'
                }}>
                  <input
                    type="checkbox"
                    checked={!!data.completed}
                    onChange={() => toggleChallengeCompletion(student.id, name)}
                    disabled={!data.file} // Only allow completion if file is uploaded
                  />
                  <span style={{ flex: 1, fontWeight: data.completed ? 'bold' : 'normal' }}>
                    {name}
                  </span>
                  {data.file && (
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                      <a
                        href={data.file}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ 
                          color: '#2563eb', 
                          fontSize: '0.875rem',
                          textDecoration: 'none',
                          padding: '0.25rem 0.5rem',
                          backgroundColor: '#eff6ff',
                          borderRadius: '0.25rem'
                        }}
                      >
                        View Submission
                      </a>
                      <button
                        onClick={() => setShowDeleteConfirm({ studentId: student.id, challenge: name })}
                        style={{
                          backgroundColor: '#dc2626',
                          color: 'white',
                          padding: '0.25rem 0.5rem',
                          border: 'none',
                          borderRadius: '0.25rem',
                          cursor: 'pointer',
                          fontSize: '0.875rem'
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      ))}

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
            padding: '2rem',
            borderRadius: '0.5rem',
            maxWidth: '400px',
            textAlign: 'center'
          }}>
            <h3 style={{ marginBottom: '1rem', fontSize: '1.25rem', fontWeight: 'bold' }}>
              Confirm Deletion
            </h3>
            <p style={{ marginBottom: '1.5rem', color: '#6b7280' }}>
              Are you sure you want to delete this challenge submission? This action cannot be undone and will remove the associated points.
            </p>
            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
              <button
                onClick={() => deleteSubmission(showDeleteConfirm.studentId, showDeleteConfirm.challenge)}
                style={{
                  backgroundColor: '#dc2626',
                  color: 'white',
                  padding: '0.5rem 1rem',
                  border: 'none',
                  borderRadius: '0.25rem',
                  cursor: 'pointer'
                }}
              >
                Delete
              </button>
              <button
                onClick={() => setShowDeleteConfirm(null)}
                style={{
                  backgroundColor: '#6b7280',
                  color: 'white',
                  padding: '0.5rem 1rem',
                  border: 'none',
                  borderRadius: '0.25rem',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminPanel; 