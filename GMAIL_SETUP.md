# Gmail Setup Guide for QuMail

## 🚨 **Important: Gmail Authentication Error Fix**

If you're getting "Username and Password not accepted" errors, follow these steps:

## 📧 **Step 1: Enable 2-Step Verification**

1. Go to [Google Account Security](https://myaccount.google.com/security)
2. Click **"2-Step Verification"**
3. **Turn it ON** if it's not already enabled
4. Follow the setup process

## 🔑 **Step 2: Create App Password (Alternative Method)**

1. Go to [Google Account Security](https://myaccount.google.com/security)
2. Click **"2-Step Verification"**
3. Scroll down to **"App passwords"**
4. Click **"Generate"**
5. Select **"Mail"** and **"Other (Custom name)"**
6. Enter **"QuMail"** as the name
7. **Copy the 16-character password** (save it somewhere safe)

## 🛠️ **Step 3: Update Your Gmail Credentials**

### Option A: Use OAuth2 (Recommended)
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing
3. Enable **Gmail API**
4. Go to **"Credentials"** → **"Create Credentials"** → **"OAuth 2.0 Client ID"**
5. Choose **"Desktop Application"**
6. Download the JSON file
7. Replace `src/config/gmail_credentials.json` with the downloaded file

### Option B: Use App Password (Simpler)
1. Update your `gmail_credentials.json` to use app password method
2. Use the 16-character app password instead of OAuth2

## 🔧 **Step 4: Grant Proper Permissions**

When authenticating with QuMail, make sure to:
1. ✅ **Allow** access to Gmail
2. ✅ **Allow** sending emails
3. ✅ **Allow** reading emails
4. ✅ **Allow** managing emails

## 🎯 **Common Issues & Solutions**

### "Invalid login" Error
- **Cause**: 2-Step Verification not enabled
- **Solution**: Enable 2-Step Verification in Google Account

### "Bad Credentials" Error
- **Cause**: Wrong OAuth2 setup or expired tokens
- **Solution**: Use "Change Account" button in QuMail to re-authenticate

### "Access Denied" Error
- **Cause**: Insufficient permissions granted
- **Solution**: Re-authenticate and grant all requested permissions

## 🚀 **Testing Your Setup**

1. **Delete** existing tokens: `src/config/gmail_tokens.json`
2. **Restart** QuMail: `npm start`
3. **Click** "Connect Gmail" or "Change Account"
4. **Grant all permissions** when prompted
5. **Test** sending an email to yourself

## 📞 **Still Having Issues?**

If you're still getting authentication errors:

1. **Try Demo Mode** first to verify QuMail works
2. **Check** your Google Account security settings
3. **Ensure** 2-Step Verification is enabled
4. **Use** the "Change Account" feature to re-authenticate
5. **Grant** all permissions when prompted by Google

## 🔐 **Security Note**

QuMail uses OAuth2 for secure authentication. Your Gmail password is never stored or transmitted. All authentication is handled directly by Google's secure servers.
