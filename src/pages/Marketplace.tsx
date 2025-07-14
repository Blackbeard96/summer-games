import React, { useEffect, useState } from 'react';
import { db } from '../firebase';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';

const items = [
  { name: 'Sleep - In 30 min', description: 'Come to work 30 minutes later (10 am start)', price: 30, icon: '😴', image: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=facearea&w=256&h=256&facepad=2' },
  { name: 'Sleep - In 1 hr', description: 'Come to work 1 hour later (10:30 am start)', price: 54, icon: '😴', image: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=facearea&w=256&h=256&facepad=2' },
  { name: 'Shield', description: 'Avoid next penalty for incomplete work', price: 25, icon: '🛡️', image: 'https://images.unsplash.com/photo-1465101046530-73398c7f28ca?auto=format&fit=facearea&w=256&h=256&facepad=2' },
  { name: 'Lunch Extension (+15)', description: 'Extend lunch by 15 minutes (Full Hour)', price: 30, icon: '🍕', image: 'https://images.unsplash.com/photo-1540189549336-e6e99c3679fe?auto=format&fit=facearea&w=256&h=256&facepad=2' },
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
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => {
          const purchased = inventory.includes(item.name);
          return (
            <div key={item.name} className="rounded-xl shadow bg-white flex flex-col items-center border p-0 overflow-hidden relative">
              <img src={item.image} alt={item.name} style={{ width: '100%', height: 160, objectFit: 'cover' }} />
              <div className="p-4 w-full flex-1 flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-2xl">{item.icon}</span>
                    <h3 className="text-lg font-semibold">{item.name}</h3>
                  </div>
                  <p className="text-sm mb-1">{item.description}</p>
                  <p className="mb-2">Price: {item.price} PP</p>
                </div>
                {purchased ? (
                  <span className="inline-block mt-2 px-3 py-1 bg-green-100 text-green-700 rounded font-semibold">Purchased</span>
                ) : (
                  <button
                    onClick={() => handlePurchase(item)}
                    disabled={powerPoints < item.price}
                    className="mt-2 px-3 py-1 bg-black text-white rounded disabled:opacity-50"
                  >
                    Buy
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default Marketplace; 