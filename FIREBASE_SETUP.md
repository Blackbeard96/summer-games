# Firebase Setup Guide

## Step 1: Create a Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click "Create a project" or "Add project"
3. Enter a project name (e.g., "summer-games-app")
4. Choose whether to enable Google Analytics (recommended)
5. Click "Create project"

## Step 2: Add Web App to Firebase

1. In your Firebase project dashboard, click the web icon (</>) 
2. Register your app with a nickname (e.g., "summer-games-web")
3. Copy the Firebase configuration object

## Step 3: Configure Environment Variables

Create a `.env.local` file in the root directory with your Firebase config:

```env
REACT_APP_FIREBASE_API_KEY=your_actual_api_key
REACT_APP_FIREBASE_AUTH_DOMAIN=your_project_id.firebaseapp.com
REACT_APP_FIREBASE_PROJECT_ID=your_project_id
REACT_APP_FIREBASE_STORAGE_BUCKET=your_project_id.appspot.com
REACT_APP_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
REACT_APP_FIREBASE_APP_ID=your_app_id
```

## Step 4: Enable Authentication

1. In Firebase Console, go to "Authentication" → "Sign-in method"
2. Enable "Email/Password" authentication
3. Optionally enable "Google" or other providers

## Step 5: Set up Firestore Database

1. Go to "Firestore Database" in Firebase Console
2. Click "Create database"
3. Choose "Start in test mode" for development
4. Select a location close to your users
5. Create the following collections:
   - `students` (for user data)
   - `challenges` (for challenge definitions)
   - `leaderboard` (for rankings)

## Step 6: Set up Storage (Optional)

1. Go to "Storage" in Firebase Console
2. Click "Get started"
3. Choose "Start in test mode" for development
4. Select a location

## Step 7: Security Rules

### Firestore Rules
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Students can read/write their own data
    match /students/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
    
    // Anyone can read challenges
    match /challenges/{challengeId} {
      allow read: if true;
      allow write: if false;
    }
    
    // Anyone can read leaderboard
    match /leaderboard/{userId} {
      allow read: if true;
      allow write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

### Storage Rules
```javascript
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /{allPaths=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

## Step 8: Test the Setup

1. Run `npm start` to start the development server
2. Try to sign up/sign in
3. Check if data is being saved to Firestore

## Troubleshooting

- Make sure all environment variables are prefixed with `REACT_APP_`
- Restart the development server after adding environment variables
- Check browser console for any Firebase-related errors
- Verify that your Firebase project is in the correct region 