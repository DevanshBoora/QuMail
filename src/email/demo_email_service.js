class DemoEmailService {
  constructor() {
    this.authenticated = true; // Auto-authenticate for demo
    this.userEmail = 'demo@qumail.com';
    this.demoEmails = this.generateDemoEmails();
    console.log('[Demo Service] Initialized with', this.demoEmails.length, 'demo emails');
  }

  async authenticate() {
    await new Promise(resolve => setTimeout(resolve, 500));
    this.authenticated = true;
    console.log('[Demo Service] Authentication successful');
    return {
      success: true,
      message: 'Demo authentication successful'
    };
  }

  generateDemoEmails() {
    return [
      {
        id: 'demo-001',
        threadId: 'thread-001',
        from: 'alice@university.edu',
        to: 'demo@qumail.com',
        subject: 'Quantum Research Collaboration',
        date: new Date(Date.now() - 3600000),
        body: 'Hi! I wanted to discuss our quantum cryptography research project. The latest findings on quantum key distribution are fascinating. Let\'s schedule a meeting to review the encrypted data.',
        attachments: [],
        encrypted: true,
        encryptionLevel: 'otp',
        keyId: 'qk-001',
        labels: ['INBOX'],
        snippet: 'Hi! I wanted to discuss our quantum cryptography research project...'
      },
      {
        id: 'demo-002',
        threadId: 'thread-002',
        from: 'security@company.com',
        to: 'demo@qumail.com',
        subject: 'Confidential: Security Protocol Update',
        date: new Date(Date.now() - 7200000),
        body: 'CONFIDENTIAL NOTICE: We are implementing new quantum-safe encryption protocols across all communication channels. Please ensure all sensitive communications use Level 2 encryption or higher.',
        attachments: [
          { filename: 'security_protocol.pdf', size: 245760, mimeType: 'application/pdf' }
        ],
        encrypted: true,
        encryptionLevel: 'aes256',
        keyId: 'qk-002',
        labels: ['INBOX'],
        snippet: 'CONFIDENTIAL NOTICE: We are implementing new quantum-safe encryption...'
      },
      {
        id: 'demo-003',
        threadId: 'thread-003',
        from: 'researcher@qtech.org',
        to: 'demo@qumail.com',
        subject: 'Post-Quantum Cryptography Implementation',
        date: new Date(Date.now() - 10800000),
        body: 'The Kyber implementation is working perfectly! Our tests show excellent performance against quantum attacks. The encryption overhead is minimal and the security guarantees are strong.',
        attachments: [],
        encrypted: true,
        encryptionLevel: 'kyber',
        keyId: 'qk-003',
        labels: ['INBOX'],
        snippet: 'The Kyber implementation is working perfectly! Our tests show...'
      },
      {
        id: 'demo-004',
        threadId: 'thread-004',
        from: 'colleague@institute.com',
        to: 'demo@qumail.com',
        subject: 'Regular Meeting Notes',
        date: new Date(Date.now() - 14400000),
        body: 'Here are the notes from today\'s meeting. Nothing confidential, just regular project updates and scheduling information.',
        attachments: [],
        encrypted: false,
        encryptionLevel: 'plain',
        keyId: null,
        labels: ['INBOX'],
        snippet: 'Here are the notes from today\'s meeting. Nothing confidential...'
      }
    ];
  }

  async fetchEmails(maxResults = 20) {
    console.log('[Demo Service] Fetching emails, authenticated:', this.authenticated);
    if (!this.authenticated) {
      await this.authenticate();
    }

    await new Promise(resolve => setTimeout(resolve, 500));
    console.log('[Demo Service] Returning', this.demoEmails.length, 'emails');
    return this.demoEmails.slice(0, maxResults);
  }

  async sendEmail(emailData) {
    if (!this.authenticated) {
      await this.authenticate();
    }
    await new Promise(resolve => setTimeout(resolve, 1000));

    const sentEmail = {
      id: `demo-sent-${Date.now()}`,
      threadId: `thread-sent-${Date.now()}`,
      from: this.userEmail,
      to: emailData.to,
      subject: emailData.subject,
      date: new Date(),
      body: emailData.body,
      attachments: emailData.attachments || [],
      encrypted: emailData.encrypted,
      encryptionLevel: emailData.encryptionLevel,
      keyId: emailData.keyId,
      labels: ['SENT']
    };

    this.demoEmails.unshift({
      ...sentEmail,
      from: emailData.to,
      to: this.userEmail,
      subject: `Re: ${emailData.subject}`,
      body: `Thank you for your encrypted message! This is an automated demo response.\n\nOriginal message:\n${emailData.body}`,
      date: new Date(Date.now() + 5000),
      labels: ['INBOX']
    });

    return {
      success: true,
      messageId: sentEmail.id,
      response: 'Demo email sent successfully'
    };
  }

  async getUserProfile() {
    return {
      emailAddress: this.userEmail,
      messagesTotal: this.demoEmails.length,
      threadsTotal: this.demoEmails.length,
      historyId: 'demo-history-001'
    };
  }

  isAuthenticated() {
    return this.authenticated;
  }

  logout() {
    this.authenticated = false;
  }

  async getAuthStatus() {
    if (!this.authenticated) {
      return { authenticated: false };
    }
    const profile = await this.getUserProfile();
    return {
      authenticated: true,
      user: profile
    };
  }
}

module.exports = { DemoEmailService };
