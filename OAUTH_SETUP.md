# OAuth 2.0 Setup Guide

## Why OAuth 2.0?

OAuth 2.0 provides **significantly better security** than app passwords:

✅ **Session-based access** - Tokens expire automatically  
✅ **No password storage** - Your actual password never leaves your device  
✅ **User authorization** - You explicitly approve each access  
✅ **Revocable** - Can be revoked instantly from your account  
✅ **Mobile notifications** - Get notified when access is requested  
✅ **Granular permissions** - Only grant mail access, nothing else  

## Setup Instructions

### Step 1: Create OAuth 2.0 Credentials

#### For Gmail:

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (or select existing)
3. Enable the **Gmail API**:
   - Go to "APIs & Services" → "Library"
   - Search for "Gmail API"
   - Click "Enable"
4. Create OAuth 2.0 credentials:
   - Go to "APIs & Services" → "Credentials"
   - Click "Create Credentials" → "OAuth client ID"
   - Choose "Desktop app" as application type
   - Name it "Email Downloader" (or any name you prefer)
   - Click "Create"
5. Download the credentials:
   - You'll get a Client ID and Client Secret
   - Copy these values

#### For Yahoo Mail:

1. Go to [Yahoo Developer Network](https://developer.yahoo.com/)
2. Create a new app
3. Request access to Yahoo Mail API
4. Get your Client ID and Client Secret
5. Set redirect URI to: `http://localhost:3000/oauth/callback`

### Step 2: Configure Environment Variables

Edit your `.env` file:

```bash
# Enable OAuth
USE_OAUTH=true

# OAuth Credentials (from Step 1)
OAUTH_CLIENT_ID=your-actual-client-id-here
OAUTH_CLIENT_SECRET=your-actual-client-secret-here
OAUTH_REDIRECT_URI=http://localhost:3000/oauth/callback

# Email Configuration
EMAIL_USER=your-email@gmail.com
EMAIL_IMAP_HOST=imap.gmail.com
EMAIL_MAILBOX=INBOX
```

### Step 3: Run the Application

```bash
npm run build
npm start
```

### First-Time OAuth Flow

When you run the app for the first time:

1. **Browser opens automatically** with Google/Yahoo login page
2. **Sign in** with your email account
3. **Review permissions** - you'll see what access is requested
4. **Click "Allow"** to grant access
5. **Mobile notification** (if enabled on your account)
6. Browser shows "Authorization Successful"
7. **Token is cached** - you won't need to do this again until it expires

### Token Management

- **Access tokens** expire after 1 hour
- **Refresh tokens** are used to get new access tokens automatically
- Tokens are stored in `.oauth-tokens.json` (add to `.gitignore`)
- No need to re-authorize until refresh token expires (typically 6 months)

### Revoking Access

To revoke access at any time:

#### Gmail:
1. Go to [Google Account Security](https://myaccount.google.com/permissions)
2. Find "Email Downloader" app
3. Click "Remove Access"

#### Or programmatically:
```bash
# Delete token file
rm .oauth-tokens.json
```

### Fallback to App Password

If you need to use app passwords temporarily:

```bash
# In .env file
USE_OAUTH=false
EMAIL_APP_PASSWORD=your-app-password
```

⚠️ **Not recommended** - App passwords are less secure and don't expire automatically.

## Troubleshooting

### Browser doesn't open
- Manually copy the URL from terminal and open in browser

### Port 3000 already in use
- Change `OAUTH_REDIRECT_URI` to use different port (e.g., `localhost:3001`)
- Update redirect URI in Google Cloud Console

### "Invalid credentials" error
- Verify Client ID and Client Secret are correct
- Check that Gmail API is enabled
- Ensure redirect URI matches exactly

### Token expired
- Delete `.oauth-tokens.json` and run again
- App will automatically start new OAuth flow

## Security Best Practices

1. **Never commit** `.env` or `.oauth-tokens.json` to git
2. **Use OAuth** instead of app passwords whenever possible
3. **Regularly review** authorized applications in your account
4. **Revoke access** when no longer needed
5. **Keep tokens secure** - treat them like passwords

## Additional Resources

- [Google OAuth 2.0 Documentation](https://developers.google.com/identity/protocols/oauth2)
- [Gmail API Guide](https://developers.google.com/gmail/api/guides)
- [OAuth 2.0 Security Best Practices](https://datatracker.ietf.org/doc/html/draft-ietf-oauth-security-topics)
