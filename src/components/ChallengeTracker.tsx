import React, { useEffect, useState } from 'react';
import { db } from '../App';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';

const ChallengeTracker = () => {
  const { currentUser } = useAuth();
  const [challenges, setChallenges] = useState<{[key: string]: boolean}>({});
  const [xp, setXP] = useState(0);
  const [level, setLevel] = useState(1);
  const [unlocks, setUnlocks] = useState<string[]>([]);
  const [powerPoints, setPowerPoints] = useState(0);

  useEffect(() => {
    const fetchChallenges = async () => {
      if (!currentUser) return;
      
      const userRef = doc(db, 'students', currentUser.uid);
      const docSnap = await getDoc(userRef);

      if (docSnap.exists()) {
        const data = docSnap.data();
        setChallenges(data.challenges || {});
        const xpVal = data.xp || 0;
        const ppVal = data.powerPoints || 0;
        setXP(xpVal);
        setPowerPoints(ppVal);
        const lvl = Math.floor(xpVal / 50) + 1;
        setLevel(lvl);
        updateUnlocks(lvl);
      } else {
        await setDoc(userRef, { challenges: {}, xp: 0, powerPoints: 0 });
      }
    };

    if (currentUser) fetchChallenges();
  }, [currentUser]);

  const updateUnlocks = (lvl: number) => {
    const unlockMap: {[key: number]: string} = {
      2: "🔓 Sight Beyond Sight Badge",
      3: "🔓 Tool Mastery Badge",
      4: "🔓 Flow State Ability",
      5: "🔓 Imposition Ability"
    };
    const newUnlocks = Object.entries(unlockMap)
      .filter(([key]) => lvl >= parseInt(key))
      .map(([, val]) => val);
    setUnlocks(newUnlocks);
  };

  const toggleChallenge = async (id: string) => {
    if (!currentUser) return;
    
    const alreadyCompleted = challenges[id];
    const updated = {
      ...challenges,
      [id]: !alreadyCompleted
    };
    const xpChange = alreadyCompleted ? -10 : 10;
    const ppChange = alreadyCompleted ? -5 : 5;
    const newXP = xp + xpChange;
    const newPP = powerPoints + ppChange;
    const newLevel = Math.floor(newXP / 50) + 1;
    setChallenges(updated);
    setXP(newXP);
    setPowerPoints(newPP);
    setLevel(newLevel);
    updateUnlocks(newLevel);

    const userRef = doc(db, 'students', currentUser.uid);
    await updateDoc(userRef, { challenges: updated, xp: newXP, powerPoints: newPP });
  };

  const exampleChallenges = [
    "Shape Shifter",
    "Memory Forge",
    "Your Manifest Weapon",
    "The Impossible Tool"
  ];

  return (
    <div className="p-4 bg-white shadow rounded-xl">
      <h2 className="text-xl font-bold mb-2">Your Challenge Progress</h2>
      <p className="mb-1">Total XP: <strong>{xp}</strong></p>
      <p className="mb-1">Level: <strong>{level}</strong></p>
      <p className="mb-1">Power Points: <strong>{powerPoints}</strong></p>
      {unlocks.length > 0 && (
        <div className="mb-3">
          <p className="font-semibold">Unlocked:</p>
          <ul className="list-disc list-inside">
            {unlocks.map((u, i) => <li key={i}>{u}</li>)}
          </ul>
        </div>
      )}
      <ul>
        {exampleChallenges.map((name) => (
          <li key={name} className="flex items-center gap-2 mb-1">
            <input
              type="checkbox"
              checked={challenges[name] || false}
              onChange={() => toggleChallenge(name)}
            />
            <span>{name}</span>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default ChallengeTracker; 