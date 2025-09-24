const { google } = require('googleapis');
const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');
const { OAuthCallbackServer } = require('../auth/oauth_server');

class EmailService {
  constructor() {
    this.oauth2Client = null;
    this.gmail = null;
    this.transporter = null;
    this.credentials = null;
    this.tokens = null;
    this.oauthServer = null;
    this.emailCache = new Map();
    this.cacheExpiry = 5 * 60 * 1000; // 5 minutes
    
    this.scopes = [
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/gmail.send',
      'https://www.googleapis.com/auth/gmail.modify',
      'https://www.googleapis.com/auth/gmail.compose'
    ];
    
    this.loadCredentials();
  }

  loadCredentials() {
    try {
      const credentialsPath = path.join(__dirname, '..', 'config', 'gmail_credentials.json');
      console.log(`[EmailService] Looking for credentials at: ${credentialsPath}`);
      
      if (!fs.existsSync(credentialsPath)) {
        console.error('[EmailService] Error: gmail_credentials.json not found at', credentialsPath);
        return;
      }
      
      console.log('[EmailService] Credentials file found, reading...');
      const fileContent = fs.readFileSync(credentialsPath, 'utf8');
      this.credentials = JSON.parse(fileContent);
      
      if (!this.credentials.installed || !this.credentials.installed.client_id) {
        console.error('[EmailService] Invalid credentials format. Missing required fields.');
        console.error('Credentials content:', JSON.stringify(this.credentials, null, 2));
        this.credentials = null;
      } else {
        console.log('[EmailService] Successfully loaded Gmail credentials');
      }
    } catch (error) {
      console.error('[EmailService] Error loading Gmail credentials:', error);
      if (error.code === 'ENOENT') {
        console.error('[EmailService] The file was not found. Please ensure gmail_credentials.json exists in the config directory.');
      } else if (error instanceof SyntaxError) {
        console.error('[EmailService] The credentials file contains invalid JSON.');
      }
      this.credentials = null;
    }
  }

  async authenticate() {
    console.log('[EmailService] Starting authentication...');
    try {
      if (!this.credentials) {
        const errorMsg = 'Gmail credentials not found. Please ensure gmail_credentials.json exists in the config directory and contains valid OAuth 2.0 credentials.';
        console.error(`[EmailService] ${errorMsg}`);
        throw new Error(errorMsg);
      }

      const { client_secret, client_id, redirect_uris } = this.credentials.installed;
      if (!client_id || !client_secret || !redirect_uris || !redirect_uris[0]) {
        const errorMsg = 'Invalid OAuth 2.0 configuration. Please check your gmail_credentials.json file.';
        console.error(`[EmailService] ${errorMsg}`, {
          hasClientId: !!client_id,
          hasClientSecret: !!client_secret,
          hasRedirectUris: !!redirect_uris,
          firstRedirectUri: redirect_uris ? redirect_uris[0] : undefined
        });
        throw new Error(errorMsg);
      }

      console.log('[EmailService] Initializing OAuth2 client...');
      this.oauth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

      // Load existing tokens (but allow force re-auth)
      const tokenPath = path.join(__dirname, '..', 'config', 'gmail_tokens.json');
      let tokensAreValid = false;
      
      // Check if we should force new authentication (for account switching)
      const forceNewAuth = process.env.FORCE_NEW_AUTH === 'true';
      
      if (fs.existsSync(tokenPath) && !forceNewAuth) {
        console.log('[EmailService] Found existing tokens, attempting to use them...');
        try {
          this.tokens = JSON.parse(fs.readFileSync(tokenPath, 'utf8'));
          this.oauth2Client.setCredentials(this.tokens);
          
          // Verify if tokens are still valid
          try {
            await this.oauth2Client.getAccessToken();
            this.gmail = google.gmail({ version: 'v1', auth: this.oauth2Client });
            await this.setupTransporter();
            console.log('[EmailService] Successfully authenticated with existing tokens');
            tokensAreValid = true;
            return { success: true, message: 'Authenticated with existing tokens' };
          } catch (tokenError) {
            console.log('[EmailService] Existing tokens are invalid or expired:', tokenError.message);
          }
        } catch (parseError) {
          console.error('[EmailService] Error parsing existing tokens:', parseError);
        }
      } else if (forceNewAuth) {
        console.log('[EmailService] Force new authentication requested, skipping existing tokens');
      }

      // If we get here, we need to get new tokens
      if (!tokensAreValid) {
        console.log('[EmailService] No valid tokens found, starting OAuth flow...');
        await this.getNewToken();
        return { success: true, message: 'Successfully authenticated with new tokens' };
      }
    } catch (error) {
      console.error('[EmailService] Authentication failed:', error);
      throw error;
    }
  }

