const crypto = require('crypto');

class EncryptionEngine {
  constructor() {
    this.algorithms = {
      'plain': { encrypt: this.encryptPlain.bind(this), decrypt: this.decryptPlain.bind(this) },
      'aes256': { encrypt: this.encryptAES256.bind(this), decrypt: this.decryptAES256.bind(this) },
      'otp': { encrypt: this.encryptOTP.bind(this), decrypt: this.decryptOTP.bind(this) },
      'kyber': { encrypt: this.encryptKyber.bind(this), decrypt: this.decryptKyber.bind(this) }
    };
  }

  async encrypt(data, key, algorithm = 'aes256') {
    if (!this.algorithms[algorithm]) {
      throw new Error(`Unsupported encryption algorithm: ${algorithm}`);
    }
    
    console.log(`[Encryption] Encrypting with ${algorithm.toUpperCase()}`);
    return await this.algorithms[algorithm].encrypt(data, key);
  }

  async decrypt(encryptedData, key, algorithm = 'aes256') {
    if (!this.algorithms[algorithm]) {
      throw new Error(`Unsupported decryption algorithm: ${algorithm}`);
    }
    
    console.log(`[Encryption] Decrypting with ${algorithm.toUpperCase()}`);
    return await this.algorithms[algorithm].decrypt(encryptedData, key);
  }

  // Plain text (no encryption)
  async encryptPlain(data, key) {
    return data;
  }

  async decryptPlain(data, key) {
    return data;
  }

  // AES-256 encryption
  async encryptAES256(data, key) {
    try {
      if (!data || typeof data !== 'string') {
        throw new Error('Invalid data: must be a non-empty string');
      }
      if (!key || key.length < 64) {
        throw new Error('Invalid key: must be at least 64 characters');
      }
      
      const keyBuffer = Buffer.from(key.substring(0, 64), 'hex'); // Use first 32 bytes
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipheriv('aes-256-cbc', keyBuffer, iv);
      
      let encrypted = cipher.update(data, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      
      return JSON.stringify({
        algorithm: 'aes256',
        iv: iv.toString('hex'),
        data: encrypted,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('[Encryption] AES256 encryption failed:', error);
      throw new Error(`AES256 encryption failed: ${error.message}`);
    }
  }

  async decryptAES256(encryptedData, key) {
    try {
      if (!encryptedData || typeof encryptedData !== 'string') {
        throw new Error('Invalid encrypted data');
      }
      
      const parsed = JSON.parse(encryptedData);
      if (!parsed.data || !parsed.iv) {
        throw new Error('Invalid encrypted data format');
      }
      
      const keyBuffer = Buffer.from(key.substring(0, 64), 'hex');
      const iv = Buffer.from(parsed.iv, 'hex');
      const decipher = crypto.createDecipheriv('aes-256-cbc', keyBuffer, iv);
      
      let decrypted = decipher.update(parsed.data, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      
      return decrypted;
    } catch (error) {
      console.error('[Encryption] AES256 decryption failed:', error);
      throw new Error(`AES256 decryption failed: ${error.message}`);
    }
  }

  // One-Time Pad (OTP) encryption
  async encryptOTP(data, key) {
    try {
      const keyBuffer = Buffer.from(key, 'hex');
      const dataBuffer = Buffer.from(data, 'utf8');
      const encrypted = Buffer.alloc(dataBuffer.length);
      
      for (let i = 0; i < dataBuffer.length; i++) {
        encrypted[i] = dataBuffer[i] ^ keyBuffer[i % keyBuffer.length];
      }
      
      return JSON.stringify({
        algorithm: 'otp',
        data: encrypted.toString('hex'),
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('[Encryption] OTP encryption failed:', error);
      throw new Error('OTP encryption failed');
    }
  }

  async decryptOTP(encryptedData, key) {
    try {
      const parsed = JSON.parse(encryptedData);
      const keyBuffer = Buffer.from(key, 'hex');
      const encryptedBuffer = Buffer.from(parsed.data, 'hex');
      const decrypted = Buffer.alloc(encryptedBuffer.length);
      
      for (let i = 0; i < encryptedBuffer.length; i++) {
        decrypted[i] = encryptedBuffer[i] ^ keyBuffer[i % keyBuffer.length];
      }
      
      return decrypted.toString('utf8');
    } catch (error) {
      console.error('[Encryption] OTP decryption failed:', error);
      throw new Error('OTP decryption failed');
    }
  }

  // Kyber Post-Quantum Cryptography (simulated)
  async encryptKyber(data, key) {
    try {
      if (!data || typeof data !== 'string') {
        throw new Error('Invalid data: must be a non-empty string');
      }
      if (!key || key.length < 64) {
        throw new Error('Invalid key: must be at least 64 characters');
      }
      
      // Simulate Kyber encryption with AES + additional entropy
      const keyBuffer = Buffer.from(key, 'hex');
      const entropy = crypto.randomBytes(16);
      const iv = crypto.randomBytes(16);
      const combinedKey = Buffer.concat([keyBuffer.slice(0, 16), entropy]);
      
      const cipher = crypto.createCipheriv('aes-256-cbc', combinedKey, iv);
      let encrypted = cipher.update(data, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      
      return JSON.stringify({
        algorithm: 'kyber',
        data: encrypted,
        entropy: entropy.toString('hex'),
        iv: iv.toString('hex'),
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('[Encryption] Kyber encryption failed:', error);
      throw new Error(`Kyber encryption failed: ${error.message}`);
    }
  }

  async decryptKyber(encryptedData, key) {
    try {
      if (!encryptedData || typeof encryptedData !== 'string') {
        throw new Error('Invalid encrypted data');
      }
      
      const parsed = JSON.parse(encryptedData);
      if (!parsed.data || !parsed.entropy || !parsed.iv) {
        throw new Error('Invalid encrypted data format');
      }
      
      const keyBuffer = Buffer.from(key, 'hex');
      const entropy = Buffer.from(parsed.entropy, 'hex');
      const iv = Buffer.from(parsed.iv, 'hex');
      const combinedKey = Buffer.concat([keyBuffer.slice(0, 16), entropy]);
      
      const decipher = crypto.createDecipheriv('aes-256-cbc', combinedKey, iv);
      let decrypted = decipher.update(parsed.data, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      
      return decrypted;
    } catch (error) {
      console.error('[Encryption] Kyber decryption failed:', error);
      throw new Error(`Kyber decryption failed: ${error.message}`);
    }
  }

  getSupportedAlgorithms() {
    return Object.keys(this.algorithms);
  }
}

module.exports = { EncryptionEngine };
