# 🔐 Firebase Rules Fix Instructions

## 🚨 **Current Issue:**
You're getting "Missing or insufficient permissions" errors because the Firebase security rules are too restrictive.

## ✅ **Solution:**

### **Step 1: Update Firebase Security Rules**

1. **Go to Firebase Console:**
   - Visit: https://console.firebase.google.com/
   - Select your project: `summer-games` (or whatever your project is named)

2. **Navigate to Firestore Rules:**
   - Click **"Firestore Database"** in the left sidebar
   - Click the **"Rules"** tab at the top

3. **Replace the Current Rules:**
   - Copy the contents of the `firestore.rules` file I created
   - Paste it into the rules editor
   - Click **"Publish"**

### **Step 2: What the New Rules Do:**

- **✅ Allows your email** (`edm21179@gmail.com`) full admin access
- **✅ Allows all @mstgames.net emails** admin access
- **✅ Allows all @compscihigh.org emails** admin access
- **✅ Allows users to access their own data**
- **✅ Allows test account access** for admins
- **✅ Allows manifest selection** to work properly

### **Step 3: Test the Fix:**

1. **Refresh your app** after updating the rules
2. **Try the manifest selection** - it should work now
3. **Access admin tools** - should work without permission errors

## 🔧 **Alternative Quick Fix (Temporary):**

If you need immediate access, you can temporarily use more permissive rules:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

**⚠️ Warning:** This allows any authenticated user to access any data. Only use this temporarily for testing, then switch to the proper rules above.

## 🎯 **Expected Results After Fix:**

- ✅ No more "Missing or insufficient permissions" errors
- ✅ Manifest selection works properly
- ✅ Admin tools accessible
- ✅ Test account functionality works
- ✅ Students can select manifests without errors

## 🆘 **If Still Having Issues:**

1. **Check Firebase Console** for any rule syntax errors
2. **Wait 1-2 minutes** after publishing rules (they take time to propagate)
3. **Clear browser cache** and refresh
4. **Check the Firebase Rules Checker** tool in the admin panel

## 📞 **Need Help?**

If you're still having issues after following these steps, let me know and I can help troubleshoot further!

