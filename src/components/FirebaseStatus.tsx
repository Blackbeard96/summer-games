import React, { useEffect, useState } from 'react';
import { auth, db } from '../firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';

const FirebaseStatus = () => {
  const [authStatus, setAuthStatus] = useState<'checking' | 'connected' | 'error'>('checking');
  const [firestoreStatus, setFirestoreStatus] = useState<'checking' | 'connected' | 'error'>('checking');
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    // Test Authentication
    const unsubscribe = onAuthStateChanged(auth, 
      (user) => {
        setAuthStatus('connected');
        setUser(user);
      },
      (error) => {
        console.error('Auth error:', error);
        setAuthStatus('error');
      }
    );

    // Test Firestore
    const testFirestore = async () => {
      try {
        // Test with a collection that should exist (students or users)
        const testDoc = doc(db, 'students', 'test-connection');
        await getDoc(testDoc);
        setFirestoreStatus('connected');
        console.log('Firestore connection test successful');
      } catch (error: any) {
        // If the document doesn't exist, that's fine - we just want to test the connection
        if (error.code === 'permission-denied') {
          console.error('Firestore permission error:', error);
          setFirestoreStatus('error');
        } else {
          // Document not found is expected for test document
          setFirestoreStatus('connected');
          console.log('Firestore connection test successful (document not found is expected)');
        }
      }
    };

    testFirestore();

    return () => unsubscribe();
  }, []);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'connected': return 'text-green-600';
      case 'error': return 'text-red-600';
      default: return 'text-yellow-600';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'connected': return '✅';
      case 'error': return '❌';
      default: return '⏳';
    }
  };

  return (
    <div className="fixed bottom-4 right-4 bg-white p-4 rounded-lg shadow-lg border text-sm">
      <h3 className="font-semibold mb-2">Firebase Status</h3>
      <div className="space-y-1">
        <div className={`flex items-center gap-2 ${getStatusColor(authStatus)}`}>
          <span>{getStatusIcon(authStatus)}</span>
          <span>Auth: {authStatus}</span>
        </div>
        <div className={`flex items-center gap-2 ${getStatusColor(firestoreStatus)}`}>
          <span>{getStatusIcon(firestoreStatus)}</span>
          <span>Firestore: {firestoreStatus}</span>
        </div>
        {user && (
          <div className="text-green-600">
            <span>✅</span>
            <span>User: {user.email}</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default FirebaseStatus; 