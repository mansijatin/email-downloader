# Mail Attachment Downloader

A secure email attachment downloader that uses **OAuth 2.0** for authentication. Scans emails for attachments containing 'CommSec', downloads them, and extracts data from PDFs and images.

## 🔐 Security Features

- **OAuth 2.0 Authentication** - No passwords stored, session-based access
- **Token auto-refresh** - Seamless re-authentication
- **User authorization flow** - Explicit permission required
- **Revocable access** - Can be revoked anytime from your account
- **Mobile notifications** - Get notified when access is requested

## Features

- 🔒 Secure OAuth 2.0 authentication (recommended) or app password fallback
- 📧 IMAP-based email scanning
- 📎 Automatic attachment download
- 📄 PDF text extraction
- 🖼️ OCR for images (using Tesseract)
- 📊 CSV metadata tracking
- 🔄 Idempotent scanning (skips previously processed dates)

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Setup OAuth 2.0 (Recommended)

See [OAUTH_SETUP.md](OAUTH_SETUP.md) for detailed instructions.

**Quick summary:**
1. Create OAuth credentials in [Google Cloud Console](https://console.cloud.google.com/)
2. Enable Gmail API
3. Get Client ID and Client Secret
4. Configure `.env` file

### 3. Configure Environment

```bash
# Copy and edit .env file
cp .env.example .env
```

Edit `.env`:
```bash
USE_OAUTH=true
OAUTH_CLIENT_ID=your-client-id
OAUTH_CLIENT_SECRET=your-client-secret
EMAIL_USER=your-email@gmail.com
```

### 4. Build and Run

```bash
npm run build
npm start
```

On first run, your browser will open for OAuth authorization. Approve access and you're done!

## Usage

### Basic Usage

```bash
npm start
```

Scans emails since the last scan date (tracked in `scan_metadata.csv`).

### Scan Specific Date Range

```bash
npm start 2024-01-01 2024-12-31
```

### Using App Password (Not Recommended)

If you can't use OAuth:

```bash
# In .env
USE_OAUTH=false
EMAIL_APP_PASSWORD=your-16-char-app-password
```

⚠️ **Warning:** App passwords are less secure and should only be used as a fallback.

## Authentication Methods Comparison

| Feature | OAuth 2.0 | App Password |
|---------|-----------|--------------|
| Security | ✅ Excellent | ⚠️ Basic |
| Password stored | ❌ No | ✅ Yes |
| Expires | ✅ Auto | ❌ Manual only |
| Revocable | ✅ Yes | ✅ Yes |
| 2FA compatible | ✅ Yes | ✅ Yes |
| User notification | ✅ Yes | ❌ No |
| Session-based | ✅ Yes | ❌ No |

## Configuration

### Environment Variables

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `USE_OAUTH` | Enable OAuth 2.0 | No | `false` |
| `OAUTH_CLIENT_ID` | OAuth client ID | Yes (if OAuth) | - |
| `OAUTH_CLIENT_SECRET` | OAuth client secret | Yes (if OAuth) | - |
| `EMAIL_USER` | Email address | Yes | - |
| `EMAIL_IMAP_HOST` | IMAP server | No | `imap.gmail.com` |
| `EMAIL_MAILBOX` | Mailbox name | No | `INBOX` |
| `EMAIL_APP_PASSWORD` | App password | Yes (if not OAuth) | - |

## Output

- **Attachments**: Saved to `commsec-attachments/` folder
- **Metadata**: Tracked in `commsec-attachments/scan_metadata.csv`
- **OAuth Tokens**: Cached in `.oauth-tokens.json` (gitignored)

## Supported File Types

- **PDF** - Text extraction using pdf-parse
- **Images** (JPG, PNG, GIF) - OCR using Tesseract.js
- **Others** - Saved without extraction

## Security Best Practices

1. ✅ Always use OAuth 2.0 when possible
2. ✅ Never commit `.env` or `.oauth-tokens.json`
3. ✅ Regularly review authorized apps in your account
4. ✅ Revoke access when no longer needed
5. ✅ Use specific mailbox names, not entire account access

## Troubleshooting

### OAuth Issues

**Browser doesn't open:**
- Manually copy the URL from terminal

**Port conflict:**
- Change `OAUTH_REDIRECT_URI` to different port

**Invalid credentials:**
- Verify Client ID/Secret are correct
- Ensure Gmail API is enabled
- Check redirect URI matches

### IMAP Issues

**Connection refused:**
- Verify IMAP is enabled in email settings
- Check firewall/network settings

**Authentication failed:**
- For OAuth: Delete `.oauth-tokens.json` and retry
- For app password: Generate new password

See [OAUTH_SETUP.md](OAUTH_SETUP.md) for detailed troubleshooting.

## Requirements

- Node.js 18+
- Gmail or compatible IMAP email account
- For OAuth: Google Cloud project with Gmail API enabled

## License

MIT