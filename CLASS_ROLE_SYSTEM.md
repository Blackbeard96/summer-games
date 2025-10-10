# Class Role System

A comprehensive role-based permission system for classroom management with Scorekeeper functionality and PP (Power Points) management.

## 🎯 Overview

The Class Role System enables teachers to assign student scorekeepers who can manage Power Points for their classmates. All PP changes require admin approval, ensuring accountability and oversight.

## 🔑 Roles & Permissions

### Administrator
- **Full system access**
- Assign roles to users
- Approve/reject PP changes
- Direct PP modification
- View all students
- Access all management interfaces

### Scorekeeper  
- **Limited PP management**
- Submit PP change requests
- View all students
- Cannot directly modify PP
- Changes require admin approval
- Receive notifications on request status

### Student
- **Standard permissions**
- View own progress
- Complete challenges
- No PP modification rights
- Receive notifications for PP changes

## 🚀 Quick Setup

### 1. Initialize the System
1. Go to **Admin Panel** → **🚀 Role Setup**
2. Click "Set Me as Administrator" 
3. This creates the first admin user

### 2. Assign Scorekeepers
1. Go to **Admin Panel** → **👥 Role Manager**
2. Find the student you want to assign
3. Click "📊 Scorekeeper" button
4. Student will be notified of their new role

### 3. Scorekeeper Usage
1. Scorekeeper goes to **Admin Panel** → **📊 Scorekeeper**
2. Select student and enter PP change (+/-)
3. Add reason for the change
4. Submit for admin approval

### 4. Admin Approval
1. Admin goes to **Admin Panel** → **🔍 PP Approval**
2. Review pending PP change requests
3. Approve or reject with optional notes
4. Students are notified of decisions

## 📊 Components

### Core Components
- `RoleManager` - Assign and manage user roles
- `ScorekeeperInterface` - PP change submission interface
- `PPChangeApproval` - Admin approval interface
- `RoleSystemSetup` - Initial system setup

### Data Types
- `UserRole` - Role definitions (admin, scorekeeper, student)
- `PPChangeRequest` - Individual PP change requests
- `PPChangeSession` - Batch of changes submitted together
- `UserRoleData` - User role assignments with permissions

## 🔄 Workflow

### PP Change Process
1. **Scorekeeper** selects student and enters PP change
2. **System** creates PP change request with "pending" status
3. **Admin** receives notification of pending changes
4. **Admin** reviews and approves/rejects changes
5. **System** updates student PP and notifies all parties
6. **Students** receive notifications of PP changes

### Role Assignment Process
1. **Admin** accesses Role Manager
2. **Admin** selects student and assigns role
3. **System** updates user permissions
4. **Student** receives role assignment notification
5. **Student** gains access to role-specific features

## 🗄️ Database Collections

### `userRoles`
```javascript
{
  userId: string,
  role: 'admin' | 'scorekeeper' | 'student',
  assignedBy: string,
  assignedAt: Date,
  permissions: {
    canModifyPP: boolean,
    canApproveChanges: boolean,
    canAssignRoles: boolean,
    canViewAllStudents: boolean,
    canSubmitPPChanges: boolean
  }
}
```

### `ppChangeRequests`
```javascript
{
  scorekeeperId: string,
  scorekeeperName: string,
  targetUserId: string,
  targetUserName: string,
  ppChange: number, // positive or negative
  reason: string,
  timestamp: Date,
  status: 'pending' | 'approved' | 'rejected',
  reviewedBy?: string,
  reviewedAt?: Date,
  reviewNotes?: string
}
```

### `ppChangeSessions`
```javascript
{
  scorekeeperId: string,
  scorekeeperName: string,
  changes: PPChangeRequest[],
  totalChanges: number,
  submittedAt: Date,
  status: 'pending' | 'approved' | 'rejected' | 'partially_approved'
}
```

## 🔔 Notifications

### Automatic Notifications
- **Role Assignment**: Student notified when assigned new role
- **PP Changes Approved**: Student notified when PP is modified
- **PP Changes Rejected**: Scorekeeper notified when changes are rejected
- **Submission Received**: Admin notified when scorekeeper submits changes

### Notification Types
- `role_assigned` - Role assignment notification
- `pp_change_approved` - PP change approved
- `pp_changes_rejected` - PP changes rejected
- `pp_change_submitted` - New submission for admin review

## 🛡️ Security Features

### Permission Validation
- All role-based actions validate user permissions
- Database rules enforce role-based access
- Frontend components check user roles before rendering

### Audit Trail
- All PP changes are logged with timestamps
- Role assignments tracked with assigner information
- Change reasons required for all PP modifications

### Data Integrity
- PP cannot go below 0
- All changes require valid reasons
- Batch operations use Firestore transactions

## 🎨 UI Components

### Role Manager
- Grid view of all students
- Role badges with color coding
- One-click role assignment
- Role statistics dashboard

### Scorekeeper Interface
- Student selection dropdown
- PP amount input (positive/negative)
- Reason text area
- Pending changes preview
- Batch submission

### PP Change Approval
- Session-based approval interface
- Detailed change review
- Bulk approve/reject options
- Real-time updates

## 🔧 Customization

### Role Colors
- Admin: Red (`#dc2626`)
- Scorekeeper: Green (`#059669`)
- Student: Blue (`#3b82f6`)

### Permission Customization
Edit `ROLE_PERMISSIONS` in `src/types/roles.ts` to modify role capabilities.

### Notification Styling
Customize notification appearance in each component's notification creation functions.

## 📱 Mobile Responsive

All components are designed to work on mobile devices with:
- Responsive grid layouts
- Touch-friendly buttons
- Readable text sizes
- Optimized spacing

## 🚨 Troubleshooting

### Common Issues

**Q: Role Setup button doesn't work**
A: Check Firebase permissions and ensure user is logged in

**Q: PP changes not appearing**
A: Verify Firestore rules allow read/write to `ppChangeRequests` collection

**Q: Notifications not showing**
A: Check that notification subcollections exist under `students/{userId}/notifications`

**Q: Scorekeeper can't see students**
A: Ensure user role is properly set in `userRoles` collection

### Debug Steps
1. Check browser console for errors
2. Verify Firebase Authentication
3. Check Firestore security rules
4. Confirm user role assignments
5. Test with Firebase Emulator for development

## 🔄 Future Enhancements

### Planned Features
- [ ] Role expiration dates
- [ ] PP change history dashboard
- [ ] Bulk role assignments
- [ ] Custom permission sets
- [ ] Email notifications
- [ ] PP change analytics
- [ ] Role templates
- [ ] Audit log export

### Integration Points
- Badge system integration
- Chapter progress integration
- Google Classroom sync
- Parent notifications
- Grade book export

## 📞 Support

For issues or questions about the Class Role System:
1. Check this documentation
2. Review component source code
3. Test with Firebase Emulator
4. Check browser developer tools
5. Verify database permissions

---

**Created**: September 2025  
**Version**: 1.0.0  
**Components**: 4 main components, 3 data types  
**Database Collections**: 3 collections + notifications subcollection









