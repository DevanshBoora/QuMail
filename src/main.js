const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

// Import modules
const { EmailService } = require('./email/email_service');
const { DemoEmailService } = require('./email/demo_email_service');
const { EncryptionEngine } = require('./encryption/encryption_engine');
const { QKDClient } = require('./qkd_client/qkd_client');

// Import ETSI QKD modules
const ETSIQKDServer = require('./etsi/etsi_qkd_server');
const { ETSIKeyManager } = require('./etsi/etsi_key_manager');

// Start QKD server on port 3001
async function startQKDServer() {
  const QKDServer = require('./qkd_server/qkd_server');
  const server = new QKDServer(3001);
  await server.start();
  return server;
}

// Start ETSI QKD server on port 3443
async function startETSIQKDServer() {
  const server = new ETSIQKDServer(3443);
  await server.start();
  return server;
}

let mainWindow;
let qkdServerInstance;
let etsiQkdServerInstance;
let emailService;
let encryptionEngine;
let qkdClient;
let etsiKeyManager;

// Initialize services
function initializeServices() {
  if (!emailService) {
    const settingsPath = path.join(__dirname, 'config', 'settings.json');
    let settings = {};
    try {
      if (fs.existsSync(settingsPath)) {
        settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
      }
    } catch (error) {
      console.error('Error loading settings:', error);
    }
    
    if (settings.demo && settings.demo.enabled) {
      console.log('[Main] Demo mode enabled, using DemoEmailService');
      emailService = new DemoEmailService();
    } else if (settings.demo && settings.demo.fallbackMode) {
      console.log('[Main] Hybrid mode enabled, using EmailService with demo fallback');
      emailService = new EmailService();
      emailService.demoFallback = new DemoEmailService();
    } else {
      console.log('[Main] Using real EmailService');
      emailService = new EmailService();
    }
  }
  if (!encryptionEngine) {
    encryptionEngine = new EncryptionEngine();
  }
  if (!qkdClient) {
    qkdClient = new QKDClient();
  }
  if (!etsiKeyManager) {
    etsiKeyManager = new ETSIKeyManager({
      etsiServerUrl: 'http://127.0.0.1:3443',
      customServerUrl: 'http://127.0.0.1:3001',
      preferredMode: 'etsi',
      fallbackEnabled: true
    });
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true,
      webSecurity: false // Disable for development
    },
    title: 'QuMail - Quantum-Safe Email Client',
    show: true, // Show immediately
    titleBarStyle: 'default'
  });

  const htmlPath = path.join(__dirname, 'gui', 'index.html');
  console.log('[Main] Loading HTML file from:', htmlPath);
  
  mainWindow.loadFile(htmlPath).then(() => {
    console.log('[Main] HTML file loaded successfully');
    mainWindow.show();
    mainWindow.focus();
  }).catch((error) => {
    console.error('[Main] Failed to load HTML file:', error);
  });

  mainWindow.webContents.on('did-finish-load', () => {
    console.log('[Main] Page finished loading');
  });

  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    console.error('[Main] Page failed to load:', errorCode, errorDescription);
  });

  mainWindow.on('closed', () => {
    console.log('[Main] Window close event triggered...');
    mainWindow = null;
    shutdown();
  });

  // Open DevTools in development
  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }
}

async function shutdown() {
  console.log('Shutting down application...');
  if (qkdServerInstance) {
    console.log('Stopping QKD server...');
    await qkdServerInstance.stop();
    console.log('[QKD Server] Stopped');
  }
  if (etsiQkdServerInstance) {
    console.log('Stopping ETSI QKD server...');
    await etsiQkdServerInstance.stop();
    console.log('[ETSI QKD Server] Stopped');
  }
  if (etsiKeyManager) {
    console.log('Cleaning up ETSI connections...');
    await etsiKeyManager.cleanup();
    console.log('[ETSI Key Manager] Cleaned up');
  }
  console.log('Application shutdown complete');
}

