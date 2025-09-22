# QuMail - Quantum-Safe Email Client

A modern desktop email client with quantum-safe encryption capabilities built with Electron.js. QuMail provides multiple layers of encryption to protect your communications against both classical and quantum computing threats.

## ✨ Features
- 🔐 **Multi-level encryption**: OTP, AES-256, Kyber PQC, and Plain text options
- 📧 **Gmail Integration**: Full OAuth2 integration with IMAP/SMTP support
- 🔑 **QKD Simulation**: Quantum Key Distribution server implementing ETSI GS QKD 014 standard
- 🖥️ **Modern GUI**: Professional Electron interface with responsive design
- 🚀 **Demo Mode**: Test all features without Gmail API setup
- ♿ **Accessibility**: Full keyboard navigation and screen reader support
- 📱 **Responsive**: Works on different screen sizes

## 🚀 Quick Start

### Prerequisites
- Node.js (v16 or higher)
- npm or yarn

### Installation
```bash
# Clone the repository
git clone <repository-url>
cd QuMail

# Install dependencies
npm install

# Start the application
npm start

# Alternative: Start with demo mode
npm run demo
```

### Gmail Setup (Optional)
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing one
3. Enable Gmail API
4. Create OAuth 2.0 credentials
5. Download credentials and save as `src/config/gmail_credentials.json`

## 🎮 Demo Mode
Try QuMail without Gmail setup:
1. Click "Demo Mode" in the sidebar
2. Click "Enable Demo Mode"
3. Explore all encryption features with simulated emails

## 🔒 Encryption Levels
- **Plain Text**: No encryption (for testing)
- **AES-256**: Industry-standard symmetric encryption
- **Kyber PQC**: Post-quantum cryptography (simulated)
- **OTP**: One-time pad for maximum security

## 🛠️ Development

### Available Scripts
```bash
npm start          # Start the application
npm run dev        # Start in development mode
npm test           # Run test suite
npm run qkd-server # Start QKD server only
npm run demo       # Start with demo mode
```

### Project Structure
```
src/
├── gui/           # Frontend (HTML, CSS, JS)
├── email/         # Email services
├── encryption/    # Encryption engines
├── qkd_client/    # QKD client
├── qkd_server/    # QKD server
├── auth/          # OAuth authentication
├── config/        # Configuration files
└── tests/         # Test suite
```

## 🧪 Testing
Run the comprehensive test suite:
```bash
npm test
```

## 📝 License
MIT License - see LICENSE file for details

## 🤝 Contributing
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests
5. Submit a pull request

## 🐛 Troubleshooting
- **Authentication fails**: Check Gmail credentials configuration
- **QKD server won't start**: Ensure port 3001 is available
- **Emails not loading**: Try demo mode first to verify functionality
