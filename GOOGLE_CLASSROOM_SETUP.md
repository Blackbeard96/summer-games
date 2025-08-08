# Google Classroom OAuth Setup Guide

This guide will help you complete the Google Classroom OAuth setup for your XioTein School application.

## Prerequisites

- A Google Cloud Console account
- Your OAuth 2.0 Client ID: `281092791460-085tqid3jq8e9llqdmlps0f5d6c835n5.apps.googleusercontent.com`

## Step-by-Step Setup

### 1. Access Google Cloud Console

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Sign in with your Google account
3. Select your project (or create a new one if needed)

### 2. Configure OAuth Consent Screen

1. In the left sidebar, navigate to **APIs & Services** → **OAuth consent screen**
2. Choose **External** user type (unless you have a Google Workspace organization)
3. Fill in the required information:
   - **App name**: XioTein School
   - **User support email**: Your email address
   - **Developer contact information**: Your email address
4. Click **Save and Continue**
5. On the **Scopes** page, click **Save and Continue**
6. On the **Test users** page, add your email address as a test user
7. Click **Save and Continue**

### 3. Add Authorized Domains

1. Still in the OAuth consent screen, go to the **Authorized domains** section
2. Click **Add Domain**
3. Add `localhost` to the list
4. Click **Save**

### 4. Configure OAuth 2.0 Client ID

1. Navigate to **APIs & Services** → **Credentials**
2. Find your OAuth 2.0 Client ID: `281092791460-085tqid3jq8e9llqdmlps0f5d6c835n5.apps.googleusercontent.com`
3. Click on the client ID to edit it
4. In the **Authorized redirect URIs** section, add:
   ```
   http://localhost:3000/admin
   ```
5. Click **Save**

### 5. Enable Google Classroom API

1. Navigate to **APIs & Services** → **Library**
2. Search for "Google Classroom API"
3. Click on **Google Classroom API**
4. Click **Enable**

### 6. Test the Integration

1. Go back to your XioTein School application
2. Navigate to the Admin Panel
3. Click **Import from Google** or try the Google Classroom integration
4. The OAuth flow should now work properly

## Troubleshooting

### Common Issues

1. **"Error: redirect_uri_mismatch"**
   - Make sure you've added `http://localhost:3000/admin` to the authorized redirect URIs
   - Check that there are no extra spaces or characters

2. **"Error: access_denied"**
   - Make sure you've added your email as a test user in the OAuth consent screen
   - Check that the app is not in "Testing" mode if you want to use it with other users

3. **"Error: invalid_client"**
   - Verify that your OAuth 2.0 Client ID is correct
   - Make sure you're using the right project in Google Cloud Console

### Verification Steps

1. Check that your OAuth consent screen shows:
   - App name: XioTein School
   - Authorized domains: localhost
   - Test users: Your email address

2. Check that your OAuth 2.0 Client ID has:
   - Authorized redirect URIs: `http://localhost:3000/admin`
   - Application type: Web application

3. Verify that Google Classroom API is enabled in your project

## Security Notes

- Keep your OAuth 2.0 Client ID secure
- Don't commit sensitive credentials to version control
- Consider using environment variables for production deployments
- Regularly review and update your OAuth consent screen settings

## Next Steps

Once the OAuth setup is complete, you should be able to:
- Import Google Classroom courses
- Map assignments to chapter challenges
- Sync student data between Google Classroom and XioTein School

For production deployment, you'll need to:
- Add your production domain to authorized domains
- Add production redirect URIs
- Publish your OAuth consent screen (if needed)
- Set up proper environment variables for credentials 