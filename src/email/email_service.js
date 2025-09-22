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

  async fetchEmails(maxResults = 10) {
    try {
      if (!this.gmail) {
        throw new Error('Gmail API not initialized. Please authenticate first.');
      }

      // Try to refresh token if needed
      try {
        await this.oauth2Client.getAccessToken();
      } catch (tokenError) {
        console.log('[EmailService] Token refresh failed, re-authenticating...');
        throw new Error('Authentication expired. Please reconnect your Gmail account.');
      }

      const response = await this.gmail.users.messages.list({
        userId: 'me',
        maxResults: maxResults,
        q: 'in:inbox'
      });

      const messages = response.data.messages || [];
      const emails = [];

      for (const message of messages) {
        try {
          const messageDetail = await this.gmail.users.messages.get({
            userId: 'me',
            id: message.id,
            format: 'full'
          });

          const email = this.parseGmailMessage(messageDetail.data);
          emails.push(email);
        } catch (error) {
          console.error(`Error fetching message ${message.id}:`, error);
        }
      }

      return emails;
    } catch (error) {
      console.error('Error fetching emails:', error);
      throw new Error(`Failed to fetch emails: ${error.message}`);
    }
  }

  parseGmailMessage(messageData) {
    const headers = messageData.payload.headers;
    const getHeader = (name) => {
      const header = headers.find(h => h.name.toLowerCase() === name.toLowerCase());
      return header ? header.value : '';
    };

    let body = '';
    let attachments = [];

    if (messageData.payload.parts) {
      messageData.payload.parts.forEach(part => {
        if (part.mimeType === 'text/plain' || part.mimeType === 'text/html') {
          if (part.body.data) {
            body += Buffer.from(part.body.data, 'base64').toString('utf8');
          }
        } else if (part.filename && part.body.attachmentId) {
          attachments.push({
            filename: part.filename,
            mimeType: part.mimeType,
            size: part.body.size,
            attachmentId: part.body.attachmentId
          });
        }
      });
    } else if (messageData.payload.body.data) {
      body = Buffer.from(messageData.payload.body.data, 'base64').toString('utf8');
    }

    let encrypted = false;
    let encryptionLevel = null;
    let keyId = null;

    try {
      const subject = getHeader('Subject');
      if (subject.includes('[QuMail-Encrypted]') || body.includes('"algorithm"')) {
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
      id: messageData.id,
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
      snippet: messageData.snippet
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

      // Create email in RFC 2822 format for Gmail API
      const emailSubject = encrypted ? `[QuMail-Encrypted] ${subject}` : subject;
      const htmlBody = this.generateHtmlBody(body, encrypted, encryptionLevel);
      
      let emailContent = [
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
      
      const email = emailContent.join('\r\n');
      const encodedEmail = Buffer.from(email).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

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

  generateHtmlBody(textBody, encrypted, encryptionLevel) {
    const encryptionBadge = encrypted ? 
      `<div style="background: #4CAF50; color: white; padding: 8px; border-radius: 4px; margin-bottom: 16px; font-size: 12px;">
        ?? Quantum-Safe Encrypted (${encryptionLevel?.toUpperCase()}) - QuMail
      </div>` : '';

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

  logout() {
    this.oauth2Client = null;
    this.gmail = null;
    this.transporter = null;
    this.tokens = null;

    const tokenPath = path.join(__dirname, '..', 'config', 'gmail_tokens.json');
    if (fs.existsSync(tokenPath)) {
      fs.unlinkSync(tokenPath);
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
