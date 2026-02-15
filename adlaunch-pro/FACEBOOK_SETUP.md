# 🔵 Facebook App Configuration Guide

## Current Status

Your AdLaunch Pro app is experiencing the **"Facebook Login is currently unavailable for this app"** error because the Facebook App needs to be properly configured.

**App ID**: `878151631605651`

---

## 🚀 Quick Start (Simulation Mode)

**SIMULATION MODE IS NOW ENABLED** in `config.js`. This allows you to test the app without Facebook approval:

```javascript
debug: {
    simulateFB: true,  // ✅ Enabled
}
```

### What Simulation Mode Does:
- ✅ Bypasses Facebook login completely
- ✅ Creates fake ad accounts for testing
- ✅ Allows campaign creation without real Facebook API
- ✅ Perfect for development and demo purposes

### To Test:
1. Restart your server: `node server.js`
2. Open `https://localhost:3000/dashboard.html`
3. Click **"Connecter Facebook Business"**
4. You'll be instantly "logged in" with demo data

---

## 🔧 Production Setup (Real Facebook Integration)

To use **real Facebook login** and **real ad accounts**, follow these steps:

### Step 1: Access Facebook Developer Console

1. Go to https://developers.facebook.com/apps/
2. Find your app: **878151631605651**
3. Or create a new app if needed

### Step 2: Configure App Domains

**Settings → Basic → App Domains**:
```
localhost
```

### Step 3: Configure OAuth Redirect URIs

**Products → Facebook Login → Settings → Valid OAuth Redirect URIs**:
```
https://localhost:3000/
https://localhost:3000/dashboard.html
https://localhost:3000/auth.html
http://localhost:3000/
http://localhost:3000/dashboard.html
http://localhost:3000/auth.html
```

### Step 4: Add Test Users (Development Mode)

**Roles → Test Users**:
- Add yourself as a test user
- OR add your Facebook account as an Administrator

> **Important**: While in Development Mode, only approved testers can log in!

### Step 5: Request Permissions (For Public Use)

**App Review → Permissions and Features**:

Request **Advanced Access** for:
- ✅ `ads_management`
- ✅ `ads_read`
- ✅ `business_management`
- ✅ `pages_read_engagement`

**Review Time**: 3-7 business days

### Step 6: Switch to Live Mode

Once approved:
1. **Settings → Basic**
2. Toggle **App Mode** to **Live**

### Step 7: Disable Simulation Mode

In `config.js`:
```javascript
debug: {
    simulateFB: false,  // ❌ Disable simulation
}
```

---

## 🐛 Troubleshooting

### Error: "This app is in development mode"

**Solution**: Add yourself as a Test User or Administrator

### Error: "Can't Load URL"

**Solution**: Add `localhost` to App Domains

### Error: "Invalid OAuth Redirect URI"

**Solution**: Add all your URLs to Valid OAuth Redirect URIs

### Error: "Permissions not granted"

**Solution**: Request Advanced Access in App Review

---

## 📋 Checklist

- [ ] App created in Facebook Developer Console
- [ ] App Domains configured (`localhost`)
- [ ] OAuth Redirect URIs added
- [ ] Test user added (yourself)
- [ ] Permissions requested (for production)
- [ ] App switched to Live mode (after approval)
- [ ] Simulation mode disabled in `config.js`

---

## 🎯 Current Configuration

**Mode**: Development (Simulation Enabled)

**To switch to production**:
1. Complete all setup steps above
2. Set `simulateFB: false` in `config.js`
3. Restart server

---

## 📚 Resources

- [Facebook Login Documentation](https://developers.facebook.com/docs/facebook-login/web)
- [App Review Process](https://developers.facebook.com/docs/app-review)
- [OAuth Configuration](https://developers.facebook.com/docs/facebook-login/security)

---

## ❓ Need Help?

See the detailed guide: `facebook_login_fix_guide.md` in the artifacts folder.
