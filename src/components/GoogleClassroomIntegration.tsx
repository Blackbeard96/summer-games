import React, { useState } from 'react';
import { useGoogleLogin } from '@react-oauth/google';
import { db } from '../firebase';
import { doc, setDoc } from 'firebase/firestore';
import { CHAPTERS } from '../types/chapters';
import OAuthSetupModal from './OAuthSetupModal';

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
  
  // Get all challenges from all chapters
  const challenges = CHAPTERS.flatMap(chapter => 
    chapter.challenges.map(challenge => ({
      id: challenge.id,
      name: `Chapter ${chapter.id}: ${challenge.title}`,
      chapterId: chapter.id,
      chapterTitle: chapter.title
    }))
  );

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
      
      const selectedChallengeData = challenges.find(c => c.id === selectedChallenge);
      
      const mappingData = {
        challengeId: selectedChallenge,
        courseId: courseId,
        title: assignment?.title || '',
        description: assignment?.description || '',
        dueDate: assignment?.dueDate || null,
        courseName: course?.name || '',
        chapterId: selectedChallengeData?.chapterId || null,
        chapterTitle: selectedChallengeData?.chapterTitle || '',
        mappedAt: new Date()
      };
      
      console.log('Saving mapping data:', mappingData);
      
      await setDoc(doc(db, 'chapterClassroomMap', assignmentId), mappingData);
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
        style={{ marginRight: 8, minWidth: '250px' }}
      >
        <option value="">Select Chapter Challenge</option>
        {CHAPTERS.map(chapter => (
          <optgroup key={chapter.id} label={`Chapter ${chapter.id}: ${chapter.title}`}>
            {chapter.challenges.map(challenge => (
              <option key={challenge.id} value={challenge.id}>
                {challenge.title}
              </option>
            ))}
          </optgroup>
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
  const [showOAuthSetupModal, setShowOAuthSetupModal] = useState(false);

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
      setShowOAuthSetupModal(true);
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
    <div style={{ maxWidth: 800, margin: '2rem auto', padding: 24, background: '#fff', borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.07)' }}>
      <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: 16 }}>Chapter Assignment Integration</h2>
      {!accessToken ? (
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <button onClick={() => login()} style={{ background: '#4285F4', color: 'white', border: 'none', borderRadius: 4, padding: '0.75rem 1.5rem', fontWeight: 'bold', fontSize: '1rem', cursor: 'pointer' }}>
            Sign in with Google
          </button>
          <button 
            onClick={() => setShowOAuthSetupModal(true)} 
            style={{ 
              background: 'transparent', 
              color: '#6b7280', 
              border: '1px solid #d1d5db', 
              borderRadius: 4, 
              padding: '0.75rem 1.5rem', 
              fontSize: '0.875rem', 
              cursor: 'pointer' 
            }}
          >
            OAuth Setup Help
          </button>
        </div>
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
              <p style={{ color: '#6b7280', fontSize: '0.875rem', marginBottom: '1rem' }}>
                Select a Chapter Challenge to attach each Google Classroom assignment to.
              </p>
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

      {/* OAuth Setup Modal */}
      <OAuthSetupModal
        isOpen={showOAuthSetupModal}
        onClose={() => setShowOAuthSetupModal(false)}
        clientId="281092791460-085tqid3jq8e9llqdmlps0f5d6c835n5.apps.googleusercontent.com"
      />
    </div>
  );
};

export default GoogleClassroomIntegration;