const { ipcRenderer } = require('electron');

class QuMailRenderer {
    constructor() {
        this.currentView = 'inbox';
        this.emails = [];
        this.sentEmails = [];
        this.selectedEmail = null;
        this.isAuthenticated = false;
        this.qkdStatus = false;
        
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.checkQKDStatus();
        this.loadSettings();
        
        // Auto-refresh QKD status every 30 seconds
        setInterval(() => this.checkQKDStatus(), 30000);
    }

    setupEventListeners() {
        // Navigation
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', (e) => {
                const view = e.currentTarget.dataset.view;
                this.switchView(view);
            });
            
            // Keyboard navigation support
            item.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    const view = e.currentTarget.dataset.view;
                    this.switchView(view);
                }
            });
        });

        // Authentication
        document.getElementById('auth-btn').addEventListener('click', () => {
            this.authenticateGmail();
        });
        
        document.getElementById('auth-btn-empty').addEventListener('click', () => {
            this.authenticateGmail();
        });

        // Switch account button
        document.getElementById('switch-account-btn').addEventListener('click', () => {
            this.switchGmailAccount();
        });

        // Refresh emails
        document.getElementById('refresh-btn').addEventListener('click', () => {
            this.fetchEmails();
        });

        // Back to inbox
        document.getElementById('back-to-inbox').addEventListener('click', () => {
            this.switchView('inbox');
        });

        // Compose form
        document.getElementById('compose-form').addEventListener('submit', (e) => {
            e.preventDefault();
            this.sendEmail();
        });

        // Clear form
        document.getElementById('clear-form').addEventListener('click', () => {
            this.clearComposeForm();
        });

        // Demo mode
        document.getElementById('enable-demo').addEventListener('click', () => {
            this.enableDemoMode();
        });

        // Settings
        document.getElementById('demo-mode-toggle').addEventListener('change', (e) => {
            this.toggleDemoMode(e.target.checked);
        });
    }

    switchView(viewName) {
        // Update navigation
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.remove('active');
        });
        
        if (viewName !== 'email-detail') {
            document.querySelector(`[data-view="${viewName}"]`).classList.add('active');
        }

        // Update content
        document.querySelectorAll('.view').forEach(view => {
            view.classList.remove('active');
        });
        
        if (viewName === 'email-detail') {
            document.getElementById('email-detail-view').classList.add('active');
        } else {
            document.getElementById(`${viewName}-view`).classList.add('active');
        }

        this.currentView = viewName;

        // Load view-specific data
        if (viewName === 'inbox') {
            this.fetchEmails();
        } else if (viewName === 'sent') {
            this.loadSentEmails();
        }
    }

    async checkQKDStatus() {
        try {
            const response = await fetch('http://localhost:3001/api/v1/status');
            if (response.ok) {
                const data = await response.json();
                this.updateQKDStatus(true, data.keysAvailable);
            } else {
                this.updateQKDStatus(false, 0);
            }
        } catch (error) {
            this.updateQKDStatus(false, 0);
        }
    }

    updateQKDStatus(active, keysAvailable = 0) {
        const statusElement = document.getElementById('qkd-status');
        const indicator = statusElement.querySelector('.status-dot');
        const text = statusElement.querySelector('span');

        if (active) {
            statusElement.classList.add('active');
            text.textContent = `QKD Server (${keysAvailable} keys)`;
            this.qkdStatus = true;
        } else {
            statusElement.classList.remove('active');
            text.textContent = 'QKD Server';
            this.qkdStatus = false;
        }
    }

    updateAuthStatus(authenticated, userEmail = '') {
        const statusElement = document.getElementById('auth-status');
        const indicator = statusElement.querySelector('.status-dot');
        const text = statusElement.querySelector('span');
        const authBtn = document.getElementById('auth-btn');
        const authBtnEmpty = document.getElementById('auth-btn-empty');
        const switchAccountBtn = document.getElementById('switch-account-btn');
        const composeSubtitle = document.getElementById('compose-subtitle');

        if (authenticated) {
            statusElement.classList.add('active');
            text.textContent = userEmail || 'Connected';
            this.isAuthenticated = true;
            
            // Update compose subtitle
            if (composeSubtitle) {
                if (userEmail === 'demo@qumail.com') {
                    composeSubtitle.textContent = '⚠️ Demo Mode - Emails won\'t be sent to real addresses';
                    composeSubtitle.style.color = '#f59e0b';
                } else {
                    composeSubtitle.textContent = '✅ Connected to Gmail - Emails will be sent';
                    composeSubtitle.style.color = '#10b981';
                }
            }
            
            // Update button text to Logout
            if (authBtn) {
                authBtn.innerHTML = '<span>Logout</span>';
                authBtn.className = 'action-btn danger';
                authBtn.onclick = () => this.logoutGmail();
            }
            if (authBtnEmpty) {
                authBtnEmpty.textContent = 'Switch Account';
                authBtnEmpty.onclick = () => this.switchGmailAccount();
            }
            // Show change account button when authenticated (but not in demo mode)
            if (switchAccountBtn) {
                if (userEmail !== 'demo@qumail.com') {
                    switchAccountBtn.style.display = 'block';
                } else {
                    switchAccountBtn.style.display = 'none';
                }
            }
        } else {
            statusElement.classList.remove('active');
            text.textContent = 'Not Connected';
            this.isAuthenticated = false;
            
            // Update compose subtitle
            if (composeSubtitle) {
                composeSubtitle.textContent = '❌ Connect Gmail to send real emails';
                composeSubtitle.style.color = '#ef4444';
            }
            
            // Update button text to Connect Gmail
            if (authBtn) {
                authBtn.innerHTML = '<span>Connect Gmail</span>';
                authBtn.className = 'action-btn primary';
                authBtn.onclick = () => this.authenticateGmail();
            }
            if (authBtnEmpty) {
                authBtnEmpty.textContent = 'Connect Gmail Account';
                authBtnEmpty.onclick = () => this.authenticateGmail();
            }
            // Hide change account button when not authenticated
            if (switchAccountBtn) {
                switchAccountBtn.style.display = 'none';
            }
        }
    }

    async authenticateGmail() {
        this.showLoading('Authenticating with Gmail...');
        
        try {
            const result = await ipcRenderer.invoke('gmail-auth');
            if (result.success) {
                this.updateAuthStatus(true);
                this.showToast('Gmail authentication successful!', 'success');
                // Auto-switch to inbox and fetch emails
                this.switchView('inbox');
                setTimeout(() => {
                    this.fetchEmails();
                }, 500);
            } else {
                throw new Error(result.message || 'Authentication failed');
            }
        } catch (error) {
            console.error('Authentication error:', error);
            let errorMessage = 'Authentication failed';
            
            if (error.message.includes('credentials')) {
                errorMessage = 'Gmail credentials not configured. Please check your setup.';
            } else if (error.message.includes('network') || error.message.includes('timeout')) {
                errorMessage = 'Network error. Please check your internet connection.';
            } else if (error.message.includes('authorization')) {
                errorMessage = 'Authorization denied. Please try again.';
            } else {
                errorMessage = `Authentication failed: ${error.message}`;
            }
            
            this.showToast(errorMessage, 'error');
        } finally {
            this.hideLoading();
        }
    }

    async logoutGmail() {
        this.showLoading('Logging out...');
        
        try {
            await ipcRenderer.invoke('gmail-logout');
            this.updateAuthStatus(false);
            this.emails = [];
            this.displayEmails([]);
            this.showToast('Logged out successfully', 'success');
            this.switchView('inbox');
        } catch (error) {
            console.error('Logout error:', error);
            this.showToast('Logout failed: ' + error.message, 'error');
        } finally {
            this.hideLoading();
        }
    }

    async switchGmailAccount() {
        this.showLoading('Switching Gmail account...');
        
        try {
            // Force new authentication by setting environment variable
            await ipcRenderer.invoke('force-new-auth');
            this.updateAuthStatus(false);
            this.emails = [];
            this.displayEmails([]);
            
            // Wait a moment then start new authentication
            setTimeout(async () => {
                try {
                    const result = await ipcRenderer.invoke('gmail-auth');
                    if (result.success) {
                        this.updateAuthStatus(true);
                        this.showToast('✅ Account switched successfully!', 'success');
                        this.switchView('inbox');
                        setTimeout(() => {
                            this.fetchEmails();
                        }, 500);
                    }
                } catch (error) {
                    console.error('Account switch error:', error);
                    this.showToast('❌ Failed to switch account: ' + error.message, 'error');
                } finally {
                    this.hideLoading();
                }
            }, 1000);
        } catch (error) {
            console.error('Account switch error:', error);
            this.showToast('❌ Failed to switch account: ' + error.message, 'error');
            this.hideLoading();
        }
    }

    async fetchEmails() {
        if (!this.isAuthenticated && this.currentView === 'inbox') {
            this.showEmptyState('inbox', 'Please authenticate with Gmail first');
            return;
        }

        this.showLoading('Fetching emails...');
        
        try {
            const emails = await ipcRenderer.invoke('fetch-emails');
            this.emails = emails;
            this.displayEmails(emails);
            this.updateInboxCount(emails.length);
            
            if (emails.length === 0) {
                this.showEmptyState('inbox', 'No emails found');
            }
        } catch (error) {
            console.error('Fetch emails error:', error);
            let errorMessage = 'Failed to fetch emails';
            
            if (error.message.includes('Authentication expired') || error.message.includes('Invalid login')) {
                errorMessage = 'Gmail authentication expired. Please logout and reconnect.';
                this.updateAuthStatus(false);
            } else if (error.message.includes('network') || error.message.includes('timeout')) {
                errorMessage = 'Network error. Please check your internet connection.';
            } else {
                errorMessage = `Failed to fetch emails: ${error.message}`;
            }
            
            this.showToast('❌ ' + errorMessage, 'error');
            this.showEmptyState('inbox', errorMessage);
        } finally {
            this.hideLoading();
        }
    }

    displayEmails(emails) {
        const emailList = document.getElementById('email-list');
        
        if (emails.length === 0) {
            this.showEmptyState('inbox', 'No emails to display');
            return;
        }

        emailList.innerHTML = emails.map((email, index) => `
            <div class="email-item" 
                 data-email-index="${index}" 
                 role="button" 
                 tabindex="0"
                 aria-label="Email from ${this.escapeHtml(email.from)}: ${this.escapeHtml(email.subject)}"
                 onclick="window.quMailRenderer.openEmail(${index})"
                 onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();window.quMailRenderer.openEmail(${index})}">
                <div class="email-header">
                    <span class="email-from">${this.escapeHtml(email.from)}</span>
                    <span class="email-date">${this.formatDate(email.date)}</span>
                </div>
                <div class="email-subject">${this.escapeHtml(email.subject)}</div>
                <div class="email-snippet">${this.escapeHtml(email.snippet || email.body.substring(0, 150) + '...')}</div>
                ${email.encrypted ? `<span class="encryption-badge ${email.encryptionLevel}" aria-label="Encrypted with ${email.encryptionLevel}">
                    🔒 ${email.encryptionLevel.toUpperCase()} Encrypted
                </span>` : ''}
            </div>
        `).join('');
    }

    openEmail(emailIndex) {
        const email = this.emails[emailIndex];
        if (!email) return;

        this.selectedEmail = email;
        
        // Populate email detail view
        document.getElementById('email-detail-subject').textContent = email.subject;
        document.getElementById('email-detail-from-text').textContent = email.from;
        document.getElementById('email-detail-date-text').textContent = this.formatFullDate(email.date);
        document.getElementById('email-detail-body').innerHTML = this.formatEmailBody(email.body);
        
        // Show encryption badge if encrypted
        const encryptionDiv = document.getElementById('email-detail-encryption');
        if (email.encrypted) {
            encryptionDiv.innerHTML = `
                <span class="encryption-badge ${email.encryptionLevel}">
                    🔒 ${email.encryptionLevel.toUpperCase()} Encrypted
                </span>
            `;
        } else {
            encryptionDiv.innerHTML = '';
        }
        
        // Switch to detail view
        this.switchView('email-detail');
    }

    formatEmailBody(body) {
        // Convert line breaks to HTML and escape HTML
        return this.escapeHtml(body).replace(/\n/g, '<br>');
    }

    formatFullDate(date) {
        const d = new Date(date);
        return d.toLocaleString();
    }

    async sendEmail() {
        const form = document.getElementById('compose-form');
        const formData = new FormData(form);
        
        const emailData = {
            to: formData.get('to'),
            subject: formData.get('subject'),
            body: formData.get('body'),
            encryptionLevel: formData.get('encryptionLevel'),
            attachments: []
        };

        if (!emailData.to || !emailData.subject || !emailData.body) {
            this.showToast('? Please fill in all required fields', 'error');
            return;
        }

        this.showLoading('Sending email...');
        
        try {
            const result = await ipcRenderer.invoke('send-email', emailData);
            if (result.success) {
                this.showToast('✅ Email sent successfully via Gmail API!', 'success');
                
                // Show decryption info if encrypted
                if (emailData.encryptionLevel !== 'plain' && result.decryptionInfo) {
                    setTimeout(() => {
                        this.showDecryptionInfo(result.decryptionInfo, emailData.to);
                    }, 1000);
                }
                
                // Add to sent emails list only if actually sent
                this.sentEmails.unshift({
                    id: result.messageId || `sent-${Date.now()}`,
                    to: emailData.to,
                    subject: emailData.subject,
                    body: emailData.body,
                    date: new Date(),
                    encrypted: emailData.encryptionLevel !== 'plain',
                    encryptionLevel: emailData.encryptionLevel,
                    decryptionInfo: result.decryptionInfo
                });
                this.clearComposeForm();
                this.switchView('sent');
                this.loadSentEmails();
            } else {
                throw new Error(result.message || 'Failed to send email');
            }
        } catch (error) {
            console.error('Send email error:', error);
            let errorMessage = 'Failed to send email';
            
            if (error.message.includes('Authentication expired') || error.message.includes('Invalid login')) {
                errorMessage = 'Gmail authentication expired. Please logout and reconnect to send emails.';
                this.updateAuthStatus(false);
            } else if (error.message.includes('transporter not initialized')) {
                errorMessage = 'Please connect your Gmail account first to send emails.';
            } else {
                errorMessage = `Failed to send email: ${error.message}`;
            }
            
            this.showToast('❌ ' + errorMessage, 'error');
        } finally {
            this.hideLoading();
        }
    }

    clearComposeForm() {
        document.getElementById('compose-form').reset();
        document.getElementById('encryption-level').value = 'aes256';
    }

    async enableDemoMode() {
        this.showLoading('Enabling demo mode...');
        
        try {
            await this.updateSettings({ demo: { enabled: true, skipOAuth: true } });
            
            this.updateAuthStatus(true, 'demo@qumail.com');
            this.showToast('🚀 Demo mode enabled!', 'success');
            this.switchView('inbox');
            // Force fetch demo emails
            setTimeout(() => {
                this.fetchEmails();
            }, 500);
        } catch (error) {
            console.error('Demo mode error:', error);
            this.showToast('❌ Failed to enable demo mode', 'error');
        } finally {
            this.hideLoading();
        }
    }

    async toggleDemoMode(enabled) {
        try {
            await this.updateSettings({ demo: { enabled, skipOAuth: enabled } });
            this.showToast(enabled ? '? Demo mode enabled' : '? Demo mode disabled', 'success');
            
            if (!enabled) {
                this.updateAuthStatus(false);
                this.emails = [];
                this.displayEmails([]);
            }
        } catch (error) {
            console.error('Toggle demo mode error:', error);
            this.showToast('? Failed to update demo mode', 'error');
        }
    }

    async loadSettings() {
        try {
            const settings = await ipcRenderer.invoke('load-settings');
            
            if (settings.demo && settings.demo.enabled) {
                document.getElementById('demo-mode-toggle').checked = true;
                this.updateAuthStatus(true, 'demo@qumail.com');
            }
            
            if (settings.encryption && settings.encryption.defaultLevel) {
                document.getElementById('default-encryption').value = settings.encryption.defaultLevel;
                document.getElementById('encryption-level').value = settings.encryption.defaultLevel;
            }
        } catch (error) {
            console.error('Load settings error:', error);
        }
    }

    async updateSettings(newSettings) {
        try {
            const currentSettings = await ipcRenderer.invoke('load-settings');
            const updatedSettings = { ...currentSettings, ...newSettings };
            await ipcRenderer.invoke('save-settings', updatedSettings);
        } catch (error) {
            console.error('Update settings error:', error);
            throw error;
        }
    }

    loadSentEmails() {
        const sentList = document.getElementById('sent-list');
        
        if (this.sentEmails.length === 0) {
            sentList.innerHTML = `
                <div class="empty-state">
                    <span class="empty-icon">📤</span>
                    <p>Sent emails will appear here</p>
                </div>
            `;
            return;
        }

        sentList.innerHTML = this.sentEmails.map(email => `
            <div class="email-item">
                <div class="email-header">
                    <span class="email-from">To: ${this.escapeHtml(email.to)}</span>
                    <span class="email-date">${this.formatDate(email.date)}</span>
                </div>
                <div class="email-subject">${this.escapeHtml(email.subject)}</div>
                <div class="email-snippet">${this.escapeHtml(email.body.substring(0, 150) + '...')}</div>
                ${email.encrypted ? `<span class="encryption-badge ${email.encryptionLevel}">
                    🔒 ${email.encryptionLevel.toUpperCase()} Encrypted
                </span>` : ''}
            </div>
        `).join('');
    }

    updateInboxCount(count) {
        document.getElementById('inbox-count').textContent = count;
    }

    showEmptyState(view, message) {
        const container = view === 'inbox' ? 
            document.getElementById('email-list') : 
            document.getElementById('sent-list');
            
        container.innerHTML = `
            <div class="empty-state">
                <span class="empty-icon">${view === 'inbox' ? '📬' : '📤'}</span>
                <p>${message}</p>
            </div>
        `;
    }

    showLoading(message = 'Processing...') {
        const overlay = document.getElementById('loading-overlay');
        const text = overlay.querySelector('.loading-text');
        text.textContent = message;
        overlay.classList.add('active');
    }

    hideLoading() {
        document.getElementById('loading-overlay').classList.remove('active');
    }

    showToast(message, type = 'success') {
        const toast = document.getElementById('toast');
        const messageEl = toast.querySelector('.toast-message');
        
        const icons = {
            success: '✅',
            error: '❌',
            warning: '⚠️',
            info: 'ℹ️'
        };
        
        // Add icon to message
        const iconText = icons[type] || icons.info;
        messageEl.textContent = `${iconText} ${message}`;
        
        toast.className = `toast ${type}`;
        toast.classList.add('show');
        
        setTimeout(() => {
            toast.classList.remove('show');
        }, 4000);
    }

    formatDate(date) {
        const d = new Date(date);
        const now = new Date();
        const diff = now - d;
        
        if (diff < 24 * 60 * 60 * 1000) {
            return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        } else if (diff < 7 * 24 * 60 * 60 * 1000) {
            return d.toLocaleDateString([], { weekday: 'short' });
        } else {
            return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
        }
    }

    showDecryptionInfo(decryptionInfo, recipient) {
        const modal = document.createElement('div');
        modal.className = 'decryption-modal';
        modal.innerHTML = `
            <div class="decryption-content">
                <h3>🔐 Encrypted Email Sent!</h3>
                <p>Your encrypted email was sent to <strong>${this.escapeHtml(recipient)}</strong></p>
                <div class="decryption-details">
                    <h4>Decryption Information:</h4>
                    <div class="info-item">
                        <label>Encryption Level:</label>
                        <span class="encryption-badge ${decryptionInfo.level}">${decryptionInfo.level.toUpperCase()}</span>
                    </div>
                    <div class="info-item">
                        <label>Quantum Key ID:</label>
                        <code>${decryptionInfo.keyId}</code>
                    </div>
                    <div class="info-item">
                        <label>Decryption Key:</label>
                        <code class="decryption-key">${decryptionInfo.key}</code>
                        <button class="copy-btn" onclick="navigator.clipboard.writeText('${decryptionInfo.key}')">Copy</button>
                    </div>
                </div>
                <div class="share-instructions">
                    <h4>📱 Share with Recipient:</h4>
                    <p>Send this decryption information to your recipient through a secure channel:</p>
                    <textarea readonly class="share-text">Decryption Info for QuMail:
Key: ${decryptionInfo.key}
Level: ${decryptionInfo.level.toUpperCase()}
ID: ${decryptionInfo.keyId}</textarea>
                    <button class="copy-btn" onclick="navigator.clipboard.writeText(this.previousElementSibling.value)">Copy All</button>
                </div>
                <button class="close-btn" onclick="this.parentElement.parentElement.remove()">Close</button>
            </div>
        `;
        document.body.appendChild(modal);
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    console.log('[Renderer] DOM loaded, initializing QuMailRenderer...');
    try {
        window.quMailRenderer = new QuMailRenderer();
        console.log('[Renderer] QuMailRenderer initialized successfully');
    } catch (error) {
        console.error('[Renderer] Failed to initialize QuMailRenderer:', error);
    }
});

// Fallback initialization if DOMContentLoaded already fired
if (document.readyState === 'loading') {
    console.log('[Renderer] Document still loading, waiting for DOMContentLoaded...');
} else {
    console.log('[Renderer] Document already loaded, initializing immediately...');
    try {
        window.quMailRenderer = new QuMailRenderer();
        console.log('[Renderer] QuMailRenderer initialized successfully (immediate)');
    } catch (error) {
        console.error('[Renderer] Failed to initialize QuMailRenderer (immediate):', error);
    }
}