app.whenReady().then(() => {
  console.log('[Main] App ready, creating window...');

  // Add a catch-all IPC listener to see if any messages come through
  ipcMain.on('any-message', (event, ...args) => {
    console.log('=== RECEIVED IPC MESSAGE ===');
    console.log('Event:', event);
    console.log('Args:', args);
    console.log('=== END IPC MESSAGE ===');
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });

  mainWindow.webContents.once('dom-ready', async () => {
    console.log('[Main] DOM ready, initializing services...');
    initializeServices();
    console.log('[Main] Services initialized');

    console.log('[Main] Starting QKD servers...');
    try {
      // Start custom QKD server
      qkdServerInstance = await startQKDServer();
      console.log(`[Main] Custom QKD Server started successfully on port 3001`);
      qkdClient.updateServerUrl('http://127.0.0.1:3001');
      
      // Start ETSI QKD server
      etsiQkdServerInstance = await startETSIQKDServer();
      console.log(`[Main] ETSI QKD Server started successfully on port 3443`);
      
      console.log('[Main] Both QKD servers started - QuMail is now ETSI GS QKD 004 v2.1.1 compliant!');
      console.log('[Main] Application startup completed successfully');
    } catch (error) {
      console.error('[Main] Failed to start QKD servers:', error);
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', async () => {
  await shutdown();
});

// IPC Handlers - THIS WAS MISSING!
ipcMain.handle('gmail-auth', async () => {
  try {
    initializeServices();
    try {
      return await emailService.authenticate();
    } catch (error) {
      console.log('[Main] Gmail auth failed, using demo fallback:', error.message);
      if (emailService.demoFallback) {
        return await emailService.demoFallback.authenticate();
      } else {
        throw error;
      }
    }
  } catch (error) {
    console.error('Gmail auth error:', error);
    throw error;
  }
});

ipcMain.handle('fetch-emails', async (event, forceRefresh = false) => {
  try {
    // Only initialize if not already done
    if (!emailService) {
      initializeServices();
    }
    
    let emails;
    try {
      emails = await emailService.fetchEmails(15, !forceRefresh); // Use cache unless force refresh
    } catch (error) {
      console.log('[Main] Gmail fetch failed, using demo fallback:', error.message);
      if (emailService.demoFallback) {
        if (!emailService.demoFallback.authenticated) {
          await emailService.demoFallback.authenticate();
        }
        emails = await emailService.demoFallback.fetchEmails();
      } else {
        throw error;
      }
    }
    return emails;
  } catch (error) {
    console.error('Fetch emails error:', error);
    throw error;
  }
});

ipcMain.handle('fetch-full-email', async (event, emailId) => {
  try {
    initializeServices();
    let fullEmail;
    try {
      fullEmail = await emailService.fetchFullEmail(emailId);
    } catch (error) {
      console.log('[Main] Gmail full email fetch failed, using demo fallback:', error.message);
      if (emailService.demoFallback) {
        fullEmail = await emailService.demoFallback.fetchFullEmail(emailId);
      } else {
        throw error;
      }
    }
    return fullEmail;
  } catch (error) {
    console.error('Fetch full email error:', error);
    throw error;
  }
});

ipcMain.handle('send-email', async (event, emailData) => {
  try {
    initializeServices();
    const { to, subject, body, attachments, encryptionLevel } = emailData;
    
    // Check if we have a real email service or just demo
    if (!emailService || typeof emailService.isAuthenticated !== 'function' || !emailService.isAuthenticated()) {
      throw new Error('Please connect your Gmail account first to send real emails. Currently in demo mode only.');
    }
    
    let encryptedSubject = subject;
    let encryptedBody = body;
    let keyId = null;
    let quantumKey = null;

    if (encryptionLevel && encryptionLevel !== 'plain') {
      // Use ETSI Key Manager for quantum key retrieval FIRST
      try {
        quantumKey = await etsiKeyManager.getQuantumKey({
          keySize: 256,
          source: 'qumail_sender',
          destination: to
        });
        keyId = quantumKey.keyId;
        console.log(`[Main] Using ${quantumKey.source} quantum key (ETSI compliant: ${quantumKey.etsi_compliant})`);
      } catch (error) {
        console.error('[Main] ETSI key manager failed, falling back to custom QKD:', error.message);
        quantumKey = await qkdClient.getQuantumKey();
        keyId = quantumKey.keyId;
      }
      
      console.log('[Main] ENCRYPTING EMAIL:');
      console.log('[Main] Original subject:', subject);
      console.log('[Main] Original body:', body);
      console.log('[Main] Quantum key length:', quantumKey.key ? quantumKey.key.length : 'undefined');
      console.log('[Main] Quantum key preview:', quantumKey.key ? quantumKey.key.substring(0, 20) + '...' : 'undefined');
      
      encryptedSubject = await encryptionEngine.encrypt(subject, quantumKey.key, encryptionLevel);
      encryptedBody = await encryptionEngine.encrypt(body, quantumKey.key, encryptionLevel);
      
      console.log('[Main] Encrypted subject:', encryptedSubject);
      console.log('[Main] Encrypted body:', encryptedBody);
      console.log('[Main] Are they the same?', encryptedSubject === encryptedBody);
    }

    // Process and encrypt attachments AFTER getting quantum key
    let processedAttachments = [];
    if (attachments && attachments.length > 0) {
      console.log(`[Main] Processing ${attachments.length} attachments`);
      for (const attachment of attachments) {
        console.log(`[Main] Processing attachment: ${attachment.name}, size: ${attachment.size}`);
        
        if (encryptionLevel && encryptionLevel !== 'plain' && quantumKey) {
          // Encrypt attachment data with quantum key
          console.log(`[Main] Encrypting attachment: ${attachment.name}`);
          const encryptedData = await encryptionEngine.encrypt(attachment.data, quantumKey.key, encryptionLevel);
          processedAttachments.push({
            name: attachment.name,
            type: attachment.type,
            size: attachment.size,
            data: encryptedData,
            encrypted: true,
            encryptionLevel: encryptionLevel
          });
        } else {
          // Keep attachment as-is for plain emails
          processedAttachments.push({
            name: attachment.name,
            type: attachment.type,
            size: attachment.size,
            data: attachment.data,
            encrypted: false
          });
        }
      }
    }

    const emailToSend = {
      to,
      subject: encryptedSubject,
      body: encryptedBody,
      attachments: processedAttachments, // Use processed attachments instead of raw attachments
      encrypted: encryptionLevel !== 'plain',
      encryptionLevel,
      keyId,
      originalKey: quantumKey ? quantumKey.key : null
    };

    console.log('[Main] Attempting to send email via Gmail API...');
    const result = await emailService.sendEmail(emailToSend);
    console.log('[Main] Email sent successfully:', result.messageId);
    return result;
  } catch (error) {
    console.error('[Main] Send email error:', error);
    throw error;
  }
});

// Settings management - THIS WAS MISSING!
ipcMain.handle('save-settings', async (event, settings) => {
  try {
    const settingsPath = path.join(__dirname, 'config', 'settings.json');
    await fs.promises.writeFile(settingsPath, JSON.stringify(settings, null, 2));
    return { success: true };
  } catch (error) {
    console.error('Save settings error:', error);
    throw error;
  }
});

ipcMain.handle('load-settings', async () => {
  try {
    const settingsPath = path.join(__dirname, 'config', 'settings.json');
    if (fs.existsSync(settingsPath)) {
      const settings = await fs.promises.readFile(settingsPath, 'utf8');
      return JSON.parse(settings);
    }
    return {};
  } catch (error) {
    console.error('Load settings error:', error);
    return {};
  }
});

// Gmail logout handler
ipcMain.handle('gmail-logout', async () => {
  try {
    initializeServices();
    if (emailService && emailService.logout) {
      emailService.logout();
    }
    // Clear the force auth flag
    process.env.FORCE_NEW_AUTH = 'false';
    return { success: true };
  } catch (error) {
    console.error('Logout error:', error);
    throw error;
  }
});

// Decrypt message handler
ipcMain.handle('decrypt-message', async (event, decryptionData) => {
  try {
    const { encryptedText, key, encryptionLevel, keyId, emailData } = decryptionData;
    
    if (!encryptedText || !key || !encryptionLevel) {
      throw new Error('Missing required decryption parameters');
    }
    
    console.log('[Main] Attempting to decrypt message...');
    console.log('[Main] Encryption Level:', encryptionLevel);
    console.log('[Main] Key ID:', keyId);
    console.log('[Main] Encrypted text to decrypt:', encryptedText);
    console.log('[Main] Decryption key:', key);
    
    // Initialize services if not already done
    initializeServices();
    
    // Decrypt the message using the encryption engine
    const decryptedText = await encryptionEngine.decrypt(encryptedText, key, encryptionLevel);
    
    console.log('[Main] Message decrypted successfully');
    console.log('[Main] Decrypted text:', decryptedText);
    console.log('[Main] Decrypted text type:', typeof decryptedText);
    console.log('[Main] Decrypted text length:', decryptedText ? decryptedText.length : 'null/undefined');
    
    // Extract and decrypt attachments from email data
    let decryptedAttachments = [];
    
    // For demo purposes, we'll create mock attachments if the email was sent with attachments
    // In a real implementation, attachments would be encrypted and stored separately
    if (emailData && emailData.body) {
      // Look for attachment information in the email body
      const attachmentMatches = emailData.body.match(/📎 Quantum-Encrypted Attachments \((\d+)\):/);
      if (attachmentMatches) {
        const attachmentCount = parseInt(attachmentMatches[1]);
        console.log('[Main] Found', attachmentCount, 'attachments mentioned in email');
        
        // Extract attachment info from HTML
        const attachmentRegex = /<strong>([^<]+)<\/strong> \(([^)]+)\) - ([^<]+) Encrypted/g;
        let match;
        while ((match = attachmentRegex.exec(emailData.body)) !== null) {
          const [, filename, filesize, encryption] = match;
          
          // Create a demo file for download
          const demoContent = `This is a decrypted attachment: ${filename}\n\nOriginal encryption: ${encryption}\nDecrypted using QuMail quantum-safe technology.\n\nThis is a demo file to show attachment decryption functionality.`;
          const base64Content = Buffer.from(demoContent).toString('base64');
          
          decryptedAttachments.push({
            name: filename,
            size: demoContent.length,
            type: filename.endsWith('.pdf') ? 'application/pdf' : 
                  filename.endsWith('.txt') ? 'text/plain' :
                  filename.endsWith('.doc') ? 'application/msword' :
                  filename.endsWith('.jpg') || filename.endsWith('.png') ? 'image/jpeg' :
                  'application/octet-stream',
            data: base64Content
          });
        }
      }
    }
    
    // Also check for actual attachments in the email object
    if (emailData && emailData.attachments && emailData.attachments.length > 0) {
      console.log('[Main] Found', emailData.attachments.length, 'actual attachments to decrypt');
      
      for (const attachment of emailData.attachments) {
        try {
          let attachmentData = attachment.data;
          
          // If we don't have data but have attachmentId, download it
          if (!attachmentData && attachment.attachmentId) {
            console.log(`[Main] Downloading attachment data for ${attachment.filename}`);
            try {
              initializeServices();
              if (emailService && emailService.isAuthenticated()) {
                attachmentData = await emailService.downloadAttachment(emailData.id, attachment.attachmentId);
                console.log(`[Main] Downloaded attachment data, length: ${attachmentData.length}`);
              } else {
                console.log('[Main] Email service not available, skipping attachment download');
                continue;
              }
            } catch (downloadError) {
              console.error('[Main] Error downloading attachment:', downloadError);
              continue;
            }
          }
          
          // Try to decrypt the attachment data if it's encrypted
          if (attachment.encrypted && attachmentData) {
            try {
              // Decrypt the attachment using the same key
              attachmentData = await encryptionEngine.decrypt(attachmentData, key, encryptionLevel);
            } catch (decryptError) {
              console.log('[Main] Attachment not encrypted or using different key, using as-is');
            }
          }
          
          if (attachmentData) {
            decryptedAttachments.push({
              name: attachment.name || attachment.filename || 'Unknown File',
              size: attachment.size || 0,
              type: attachment.type || attachment.mimeType || 'application/octet-stream',
              data: attachmentData,
              messageId: emailData.id,
              attachmentId: attachment.attachmentId
            });
          }
        } catch (attachmentError) {
          console.error('[Main] Error processing attachment:', attachmentError);
        }
      }
    }
    
    return {
      success: true,
      decryptedText,
      originalEncryption: encryptionLevel,
      keyId,
      attachments: decryptedAttachments
    };
  } catch (error) {
    console.error('[Main] Decrypt message error:', error);
    return {
      success: false,
      error: error.message
    };
  }
});

// Force new authentication handler
ipcMain.handle('force-new-auth', async () => {
  try {
    console.log('[Main] Setting force new authentication flag');
    process.env.FORCE_NEW_AUTH = 'true';
    
    // Clear existing tokens
    const tokenPath = path.join(__dirname, 'config', 'gmail_tokens.json');
    if (fs.existsSync(tokenPath)) {
      fs.unlinkSync(tokenPath);
      console.log('[Main] Cleared existing Gmail tokens');
    }
    
    // Reset email service
    initializeServices();
    if (emailService && emailService.logout) {
      emailService.logout();
    }
    
    return { success: true };
  } catch (error) {
    console.error('Force new auth error:', error);
    throw error;
  }
});

// Log email analysis from renderer
ipcMain.on('log-email-analysis', (event, analysisData) => {
  console.log('=== RENDERER EMAIL ANALYSIS ===');
  console.log('Subject:', analysisData.subject);
  console.log('Body length:', analysisData.bodyLength);
  console.log('Body content:', analysisData.bodyContent);
  console.log('Snippet:', analysisData.snippet);
  console.log('Full email keys:', Object.keys(analysisData.fullEmail || {}));
  console.log('=== END RENDERER ANALYSIS ===');
});

// Download attachment handler
ipcMain.handle('download-attachment', async (event, messageId, attachmentId) => {
  try {
    console.log(`[Main] Downloading attachment ${attachmentId} from message ${messageId}`);
    initializeServices();
    
    if (!emailService || !emailService.isAuthenticated()) {
      throw new Error('Email service not authenticated');
    }
    
    const attachmentData = await emailService.downloadAttachment(messageId, attachmentId);
    console.log(`[Main] Successfully downloaded attachment, data length: ${attachmentData.length}`);
    console.log(`[Main] First 100 chars of attachment data: ${attachmentData.substring(0, 100)}`);
    console.log(`[Main] Last 50 chars of attachment data: ${attachmentData.substring(attachmentData.length - 50)}`);
    
    // Validate base64 format
    const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
    if (!base64Regex.test(attachmentData)) {
      console.error('[Main] Invalid base64 data detected in main process');
      return {
        success: false,
        error: 'Invalid base64 data format'
      };
    }
    
    return {
      success: true,
      data: attachmentData
    };
  } catch (error) {
    console.error('[Main] Download attachment error:', error);
    return {
      success: false,
      error: error.message
    };
  }
});

// Decrypt attachment handler
ipcMain.handle('decrypt-attachment', async (event, encryptedData, key, encryptionLevel) => {
  try {
    console.log(`[Main] Decrypting attachment with ${encryptionLevel} encryption`);
    initializeServices();
    
    const decryptedData = await encryptionEngine.decrypt(encryptedData, key, encryptionLevel);
    console.log(`[Main] Successfully decrypted attachment, data length: ${decryptedData.length}`);
    
    return {
      success: true,
      data: decryptedData
    };
  } catch (error) {
    console.error('[Main] Decrypt attachment error:', error);
    return {
      success: false,
      error: error.message
    };
  }
});

// Log extraction method from renderer
ipcMain.on('log-extraction-method', (event, method, data) => {
  console.log(`=== RENDERER EXTRACTION: ${method} ===`);
  if (data) {
    console.log('Extracted data:', data);
    console.log('Data length:', data.length);
  } else {
    console.log('No data extracted');
  }
  console.log('=== END EXTRACTION LOG ===');
});

// Log final extraction from renderer
ipcMain.on('log-final-extraction', (event, data) => {
  console.log('=== RENDERER FINAL EXTRACTION ===');
  console.log('Final extracted data:', data);
  console.log('Final data length:', data ? data.length : 'null');
  console.log('=== END FINAL EXTRACTION ===');
});

// ETSI QKD IPC Handlers
ipcMain.handle('etsi-get-status', async () => {
  try {
    initializeServices();
    const status = await etsiKeyManager.getSystemStatus();
    return status;
  } catch (error) {
    console.error('ETSI status error:', error);
    return { error: error.message };
  }
});

ipcMain.handle('etsi-get-statistics', async () => {
  try {
    initializeServices();
    const stats = await etsiKeyManager.getETSIStatistics();
    return stats;
  } catch (error) {
    console.error('ETSI statistics error:', error);
    return { error: error.message };
  }
});

ipcMain.handle('etsi-test-connectivity', async () => {
  try {
    initializeServices();
    const results = await etsiKeyManager.testConnectivity();
    return results;
  } catch (error) {
    console.error('ETSI connectivity test error:', error);
    return { error: error.message };
  }
});

ipcMain.handle('etsi-set-mode', async (event, mode) => {
  try {
    initializeServices();
    etsiKeyManager.setPreferredMode(mode);
    return { success: true, mode: mode };
  } catch (error) {
    console.error('ETSI set mode error:', error);
    return { error: error.message };
  }
});

ipcMain.handle('etsi-get-config', async () => {
  try {
    initializeServices();
    const config = etsiKeyManager.getConfiguration();
    return config;
  } catch (error) {
    console.error('ETSI get config error:', error);
    return { error: error.message };
  }
});

module.exports = app;
