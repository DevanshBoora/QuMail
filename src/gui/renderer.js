const { ipcRenderer } = require('electron');

class QuMailRenderer {
    constructor() {
        this.currentEmail = null;
        this.currentView = 'inbox';
        this.sentEmails = [];
        this.isAuthenticated = false;
        this.userEmail = '';
        this.quantumVisualizer = null;
        
        this.init();
    }

    init() {
        try {
            this.setupEventListeners();
            this.checkQKDStatus();
            this.loadSettings();
            
            // Initialize security indicator with default AES-256
            setTimeout(() => {
                this.updateSecurityIndicator('aes256');
            }, 100);
            
            // Auto-refresh QKD status every 30 seconds
            setInterval(() => this.checkQKDStatus(), 30000);
            
            // Hide loading overlay after initialization
            setTimeout(() => {
                this.hideLoading();
            }, 1000);
        } catch (error) {
            console.error('[Renderer] Initialization error:', error);
            // Ensure loading is hidden even on error
            setTimeout(() => {
                this.hideLoading();
            }, 2000);
        }
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
            this.fetchEmails(true); // Force refresh
        });

        // Back to inbox
        document.getElementById('back-to-inbox').addEventListener('click', () => {
            this.switchView('inbox');
        });

        // Decrypt email button
        document.getElementById('decrypt-email-btn').addEventListener('click', () => {
            this.decryptCurrentEmail();
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

        // Security level indicator
        document.getElementById('encryption-level').addEventListener('change', (e) => {
            this.updateSecurityIndicator(e.target.value);
        });

        // Decrypt form
        document.getElementById('decrypt-form').addEventListener('submit', (e) => {
            e.preventDefault();
            this.decryptMessage();
        });

        // Clear decrypt form
        document.getElementById('clear-decrypt-form').addEventListener('click', () => {
            this.clearDecryptForm();
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
        } else if (viewName === 'settings') {
            this.initializeQuantumVisualizer();
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
            
            // Clear current authentication status
            this.updateAuthStatus(false);
            
            // Clear emails
            this.emails = [];
            this.displayEmails([]);
            
            // Hide loading before starting new auth
            this.hideLoading();
            
            // Start new authentication (this will show its own loading)
            await this.authenticateGmail();
        } catch (error) {
            console.error('Switch account error:', error);
            this.showToast('❌ Failed to switch account', 'error');
            this.hideLoading();
        }
    }

    async fetchEmails(forceRefresh = false) {
        if (!this.isAuthenticated && this.currentView === 'inbox') {
            this.showEmptyState('inbox', 'Please authenticate with Gmail first');
            return;
        }

        this.showLoading(forceRefresh ? 'Refreshing emails...' : 'Fetching emails...');
        
        try {
            const emails = await ipcRenderer.invoke('fetch-emails', forceRefresh);
            this.emails = emails;
            this.displayEmails(emails);
            this.updateInboxCount(emails.length);
            
            if (emails.length === 0) {
                this.showEmptyState('inbox', 'No emails found');
            } else if (forceRefresh) {
                this.showToast('✅ Emails refreshed successfully', 'success');
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
                 aria-label="Email from ${this.escapeHtml(email.from)}: ${this.escapeHtml(this.formatEmailSubject(email.subject))}">
                <div class="email-header">
                    <span class="email-from">${this.escapeHtml(email.from)}</span>
                    <span class="email-date">${this.formatDate(email.date)}</span>
                </div>
                <div class="email-subject">${this.escapeHtml(this.formatEmailSubject(email.subject))}</div>
                <div class="email-snippet">${this.escapeHtml(email.snippet || email.body.substring(0, 150) + '...')}</div>
                ${email.encrypted ? `<span class="encryption-badge ${email.encryptionLevel}" aria-label="Encrypted with ${email.encryptionLevel}">
                    🔒 ${email.encryptionLevel.toUpperCase()} Encrypted
                </span>` : ''}
            </div>
        `).join('');

        // Add click event listeners to email items
        const emailItems = emailList.querySelectorAll('.email-item');
        emailItems.forEach((item, index) => {
            item.addEventListener('click', () => this.openEmail(index));
            item.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    this.openEmail(index);
                }
            });
        });
    }

    openEmail(emailIndex) {
        if (emailIndex < 0 || emailIndex >= this.emails.length) {
            this.showToast('❌ Email not found', 'error');
            return;
        }
        
        const email = this.emails[emailIndex];
        this.showEmailDetail(email);
    }

    showEmailDetail(email) {
        try {
            console.log('Opening email:', email);
            this.currentEmail = email; // Store current email for decryption
            
            // Safely set email details with fallbacks
            document.getElementById('email-detail-subject').textContent = this.formatEmailSubject(email.subject) || 'No Subject';
            document.getElementById('email-detail-from-text').textContent = email.from || 'Unknown Sender';
            document.getElementById('email-detail-date-text').textContent = this.formatFullDate(email.date) || 'Unknown Date';
            
            // Get full email content if we only have snippet
            if (email.snippet && !email.body) {
                this.fetchFullEmailContent(email.id);
            } else {
                document.getElementById('email-detail-body').innerHTML = this.formatEmailBody(email.body || email.snippet || 'No content available');
            }
            
            // Show/hide decrypt button based on encryption status
            const decryptBtn = document.getElementById('decrypt-email-btn');
            if (email.encrypted) {
                decryptBtn.style.display = 'block';
            } else {
                decryptBtn.style.display = 'none';
            }
            
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
        } catch (error) {
            console.error('Error showing email detail:', error);
            this.showToast('❌ Error opening email', 'error');
        }
    }

    async fetchFullEmailContent(emailId) {
        try {
            const fullEmail = await ipcRenderer.invoke('fetch-full-email', emailId);
            if (fullEmail && fullEmail.body) {
                document.getElementById('email-detail-body').innerHTML = this.formatEmailBody(fullEmail.body);
                // Update current email with full content
                this.currentEmail.body = fullEmail.body;
            }
        } catch (error) {
            console.error('Error fetching full email content:', error);
            document.getElementById('email-detail-body').innerHTML = '<p>Error loading email content</p>';
        }
    }

    async decryptCurrentEmail() {
        console.log('🔍 DECRYPTION STARTED - decryptCurrentEmail called');
        console.log('🔍 Current email:', this.currentEmail);
        
        if (!this.currentEmail || !this.currentEmail.encrypted) {
            console.log('❌ No encrypted email selected');
            this.showToast('❌ No encrypted email selected', 'error');
            return;
        }

        console.log('Current email for decryption:', this.currentEmail);

        // ALWAYS fetch full email content for decryption (metadata format doesn't include body)
        try {
            this.showLoading('Loading full email content...');
            console.log('🔍 Fetching full email content for ID:', this.currentEmail.id);
            
            // Send immediate test message to main process
            ipcRenderer.send('any-message', 'TEST', 'decryptCurrentEmail called', this.currentEmail.id);
            
            const fullEmail = await ipcRenderer.invoke('fetch-full-email', this.currentEmail.id);
            console.log('🔍 Received full email:', fullEmail ? 'YES' : 'NO');
            
            if (fullEmail && fullEmail.body) {
                console.log('🔍 Received full email body:', fullEmail.body);
                this.currentEmail.body = fullEmail.body;
            } else {
                console.log('🔍 No body in full email response');
            }
            this.hideLoading();
        } catch (error) {
            console.error('🔍 Error fetching full email content:', error);
            this.hideLoading();
        }

        // Extract encrypted data from email body
        let encryptedData = '';
        try {
            const emailBody = this.currentEmail.body || this.currentEmail.snippet || '';
            console.log('=== DETAILED EMAIL ANALYSIS ===');
            console.log('Email subject:', this.currentEmail.subject);
            console.log('Email body length:', emailBody.length);
            console.log('Email body content:', emailBody);
            console.log('Email snippet:', this.currentEmail.snippet);
            console.log('Full current email object:', this.currentEmail);
            console.log('=== END EMAIL ANALYSIS ===');

            // Send detailed logs to main process for terminal visibility
            ipcRenderer.send('log-email-analysis', {
                subject: this.currentEmail.subject,
                bodyLength: emailBody.length,
                bodyContent: emailBody,
                snippet: this.currentEmail.snippet,
                fullEmail: this.currentEmail
            });

            // Method 0: Extract from email body first (contains encrypted message content)
            // Look for encrypted JSON in email body - this should be the MESSAGE content
            console.log('Searching for encrypted message body in:', emailBody);
            
            // Try multiple patterns to find encrypted message body
            let bodyJsonMatch = null;
            
            // Pattern 1: Look for "Encrypted Message Body" section specifically (NEW PRIORITY)
            const messageBodyMatch = emailBody.match(/📝 Encrypted Message Body:[\s\S]*?<div[^>]*font-family:[^>]*monospace[^>]*>([^<]+)<\/div>/i);
            if (messageBodyMatch) {
                encryptedData = this.decodeHtmlEntities(messageBodyMatch[1].trim());
                console.log('Found encrypted MESSAGE BODY data (Message Body section):', encryptedData);
                ipcRenderer.send('log-extraction-method', 'MESSAGE_BODY_SECTION', encryptedData);
            }
            
            // Pattern 2: Look for JSON in any monospace div (fallback)
            if (!encryptedData) {
                const htmlMonospaceMatch = emailBody.match(/<div[^>]*font-family:[^>]*monospace[^>]*>([^<]+)<\/div>/i);
                if (htmlMonospaceMatch) {
                    encryptedData = this.decodeHtmlEntities(htmlMonospaceMatch[1].trim());
                    console.log('Found encrypted data (HTML monospace method):', encryptedData);
                    ipcRenderer.send('log-extraction-method', 'HTML_MONOSPACE', encryptedData);
                }
            }
            
            // Pattern 3: Look for JSON with "data" field (more likely to be message content)
            if (!encryptedData) {
                bodyJsonMatch = emailBody.match(/\{[^}]*"algorithm"[^}]*"data"[^}]*\}/g);
                if (bodyJsonMatch && bodyJsonMatch.length > 0) {
                    // If multiple matches, prefer the longer one (likely the message, not subject)
                    encryptedData = bodyJsonMatch.reduce((a, b) => a.length > b.length ? a : b);
                    console.log('Found encrypted MESSAGE data (Body JSON method):', encryptedData);
                    ipcRenderer.send('log-extraction-method', 'BODY_JSON_DATA', encryptedData);
                }
            }
            
            // Pattern 4: Look for JSON in general HTML content
            if (!encryptedData) {
                const htmlJsonMatch = emailBody.match(/<[^>]*>\s*(\{[^}]*"algorithm"[^}]*\})\s*<\/[^>]*>/);
                if (htmlJsonMatch) {
                    encryptedData = this.decodeHtmlEntities(htmlJsonMatch[1]);
                    console.log('Found encrypted data (HTML wrapped):', encryptedData);
                    ipcRenderer.send('log-extraction-method', 'HTML_WRAPPED', encryptedData);
                }
            }
            
            // Pattern 5: Look for the SECOND JSON occurrence (first might be subject, second might be message)
            if (!encryptedData) {
                const allJsonMatches = emailBody.match(/\{[^}]*"algorithm"[^}]*\}/g);
                if (allJsonMatches && allJsonMatches.length > 1) {
                    encryptedData = this.decodeHtmlEntities(allJsonMatches[1]); // Take the second match
                    console.log('Found encrypted data (Second JSON match - likely message):', encryptedData);
                    ipcRenderer.send('log-extraction-method', 'SECOND_JSON', encryptedData);
                }
            }
            
            // Method 0.5: If no body JSON found, try subject line (contains encrypted subject) - LAST RESORT
            if (!encryptedData && this.currentEmail.subject && this.currentEmail.subject.includes('{"algorithm"')) {
                const subjectMatch = this.currentEmail.subject.match(/\{[^}]*"algorithm"[^}]*\}/);
                if (subjectMatch) {
                    encryptedData = subjectMatch[0];
                    console.log('⚠️ FALLBACK TO SUBJECT - Found encrypted SUBJECT data (Subject method - fallback):', encryptedData);
                    console.log('⚠️ THIS MEANS WE COULD NOT FIND MESSAGE BODY DATA!');
                    ipcRenderer.send('log-extraction-method', 'SUBJECT_FALLBACK', encryptedData);
                }
            }
            
            // Final check - what did we extract?
            if (encryptedData) {
                console.log('🎯 FINAL EXTRACTED DATA:', encryptedData);
                console.log('🎯 DATA LENGTH:', encryptedData.length);
                ipcRenderer.send('log-final-extraction', encryptedData);
            } else {
                console.log('❌ NO ENCRYPTED DATA FOUND ANYWHERE!');
                ipcRenderer.send('log-extraction-method', 'NO_DATA_FOUND', null);
            }

            // Method 1: Extract from HTML monospace div (for HTML emails)
            if (!encryptedData) {
                let htmlMatch = emailBody.match(/<div[^>]*font-family[^>]*monospace[^>]*>([^<]+)<\/div>/i);
                if (htmlMatch) {
                    encryptedData = this.decodeHtmlEntities(htmlMatch[1].trim());
                    console.log('Found encrypted data (HTML method):', encryptedData);
                }
            }
            
            // Method 2: Look for JSON with algorithm field
            if (!encryptedData) {
                let jsonMatch = emailBody.match(/\{[^{}]*"algorithm"[^{}]*"[^"]*"[^{}]*\}/);
                if (jsonMatch) {
                    encryptedData = jsonMatch[0];
                    console.log('Found encrypted data (method 1):', encryptedData);
                }
            }
            
            // Method 3: Look for any JSON structure
            if (!encryptedData) {
                let jsonMatch = emailBody.match(/\{[^{}]*"data"[^{}]*\}/);
                if (jsonMatch) {
                    encryptedData = jsonMatch[0];
                    console.log('Found encrypted data (method 2):', encryptedData);
                }
            }
            
            // Method 4: If body starts with JSON
            if (!encryptedData && emailBody.trim().startsWith('{')) {
                try {
                    // Try to parse to validate it's JSON
                    JSON.parse(emailBody.trim());
                    encryptedData = emailBody.trim();
                    console.log('Found encrypted data (method 3):', encryptedData);
                } catch (parseError) {
                    console.log('Body starts with { but is not valid JSON');
                }
            }

            // Method 5: Look for base64-like data patterns
            if (!encryptedData) {
                const base64Match = emailBody.match(/[A-Za-z0-9+/]{50,}={0,2}/);
                if (base64Match) {
                    // Create a simple JSON structure for the base64 data
                    encryptedData = JSON.stringify({
                        algorithm: this.currentEmail.encryptionLevel || 'aes256',
                        data: base64Match[0],
                        timestamp: new Date().toISOString()
                    });
                    console.log('Found encrypted data (method 4):', encryptedData);
                }
            }

        } catch (error) {
            console.error('Error extracting encrypted data:', error);
        }

        if (!encryptedData) {
            console.error('No encrypted data found in email body:', this.currentEmail.body);
            this.showToast('❌ Could not extract encrypted data from email', 'error');
            return;
        }

        // Pre-fill decrypt form and switch to decrypt view
        this.switchView('decrypt');
        
        // Fill in the form fields
        document.getElementById('encrypted-text').value = encryptedData;
        
        // Set encryption level if available
        if (this.currentEmail.encryptionLevel) {
            const levelSelect = document.getElementById('decryption-level');
            levelSelect.value = this.currentEmail.encryptionLevel;
        }
        
        // Set key ID if available
        if (this.currentEmail.keyId) {
            document.getElementById('key-id').value = this.currentEmail.keyId;
        }

        this.showToast('📧 Email data loaded into decrypt form', 'success');
    }

    formatEmailBody(body) {
        // Check if this is a QuMail encrypted message
        if (this.isQuMailEncrypted(body)) {
            return this.formatEncryptedContent(body);
        }
        
        // Check if body contains HTML
        if (body.includes('<') && body.includes('>')) {
            // Clean and sanitize HTML content
            return this.sanitizeHtml(body);
        }
        
        // Plain text - convert line breaks to HTML and escape
        return this.escapeHtml(body).replace(/\n/g, '<br>');
    }

    isQuMailEncrypted(body) {
        return body.includes('"algorithm"') && 
               (body.includes('"data"') || body.includes('"entropy"')) &&
               body.includes('"timestamp"');
    }

    formatEncryptedContent(body) {
        try {
            // Extract the JSON encryption data
            let encryptionData = null;
            let algorithm = 'Unknown';
            let rawEncryptedData = '';
            
            // First try to get encrypted data from the email body (contains message content)
            let bodyJsonMatch = body.match(/\{[^}]*"algorithm"[^}]*"data"[^}]*\}/);
            if (bodyJsonMatch) {
                rawEncryptedData = bodyJsonMatch[0];
                try {
                    encryptionData = JSON.parse(rawEncryptedData);
                    console.log('Extracted encrypted data from body:', rawEncryptedData);
                } catch (e) {
                    console.log('Failed to parse body JSON:', e);
                }
            }
            
            // Fallback: try subject line (contains encrypted subject)
            if (!rawEncryptedData && this.currentEmail && this.currentEmail.subject && this.currentEmail.subject.includes('{"algorithm"')) {
                const subjectMatch = this.currentEmail.subject.match(/\{[^}]*"algorithm"[^}]*\}/);
                if (subjectMatch) {
                    rawEncryptedData = subjectMatch[0];
                    try {
                        encryptionData = JSON.parse(rawEncryptedData);
                        console.log('Extracted encrypted data from subject (fallback):', rawEncryptedData);
                    } catch (e) {
                        console.log('Failed to parse subject JSON:', e);
                    }
                }
            }
            
            // If not found in subject, try body parsing
            if (!rawEncryptedData) {
                // Try to parse JSON directly
                if (body.trim().startsWith('{')) {
                    encryptionData = JSON.parse(body.trim());
                    rawEncryptedData = body.trim();
                } else {
                    // Extract JSON from HTML content - look for the encrypted data div
                    const htmlMatch = body.match(/<div[^>]*font-family[^>]*monospace[^>]*>([^<]+)<\/div>/i);
                    if (htmlMatch) {
                        rawEncryptedData = this.decodeHtmlEntities(htmlMatch[1].trim());
                        try {
                            encryptionData = JSON.parse(rawEncryptedData);
                        } catch (e) {
                            console.log('Failed to parse extracted HTML JSON:', e);
                        }
                    }
                    
                    // Fallback: Extract JSON from mixed content
                    if (!rawEncryptedData) {
                        const jsonMatch = body.match(/\{[^}]*"algorithm"[^}]*\}/);
                        if (jsonMatch) {
                            encryptionData = JSON.parse(jsonMatch[0]);
                            rawEncryptedData = jsonMatch[0];
                        }
                    }
                    
                    // Another fallback: Look for any JSON-like structure
                    if (!rawEncryptedData) {
                        const jsonPattern = /\{[^{}]*"(?:algorithm|data|entropy)"[^{}]*\}/g;
                        const matches = body.match(jsonPattern);
                        if (matches && matches.length > 0) {
                            rawEncryptedData = matches[0];
                            try {
                                encryptionData = JSON.parse(rawEncryptedData);
                            } catch (e) {
                                console.log('Failed to parse fallback JSON:', e);
                            }
                        }
                    }
                }
            }
            
            if (encryptionData && encryptionData.algorithm) {
                algorithm = encryptionData.algorithm.toUpperCase();
            }
            
            // Create formatted display with copyable encrypted data
            return `
                <div class="encrypted-email-banner">
                    <div class="encryption-header">
                        <span class="encryption-icon">🔒</span>
                        <span class="encryption-title">Quantum-Safe Encrypted (${algorithm}) - QuMail</span>
                    </div>
                </div>
                <div class="encrypted-content-wrapper">
                    <div class="encryption-info">
                        <p><strong>Algorithm:</strong> ${algorithm}</p>
                        <p><strong>Timestamp:</strong> ${encryptionData.timestamp || 'Unknown'}</p>
                    </div>
                    <div class="encryption-data-section">
                        <div class="encryption-data-header">
                            <h4>Encrypted Message Data:</h4>
                            <button class="copy-btn" onclick="navigator.clipboard.writeText('${this.escapeHtml(rawEncryptedData)}').then(() => this.textContent = 'Copied!').catch(() => this.textContent = 'Copy Failed')">Copy</button>
                        </div>
                        <div class="encryption-data-container">
                            <textarea class="encryption-json" readonly>${this.escapeHtml(rawEncryptedData)}</textarea>
                        </div>
                    </div>
                    <div class="encryption-footer">
                        <p>📋 <strong>Copy the encrypted data above</strong> and paste it into the Decrypt tab to decrypt this message.</p>
                        <p>🔐 This message was encrypted using QuMail quantum-safe encryption technology.</p>
                    </div>
                </div>
            `;
        } catch (error) {
            // Fallback for malformed encrypted content
            return `
                <div class="encrypted-email-banner">
                    <div class="encryption-header">
                        <span class="encryption-icon">🔒</span>
                        <span class="encryption-title">Quantum-Safe Encrypted - QuMail</span>
                    </div>
                </div>
                <div class="encrypted-content-wrapper">
                    <div class="encryption-data-section">
                        <div class="encryption-data-header">
                            <h4>Encrypted Message Data:</h4>
                            <button class="copy-btn" onclick="navigator.clipboard.writeText('${this.escapeHtml(body)}').then(() => this.textContent = 'Copied!').catch(() => this.textContent = 'Copy Failed')">Copy</button>
                        </div>
                        <div class="encryption-data-container">
                            <textarea class="encryption-raw" readonly>${this.escapeHtml(body)}</textarea>
                        </div>
                    </div>
                    <div class="encryption-footer">
                        <p>📋 <strong>Copy the encrypted data above</strong> and paste it into the Decrypt tab.</p>
                        <p>🔐 This message was encrypted using QuMail quantum-safe encryption technology.</p>
                    </div>
                </div>
            `;
        }
    }

    sanitizeHtml(html) {
        // Basic HTML sanitization - remove script tags and dangerous attributes
        return html
            .replace(/<script[^>]*>.*?<\/script>/gi, '')
            .replace(/<iframe[^>]*>.*?<\/iframe>/gi, '')
            .replace(/on\w+\s*=\s*"[^"]*"/gi, '')
            .replace(/on\w+\s*=\s*'[^']*'/gi, '')
            .replace(/javascript:/gi, '');
    }

    formatEmailSubject(subject) {
        // Clean up encrypted email subjects
        if (subject.includes('[QuMail-Encrypted]')) {
            // Remove the prefix and any JSON-like content from the subject
            let cleanSubject = subject.replace('[QuMail-Encrypted]', '').trim();
            
            // Store the full subject with JSON for later extraction
            this.lastEncryptedSubject = subject;
            
            // If the subject contains JSON-like data, extract just the readable part
            if (cleanSubject.includes('{"algorithm"')) {
                // Try to extract any readable text before the JSON
                const jsonStart = cleanSubject.indexOf('{"algorithm"');
                if (jsonStart > 0) {
                    cleanSubject = cleanSubject.substring(0, jsonStart).trim();
                } else {
                    cleanSubject = 'Encrypted Message';
                }
            }
            
            return cleanSubject || 'Encrypted Message';
        }
        
        return subject;
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

        this.showLoading('Sending encrypted email...');
        
        // Trigger quantum key generation visualization if encrypted
        if (emailData.encryptionLevel !== 'plain') {
            this.triggerQuantumKeyGeneration();
        }
        
        try {
            const result = await ipcRenderer.invoke('send-email', emailData);
            if (result.success) {
                this.showToast('✅ Email sent successfully via Gmail API!', 'success');
                
                // Show decryption info if encrypted
                if (emailData.encryptionLevel !== 'plain' && result.decryptionInfo) {
                    setTimeout(() => {
                        this.showDecryptionInfo(result.decryptionInfo, emailData.to);
                    }, 500);
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
        this.updateSecurityIndicator('aes256');
    }

    updateSecurityIndicator(level) {
        const indicator = document.getElementById('security-indicator');
        const icon = document.getElementById('security-icon');
        const title = document.getElementById('security-title');
        const badge = document.getElementById('security-badge');
        const description = document.getElementById('security-description');
        const features = document.getElementById('security-features');
        const strengthText = document.getElementById('strength-text');

        if (!indicator) return;

        // Remove existing level classes
        indicator.classList.remove('plain', 'aes256', 'kyber', 'otp');
        indicator.classList.add(level);

        const securityLevels = {
            plain: {
                icon: '🔓',
                title: 'Plain Text',
                badge: 'None',
                description: 'Your message will be sent without encryption. Anyone can read it during transmission. Only use for non-sensitive information.',
                features: [
                    { icon: '⚠️', text: 'No encryption protection' },
                    { icon: '⚠️', text: 'Readable by anyone' },
                    { icon: '✓', text: 'Fastest transmission' }
                ],
                strength: 'None (0%)'
            },
            aes256: {
                icon: '🔒',
                title: 'AES-256 Encryption',
                badge: 'Standard',
                description: 'Your message will be encrypted using AES-256 algorithm, providing strong protection against conventional attacks. Suitable for most secure communications.',
                features: [
                    { icon: '✓', text: '256-bit encryption key' },
                    { icon: '✓', text: 'Industry standard security' },
                    { icon: '✓', text: 'Fast encryption/decryption' }
                ],
                strength: 'High (75%)'
            },
            kyber: {
                icon: '🛡️',
                title: 'Kyber Post-Quantum',
                badge: 'Future-Safe',
                description: 'Your message will be encrypted using Kyber post-quantum cryptography, providing protection against both classical and future quantum computer attacks.',
                features: [
                    { icon: '✓', text: 'Quantum-resistant algorithm' },
                    { icon: '✓', text: 'NIST standardized PQC' },
                    { icon: '✓', text: 'Future-proof security' }
                ],
                strength: 'Maximum (90%)'
            },
            otp: {
                icon: '🔐',
                title: 'One-Time Pad',
                badge: 'Maximum',
                description: 'Your message will be encrypted using quantum-generated one-time pad keys, providing theoretically unbreakable security. The highest level of protection available.',
                features: [
                    { icon: '✓', text: 'Theoretically unbreakable' },
                    { icon: '✓', text: 'Quantum-generated keys' },
                    { icon: '✓', text: 'Perfect secrecy guarantee' }
                ],
                strength: 'Perfect (100%)'
            }
        };

        const config = securityLevels[level];
        if (!config) return;

        // Update content
        icon.textContent = config.icon;
        title.textContent = config.title;
        badge.textContent = config.badge;
        description.textContent = config.description;
        strengthText.textContent = config.strength;

        // For compact version, we don't show features list
        // Just update the description with key info

        console.log(`[Security Indicator] Updated to ${level.toUpperCase()}`);
    }

    async decryptMessage() {
        const form = document.getElementById('decrypt-form');
        const formData = new FormData(form);
        
        const decryptionData = {
            encryptedText: formData.get('encryptedText'),
            key: formData.get('key'),
            encryptionLevel: formData.get('encryptionLevel'),
            keyId: formData.get('keyId') || null
        };

        if (!decryptionData.encryptedText || !decryptionData.key || !decryptionData.encryptionLevel) {
            this.showToast('❌ Please fill in all required fields', 'error');
            return;
        }

        this.showLoading('Decrypting message...');
        
        try {
            console.log('Sending decryption data:', decryptionData);
            const result = await ipcRenderer.invoke('decrypt-message', decryptionData);
            console.log('Received decryption result:', result);
            
            if (result.success) {
                this.showToast('✅ Message decrypted successfully!', 'success');
                console.log('About to display decrypted message:', result.decryptedText);
                
                // Force display the message even if it seems empty
                const messageToDisplay = result.decryptedText || 'No content received';
                console.log('Forcing display of:', messageToDisplay);
                this.displayDecryptedMessage(messageToDisplay, result.originalEncryption, result.keyId);
            } else {
                throw new Error(result.error || 'Failed to decrypt message');
            }
        } catch (error) {
            console.error('Decrypt message error:', error);
            let errorMessage = 'Failed to decrypt message';
            
            if (error.message.includes('Invalid key') || error.message.includes('decryption failed')) {
                errorMessage = 'Invalid decryption key or wrong encryption level. Please check your inputs.';
            } else if (error.message.includes('Missing required')) {
                errorMessage = 'Please fill in all required fields.';
            } else {
                errorMessage = `Decryption failed: ${error.message}`;
            }
            
            this.showToast('❌ ' + errorMessage, 'error');
        } finally {
            this.hideLoading();
        }
    }

    displayDecryptedMessage(decryptedText, encryptionLevel, keyId) {
        console.log('Displaying decrypted message:', decryptedText);
        console.log('Encryption level:', encryptionLevel);
        console.log('Key ID:', keyId);
        
        const outputDiv = document.getElementById('decrypted-output');
        
        // Ensure decryptedText is not empty or undefined
        const messageText = decryptedText || '[No decrypted content]';
        const safeMessageText = this.escapeHtml(messageText);
        
        console.log('Message text for display:', messageText);
        console.log('Safe message text:', safeMessageText);
        
        outputDiv.innerHTML = `
            <div class="decrypt-success-card">
                <!-- Success Header -->
                <div class="success-header">
                    <div class="success-icon">✅</div>
                    <h3>Decryption Successful!</h3>
                    <button class="copy-btn" onclick="navigator.clipboard.writeText('${messageText.replace(/'/g, "\\'")}'); this.textContent='Copied!'; setTimeout(() => this.textContent='Copy Message', 1500)">Copy Message</button>
                </div>
                
                <!-- Decrypted Message Display -->
                <div class="message-display-section">
                    <h4 class="section-title">🔓 Your Decrypted Message:</h4>
                    <div class="decrypted-text-box">
                        <div class="message-text">${safeMessageText}</div>
                    </div>
                </div>
                
                <!-- Technical Details -->
                <div class="tech-details">
                    <div class="detail-item">
                        <span class="detail-label">Encryption:</span>
                        <span class="detail-value encryption-${encryptionLevel || 'aes256'}">${(encryptionLevel || 'AES256').toUpperCase()}</span>
                    </div>
                    ${keyId ? `
                    <div class="detail-item">
                        <span class="detail-label">Key ID:</span>
                        <span class="detail-value key-id-text">${keyId}</span>
                    </div>
                    ` : ''}
                </div>
            </div>
        `;
        
        console.log('HTML inserted into output div');
        
        // Add smooth fade-in animation
        setTimeout(() => {
            const content = outputDiv.querySelector('.decrypt-success-card');
            if (content) {
                content.classList.add('fade-in');
                console.log('Fade-in animation triggered');
            }
        }, 50);
    }

    clearDecryptForm() {
        document.getElementById('decrypt-form').reset();
        document.getElementById('decryption-level').value = 'aes256';
        
        // Reset the output area
        const outputDiv = document.getElementById('decrypted-output');
        outputDiv.innerHTML = `
            <div class="output-placeholder">
                <div class="placeholder-icon">🔐</div>
                <p>Decrypted message will appear here</p>
            </div>
        `;
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

    initializeQuantumVisualizer() {
        if (!this.quantumVisualizer) {
            try {
                this.quantumVisualizer = new QuantumVisualizer('quantum-visualizer-container');
                console.log('[Renderer] Quantum Visualizer initialized');
                
                // Set initial security level based on current settings
                const defaultEncryption = document.getElementById('default-encryption').value;
                const securityLevel = this.mapEncryptionToSecurityLevel(defaultEncryption);
                this.quantumVisualizer.setSecurityLevel(securityLevel);
                
            } catch (error) {
                console.error('[Renderer] Failed to initialize Quantum Visualizer:', error);
            }
        }
    }

    mapEncryptionToSecurityLevel(encryption) {
        const mapping = {
            'plain': 'low',
            'aes256': 'medium',
            'kyber': 'high',
            'otp': 'maximum'
        };
        return mapping[encryption] || 'medium';
    }

    triggerQuantumKeyGeneration() {
        if (this.quantumVisualizer) {
            this.quantumVisualizer.triggerKeyGeneration();
        }
    }

    updateQuantumVisualizerSecurity(level) {
        if (this.quantumVisualizer) {
            this.quantumVisualizer.setSecurityLevel(level);
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
        
        // Auto-hide loading after 30 seconds to prevent stuck states
        if (this.loadingTimeout) {
            clearTimeout(this.loadingTimeout);
        }
        this.loadingTimeout = setTimeout(() => {
            this.hideLoading();
            console.warn('[Renderer] Loading timeout - auto-hiding loading overlay');
        }, 30000);
    }

    hideLoading() {
        document.getElementById('loading-overlay').classList.remove('active');
        if (this.loadingTimeout) {
            clearTimeout(this.loadingTimeout);
            this.loadingTimeout = null;
        }
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

    decodeHtmlEntities(text) {
        const div = document.createElement('div');
        div.innerHTML = text;
        return div.textContent || div.innerText || '';
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
