import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, addDoc, getDocs, deleteDoc, doc } from 'firebase/firestore';
import { CHAPTERS } from '../types/chapters';

interface GoogleClassroomAssignment {
  id: string;
  title: string;
  description?: string;
  dueDate?: {
    year: number;
    month: number;
    day: number;
  };
  courseId: string;
  courseName?: string;
}

const ChapterAssignmentManager = () => {
  const [assignments, setAssignments] = useState<{ [challengeId: string]: GoogleClassroomAssignment }>({});
  const [selectedChapter, setSelectedChapter] = useState<number>(1);
  const [selectedChallenge, setSelectedChallenge] = useState<string>('');
  const [newAssignment, setNewAssignment] = useState({
    title: '',
    description: '',
    courseId: '',
    courseName: '',
    dueDate: {
      year: new Date().getFullYear(),
      month: new Date().getMonth() + 1,
      day: new Date().getDate()
    }
  });

  useEffect(() => {
    fetchAssignments();
  }, []);

  const fetchAssignments = async () => {
    try {
      const querySnapshot = await getDocs(collection(db, 'chapterClassroomMap'));
      const assignmentsData: { [challengeId: string]: GoogleClassroomAssignment } = {};
      
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        assignmentsData[data.challengeId] = {
          id: doc.id,
          title: data.title,
          description: data.description,
          dueDate: data.dueDate,
          courseId: data.courseId,
          courseName: data.courseName
        };
      });
      
      setAssignments(assignmentsData);
    } catch (error) {
      console.error('Error fetching assignments:', error);
    }
  };

  const handleAddAssignment = async () => {
    if (!selectedChallenge || !newAssignment.title || !newAssignment.courseId) {
      alert('Please fill in all required fields');
      return;
    }

    try {
      const assignmentData = {
        challengeId: selectedChallenge,
        title: newAssignment.title,
        description: newAssignment.description,
        courseId: newAssignment.courseId,
        courseName: newAssignment.courseName,
        dueDate: newAssignment.dueDate
      };

      await addDoc(collection(db, 'chapterClassroomMap'), assignmentData);
      
      // Reset form
      setNewAssignment({
        title: '',
        description: '',
        courseId: '',
        courseName: '',
        dueDate: {
          year: new Date().getFullYear(),
          month: new Date().getMonth() + 1,
          day: new Date().getDate()
        }
      });
      
      fetchAssignments();
      alert('Assignment added successfully!');
    } catch (error) {
      console.error('Error adding assignment:', error);
      alert('Failed to add assignment');
    }
  };

  const handleDeleteAssignment = async (assignmentId: string) => {
    if (window.confirm('Are you sure you want to delete this assignment?')) {
      try {
        await deleteDoc(doc(db, 'chapterClassroomMap', assignmentId));
        fetchAssignments();
        alert('Assignment deleted successfully!');
      } catch (error) {
        console.error('Error deleting assignment:', error);
        alert('Failed to delete assignment');
      }
    }
  };

  const getCurrentChapter = () => {
    return CHAPTERS.find(chapter => chapter.id === selectedChapter);
  };

  return (
    <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
      <h1 style={{ 
        fontSize: '2rem', 
        fontWeight: 'bold', 
        marginBottom: '2rem',
        color: '#1f2937',
        textAlign: 'center'
      }}>
        📚 Chapter Assignment Manager
      </h1>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
        {/* Add New Assignment */}
        <div style={{ 
          padding: '1.5rem', 
          backgroundColor: '#f9fafb', 
          borderRadius: '0.75rem',
          border: '1px solid #e5e7eb'
        }}>
          <h2 style={{ 
            fontSize: '1.5rem', 
            fontWeight: 'bold', 
            marginBottom: '1rem',
            color: '#374151'
          }}>
            ➕ Add New Assignment
          </h2>

          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold', color: '#374151' }}>
              Chapter:
            </label>
            <select
              value={selectedChapter}
              onChange={(e) => setSelectedChapter(Number(e.target.value))}
              style={{
                width: '100%',
                padding: '0.5rem',
                borderRadius: '0.25rem',
                border: '1px solid #d1d5db',
                fontSize: '1rem'
              }}
            >
              {CHAPTERS.map(chapter => (
                <option key={chapter.id} value={chapter.id}>
                  Chapter {chapter.id}: {chapter.title}
                </option>
              ))}
            </select>
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold', color: '#374151' }}>
              Challenge:
            </label>
            <select
              value={selectedChallenge}
              onChange={(e) => setSelectedChallenge(e.target.value)}
              style={{
                width: '100%',
                padding: '0.5rem',
                borderRadius: '0.25rem',
                border: '1px solid #d1d5db',
                fontSize: '1rem'
              }}
            >
              <option value="">Select a challenge</option>
              {getCurrentChapter()?.challenges.map(challenge => (
                <option key={challenge.id} value={challenge.id}>
                  {challenge.title}
                </option>
              ))}
            </select>
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold', color: '#374151' }}>
              Assignment Title: *
            </label>
            <input
              type="text"
              value={newAssignment.title}
              onChange={(e) => setNewAssignment({ ...newAssignment, title: e.target.value })}
              style={{
                width: '100%',
                padding: '0.5rem',
                borderRadius: '0.25rem',
                border: '1px solid #d1d5db',
                fontSize: '1rem'
              }}
              placeholder="Enter assignment title"
            />
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold', color: '#374151' }}>
              Description:
            </label>
            <textarea
              value={newAssignment.description}
              onChange={(e) => setNewAssignment({ ...newAssignment, description: e.target.value })}
              style={{
                width: '100%',
                padding: '0.5rem',
                borderRadius: '0.25rem',
                border: '1px solid #d1d5db',
                fontSize: '1rem',
                minHeight: '80px',
                resize: 'vertical'
              }}
              placeholder="Enter assignment description"
            />
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold', color: '#374151' }}>
              Course ID: *
            </label>
            <input
              type="text"
              value={newAssignment.courseId}
              onChange={(e) => setNewAssignment({ ...newAssignment, courseId: e.target.value })}
              style={{
                width: '100%',
                padding: '0.5rem',
                borderRadius: '0.25rem',
                border: '1px solid #d1d5db',
                fontSize: '1rem'
              }}
              placeholder="Enter Google Classroom course ID"
            />
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold', color: '#374151' }}>
              Course Name:
            </label>
            <input
              type="text"
              value={newAssignment.courseName}
              onChange={(e) => setNewAssignment({ ...newAssignment, courseName: e.target.value })}
              style={{
                width: '100%',
                padding: '0.5rem',
                borderRadius: '0.25rem',
                border: '1px solid #d1d5db',
                fontSize: '1rem'
              }}
              placeholder="Enter course name"
            />
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold', color: '#374151' }}>
              Due Date:
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem' }}>
              <input
                type="number"
                value={newAssignment.dueDate.month}
                onChange={(e) => setNewAssignment({
                  ...newAssignment,
                  dueDate: { ...newAssignment.dueDate, month: Number(e.target.value) }
                })}
                style={{
                  padding: '0.5rem',
                  borderRadius: '0.25rem',
                  border: '1px solid #d1d5db',
                  fontSize: '1rem'
                }}
                placeholder="Month"
                min="1"
                max="12"
              />
              <input
                type="number"
                value={newAssignment.dueDate.day}
                onChange={(e) => setNewAssignment({
                  ...newAssignment,
                  dueDate: { ...newAssignment.dueDate, day: Number(e.target.value) }
                })}
                style={{
                  padding: '0.5rem',
                  borderRadius: '0.25rem',
                  border: '1px solid #d1d5db',
                  fontSize: '1rem'
                }}
                placeholder="Day"
                min="1"
                max="31"
              />
              <input
                type="number"
                value={newAssignment.dueDate.year}
                onChange={(e) => setNewAssignment({
                  ...newAssignment,
                  dueDate: { ...newAssignment.dueDate, year: Number(e.target.value) }
                })}
                style={{
                  padding: '0.5rem',
                  borderRadius: '0.25rem',
                  border: '1px solid #d1d5db',
                  fontSize: '1rem'
                }}
                placeholder="Year"
                min="2024"
              />
            </div>
          </div>

          <button
            onClick={handleAddAssignment}
            style={{
              width: '100%',
              padding: '0.75rem',
              backgroundColor: '#22c55e',
              color: 'white',
              border: 'none',
              borderRadius: '0.5rem',
              fontSize: '1rem',
              fontWeight: 'bold',
              cursor: 'pointer',
              transition: 'background-color 0.3s ease'
            }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#16a34a'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#22c55e'}
          >
            Add Assignment
          </button>
        </div>

        {/* Current Assignments */}
        <div style={{ 
          padding: '1.5rem', 
          backgroundColor: '#f9fafb', 
          borderRadius: '0.75rem',
          border: '1px solid #e5e7eb'
        }}>
          <h2 style={{ 
            fontSize: '1.5rem', 
            fontWeight: 'bold', 
            marginBottom: '1rem',
            color: '#374151'
          }}>
            📋 Current Assignments
          </h2>

          <div style={{ maxHeight: '600px', overflowY: 'auto' }}>
            {Object.entries(assignments).length === 0 ? (
              <p style={{ color: '#6b7280', textAlign: 'center', fontStyle: 'italic' }}>
                No assignments configured yet
              </p>
            ) : (
              Object.entries(assignments).map(([challengeId, assignment]) => {
                const chapter = CHAPTERS.find(c => 
                  c.challenges.some(ch => ch.id === challengeId)
                );
                const challenge = chapter?.challenges.find(ch => ch.id === challengeId);
                
                return (
                  <div key={assignment.id} style={{ 
                    padding: '1rem', 
                    backgroundColor: 'white', 
                    borderRadius: '0.5rem',
                    border: '1px solid #e5e7eb',
                    marginBottom: '1rem'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                      <h3 style={{ 
                        fontSize: '1.125rem', 
                        fontWeight: 'bold',
                        color: '#1f2937'
                      }}>
                        {assignment.title}
                      </h3>
                      <button
                        onClick={() => handleDeleteAssignment(assignment.id)}
                        style={{
                          padding: '0.25rem 0.5rem',
                          backgroundColor: '#dc2626',
                          color: 'white',
                          border: 'none',
                          borderRadius: '0.25rem',
                          cursor: 'pointer',
                          fontSize: '0.75rem'
                        }}
                      >
                        Delete
                      </button>
                    </div>
                    
                    <p style={{ 
                      fontSize: '0.875rem', 
                      color: '#6b7280',
                      marginBottom: '0.5rem'
                    }}>
                      <strong>Chapter:</strong> {chapter?.id} - {chapter?.title}
                    </p>
                    
                    <p style={{ 
                      fontSize: '0.875rem', 
                      color: '#6b7280',
                      marginBottom: '0.5rem'
                    }}>
                      <strong>Challenge:</strong> {challenge?.title}
                    </p>
                    
                    {assignment.description && (
                      <p style={{ 
                        fontSize: '0.875rem', 
                        color: '#6b7280',
                        marginBottom: '0.5rem'
                      }}>
                        <strong>Description:</strong> {assignment.description}
                      </p>
                    )}
                    
                    <p style={{ 
                      fontSize: '0.875rem', 
                      color: '#6b7280',
                      marginBottom: '0.5rem'
                    }}>
                      <strong>Course:</strong> {assignment.courseName || assignment.courseId}
                    </p>
                    
                    {assignment.dueDate && (
                      <p style={{ 
                        fontSize: '0.875rem', 
                        color: '#dc2626'
                      }}>
                        <strong>Due:</strong> {assignment.dueDate.month}/{assignment.dueDate.day}/{assignment.dueDate.year}
                      </p>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChapterAssignmentManager; 