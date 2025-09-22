const axios = require('axios');

class QKDClient {
  constructor(serverUrl = 'http://localhost:3001') {
    this.serverUrl = serverUrl;
    this.timeout = 5000;
  }

  updateServerUrl(url) {
    this.serverUrl = url;
    console.log(`[QKD Client] Updated server URL to ${url}`);
  }

  async getStatus() {
    try {
      console.log(`[QKD Client] Getting status from: ${this.serverUrl}/api/v1/status`);
      const response = await axios.get(`${this.serverUrl}/api/v1/status`, {
        timeout: this.timeout
      });
      return response.data;
    } catch (error) {
      console.error('[QKD Client] Failed to get status:', error.message);
      throw new Error(`QKD Server unavailable: ${error.message}`);
    }
  }

  async getQuantumKey(keyId = null) {
    try {
      if (keyId) {
        // If specific key ID is requested, return a mock key for demo
        return {
          keyId: keyId,
          key: this.generateMockKey(),
          algorithm: 'quantum-safe',
          keySize: 256,
          timestamp: new Date().toISOString()
        };
      }

      // Reserve a new quantum key
      const response = await axios.post(`${this.serverUrl}/api/v1/keys/reserve`, {}, {
        timeout: this.timeout
      });
      
      return response.data;
    } catch (error) {
      console.error('[QKD Client] Failed to get quantum key:', error.message);
      
      // Fallback to mock key for demo purposes
      return {
        keyId: `mock-${Date.now()}`,
        key: this.generateMockKey(),
        algorithm: 'quantum-safe-mock',
        keySize: 256,
        timestamp: new Date().toISOString()
      };
    }
  }

  generateMockKey() {
    const crypto = require('crypto');
    return crypto.randomBytes(32).toString('hex'); // 256-bit key
  }

  async releaseKey(keyId) {
    try {
      await axios.delete(`${this.serverUrl}/api/v1/keys/${keyId}`, {
        timeout: this.timeout
      });
      return true;
    } catch (error) {
      console.error('[QKD Client] Failed to release key:', error.message);
      return false;
    }
  }

  async getAvailableKeys() {
    try {
      const response = await axios.get(`${this.serverUrl}/api/v1/keys`, {
        timeout: this.timeout
      });
      return response.data;
    } catch (error) {
      console.error('[QKD Client] Failed to get available keys:', error.message);
      return { availableKeys: 0, keys: [] };
    }
  }
}

module.exports = { QKDClient };
