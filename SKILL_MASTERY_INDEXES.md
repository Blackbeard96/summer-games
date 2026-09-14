# Academic Skill Mastery — Firestore Indexes

Composite indexes needed if queries grow:

## skillEvidence

1. `userId` ASC + `questionId` ASC  
   Used by: prior attempt weighting per question

2. `userId` ASC + `skillId` ASC  
   Used by: rebuilding mastery for a skill

3. Optional later: `userId` ASC + `skillId` ASC + `createdAtMs` ASC  
   For trend windows without loading all evidence

Create in Firebase Console → Firestore → Indexes if the console prompts after first use.
Single-field indexes are automatic.
