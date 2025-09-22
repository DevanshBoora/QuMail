const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

class QKDServer {
  constructor(port = 3001) {
    this.port = port;
    this.app = express();
    this.server = null;
    this.quantumKeys = new Map();
    this.keyPool = [];
    this.setupMiddleware();
    this.setupRoutes();
    this.generateInitialKeyPool();
  }

  setupMiddleware() {
    this.app.use(cors());
    this.app.use(express.json());
    this.app.use((req, res, next) => {
      console.log(`[QKD Server] ${new Date().toISOString()} - ${req.method} ${req.path}`);
      next();
    });
  }

  setupRoutes() {
    // Get server status
    this.app.get('/api/v1/status', (req, res) => {
      res.json({
        status: 'active',
        keysAvailable: this.keyPool.length,
        keysInUse: this.quantumKeys.size,
        timestamp: new Date().toISOString()
      });
    });

    // Get available quantum keys
    this.app.get('/api/v1/keys', (req, res) => {
      res.json({
        availableKeys: this.keyPool.length,
        keys: this.keyPool.map(key => ({
          keyId: key.keyId,
          algorithm: key.algorithm,
          keySize: key.keySize,
          timestamp: key.timestamp
        }))
      });
    });

    // Reserve a quantum key
    this.app.post('/api/v1/keys/reserve', (req, res) => {
      if (this.keyPool.length === 0) {
        this.generateMoreKeys(10);
      }

      const key = this.keyPool.shift();
      if (!key) {
        return res.status(503).json({
          error: 'No quantum keys available',
          code: 'KEYS_EXHAUSTED'
        });
      }

      this.quantumKeys.set(key.keyId, {
        ...key,
        reservedAt: new Date().toISOString(),
        status: 'reserved'
      });

      res.json({
        keyId: key.keyId,
        key: key.key,
        algorithm: key.algorithm,
        keySize: key.keySize,
        timestamp: key.timestamp
      });
    });

    // Release a quantum key
    this.app.delete('/api/v1/keys/:keyId', (req, res) => {
      const keyId = req.params.keyId;
      if (this.quantumKeys.has(keyId)) {
        this.quantumKeys.delete(keyId);
        res.json({ success: true, message: 'Key released' });
      } else {
        res.status(404).json({ error: 'Key not found' });
      }
    });
  }

  generateInitialKeyPool() {
    console.log('[QKD Server] Generating initial quantum key pool...');
    this.generateMoreKeys(20);
    console.log(`[QKD Server] Generated ${this.keyPool.length} initial quantum keys`);
  }

  generateMoreKeys(count) {
    for (let i = 0; i < count; i++) {
      const key = this.generateQuantumKey();
      this.keyPool.push(key);
    }
  }

  generateQuantumKey() {
    const keyId = uuidv4();
    const keySize = 256; // 256-bit key
    const key = this.generateSecureRandomKey(keySize / 8); // Convert to bytes
    
    return {
      keyId,
      key: key.toString('hex'),
      algorithm: 'quantum-safe',
      keySize,
      timestamp: new Date().toISOString(),
      entropy: 'high'
    };
  }

  generateSecureRandomKey(bytes) {
    const crypto = require('crypto');
    return crypto.randomBytes(bytes);
  }

  async start() {
    return new Promise((resolve, reject) => {
      this.server = this.app.listen(this.port, '0.0.0.0', () => {
        console.log(`[QKD Server] Listening on 0.0.0.0:${this.port}`);
        console.log(`[QKD Server] Started successfully on port ${this.port}`);
        console.log('[QKD Server] API Documentation:');
        console.log(`  GET  http://localhost:${this.port}/api/v1/status`);
        console.log(`  GET  http://localhost:${this.port}/api/v1/keys`);
        console.log(`  POST http://localhost:${this.port}/api/v1/keys/reserve`);
        resolve(this.server);
      });

      this.server.on('error', (error) => {
        console.error('[QKD Server] Failed to start:', error);
        reject(error);
      });
    });
  }

  async stop() {
    if (this.server) {
      return new Promise((resolve) => {
        this.server.close(() => {
          console.log('[QKD Server] Stopped');
          resolve();
        });
      });
    }
  }
}

module.exports = QKDServer;