  async getNewToken() {
    const tokenPath = path.join(__dirname, '..', 'config', 'gmail_tokens.json');
    
    try {
      this.oauthServer = new OAuthCallbackServer(3000);
      await this.oauthServer.start();

      const authUrl = this.oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: this.scopes,
      });

      console.log('[EmailService] Opening browser for authentication...');
      const { shell } = require('electron');
      await shell.openExternal(authUrl);
      
      const authResult = await this.oauthServer.waitForAuthCode();
      this.oauthServer.stop();

      if (!authResult) {
        throw new Error('No authorization code received');
      }

      const { tokens } = await this.oauth2Client.getToken(authResult);
      this.oauth2Client.setCredentials(tokens);
      this.tokens = tokens;

      fs.writeFileSync(tokenPath, JSON.stringify(tokens, null, 2));

      this.gmail = google.gmail({ version: 'v1', auth: this.oauth2Client });
      await this.setupTransporter();

      console.log('[EmailService] New tokens obtained and saved successfully');
    } catch (error) {
      if (this.oauthServer) {
        this.oauthServer.stop();
      }
      console.error('[EmailService] Failed to get new token:', error);
      throw new Error(`Authentication failed: ${error.message}`);
    }
  }

  async setupTransporter() {
    if (!this.credentials || !this.credentials.installed) {
      console.error('[EmailService] Cannot setup transporter: credentials not loaded');
      return;
    }
    
    if (!this.tokens) {
      console.error('[EmailService] Cannot setup transporter: tokens not available');
      return;
    }

    try {
      // Get user email from Gmail API
      let userEmail = 'me';
      try {
        if (this.gmail) {
          const profile = await this.gmail.users.getProfile({ userId: 'me' });
          userEmail = profile.data.emailAddress;
        }
      } catch (profileError) {
        console.log('[EmailService] Could not get user email, using "me"');
      }

      this.transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          type: 'OAuth2',
          user: userEmail,
          clientId: this.credentials.installed.client_id,
          clientSecret: this.credentials.installed.client_secret,
          refreshToken: this.tokens.refresh_token,
          accessToken: this.tokens.access_token,
        },
      });
      console.log('[EmailService] Transporter setup successfully for:', userEmail);
    } catch (error) {
      console.error('[EmailService] Failed to setup transporter:', error);
    }
  }

  async fetchEmails(maxResults = 10, useCache = true) {
    try {
      if (!this.gmail) {
        throw new Error('Gmail API not initialized. Please authenticate first.');
      }

      // Check cache first
      const cacheKey = `emails_${maxResults}`;
      if (useCache && this.emailCache.has(cacheKey)) {
        const cached = this.emailCache.get(cacheKey);
        if (Date.now() - cached.timestamp < this.cacheExpiry) {
          console.log(`[EmailService] Returning ${cached.emails.length} cached emails`);
          return cached.emails;
        }
      }

      console.log(`[EmailService] Fetching ${maxResults} emails...`);
      const startTime = Date.now();

      // Get message list first (fast)
      const response = await this.gmail.users.messages.list({
        userId: 'me',
        maxResults: maxResults,
        q: 'in:inbox'
      });

      const messages = response.data.messages || [];
      if (messages.length === 0) {
        console.log('[EmailService] No messages found');
        return [];
      }

      console.log(`[EmailService] Found ${messages.length} messages, fetching details...`);

      // Batch requests for better performance (Gmail API allows up to 100 batch requests)
      const batchSize = Math.min(10, messages.length);
      const batches = [];
      
      for (let i = 0; i < messages.length; i += batchSize) {
        batches.push(messages.slice(i, i + batchSize));
      }

      const emails = [];
      
      for (const batch of batches) {
        const batchPromises = batch.map(async (message) => {
          try {
            const messageDetail = await this.gmail.users.messages.get({
              userId: 'me',
              id: message.id,
              format: 'metadata',
              metadataHeaders: ['From', 'To', 'Subject', 'Date', 'X-QuMail-Encryption']
            });

            return this.parseGmailMessage(messageDetail.data, message.id);
          } catch (error) {
            console.error(`Error fetching message ${message.id}:`, error);
            return null;
          }
        });

        const batchResults = await Promise.all(batchPromises);
        emails.push(...batchResults.filter(email => email !== null));
      }

      const endTime = Date.now();
      console.log(`[EmailService] Fetched ${emails.length} emails in ${endTime - startTime}ms`);

      // Cache the results
      this.emailCache.set(cacheKey, {
        emails: emails,
        timestamp: Date.now()
      });

      return emails;
    } catch (error) {
      console.error('Error fetching emails:', error);
      throw new Error(`Failed to fetch emails: ${error.message}`);
    }
  }

  async fetchFullEmail(emailId) {
    try {
      if (!this.gmail) {
        throw new Error('Gmail API not initialized. Please authenticate first.');
      }

      console.log(`[EmailService] Fetching full email content for: ${emailId}`);

      const messageDetail = await this.gmail.users.messages.get({
        userId: 'me',
        id: emailId,
        format: 'full'
      });

      return this.parseGmailMessage(messageDetail.data, emailId);
    } catch (error) {
      console.error(`Error fetching full email ${emailId}:`, error);
      throw new Error(`Failed to fetch full email: ${error.message}`);
    }
  }

  parseGmailMessage(messageData, messageId = null) {
    const headers = messageData.payload?.headers || [];
    const getHeader = (name) => {
      const header = headers.find(h => h.name.toLowerCase() === name.toLowerCase());
      return header ? header.value : '';
    };

    // For metadata format, we don't have body content - use snippet instead
    let body = messageData.snippet || '';
    let attachments = [];

    // Only parse body if we have full format
    console.log(`[EmailService] Parsing email ${messageId}, payload structure:`, messageData.payload);
    console.log(`[EmailService] Payload parts:`, messageData.payload?.parts);
    
    if (messageData.payload?.parts) {
      console.log(`[EmailService] Found ${messageData.payload.parts.length} parts in email`);
      messageData.payload.parts.forEach((part, index) => {
        console.log(`[EmailService] Part ${index}:`, {
          mimeType: part.mimeType,
          filename: part.filename,
          hasBody: !!part.body,
          hasAttachmentId: !!part.body?.attachmentId,
          bodySize: part.body?.size
        });
        if (part.mimeType === 'text/plain' || part.mimeType === 'text/html') {
          if (part.body?.data) {
            body += Buffer.from(part.body.data, 'base64').toString('utf8');
          }
        } else if (part.filename && part.body?.attachmentId) {
          console.log(`[EmailService] Found attachment: ${part.filename}, MIME: ${part.mimeType}, Size: ${part.body.size}, ID: ${part.body.attachmentId}`);
          attachments.push({
            filename: part.filename,
            mimeType: part.mimeType,
            size: part.body.size,
            attachmentId: part.body.attachmentId
          });
        }
      });
    } else if (messageData.payload?.body?.data) {
      body = Buffer.from(messageData.payload.body.data, 'base64').toString('utf8');
    }

    let encrypted = false;
    let encryptionLevel = null;
    let keyId = null;

    try {
      const subject = getHeader('Subject');
      if (subject.includes('[QuMail-Encrypted]')) {
        encrypted = true;
        const encryptionHeader = getHeader('X-QuMail-Encryption');
        if (encryptionHeader) {
          const encInfo = JSON.parse(encryptionHeader);
          encryptionLevel = encInfo.level;
          keyId = encInfo.keyId;
        }
      }
    } catch (error) {
      // Not a QuMail encrypted message
    }

    return {
      id: messageId || messageData.id,
      threadId: messageData.threadId,
      from: getHeader('From'),
      to: getHeader('To'),
      subject: getHeader('Subject'),
      date: new Date(parseInt(messageData.internalDate)),
      body: body,
      attachments: attachments,
      encrypted: encrypted,
      encryptionLevel: encryptionLevel,
      keyId: keyId,
      labels: messageData.labelIds || [],
      snippet: messageData.snippet || body.substring(0, 150)
    };
  }

  async sendEmail(emailData) {
    try {
      if (!this.gmail) {
        throw new Error('Gmail API not initialized. Please authenticate first.');
      }

      // Refresh access token before sending
      try {
        if (this.oauth2Client) {
          await this.oauth2Client.getAccessToken();
        }
      } catch (tokenError) {
        console.error('[EmailService] Token refresh failed:', tokenError);
        throw new Error('Authentication expired. Please reconnect your Gmail account.');
      }

      const { to, subject, body, attachments = [], encrypted = false, encryptionLevel = null, keyId = null } = emailData;

      // Create clean email subject and body
      // For encrypted emails, don't put the encrypted subject in the email subject line
      // Instead, use a generic encrypted subject indicator
      const emailSubject = encrypted ? `[QuMail-Encrypted] Encrypted Message` : subject;
      
      // For encrypted emails, pass the original encrypted JSON to generateHtmlBody
      // Don't format it here - let generateHtmlBody handle the formatting
      const htmlBody = this.generateHtmlBody(body, encrypted, encryptionLevel, subject, attachments);
      
      // Check if we have attachments to send as actual Gmail attachments
      let emailContent, encodedEmail;
      
      if (attachments && attachments.length > 0) {
        console.log(`[EmailService] Preparing email with ${attachments.length} attachments`);
        // Create multipart email with attachments
        const boundary = `boundary_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        emailContent = [
          `To: ${to}`,
          `Subject: ${emailSubject}`,
          `Content-Type: multipart/mixed; boundary="${boundary}"`,
          'MIME-Version: 1.0',
          ''
        ];

        if (encrypted) {
          emailContent.splice(3, 0, 
            `X-QuMail-Encryption: ${JSON.stringify({
              level: encryptionLevel,
              keyId: keyId,
              timestamp: new Date().toISOString()
            })}`,
            'X-QuMail-Version: 1.0.0'
          );
        }

        // Add HTML body part
        emailContent.push(
          `--${boundary}`,
          'Content-Type: text/html; charset=utf-8',
          'Content-Transfer-Encoding: 7bit',
          '',
          htmlBody,
          ''
        );

        // Add each attachment
        for (const attachment of attachments) {
          console.log(`[EmailService] Adding attachment: ${attachment.name}, size: ${attachment.size}`);
          emailContent.push(
            `--${boundary}`,
            `Content-Type: ${attachment.type}; name="${attachment.name}"`,
            `Content-Disposition: attachment; filename="${attachment.name}"`,
            'Content-Transfer-Encoding: base64',
            '',
            attachment.data, // Base64 encoded file data
            ''
          );
        }

        // Close boundary
        emailContent.push(`--${boundary}--`);
        
      } else {
        // Simple email without attachments
        emailContent = [
          `To: ${to}`,
          `Subject: ${emailSubject}`,
          'Content-Type: text/html; charset=utf-8',
          'MIME-Version: 1.0',
          ''
        ];

        if (encrypted) {
          emailContent.splice(3, 0, 
            `X-QuMail-Encryption: ${JSON.stringify({
              level: encryptionLevel,
              keyId: keyId,
              timestamp: new Date().toISOString()
            })}`,
            'X-QuMail-Version: 1.0.0'
          );
        }

        emailContent.push(htmlBody);
      }
      
      const email = emailContent.join('\r\n');
      console.log(`[EmailService] Final email size: ${email.length} characters`);
      encodedEmail = Buffer.from(email).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

      console.log('[EmailService] Sending email via Gmail API...');
      const result = await this.gmail.users.messages.send({
        userId: 'me',
        requestBody: {
          raw: encodedEmail
        }
      });

      console.log('[EmailService] Email sent successfully via Gmail API:', result.data.id);
      
      return {
        success: true,
        messageId: result.data.id,
        response: 'Email sent via Gmail API',
        decryptionInfo: encrypted ? {
          keyId: keyId,
          level: encryptionLevel,
          key: emailData.originalKey || 'Key not available'
        } : null
      };

    } catch (error) {
      console.error('[EmailService] Error sending email via Gmail API:', error);
      throw new Error(`Failed to send email: ${error.message}`);
    }
  }

  isEncryptedJson(body) {
    try {
      const parsed = JSON.parse(body);
      return parsed.algorithm && (parsed.data || parsed.entropy);
    } catch {
      return false;
    }
  }

  formatEncryptedEmailBody(encryptedJson, encryptionLevel) {
    try {
      const data = JSON.parse(encryptedJson);
      return `Encrypted Message Data:\n\nAlgorithm: ${data.algorithm}\nTimestamp: ${data.timestamp}\n\n[Encrypted payload - Use QuMail to decrypt]`;
    } catch {
      return encryptedJson;
    }
  }

  generateHtmlBody(textBody, encrypted, encryptionLevel, encryptedSubject = null, attachments = []) {
    const encryptionBadge = encrypted ? 
      `<div style="background: #4CAF50; color: white; padding: 12px; border-radius: 6px; margin-bottom: 20px; font-size: 14px; font-weight: bold;">
        🔒 Quantum-Safe Encrypted (${encryptionLevel?.toUpperCase()}) - QuMail
      </div>` : '';

    // Check if this is encrypted JSON data
    if (encrypted && this.isEncryptedJson(textBody)) {
      try {
        const data = JSON.parse(textBody);
        
        // Create sections for both encrypted subject and encrypted message body
        const encryptedSubjectSection = encryptedSubject && this.isEncryptedJson(encryptedSubject) ? `
          <div style="margin-top: 20px; padding: 15px; background: #fff3e0; border-radius: 6px; border: 1px solid #ffb74d;">
            <h4 style="margin: 0 0 10px 0; color: #333; font-size: 14px;">🏷️ Encrypted Subject:</h4>
            <div style="background: #fff; padding: 10px; border-radius: 4px; border: 1px solid #ffb74d; font-family: 'Courier New', monospace; font-size: 12px; word-break: break-all; color: #333;">
              ${encryptedSubject}
            </div>
          </div>
        ` : '';
        
        return `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            ${encryptionBadge}
            <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; border-left: 4px solid #4CAF50;">
              <h3 style="margin: 0 0 15px 0; color: #333;">Encrypted Message Details</h3>
              <p><strong>Algorithm:</strong> ${data.algorithm?.toUpperCase()}</p>
              <p><strong>Timestamp:</strong> ${data.timestamp}</p>
              <div style="margin-top: 20px; padding: 15px; background: #e8f5e8; border-radius: 6px;">
                <p style="margin: 0; font-size: 13px; color: #2e7d32;">
                  <strong>🔐 Encrypted Payload</strong><br>
                  Copy the encrypted data below to decrypt this message in QuMail.
                </p>
              </div>
            </div>
            ${encryptedSubjectSection}
            <div style="margin-top: 20px; padding: 15px; background: #e3f2fd; border-radius: 6px; border: 1px solid #2196f3;">
              <h4 style="margin: 0 0 10px 0; color: #333; font-size: 14px;">📝 Encrypted Message Body:</h4>
              <div style="background: #fff; padding: 10px; border-radius: 4px; border: 1px solid #2196f3; font-family: 'Courier New', monospace; font-size: 12px; word-break: break-all; color: #333;">
                ${textBody}
              </div>
            </div>
            ${attachments.length > 0 ? `
            <div style="margin-top: 20px; padding: 15px; background: #fff3e0; border-radius: 6px; border: 1px solid #ff9800;">
              <h4 style="margin: 0 0 10px 0; color: #333; font-size: 14px;">📎 Quantum-Encrypted Attachments (${attachments.length}):</h4>
              ${attachments.map(att => `
                <div style="background: #fff; padding: 8px; margin: 5px 0; border-radius: 4px; border: 1px solid #ff9800; font-size: 12px;">
                  <strong>${att.name}</strong> (${this.formatFileSize(att.size)}) - ${encryptionLevel?.toUpperCase()} Encrypted
                </div>
              `).join('')}
              <p style="margin: 10px 0 0 0; font-size: 11px; color: #666; font-style: italic;">
                Attachments are quantum-encrypted and can only be decrypted using QuMail.
              </p>
            </div>
            ` : ''}
            <div style="margin-top: 20px; padding: 12px; background: #f5f5f5; border-radius: 4px; font-size: 11px; color: #666;">
              This message was encrypted using QuMail quantum-safe encryption technology.
            </div>
          </div>
        `;
      } catch {
        // Fallback for malformed JSON
      }
    }

    return `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        ${encryptionBadge}
        <div style="white-space: pre-wrap; line-height: 1.6;">
          ${textBody.replace(/\n/g, '<br>')}
        </div>
        ${encrypted ? 
          '<div style="margin-top: 20px; padding: 12px; background: #f5f5f5; border-radius: 4px; font-size: 11px; color: #666;">This message was encrypted using QuMail quantum-safe encryption technology.</div>' 
          : ''}
      </div>
    `;
  }

  formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  async getUserProfile() {
    try {
      if (!this.gmail) {
        throw new Error('Gmail API not initialized');
      }

      const response = await this.gmail.users.getProfile({
        userId: 'me'
      });

      return {
        emailAddress: response.data.emailAddress,
        messagesTotal: response.data.messagesTotal,
        threadsTotal: response.data.threadsTotal,
        historyId: response.data.historyId
      };
    } catch (error) {
      console.error('Error getting user profile:', error);
      throw new Error(`Failed to get user profile: ${error.message}`);
    }
  }

  isAuthenticated() {
    return !!(this.oauth2Client && this.tokens && this.gmail);
  }

  clearCache() {
    this.emailCache.clear();
    console.log('[EmailService] Email cache cleared');
  }

  logout() {
    this.oauth2Client = null;
    this.gmail = null;
    this.transporter = null;
    this.tokens = null;
    this.clearCache();

    const tokenPath = path.join(__dirname, '..', 'config', 'gmail_tokens.json');
    if (fs.existsSync(tokenPath)) {
      fs.unlinkSync(tokenPath);
    }
  }

  async downloadAttachment(messageId, attachmentId) {
    if (!this.isAuthenticated()) {
      throw new Error('Not authenticated');
    }

    try {
      console.log(`[EmailService] Downloading attachment ${attachmentId} from message ${messageId}`);
      
      const response = await this.gmail.users.messages.attachments.get({
        userId: 'me',
        messageId: messageId,
        id: attachmentId
      });

      if (response.data && response.data.data) {
        console.log(`[EmailService] Raw response data length: ${response.data.data.length}`);
        console.log(`[EmailService] Raw response size: ${response.data.size}`);
        console.log(`[EmailService] First 100 chars of raw data: ${response.data.data.substring(0, 100)}`);
        
        // Gmail API returns base64url encoded data, convert to base64
        let base64Data = response.data.data.replace(/-/g, '+').replace(/_/g, '/');
        
        // Add proper padding if needed
        while (base64Data.length % 4) {
          base64Data += '=';
        }
        
        console.log(`[EmailService] Successfully downloaded attachment, size: ${response.data.size} bytes`);
        console.log(`[EmailService] Base64 data length: ${base64Data.length}`);
        console.log(`[EmailService] First 100 chars of converted base64: ${base64Data.substring(0, 100)}`);
        
        // Test if the base64 is valid by trying to decode a small portion
        try {
          const testDecode = Buffer.from(base64Data.substring(0, Math.min(100, base64Data.length)), 'base64');
          console.log(`[EmailService] Base64 test decode successful, decoded ${testDecode.length} bytes`);
        } catch (testError) {
          console.error(`[EmailService] Base64 test decode failed:`, testError);
        }
        
        return base64Data;
      } else {
        throw new Error('No attachment data received');
      }
    } catch (error) {
      console.error('[EmailService] Error downloading attachment:', error);
      throw error;
    }
  }

  async getAuthStatus() {
    if (!this.isAuthenticated()) {
      return { authenticated: false };
    }

    try {
      const profile = await this.getUserProfile();
      return {
        authenticated: true,
        user: profile
      };
    } catch (error) {
      return { authenticated: false, error: error.message };
    }
  }
}

module.exports = { EmailService };
