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

        // Smart encryption suggestions
        try {
            const subjectInput = document.getElementById('compose-subject');
            const bodyInput = document.getElementById('compose-body');
            const applyBtn = document.getElementById('apply-suggestion');
            const dismissBtn = document.getElementById('dismiss-suggestion');
            
            if (subjectInput && bodyInput) {
                console.log('[Renderer] Setting up smart encryption suggestions...');
                subjectInput.addEventListener('input', () => {
                    console.log('[Renderer] Subject input detected, analyzing...');
                    this.analyzeEmailContent();
                });
                bodyInput.addEventListener('input', () => {
                    console.log('[Renderer] Body input detected, analyzing...');
                    this.analyzeEmailContent();
                });
                
                if (applyBtn) {
                    applyBtn.addEventListener('click', () => {
                        this.applySuggestion();
                    });
                }
                
                if (dismissBtn) {
                    dismissBtn.addEventListener('click', () => {
                        this.dismissSuggestion();
                    });
                }
                
                console.log('[Renderer] Smart encryption suggestions initialized successfully');
                
                // Test the suggestions immediately
                setTimeout(() => {
                    console.log('[Renderer] Testing suggestions with sample content...');
                    subjectInput.value = 'bank account information';
                    bodyInput.value = 'confidential financial data';
                    this.analyzeEmailContent();
                }, 2000);
            } else {
                console.error('[Renderer] Could not find compose form elements for suggestions');
            }
        } catch (error) {
            console.error('[Renderer] Error setting up smart encryption suggestions:', error);
        }

        // Security level indicator
        document.getElementById('encryption-level').addEventListener('change', (e) => {
            this.updateSecurityIndicator(e.target.value);
        });

        // Attachment functionality
        this.setupAttachmentHandlers();

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
        console.log('📧 DISPLAY EMAILS CALLED with', emails.length, 'emails');
        const emailList = document.getElementById('email-list');
        
        if (!emailList) {
            console.log('❌ Email list element not found!');
            return;
        }
        
        if (emails.length === 0) {
            console.log('📧 No emails to display');
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
        console.log('📧 Setting up click handlers for', emailItems.length, 'email items');
        
        emailItems.forEach((item, index) => {
            item.addEventListener('click', () => {
                console.log('📧 EMAIL ITEM CLICKED! Index:', index);
                this.openEmail(index);
            });
            item.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    console.log('📧 EMAIL ITEM KEYBOARD ACTIVATED! Index:', index);
                    this.openEmail(index);
                }
            });
        });
    }

    openEmail(emailIndex) {
        console.log('🔥 OPEN EMAIL CALLED! Index:', emailIndex);
        console.log('🔥 Total emails:', this.emails.length);
        
        if (emailIndex < 0 || emailIndex >= this.emails.length) {
            console.log('❌ Email index out of range');
            this.showToast('❌ Email not found', 'error');
            return;
        }
        
        const email = this.emails[emailIndex];
        console.log('🔥 Opening email:', email);
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
            
            // Get full email content if we only have snippet OR if it's an encrypted email (to get attachment data)
            if ((email.snippet && !email.body) || email.encrypted) {
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
                        🔒 ${email.encryptionLevel?.toUpperCase()} Encrypted
                    </span>
                `;
            } else {
                encryptionDiv.innerHTML = '';
            }
            
            // Show attachments if available
            console.log('📧 ABOUT TO CALL displayEmailAttachments with email:', email);
            this.displayEmailAttachments(email);
            console.log('📧 FINISHED calling displayEmailAttachments');
            
            // Switch to detail view
            this.switchView('email-detail');
        } catch (error) {
            console.error('Error showing email detail:', error);
            this.showToast('❌ Error opening email', 'error');
        }
    }

    displayEmailAttachments(email) {
        console.log('🔍 DISPLAY EMAIL ATTACHMENTS CALLED');
        console.log('🔍 Email object:', email);
        console.log('🔍 Email.attachments:', email.attachments);
        console.log('🔍 Email.attachments length:', email.attachments ? email.attachments.length : 'undefined');
        
        // If no attachments in email object, try to parse from HTML body
        let attachments = email.attachments || [];
        if (attachments.length === 0 && email.body) {
            console.log('🔍 No attachments in email object, parsing from HTML body...');
            attachments = this.parseAttachmentsFromHTML(email.body);
            console.log('🔍 Parsed attachments from HTML:', attachments);
        }
        
        // Find or create attachments container
        let attachmentsContainer = document.getElementById('email-detail-attachments');
        if (!attachmentsContainer) {
            // Create attachments container dynamically
            const emailDetail = document.querySelector('.email-detail');
            if (emailDetail) {
                attachmentsContainer = document.createElement('div');
                attachmentsContainer.id = 'email-detail-attachments';
                attachmentsContainer.className = 'email-attachments';
                attachmentsContainer.style.display = 'none';
                emailDetail.appendChild(attachmentsContainer);
            }
        }
        
        if (!attachmentsContainer) return;
        
        // Check if we have attachments (from email object or parsed from HTML)
        if (attachments && attachments.length > 0) {
            console.log(`📎 DISPLAYING ${attachments.length} attachments for email`);
            console.log(`📎 Attachments:`, attachments);
            
            attachmentsContainer.style.display = 'block';
            attachmentsContainer.innerHTML = `
                <h4 class="section-title">📎 Attachments (${attachments.length})</h4>
                <div class="attachments-list">
                    ${attachments.map((att, index) => {
                        console.log(`📎 Creating download button for attachment ${index}:`, att);
                        return `
                        <div class="attachment-item">
                            <div class="attachment-info">
                                <div class="attachment-icon">${this.getFileIcon(att.mimeType || att.type)}</div>
                                <div class="attachment-details">
                                    <div class="attachment-name">${att.filename || att.name}</div>
                                    <div class="attachment-size">${this.formatFileSize(att.size)}</div>
                                </div>
                            </div>
                            <div class="attachment-actions">
                                <button class="download-btn" onclick="console.log('📎 DOWNLOAD BUTTON CLICKED!'); window.quMailRenderer.downloadAttachment(${index}, '${att.filename || att.name}', null, '${att.mimeType || att.type}', '${email.id}', '${att.attachmentId || 'html-parsed'}')">
                                    📥 Download
                                </button>
                            </div>
                        </div>
                        `;
                    }).join('')}
                </div>
            `;
        } else {
            attachmentsContainer.style.display = 'none';
        }
    }

    parseAttachmentsFromHTML(htmlBody) {
        console.log('🔍 Parsing attachments from HTML body...');
        console.log('🔍 HTML body length:', htmlBody.length);
        console.log('🔍 HTML body sample:', htmlBody.substring(0, 500));
        
        const attachments = [];
        
        try {
            // Look for attachment sections in the HTML - updated pattern
            const attachmentRegex = /<strong>([^<]+)<\/strong>\s*\(([^)]+)\)\s*-\s*([A-Z0-9]+)\s*Encrypted/gi;
            let match;
            
            console.log('🔍 Testing regex pattern...');
            const testMatches = htmlBody.match(attachmentRegex);
            console.log('🔍 Regex test matches:', testMatches);
            
            while ((match = attachmentRegex.exec(htmlBody)) !== null) {
                const [, filename, filesize, encryption] = match;
                console.log(`🔍 Found attachment in HTML: ${filename}, size: ${filesize}, encryption: ${encryption}`);
                
                // Parse file size to bytes (rough estimate)
                let sizeInBytes = 0;
                if (filesize.includes('KB')) {
                    sizeInBytes = parseFloat(filesize) * 1024;
                } else if (filesize.includes('MB')) {
                    sizeInBytes = parseFloat(filesize) * 1024 * 1024;
                } else if (filesize.includes('GB')) {
                    sizeInBytes = parseFloat(filesize) * 1024 * 1024 * 1024;
                } else {
                    sizeInBytes = parseFloat(filesize) || 0;
                }
                
                // Determine MIME type from file extension
                const extension = filename.toLowerCase().split('.').pop();
                let mimeType = 'application/octet-stream';
                switch (extension) {
                    case 'jpg': case 'jpeg': mimeType = 'image/jpeg'; break;
                    case 'png': mimeType = 'image/png'; break;
                    case 'gif': mimeType = 'image/gif'; break;
                    case 'pdf': mimeType = 'application/pdf'; break;
                    case 'txt': mimeType = 'text/plain'; break;
                    case 'doc': mimeType = 'application/msword'; break;
                    case 'docx': mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'; break;
                }
                
                attachments.push({
                    filename: filename,
                    name: filename,
                    size: Math.round(sizeInBytes),
                    mimeType: mimeType,
                    type: mimeType,
                    attachmentId: 'html-parsed-' + filename.replace(/[^a-zA-Z0-9]/g, '_'),
                    encrypted: true,
                    encryptionLevel: encryption.toLowerCase()
                });
            }
            
            console.log(`🔍 Parsed ${attachments.length} attachments from HTML`);
            return attachments;
        } catch (error) {
            console.error('🔍 Error parsing attachments from HTML:', error);
            return [];
        }
    }

    async fetchFullEmailContent(emailId) {
        try {
            const fullEmail = await ipcRenderer.invoke('fetch-full-email', emailId);
            if (fullEmail && fullEmail.body) {
                document.getElementById('email-detail-body').innerHTML = this.formatEmailBody(fullEmail.body);
                // Update current email with full content
                this.currentEmail.body = fullEmail.body;
                
                // Re-run attachment detection with full email body
                console.log('🔄 Re-running attachment detection with full email body...');
                console.log('🔄 Full email body length:', fullEmail.body.length);
                console.log('🔄 Full email body contains attachment section:', fullEmail.body.includes('📎 Quantum-Encrypted Attachments'));
                this.displayEmailAttachments(this.currentEmail);
                
                // Also update attachments display with full email data
                if (fullEmail.attachments) {
                    this.currentEmail.attachments = fullEmail.attachments;
                    this.displayEmailAttachments(this.currentEmail);
                }
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
            
            console.log('🔍 STARTING EXTRACTION PATTERNS - Looking for encrypted message body...');
            console.log('🔍 Email body contains "📝 Encrypted Message Body":', emailBody.includes('📝 Encrypted Message Body'));
            console.log('🔍 Email body contains "🏷️ Encrypted Subject":', emailBody.includes('🏷️ Encrypted Subject'));
            
            // Pattern 1: Look for "Encrypted Message Body" section specifically (HIGHEST PRIORITY)
            const messageBodyMatch = emailBody.match(/📝 Encrypted Message Body:[\s\S]*?<div[^>]*font-family:[^>]*Courier New[^>]*monospace[^>]*>([\s\S]*?)<\/div>/i);
            if (messageBodyMatch) {
                encryptedData = this.decodeHtmlEntities(messageBodyMatch[1].trim());
                console.log('✅ Found encrypted MESSAGE BODY data (Message Body section):', encryptedData);
                ipcRenderer.send('log-extraction-method', 'MESSAGE_BODY_SECTION', encryptedData);
            }
            
            // Pattern 1b: Alternative pattern for Message Body section
            if (!encryptedData) {
                const altMessageBodyMatch = emailBody.match(/📝 Encrypted Message Body:[\s\S]*?<div[^>]*>([\s\S]*?)<\/div>/i);
                if (altMessageBodyMatch) {
                    const content = altMessageBodyMatch[1].trim();
                    // Check if it looks like JSON
                    if (content.includes('"algorithm"') && content.includes('"data"')) {
                        encryptedData = this.decodeHtmlEntities(content);
                        console.log('✅ Found encrypted MESSAGE BODY data (Alt Message Body section):', encryptedData);
                        ipcRenderer.send('log-extraction-method', 'ALT_MESSAGE_BODY_SECTION', encryptedData);
                    }
                }
            }
            
            // Pattern 2: Look for JSON in blue border div (message body container)
            if (!encryptedData) {
                const blueBorderMatch = emailBody.match(/border:\s*1px\s+solid\s+#2196f3[^>]*>([\s\S]*?)<\/div>/i);
                if (blueBorderMatch) {
                    const content = blueBorderMatch[1].trim();
                    if (content.includes('"algorithm"') && content.includes('"data"')) {
                        encryptedData = this.decodeHtmlEntities(content);
                        console.log('✅ Found encrypted MESSAGE BODY data (Blue border div):', encryptedData);
                        ipcRenderer.send('log-extraction-method', 'BLUE_BORDER_DIV', encryptedData);
                    }
                }
            }
            
            // Pattern 2b: Look for JSON in any monospace div (fallback)
            if (!encryptedData) {
                const htmlMonospaceMatch = emailBody.match(/<div[^>]*font-family:[^>]*monospace[^>]*>([^<]+)<\/div>/i);
                if (htmlMonospaceMatch) {
                    encryptedData = this.decodeHtmlEntities(htmlMonospaceMatch[1].trim());
                    console.log('Found encrypted data (HTML monospace method):', encryptedData);
                    ipcRenderer.send('log-extraction-method', 'HTML_MONOSPACE', encryptedData);
                }
            }
            
            // Pattern 3: Look for JSON with "data" field, but exclude subject section
            if (!encryptedData) {
                bodyJsonMatch = emailBody.match(/\{[^}]*"algorithm"[^}]*"data"[^}]*\}/g);
                if (bodyJsonMatch && bodyJsonMatch.length > 0) {
                    // Filter out any matches that are in the subject section
                    const filteredMatches = bodyJsonMatch.filter(match => {
                        const matchIndex = emailBody.indexOf(match);
                        const beforeMatch = emailBody.substring(Math.max(0, matchIndex - 200), matchIndex);
                        // Exclude if it's in the subject section
                        return !beforeMatch.includes('🏷️ Encrypted Subject:');
                    });
                    
                    if (filteredMatches.length > 0) {
                        // If multiple matches, prefer the longer one (likely the message, not subject)
                        encryptedData = filteredMatches.reduce((a, b) => a.length > b.length ? a : b);
                        console.log('✅ Found encrypted MESSAGE data (Filtered Body JSON method):', encryptedData);
                        ipcRenderer.send('log-extraction-method', 'FILTERED_BODY_JSON_DATA', encryptedData);
                    }
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
            
            // Pattern 5: Look for JSON occurrences and pick the one NOT in subject section
            if (!encryptedData) {
                const allJsonMatches = emailBody.match(/\{[^}]*"algorithm"[^}]*\}/g);
                if (allJsonMatches && allJsonMatches.length > 0) {
                    // Find the JSON that's NOT in the subject section
                    for (let i = 0; i < allJsonMatches.length; i++) {
                        const match = allJsonMatches[i];
                        const matchIndex = emailBody.indexOf(match);
                        const beforeMatch = emailBody.substring(Math.max(0, matchIndex - 300), matchIndex);
                        const afterMatch = emailBody.substring(matchIndex, Math.min(emailBody.length, matchIndex + 300));
                        
                        // Prefer matches that are in the message body section or NOT in subject section
                        if (afterMatch.includes('📝 Encrypted Message Body') || 
                            beforeMatch.includes('📝 Encrypted Message Body') ||
                            !beforeMatch.includes('🏷️ Encrypted Subject')) {
                            encryptedData = this.decodeHtmlEntities(match);
                            console.log('✅ Found encrypted MESSAGE data (Smart JSON selection):', encryptedData);
                            ipcRenderer.send('log-extraction-method', 'SMART_JSON_SELECTION', encryptedData);
                            break;
                        }
                    }
                    
                    // If still no match, take the last one (likely the message body)
                    if (!encryptedData && allJsonMatches.length > 0) {
                        encryptedData = this.decodeHtmlEntities(allJsonMatches[allJsonMatches.length - 1]);
                        console.log('⚠️ Found encrypted data (Last JSON - fallback):', encryptedData);
                        ipcRenderer.send('log-extraction-method', 'LAST_JSON_FALLBACK', encryptedData);
                    }
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
                console.log('🎯 IS VALID JSON?', encryptedData.startsWith('{') && encryptedData.endsWith('}'));
                console.log('🎯 CONTAINS ALGORITHM?', encryptedData.includes('"algorithm"'));
                console.log('🎯 CONTAINS DATA FIELD?', encryptedData.includes('"data"'));
                ipcRenderer.send('log-final-extraction', encryptedData);
            } else {
                console.log('❌ NO ENCRYPTED DATA FOUND ANYWHERE!');
                console.log('❌ This means all extraction patterns failed!');
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
            attachments: this.attachedFiles || []
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
        // Clear attachments
        this.clearAttachments();
    }

    setupAttachmentHandlers() {
        this.attachedFiles = [];
        
        const fileInput = document.getElementById('file-input');
        const dropZone = document.getElementById('attachment-drop-zone');
        const browseBtn = document.getElementById('browse-files');

        // Browse files button
        browseBtn.addEventListener('click', () => {
            fileInput.click();
        });

        // File input change
        fileInput.addEventListener('change', (e) => {
            this.handleFiles(e.target.files);
        });

        // Drag and drop
        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropZone.classList.add('dragover');
        });

        dropZone.addEventListener('dragleave', (e) => {
            e.preventDefault();
            dropZone.classList.remove('dragover');
        });

        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.classList.remove('dragover');
            this.handleFiles(e.dataTransfer.files);
        });

        // Click on drop zone to browse
        dropZone.addEventListener('click', () => {
            fileInput.click();
        });
    }

    async handleFiles(files) {
        for (const file of Array.from(files)) {
            if (file.size > 25 * 1024 * 1024) { // 25MB limit
                this.showToast('File too large. Maximum size is 25MB.', 'error');
                continue;
            }
            
            try {
                // Convert file to base64 for IPC transmission
                const fileData = await this.fileToBase64(file);
                
                const fileObj = {
                    id: Date.now() + Math.random(),
                    name: file.name,
                    size: file.size,
                    type: file.type,
                    data: fileData // Base64 encoded data
                };
                
                this.attachedFiles.push(fileObj);
                this.renderAttachedFile(fileObj);
            } catch (error) {
                console.error('Error processing file:', error);
                this.showToast(`Error processing file: ${file.name}`, 'error');
            }
        }
        
        if (files.length > 0) {
            const encryptionLevel = document.getElementById('encryption-level').value;
            this.showToast(`📎 ${files.length} file(s) attached with ${encryptionLevel.toUpperCase()} quantum encryption`, 'success');
        }
    }

    fileToBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => {
                // Remove the data:mime/type;base64, prefix
                const base64 = reader.result.split(',')[1];
                resolve(base64);
            };
            reader.onerror = error => reject(error);
        });
    }

    renderAttachedFile(fileObj) {
        const attachedFilesContainer = document.getElementById('attached-files');
        
        const fileElement = document.createElement('div');
        fileElement.className = 'attached-file';
        fileElement.dataset.fileId = fileObj.id;
        
        const fileIcon = this.getFileIcon(fileObj.type);
        const fileSize = this.formatFileSize(fileObj.size);
        const encryptionLevel = document.getElementById('encryption-level').value;
        
        fileElement.innerHTML = `
            <div class="file-info">
                <div class="file-icon">${fileIcon}</div>
                <div class="file-details">
                    <div class="file-name">${fileObj.name}</div>
                    <div class="file-size">${fileSize}</div>
                </div>
            </div>
            <div class="file-encryption">
                <div class="encryption-badge">${encryptionLevel.toUpperCase()}</div>
                <button type="button" class="remove-file" onclick="window.quMailRenderer.removeFile('${fileObj.id}')">
                    ✕
                </button>
            </div>
        `;
        
        attachedFilesContainer.appendChild(fileElement);
    }

    removeFile(fileId) {
        this.attachedFiles = this.attachedFiles.filter(f => f.id != fileId);
        const fileElement = document.querySelector(`[data-file-id="${fileId}"]`);
        if (fileElement) {
            fileElement.remove();
        }
    }

    clearAttachments() {
        this.attachedFiles = [];
        const attachedFilesContainer = document.getElementById('attached-files');
        if (attachedFilesContainer) {
            attachedFilesContainer.innerHTML = '';
        }
    }

    getFileIcon(mimeType) {
        if (mimeType.startsWith('image/')) return '🖼️';
        if (mimeType.startsWith('video/')) return '🎥';
        if (mimeType.startsWith('audio/')) return '🎵';
        if (mimeType.includes('pdf')) return '📄';
        if (mimeType.includes('word') || mimeType.includes('document')) return '📝';
        if (mimeType.includes('excel') || mimeType.includes('spreadsheet')) return '📊';
        if (mimeType.includes('powerpoint') || mimeType.includes('presentation')) return '📈';
        if (mimeType.includes('zip') || mimeType.includes('archive')) return '📦';
        return '📎';
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    async downloadAttachment(index, filename, base64Data, mimeType, messageId, attachmentId) {
        console.log('🚀 DOWNLOAD ATTACHMENT FUNCTION CALLED!');
        console.log('🚀 Parameters:', { index, filename, base64Data: base64Data ? 'HAS_DATA' : 'NO_DATA', mimeType, messageId, attachmentId });
        
        try {
            let finalBase64Data = base64Data;
            
            // If we don't have base64Data but have messageId and attachmentId, download it
            if (!base64Data && messageId && attachmentId) {
                // Check if this is an HTML-parsed attachment (no real Gmail attachment ID)
                if (attachmentId.startsWith('html-parsed')) {
                    console.log(`⚠️ HTML-parsed attachment detected: ${filename}`);
                    console.log(`⚠️ This attachment was embedded in HTML and cannot be downloaded directly`);
                    console.log(`⚠️ The attachment may need to be decrypted from the email content`);
                    
                    // Create a demo file to show the functionality works
                    const demoContent = `This attachment (${filename}) was embedded in the email HTML content and cannot be downloaded directly.\n\nTo access this attachment, you may need to:\n1. Decrypt the email content\n2. Check if the attachment data is included in the decrypted content\n3. Or contact the sender to resend with proper attachment handling\n\nThis is a demonstration of QuMail's attachment detection capabilities.`;
                    finalBase64Data = btoa(demoContent);
                    console.log(`📝 Created demo content for HTML-parsed attachment`);
                } else {
                    console.log(`🔽 DOWNLOADING ATTACHMENT: ${filename} from Gmail API`);
                    console.log(`🔽 Message ID: ${messageId}`);
                    console.log(`🔽 Attachment ID: ${attachmentId}`);
                    this.showToast(`📥 Downloading: ${filename}...`, 'info');
                    
                    const result = await ipcRenderer.invoke('download-attachment', messageId, attachmentId);
                    console.log(`🔽 Download result:`, result);
                    
                    if (result.success) {
                        let attachmentData = result.data;
                        console.log(`✅ Successfully downloaded attachment data, length: ${attachmentData.length}`);
                        console.log(`✅ First 50 chars: ${attachmentData.substring(0, 50)}`);
                        console.log(`✅ Last 50 chars: ${attachmentData.substring(attachmentData.length - 50)}`);
                        
                        // Check if attachment is encrypted and we have decryption key
                        if (this.currentEmail && this.currentEmail.encrypted && this.lastDecryptionKey) {
                            console.log(`🔓 Attempting to decrypt attachment: ${filename}`);
                            try {
                                const decryptResult = await ipcRenderer.invoke('decrypt-attachment', 
                                    attachmentData, 
                                    this.lastDecryptionKey, 
                                    this.currentEmail.encryptionLevel || 'aes256'
                                );
                                
                                if (decryptResult.success) {
                                    attachmentData = decryptResult.data;
                                    console.log(`✅ Successfully decrypted attachment, length: ${attachmentData.length}`);
                                } else {
                                    console.warn(`⚠️ Failed to decrypt attachment: ${decryptResult.error}`);
                                    // Continue with encrypted data
                                }
                            } catch (decryptError) {
                                console.warn(`⚠️ Attachment decryption error: ${decryptError.message}`);
                                // Continue with encrypted data
                            }
                        }
                        
                        finalBase64Data = attachmentData;
                    } else {
                        console.error(`❌ Download failed:`, result.error);
                        throw new Error(result.error || 'Failed to download attachment');
                    }
                }
            }
            
            if (!finalBase64Data) {
                throw new Error('No attachment data available');
            }
            
            // Validate base64 data
            if (!/^[A-Za-z0-9+/]*={0,2}$/.test(finalBase64Data)) {
                console.error('Invalid base64 data detected');
                throw new Error('Invalid base64 data format');
            }
            
            // Log first few characters for debugging
            console.log(`Base64 data preview: ${finalBase64Data.substring(0, 100)}...`);
            
            // Improve MIME type detection based on filename if needed
            let finalMimeType = mimeType;
            if (!finalMimeType || finalMimeType === 'application/octet-stream') {
                const extension = filename.toLowerCase().split('.').pop();
                switch (extension) {
                    case 'png': finalMimeType = 'image/png'; break;
                    case 'jpg': case 'jpeg': finalMimeType = 'image/jpeg'; break;
                    case 'gif': finalMimeType = 'image/gif'; break;
                    case 'pdf': finalMimeType = 'application/pdf'; break;
                    case 'txt': finalMimeType = 'text/plain'; break;
                    case 'doc': finalMimeType = 'application/msword'; break;
                    case 'docx': finalMimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'; break;
                    default: finalMimeType = mimeType || 'application/octet-stream';
                }
                console.log(`Detected MIME type from extension: ${finalMimeType}`);
            }
            
            // Convert base64 to blob using more robust method
            console.log(`Converting base64 to blob for ${filename}`);
            console.log(`Base64 data length: ${finalBase64Data.length}`);
            console.log(`Final MIME type: ${finalMimeType}`);
            
            let blob;
            try {
                // Method 1: Use fetch with data URL (more reliable for binary data)
                console.log(`🔧 Creating blob using fetch method...`);
                const dataUrl = `data:${finalMimeType};base64,${finalBase64Data}`;
                console.log(`🔧 Data URL length: ${dataUrl.length}`);
                console.log(`🔧 Data URL preview: ${dataUrl.substring(0, 100)}...`);
                
                const response = await fetch(dataUrl);
                console.log(`🔧 Fetch response status: ${response.status}`);
                console.log(`🔧 Fetch response ok: ${response.ok}`);
                
                blob = await response.blob();
                console.log(`✅ Created blob using fetch method with size: ${blob.size} bytes, type: ${blob.type}`);
                
                // Test if blob is valid by reading first few bytes
                const testArrayBuffer = await blob.slice(0, 10).arrayBuffer();
                const testBytes = new Uint8Array(testArrayBuffer);
                console.log(`🔧 First 10 bytes of blob: [${Array.from(testBytes).join(', ')}]`);
                
            } catch (fetchError) {
                console.error('❌ Fetch method failed, falling back to manual conversion:', fetchError);
                
                // Method 2: Manual conversion (fallback)
                try {
                    const byteCharacters = atob(finalBase64Data);
                    console.log(`Decoded byte characters length: ${byteCharacters.length}`);
                    
                    const byteNumbers = new Array(byteCharacters.length);
                    for (let i = 0; i < byteCharacters.length; i++) {
                        byteNumbers[i] = byteCharacters.charCodeAt(i);
                    }
                    const byteArray = new Uint8Array(byteNumbers);
                    blob = new Blob([byteArray], { type: finalMimeType });
                    console.log(`Created blob using manual method with size: ${blob.size} bytes, type: ${blob.type}`);
                } catch (manualError) {
                    console.error('Manual conversion also failed:', manualError);
                    throw new Error(`Failed to convert base64 data: ${manualError.message}`);
                }
            }

            // Create download link
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            this.showToast(`📥 Downloaded: ${filename}`, 'success');
        } catch (error) {
            console.error('Download error:', error);
            this.showToast(`❌ Failed to download: ${filename}`, 'error');
        }
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
            keyId: formData.get('keyId') || null,
            emailData: this.currentEmail // Pass current email data including attachments
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
                
                // Store the decryption key for attachment decryption
                if (decryptionData.key) {
                    this.lastDecryptionKey = decryptionData.key;
                    console.log('🔑 Stored decryption key for attachment decryption');
                }
                
                // Force display the message even if it seems empty
                const messageToDisplay = result.decryptedText || 'No content received';
                console.log('Forcing display of:', messageToDisplay);
                this.displayDecryptedMessage(messageToDisplay, result.originalEncryption, result.keyId, result.attachments);
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

    displayDecryptedMessage(decryptedText, encryptionLevel, keyId, attachments = []) {
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
                
                <!-- Decrypted Attachments -->
                ${attachments && attachments.length > 0 ? `
                <div class="attachments-section">
                    <h4 class="section-title">📎 Decrypted Attachments (${attachments.length}):</h4>
                    <div class="attachments-list">
                        ${attachments.map((att, index) => `
                            <div class="attachment-item">
                                <div class="attachment-info">
                                    <div class="attachment-icon">${this.getFileIcon(att.type)}</div>
                                    <div class="attachment-details">
                                        <div class="attachment-name">${att.name}</div>
                                        <div class="attachment-size">${this.formatFileSize(att.size)}</div>
                                    </div>
                                </div>
                                <div class="attachment-actions">
                                    <button class="download-btn" onclick="window.quMailRenderer.downloadAttachment(${index}, '${att.name}', '${att.data}', '${att.type}', '${att.messageId}', '${att.attachmentId}')">
                                        📥 Download
                                    </button>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
                ` : ''}
                
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

    // Smart Encryption Suggestion System
    analyzeEmailContent() {
        console.log('[Suggestions] analyzeEmailContent called');
        const subjectEl = document.getElementById('compose-subject');
        const bodyEl = document.getElementById('compose-body');
        
        if (!subjectEl || !bodyEl) {
            console.error('[Suggestions] Could not find compose form elements');
            return;
        }
        
        const subject = subjectEl.value;
        const body = bodyEl.value;
        const attachments = this.attachments || [];
        
        console.log('[Suggestions] Content:', { subject, body: body.substring(0, 50) + '...', attachmentCount: attachments.length });
        
        // Debounce the analysis to avoid too frequent calls
        clearTimeout(this.analysisTimeout);
        this.analysisTimeout = setTimeout(() => {
            console.log('[Suggestions] Performing analysis...');
            this.performContentAnalysis(subject, body, attachments);
        }, 500);
    }

    performContentAnalysis(subject, body, attachments) {
        console.log('[Suggestions] performContentAnalysis called');
        const analysis = this.analyzeSecurityNeeds(subject, body, attachments);
        const currentLevel = document.getElementById('encryption-level').value;
        
        console.log('[Suggestions] Analysis result:', {
            recommendedLevel: analysis.recommendedLevel,
            currentLevel: currentLevel,
            confidence: analysis.confidence,
            reasons: analysis.reasons,
            riskLevel: analysis.riskLevel
        });
        
        if (analysis.recommendedLevel !== currentLevel && analysis.confidence > 0.3) {
            console.log('[Suggestions] Showing suggestion');
            this.showEncryptionSuggestion(analysis);
        } else {
            console.log('[Suggestions] Hiding suggestion - no change needed or low confidence');
            this.hideSuggestion();
        }
    }

    analyzeSecurityNeeds(subject, body, attachments) {
        const content = (subject + ' ' + body).toLowerCase();
        let score = 0;
        let reasons = [];
        let recommendedLevel = 'aes256';

        // Financial keywords - Comprehensive banking, payment, and financial data
        const financialKeywords = [
            'bank', 'banking', 'credit card', 'debit card', 'payment', 'invoice', 'salary', 'financial', 'money', 'transaction', 'account number', 'ssn', 'social security',
            'routing number', 'iban', 'swift code', 'wire transfer', 'bitcoin', 'cryptocurrency', 'wallet', 'tax', 'irs', 'audit', 'budget', 'loan', 'mortgage', 'investment',
            'portfolio', 'stock', 'bond', 'dividend', 'interest rate', 'credit score', 'debt', 'bankruptcy', 'insurance', 'premium', 'claim', 'beneficiary', 'pension',
            'retirement', '401k', 'ira', 'payroll', 'w2', 'w4', '1099', 'receipt', 'expense', 'reimbursement', 'cash flow', 'revenue', 'profit', 'loss', 'balance sheet'
        ];
        if (financialKeywords.some(keyword => content.includes(keyword))) {
            score += 0.8;
            reasons.push('Contains financial information');
            recommendedLevel = 'kyber';
        }

        // Personal information - PII, credentials, and sensitive personal data
        const personalKeywords = [
            'password', 'confidential', 'private', 'personal', 'address', 'phone number', 'date of birth', 'medical', 'health', 'ssn', 'social security number',
            'driver license', 'passport', 'visa', 'green card', 'birth certificate', 'maiden name', 'security question', 'pin', 'access code', 'login', 'username',
            'email password', 'wifi password', 'secret', 'sensitive', 'restricted', 'family', 'relationship', 'divorce', 'custody', 'adoption', 'inheritance',
            'will', 'testament', 'emergency contact', 'next of kin', 'biometric', 'fingerprint', 'dna', 'genetic', 'ancestry', 'background check', 'criminal record',
            'credit report', 'identity', 'identity theft', 'fraud', 'scam', 'phishing', 'stalking', 'harassment', 'domestic', 'abuse', 'victim', 'witness'
        ];
        if (personalKeywords.some(keyword => content.includes(keyword))) {
            score += 0.7;
            reasons.push('Contains personal information');
            if (recommendedLevel === 'aes256') recommendedLevel = 'kyber';
        }

        // Legal/Business sensitive - Contracts, IP, corporate secrets, litigation
        const legalKeywords = [
            'contract', 'agreement', 'legal', 'lawsuit', 'settlement', 'nda', 'proprietary', 'trade secret', 'merger', 'acquisition', 'non-disclosure',
            'confidentiality agreement', 'licensing', 'patent', 'trademark', 'copyright', 'intellectual property', 'ip', 'litigation', 'arbitration', 'mediation',
            'court', 'judge', 'jury', 'attorney', 'lawyer', 'counsel', 'legal advice', 'subpoena', 'deposition', 'discovery', 'evidence', 'testimony',
            'plea', 'verdict', 'damages', 'injunction', 'restraining order', 'cease and desist', 'compliance', 'violation', 'breach', 'default',
            'due diligence', 'corporate governance', 'board meeting', 'shareholder', 'stakeholder', 'fiduciary', 'insider trading', 'sec filing',
            'regulatory', 'antitrust', 'monopoly', 'cartel', 'price fixing', 'bid rigging', 'embezzlement', 'fraud', 'money laundering', 'bribery',
            'corruption', 'whistleblower', 'ethics violation', 'conflict of interest', 'insider information', 'material non-public', 'tender offer'
        ];
        if (legalKeywords.some(keyword => content.includes(keyword))) {
            score += 0.9;
            reasons.push('Contains legal or business-sensitive content');
            recommendedLevel = 'otp';
        }

        // Government/Security - Military, intelligence, classified information
        const securityKeywords = [
            'classified', 'top secret', 'government', 'security clearance', 'national security', 'intelligence', 'secret', 'confidential', 'restricted',
            'military', 'defense', 'pentagon', 'cia', 'fbi', 'nsa', 'homeland security', 'dhs', 'state department', 'diplomatic', 'embassy', 'consulate',
            'foreign affairs', 'espionage', 'spy', 'surveillance', 'wiretap', 'covert', 'undercover', 'black ops', 'special forces', 'navy seals',
            'delta force', 'green beret', 'ranger', 'marine', 'army', 'navy', 'air force', 'coast guard', 'national guard', 'reserve',
            'weapons', 'nuclear', 'chemical', 'biological', 'warfare', 'missile', 'drone', 'satellite', 'radar', 'sonar', 'encryption key',
            'cyber warfare', 'hacking', 'malware', 'virus', 'trojan', 'backdoor', 'zero day', 'exploit', 'vulnerability', 'breach',
            'terrorism', 'terrorist', 'threat', 'attack', 'bombing', 'assassination', 'kidnapping', 'hostage', 'ransom', 'extortion',
            'sanctions', 'embargo', 'export control', 'itar', 'munitions list', 'dual use', 'proliferation', 'wmd', 'mass destruction'
        ];
        if (securityKeywords.some(keyword => content.includes(keyword))) {
            score += 1.0;
            reasons.push('Contains security-sensitive information');
            recommendedLevel = 'otp';
        }

        // Medical information - HIPAA protected health information
        const medicalKeywords = [
            'diagnosis', 'treatment', 'medical record', 'patient', 'hipaa', 'prescription', 'therapy', 'doctor', 'physician', 'nurse', 'hospital',
            'clinic', 'surgery', 'operation', 'procedure', 'medication', 'drug', 'pharmaceutical', 'vaccine', 'immunization', 'allergy',
            'symptom', 'condition', 'disease', 'illness', 'infection', 'virus', 'bacteria', 'cancer', 'tumor', 'malignant', 'benign',
            'chemotherapy', 'radiation', 'biopsy', 'lab results', 'blood test', 'urine test', 'x-ray', 'mri', 'ct scan', 'ultrasound',
            'ekg', 'ecg', 'eeg', 'blood pressure', 'heart rate', 'pulse', 'temperature', 'weight', 'height', 'bmi', 'cholesterol',
            'glucose', 'diabetes', 'insulin', 'hypertension', 'depression', 'anxiety', 'ptsd', 'mental health', 'psychiatric', 'psychology',
            'counseling', 'rehab', 'rehabilitation', 'physical therapy', 'occupational therapy', 'speech therapy', 'addiction', 'substance abuse',
            'medical history', 'family history', 'genetic testing', 'dna test', 'blood type', 'organ donor', 'transplant', 'prosthetic',
            'disability', 'handicap', 'wheelchair', 'crutches', 'hearing aid', 'pacemaker', 'implant', 'medical device', 'life support'
        ];
        if (medicalKeywords.some(keyword => content.includes(keyword))) {
            score += 0.8;
            reasons.push('Contains medical information (HIPAA protected)');
            recommendedLevel = 'kyber';
        }

        // Attachment analysis - Enhanced file type detection
        if (attachments.length > 0) {
            const sensitiveExtensions = [
                '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.zip', '.rar', '.7z', '.tar', '.gz',
                '.p7s', '.p7m', '.pfx', '.p12', '.key', '.pem', '.crt', '.cer', '.der', '.jks', '.keystore',
                '.sql', '.db', '.sqlite', '.mdb', '.accdb', '.csv', '.xml', '.json', '.config', '.ini',
                '.backup', '.bak', '.old', '.tmp', '.log', '.dump', '.dmp', '.iso', '.img', '.vmdk'
            ];
            const hasSensitiveFiles = attachments.some(att => 
                sensitiveExtensions.some(ext => att.name.toLowerCase().endsWith(ext))
            );
            
            if (hasSensitiveFiles) {
                score += 0.3;
                reasons.push('Contains document attachments');
            }

            if (attachments.length > 3) {
                score += 0.2;
                reasons.push('Multiple attachments detected');
            }

            // Check for highly sensitive file patterns
            const criticalFiles = attachments.some(att => {
                const name = att.name.toLowerCase();
                return name.includes('password') || name.includes('key') || name.includes('secret') || 
                       name.includes('confidential') || name.includes('private') || name.includes('backup') ||
                       name.includes('database') || name.includes('config') || name.includes('credential');
            });
            
            if (criticalFiles) {
                score += 0.5;
                reasons.push('Contains potentially sensitive files');
                if (recommendedLevel === 'aes256') recommendedLevel = 'kyber';
            }
        }

        // Email domain analysis - Expanded business and government domains
        const recipient = document.getElementById('compose-to').value;
        if (recipient) {
            const domain = recipient.split('@')[1];
            const businessDomains = [
                '.gov', '.mil', '.edu', '.org', 'corp.com', 'company.com', 'enterprise', 'corporate',
                'government', 'federal', 'state', 'county', 'city', 'municipal', 'agency', 'department',
                'pentagon', 'whitehouse', 'congress', 'senate', 'house', 'court', 'justice', 'treasury',
                'defense', 'homeland', 'state.gov', 'fbi.gov', 'cia.gov', 'nsa.gov', 'dhs.gov'
            ];
            if (businessDomains.some(d => domain && domain.includes(d))) {
                score += 0.3;
                reasons.push('Sending to business/government domain');
            }
        }

        // Urgency keywords - Expanded time-sensitive indicators
        const urgencyKeywords = [
            'urgent', 'asap', 'immediate', 'emergency', 'deadline', 'time-sensitive', 'rush', 'priority',
            'critical', 'breaking', 'alert', 'warning', 'notice', 'announcement', 'bulletin', 'flash',
            'expires', 'expiring', 'due date', 'overdue', 'final notice', 'last chance', 'limited time',
            'act now', 'respond immediately', 'time limit', 'countdown', 'hurry', 'fast track', 'expedite'
        ];
        if (urgencyKeywords.some(keyword => content.includes(keyword))) {
            score += 0.2;
            reasons.push('Time-sensitive content detected');
        }

        // Technology/IT Security keywords - Additional category for tech-related sensitive content
        const techKeywords = [
            'server', 'database', 'backup', 'restore', 'admin', 'administrator', 'root', 'sudo', 'ssh', 'ftp',
            'api key', 'access token', 'oauth', 'jwt', 'certificate', 'ssl', 'tls', 'vpn', 'firewall',
            'vulnerability', 'patch', 'update', 'security hole', 'exploit', 'zero-day', 'malware', 'ransomware',
            'phishing', 'ddos', 'botnet', 'trojan', 'keylogger', 'spyware', 'adware', 'rootkit', 'backdoor',
            'source code', 'repository', 'git', 'github', 'gitlab', 'bitbucket', 'deployment', 'production',
            'staging', 'development', 'test environment', 'configuration', 'environment variable', 'secret key'
        ];
        if (techKeywords.some(keyword => content.includes(keyword))) {
            score += 0.6;
            reasons.push('Contains technical/IT security information');
            if (recommendedLevel === 'aes256') recommendedLevel = 'kyber';
        }

        // Research/Academic sensitive keywords
        const researchKeywords = [
            'research', 'study', 'experiment', 'clinical trial', 'data', 'dataset', 'analysis', 'results',
            'findings', 'publication', 'manuscript', 'peer review', 'grant', 'funding', 'proposal',
            'intellectual property', 'invention', 'discovery', 'breakthrough', 'innovation', 'prototype',
            'formula', 'algorithm', 'methodology', 'procedure', 'protocol', 'specimen', 'sample'
        ];
        if (researchKeywords.some(keyword => content.includes(keyword))) {
            score += 0.4;
            reasons.push('Contains research/academic content');
        }

        return {
            score: Math.min(score, 1.0),
            confidence: Math.min(score, 1.0),
            recommendedLevel,
            reasons,
            riskLevel: score > 0.8 ? 'high' : score > 0.5 ? 'medium' : 'low'
        };
    }

    showEncryptionSuggestion(analysis) {
        console.log('[Suggestions] showEncryptionSuggestion called');
        const suggestionsDiv = document.getElementById('encryption-suggestions');
        const contentDiv = document.getElementById('suggestion-content');
        
        if (!suggestionsDiv) {
            console.error('[Suggestions] Could not find encryption-suggestions element');
            return;
        }
        
        if (!contentDiv) {
            console.error('[Suggestions] Could not find suggestion-content element');
            return;
        }
        
        console.log('[Suggestions] Found suggestion elements, proceeding...');
        
        const levelNames = {
            'plain': 'Plain Text',
            'aes256': 'AES-256 Standard',
            'kyber': 'Kyber Post-Quantum',
            'otp': 'One-Time Pad Maximum'
        };

        const riskColors = {
            'low': '🟡',
            'medium': '🟠', 
            'high': '🔴'
        };

        contentDiv.innerHTML = `
            <div>
                <strong>${riskColors[analysis.riskLevel]} Recommended: ${levelNames[analysis.recommendedLevel]} Security</strong>
            </div>
            <div style="margin-top: 0.5rem;">
                Based on your email content, we recommend upgrading to <strong>${levelNames[analysis.recommendedLevel]}</strong> encryption.
            </div>
            <div class="suggestion-reason">
                Reasons: ${analysis.reasons.join(', ')}
            </div>
        `;

        this.currentSuggestion = analysis.recommendedLevel;
        suggestionsDiv.style.display = 'block';
    }

    hideSuggestion() {
        const suggestionsDiv = document.getElementById('encryption-suggestions');
        suggestionsDiv.style.display = 'none';
        this.currentSuggestion = null;
    }

    applySuggestion() {
        if (this.currentSuggestion) {
            document.getElementById('encryption-level').value = this.currentSuggestion;
            this.updateSecurityIndicator(this.currentSuggestion);
            this.hideSuggestion();
            this.showToast('✅ Encryption level updated based on content analysis', 'success');
        }
    }

    dismissSuggestion() {
        this.hideSuggestion();
        this.showToast('💡 Suggestion dismissed', 'info');
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
