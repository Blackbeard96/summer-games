import React, { useEffect, useState } from 'react';
import { db } from '../App';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';

const items = [
  { name: 'Sleep - In 30 min', description: 'Come to work 30 minutes later (10 am start)', price: 30, icon: '😴' },
  { name: 'Sleep - In 1 hr', description: 'Come to work 1 hour later (10:30 am start)', price: 54, icon: '😴' },
  { name: 'Shield', description: 'Avoid next penalty for incomplete work', price: 25, icon: '🛡️' },
  { name: 'Lunch Extension (+15)', description: 'Extend lunch by 15 minutes (Full Hour)', price: 30, icon: '🍕' },
];

const Marketplace = () => {
  const { currentUser } = useAuth();
  const [powerPoints, setPowerPoints] = useState(0);
  const [inventory, setInventory] = useState<string[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      if (!currentUser) return;
      
      const userRef = doc(db, 'students', currentUser.uid);
      const docSnap = await getDoc(userRef);
      if (docSnap.exists()) {
        const data = docSnap.data();
        setPowerPoints(data.powerPoints || 0);
        setInventory(data.inventory || []);
      }
    };
    if (currentUser) fetchData();
  }, [currentUser]);

  const handlePurchase = async (item: typeof items[0]) => {
    if (!currentUser || powerPoints < item.price) return;
    
    const newPP = powerPoints - item.price;
    const newInventory = [...inventory, item.name];
    setPowerPoints(newPP);
    setInventory(newInventory);
    const userRef = doc(db, 'students', currentUser.uid);
    await updateDoc(userRef, { powerPoints: newPP, inventory: newInventory });
  };

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Marketplace</h1>
      <p className="mb-4">Power Points: <strong>{powerPoints}</strong></p>
      <div className="grid gap-4 md:grid-cols-2">
        {items.map((item) => (
          <div key={item.name} className="border p-4 rounded-xl shadow bg-white flex gap-4 items-center">
            <span className="text-2xl">{item.icon}</span>
            <div>
              <h3 className="text-lg font-semibold">{item.name}</h3>
              <p className="text-sm mb-1">{item.description}</p>
              <p className="mb-2">Price: {item.price} PP</p>
              <button
                onClick={() => handlePurchase(item)}
                disabled={powerPoints < item.price}
                className="px-3 py-1 bg-black text-white rounded disabled:opacity-50"
              >
                Buy
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Marketplace; 