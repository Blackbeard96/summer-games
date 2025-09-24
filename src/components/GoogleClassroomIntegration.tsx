import React, { useState } from 'react';
import { useGoogleLogin } from '@react-oauth/google';
import { db } from '../firebase';
import { doc, setDoc } from 'firebase/firestore';
import { CHAPTERS } from '../types/chapters';
import OAuthSetupModal from './OAuthSetupModal';
import ErrorBoundary from './ErrorBoundary';

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
  const [error, setError] = useState<string | null>(null);
  
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
    setError(null);
    
    try {
      // Find the assignment details from the assignments list
      const assignment = assignments.find(a => a.id === assignmentId);
      const course = courses.find(c => c.id === courseId);
      
      if (!assignment) {
        throw new Error('Assignment not found');
      }
      
      if (!course) {
        throw new Error('Course not found');
      }
      
      const selectedChallengeData = challenges.find(c => c.id === selectedChallenge);
      if (!selectedChallengeData) {
        throw new Error('Challenge not found');
      }
      
      const mappingData = {
        challengeId: selectedChallenge,
        courseId: courseId,
        title: assignment.title || '',
        description: assignment.description || '',
        dueDate: assignment.dueDate || null,
        courseName: course.name || '',
        chapterId: selectedChallengeData.chapterId || null,
        chapterTitle: selectedChallengeData.chapterTitle || '',
        mappedAt: new Date()
      };
      
      await setDoc(doc(db, 'chapterClassroomMap', assignmentId), mappingData);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      console.error('Error mapping assignment:', err);
      setError(err instanceof Error ? err.message : 'Failed to map assignment. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-2">
      <div className="flex items-center gap-2 mb-1">
        <select
          value={selectedChallenge}
          onChange={e => setSelectedChallenge(e.target.value)}
          className="min-w-64 px-2 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={saving}
          aria-label="Select a chapter challenge to map to this assignment"
          aria-describedby="challenge-selection-help"
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
        <button 
          onClick={handleMap} 
          disabled={!selectedChallenge || saving}
          className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors duration-200 ${
            !selectedChallenge || saving 
              ? 'bg-gray-200 text-gray-400 cursor-not-allowed' 
              : 'bg-blue-600 hover:bg-blue-700 text-white cursor-pointer'
          }`}
          aria-label={saving ? 'Saving assignment mapping' : 'Map assignment to selected challenge'}
          aria-disabled={!selectedChallenge || saving}
        >
          {saving ? 'Saving...' : 'Attach to Challenge'}
        </button>
      </div>
      <div id="challenge-selection-help" className="text-xs text-gray-500 mt-1">
        Choose a chapter challenge to link with this Google Classroom assignment
      </div>
      {success && (
        <div 
          role="status" 
          aria-live="polite"
          className="text-green-600 text-sm font-medium mt-1"
        >
          ✓ Successfully mapped to challenge!
        </div>
      )}
      {error && (
        <div 
          role="alert" 
          aria-live="assertive"
          className="text-red-600 text-sm font-medium mt-1"
        >
          ⚠ {error}
        </div>
      )}
    </div>
  );
};

// Add CSS for loading spinner animation
const spinnerStyle = `
  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
`;

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
        
        if (!res.ok) {
          throw new Error(`Failed to fetch courses: ${res.status} ${res.statusText}`);
        }
        
        const data = await res.json();
        setCourses(data.courses || []);
        
        if (!data.courses || data.courses.length === 0) {
          setError('No courses found. Make sure you have access to Google Classroom courses.');
        }
      } catch (err) {
        console.error('Error fetching courses:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch courses. Please try again.');
      } finally {
        setLoading(false);
      }
    },
    onError: (errorResponse) => {
      console.error('Google login error:', errorResponse);
      setError('Google login failed. Please check your OAuth setup and try again.');
      setShowOAuthSetupModal(true);
    },
    flow: 'implicit',
  });

  const fetchAssignments = async (courseId: string) => {
    if (!accessToken) {
      setError('No access token available. Please sign in again.');
      return;
    }
    
    setLoading(true);
    setError(null);
    setSelectedCourse(courseId);
    
    try {
      const res = await fetch(`https://classroom.googleapis.com/v1/courses/${courseId}/courseWork`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      
      if (!res.ok) {
        throw new Error(`Failed to fetch assignments: ${res.status} ${res.statusText}`);
      }
      
      const data = await res.json();
      const assignments = data.courseWork || [];
      setAssignments(assignments);
      
      if (assignments.length === 0) {
        setError('No assignments found for this course.');
      }
    } catch (err) {
      console.error('Error fetching assignments:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch assignments. Please try again.');
      setAssignments([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ErrorBoundary
      fallback={
        <div style={{ 
          maxWidth: 800, 
          margin: '2rem auto', 
          padding: 24, 
          background: '#fff', 
          borderRadius: 12, 
          boxShadow: '0 2px 8px rgba(0,0,0,0.07)',
          textAlign: 'center' 
        }}>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: 16, color: '#dc2626' }}>
            Google Classroom Integration Error
          </h2>
          <p style={{ color: '#6b7280', marginBottom: 16 }}>
            There was an error loading the Google Classroom integration. Please refresh the page or try again later.
          </p>
          <button 
            onClick={() => window.location.reload()}
            style={{
              backgroundColor: '#4285F4',
              color: 'white',
              border: 'none',
              borderRadius: 4,
              padding: '0.75rem 1.5rem',
              fontWeight: 'bold',
              fontSize: '1rem',
              cursor: 'pointer'
            }}
          >
            Refresh Page
          </button>
        </div>
      }
    >
      <style>{spinnerStyle}</style>
      <div className="max-w-4xl mx-auto my-8 p-6 bg-white rounded-xl shadow-lg border border-gray-100">
        <h2 className="text-2xl font-bold mb-6 text-gray-900">Chapter Assignment Integration</h2>
      {!accessToken ? (
        <div className="flex gap-3 items-center">
          <button 
            onClick={() => login()} 
            className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-lg transition-colors duration-200 shadow-md hover:shadow-lg"
            aria-label="Sign in with Google to access your classroom data"
          >
            Sign in with Google
          </button>
          <button 
            onClick={() => setShowOAuthSetupModal(true)} 
            className="bg-transparent text-gray-500 hover:text-gray-700 border border-gray-300 hover:border-gray-400 font-medium py-3 px-6 rounded-lg transition-colors duration-200"
          >
            OAuth Setup Help
          </button>
        </div>
      ) : (
        <div>
          <div className="flex justify-between items-center mt-6 mb-4">
            <h3 className="text-xl font-semibold text-gray-900">Your Courses</h3>
            <button
              onClick={() => {
                setAccessToken(null);
                setCourses([]);
                setAssignments([]);
                setSelectedCourse(null);
                setError(null);
              }}
              className="px-3 py-2 bg-transparent text-gray-500 hover:text-gray-700 border border-gray-300 hover:border-gray-400 rounded-md text-sm font-medium transition-colors duration-200"
            >
              Sign Out
            </button>
          </div>
          
          {loading && (
            <div 
              role="status" 
              aria-live="polite"
              className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg mb-4"
            >
              <div 
                aria-hidden="true"
                className="w-4 h-4 border-2 border-gray-200 border-t-blue-600 rounded-full animate-spin"
              ></div>
              <span className="text-gray-600">Loading...</span>
            </div>
          )}
          
          {error && (
            <div 
              role="alert"
              aria-live="assertive"
              className="text-red-600 bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-sm"
            >
              ⚠ {error}
            </div>
          )}
          
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {courses.map((course: any) => (
              <li key={course.id} style={{ marginBottom: 8 }}>
                <button
                  onClick={() => fetchAssignments(course.id)}
                  disabled={loading}
                  style={{ 
                    background: selectedCourse === course.id ? '#4f46e5' : '#f9fafb', 
                    color: selectedCourse === course.id ? 'white' : '#1f2937', 
                    border: selectedCourse === course.id ? 'none' : '1px solid #e5e7eb',
                    borderRadius: 6, 
                    padding: '12px 16px', 
                    fontWeight: '500', 
                    cursor: loading ? 'not-allowed' : 'pointer', 
                    marginRight: 8,
                    transition: 'all 0.2s',
                    opacity: loading ? 0.6 : 1
                  }}
                  aria-label={`Load assignments for ${course.name}${course.section ? `, Section: ${course.section}` : ''}`}
                  aria-pressed={selectedCourse === course.id}
                >
                  {course.name}
                </button>
                <span style={{ color: '#6b7280', fontSize: 14 }}>
                  {course.section ? `Section: ${course.section}` : ''}
                </span>
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
    </ErrorBoundary>
  );
};

export default GoogleClassroomIntegration;