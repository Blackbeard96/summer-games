# 🔍 Manifest Selection Diagnostic Tool

## Overview
The Manifest Diagnostic Tool helps you troubleshoot issues with the manifest selection screen that students might be experiencing. It provides comprehensive testing and debugging capabilities.

## How to Access

### Option 1: From Admin Panel
1. Go to the Admin Panel
2. Click the "🔍 Manifest Diagnostic" button in the top-right corner
3. The diagnostic tool will open in a modal

### Option 2: From Dashboard
1. Go to the Dashboard (main page)
2. Click the "🔍 Diagnostic" button in the top-right corner
3. The diagnostic tool will open in a modal

## What the Diagnostic Tool Tests

### 1. Authentication Test ✅/❌
- Checks if the user is properly authenticated
- Verifies user ID, email, and email verification status
- Shows display name if available

### 2. Database Collections Test 📁
- **Users Collection**: Checks if user document exists in the `users` collection
- **Students Collection**: Checks if student document exists in the `students` collection
- **Manifest Data**: Verifies if manifest data exists in either collection

### 3. Manifest Validity Test 🎯
- Validates that the manifest ID exists in the available manifests
- Checks if the manifest data is properly structured
- Shows the manifest name if valid

### 4. Manifest Consistency Test 🔄
- Compares manifest data between `users` and `students` collections
- Identifies if there are mismatches between collections
- Shows both manifest objects for comparison

### 5. Browser Compatibility Test 🌐
- Checks screen size and viewport dimensions
- Tests for touch support (important for mobile devices)
- Verifies local storage availability
- Shows user agent information

## Diagnostic Actions

### 🔄 Re-run Tests
- Refreshes all diagnostic tests
- Useful after making changes or fixes

### 🧪 Test Manifest Selection
- Sets a test manifest (Reading) to both collections
- Helps verify that manifest selection is working
- Use this to test if the selection screen appears correctly

### 🗑️ Clear Manifest
- Removes manifest data from both collections
- Forces the manifest selection screen to appear
- Useful for testing the selection flow

## Common Issues and Solutions

### Issue: "Manifest Selection Screen Not Appearing"
**Possible Causes:**
- User already has a manifest set
- Database connection issues
- Authentication problems

**Solutions:**
1. Use "🗑️ Clear Manifest" to remove existing manifest
2. Check authentication status in diagnostic
3. Verify database collections exist

### Issue: "Students Can't Confirm Their Manifest"
**Possible Causes:**
- Browser compatibility issues
- Touch/click events not working
- Screen size problems on mobile

**Solutions:**
1. Check browser compatibility in diagnostic
2. Test on different devices/browsers
3. Verify touch support for mobile users

### Issue: "Manifest Data Inconsistent"
**Possible Causes:**
- Data saved to only one collection
- Sync issues between collections

**Solutions:**
1. Use "🧪 Test Manifest Selection" to set consistent data
2. Check manifest consistency in diagnostic results

## Interpreting Results

### ✅ Green Checkmarks
- Indicates the test passed
- Component is working correctly

### ❌ Red X Marks
- Indicates the test failed
- Component needs attention

### 📊 Test Summary
- Quick overview of all test results
- Helps identify major issues at a glance

### 🔬 Detailed Results
- In-depth information about each test
- Shows specific data and error messages

## Raw Data
- Expandable section showing complete diagnostic data
- Useful for debugging complex issues
- Can be copied and shared for technical support

## Best Practices

1. **Run diagnostics regularly** to catch issues early
2. **Test on different devices** to ensure compatibility
3. **Clear manifests** when testing the selection flow
4. **Check browser compatibility** for mobile users
5. **Verify data consistency** between collections

## Troubleshooting Steps

1. **Start with the Test Summary** to get an overview
2. **Check Authentication** - ensure user is properly logged in
3. **Verify Collections** - both users and students collections should exist
4. **Test Manifest Selection** - use the test button to verify functionality
5. **Clear and Retry** - if issues persist, clear manifest and try again

## Support

If issues persist after using the diagnostic tool:
1. Copy the raw diagnostic data
2. Note the specific error messages
3. Check the browser console for additional errors
4. Test on different browsers/devices
5. Contact technical support with diagnostic results

