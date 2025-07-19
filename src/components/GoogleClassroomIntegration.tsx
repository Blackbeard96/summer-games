import React, { useState } from 'react';
import { useGoogleLogin } from '@react-oauth/google';
import { db } from '../firebase';
import { doc, setDoc } from 'firebase/firestore';

const classroomScopes = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/classroom.courses.readonly',
  'https://www.googleapis.com/auth/classroom.coursework.me.readonly',
  'https://www.googleapis.com/auth/classroom.student-submissions.me.readonly',
  'https://www.googleapis.com/auth/classroom.coursework.students',
].join(' ');

interface ChallengeMappingDropdownProps {
  assignmentId: string;
  courseId: string;
  assignments: any[];
  courses: any[];
}

const ChallengeMappingDropdown = ({ assignmentId, courseId, assignments, courses }: ChallengeMappingDropdownProps) => {
  const [selectedChallenge, setSelectedChallenge] = useState('');
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  // Replace this with a dynamic fetch from Firestore if needed
  const challenges = [
    { id: 'reality-shaping-101', name: 'Reality Shaping 101' },
    { id: 'memory-forge', name: 'Memory Forge' },
    { id: 'intelligent-constructs', name: 'Intelligent Constructs' },
    { id: 'dimensional-portal', name: 'Dimensional Portal' },
    { id: 'truth-manifestation', name: 'Truth Manifestation' },
    { id: 'reality-bending', name: 'Reality Bending' },
    { id: 'neural-networks', name: 'Neural Networks' },
    { id: 'eternal-creation', name: 'Eternal Creation' },
  ];

  const handleMap = async () => {
    if (!selectedChallenge) return;
    setSaving(true);
    try {
      // Find the assignment details from the assignments list
      const assignment = assignments.find(a => a.id === assignmentId);
      const course = courses.find(c => c.id === courseId);
      
      console.log('Mapping assignment:', assignment);
      console.log('Assignment title:', assignment?.title);
      console.log('Assignment ID:', assignmentId);
      console.log('All assignments:', assignments);
      console.log('Course:', course);
      
      const mappingData = {
        challengeId: selectedChallenge,
        courseId: courseId,
        title: assignment?.title || '',
        description: assignment?.description || '',
        dueDate: assignment?.dueDate || null,
        courseName: course?.name || '',
        mappedAt: new Date()
      };
      
      console.log('Saving mapping data:', mappingData);
      
      await setDoc(doc(db, 'classroomChallengeMap', assignmentId), mappingData);
      setSuccess(true);
      console.log('Successfully saved mapping for assignment:', assignmentId);
      setTimeout(() => setSuccess(false), 2000);
    } catch (err) {
      alert('Failed to map assignment.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ marginTop: 8 }}>
      <select
        value={selectedChallenge}
        onChange={e => setSelectedChallenge(e.target.value)}
        style={{ marginRight: 8 }}
      >
        <option value="">Select Challenge</option>
        {challenges.map(c => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
      </select>
      <button onClick={handleMap} disabled={!selectedChallenge || saving}>
        {saving ? 'Saving...' : 'Attach to Challenge'}
      </button>
      {success && <span style={{ color: 'green', marginLeft: 8 }}>✓ Mapped!</span>}
    </div>
  );
};

const GoogleClassroomIntegration: React.FC = () => {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [courses, setCourses] = useState<any[]>([]);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [selectedCourse, setSelectedCourse] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const login = useGoogleLogin({
    scope: classroomScopes,
    onSuccess: async (tokenResponse) => {
      setAccessToken(tokenResponse.access_token);
      setError(null);
      setLoading(true);
      try {
        const res = await fetch('https://classroom.googleapis.com/v1/courses', {
          headers: {
            Authorization: `Bearer ${tokenResponse.access_token}`,
          },
        });
        const data = await res.json();
        setCourses(data.courses || []);
      } catch (err) {
        setError('Failed to fetch courses.');
      } finally {
        setLoading(false);
      }
    },
    onError: () => {
      setError('Login Failed');
    },
    flow: 'implicit',
  });

  const fetchAssignments = async (courseId: string) => {
    if (!accessToken) return;
    setLoading(true);
    setError(null);
    setSelectedCourse(courseId);
    try {
      const res = await fetch(`https://classroom.googleapis.com/v1/courses/${courseId}/courseWork`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      const data = await res.json();
      setAssignments(data.courseWork || []);
    } catch (err) {
      setError('Failed to fetch assignments.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: 600, margin: '2rem auto', padding: 24, background: '#fff', borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.07)' }}>
      <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: 16 }}>Google Classroom Integration</h2>
      {!accessToken ? (
        <button onClick={() => login()} style={{ background: '#4285F4', color: 'white', border: 'none', borderRadius: 4, padding: '0.75rem 1.5rem', fontWeight: 'bold', fontSize: '1rem', cursor: 'pointer' }}>
          Sign in with Google
        </button>
      ) : (
        <div>
          <h3 style={{ marginTop: 24, marginBottom: 8 }}>Your Courses</h3>
          {loading && <div>Loading...</div>}
          {error && <div style={{ color: 'red' }}>{error}</div>}
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {courses.map((course: any) => (
              <li key={course.id} style={{ marginBottom: 8 }}>
                <button
                  onClick={() => fetchAssignments(course.id)}
                  style={{ background: selectedCourse === course.id ? '#4f46e5' : '#e5e7eb', color: selectedCourse === course.id ? 'white' : '#1f2937', border: 'none', borderRadius: 4, padding: '0.5rem 1rem', fontWeight: 'bold', cursor: 'pointer', marginRight: 8 }}
                >
                  {course.name}
                </button>
                <span style={{ color: '#6b7280', fontSize: 14 }}>{course.section ? `Section: ${course.section}` : ''}</span>
              </li>
            ))}
          </ul>
          {assignments.length > 0 && (
            <div style={{ marginTop: 24 }}>
              <h4>Assignments for Selected Course</h4>
              <ul style={{ listStyle: 'none', padding: 0 }}>
                {assignments.map((a: any) => (
                  <li key={a.id} style={{ background: '#f3f4f6', borderRadius: 4, padding: 8, marginBottom: 8 }}>
                    <div style={{ fontWeight: 'bold' }}>{a.title}</div>
                    <div style={{ color: '#6b7280', fontSize: 14 }}>{a.description}</div>
                    <div style={{ color: '#4f46e5', fontSize: 13 }}>Due: {a.dueDate ? `${a.dueDate.month}/${a.dueDate.day}/${a.dueDate.year}` : 'N/A'}</div>
                    <ChallengeMappingDropdown assignmentId={a.id} courseId={selectedCourse || ''} assignments={assignments} courses={courses} />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default GoogleClassroomIntegration;