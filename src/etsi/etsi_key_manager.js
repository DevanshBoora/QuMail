const { ETSIQKDInterface } = require('./etsi_qkd_interface');
const { QKDClient } = require('../qkd_client/qkd_client');

/**
 * ETSI Key Manager - Bridge between QuMail and ETSI QKD Systems
 * Provides seamless integration with existing QuMail workflows while adding ETSI compliance
 */
class ETSIKeyManager {
    constructor(options = {}) {
        this.etsiServerUrl = options.etsiServerUrl || 'http://localhost:3443';
        this.customServerUrl = options.customServerUrl || 'http://localhost:3001';
        this.fallbackEnabled = options.fallbackEnabled !== false;
        
        // Initialize both ETSI and custom QKD clients
        this.etsiClient = new ETSIQKDInterface(this.etsiServerUrl, {
            timeout: options.timeout || 10000,
            retryAttempts: options.retryAttempts || 3
        });
        
        this.customClient = new QKDClient(this.customServerUrl);
        
        // Connection management
        this.preferredMode = options.preferredMode || 'etsi'; // 'etsi' or 'custom'
        this.connectionCache = new Map();
        
        console.log(`[ETSI Key Manager] Initialized with ETSI: ${this.etsiServerUrl}, Custom: ${this.customServerUrl}`);
    }

    /**
     * Get quantum key with automatic ETSI/Custom fallback
     */
    async getQuantumKey(options = {}) {
        const keySize = options.keySize || 256;
        const source = options.source || 'qumail_client';
        const destination = options.destination || 'qumail_server';
        
        console.log(`[ETSI Key Manager] Requesting quantum key (${keySize} bits) - Mode: ${this.preferredMode}`);

        // Try ETSI first if preferred
        if (this.preferredMode === 'etsi') {
            const etsiResult = await this.getETSIKey(source, destination, keySize);
            if (etsiResult.success) {
                return this.formatKeyResponse(etsiResult, 'etsi');
            }
            
            console.warn('[ETSI Key Manager] ETSI key request failed, falling back to custom QKD');
            
            if (this.fallbackEnabled) {
                const customResult = await this.getCustomKey();
                if (customResult) {
                    return this.formatKeyResponse(customResult, 'custom');
                }
            }
        } else {
            // Try custom first
            const customResult = await this.getCustomKey();
            if (customResult) {
                return this.formatKeyResponse(customResult, 'custom');
            }
            
            console.warn('[ETSI Key Manager] Custom key request failed, falling back to ETSI');
            
            const etsiResult = await this.getETSIKey(source, destination, keySize);
            if (etsiResult.success) {
                return this.formatKeyResponse(etsiResult, 'etsi');
            }
        }

        throw new Error('Both ETSI and custom QKD key requests failed');
    }

    /**
     * Get key from ETSI QKD system
     */
    async getETSIKey(source, destination, keySize) {
        try {
            return await this.etsiClient.getQuantumKey(source, destination, keySize);
        } catch (error) {
            console.error('[ETSI Key Manager] ETSI key request failed:', error.message);
            return { success: false, error: error.message };
        }
    }

    /**
     * Get key from custom QKD system
     */
    async getCustomKey() {
        try {
            return await this.customClient.getQuantumKey();
        } catch (error) {
            console.error('[ETSI Key Manager] Custom key request failed:', error.message);
            return null;
        }
    }

    /**
     * Format key response to unified format
     */
    formatKeyResponse(keyData, source) {
        if (source === 'etsi') {
            return {
                keyId: keyData.keyId,
                key: keyData.key,
                algorithm: keyData.algorithm || 'etsi-quantum-safe',
                keySize: keyData.keySize,
                timestamp: keyData.timestamp,
                source: 'etsi',
                etsi_compliant: true,
                connection_id: keyData.connection_id
            };
        } else {
            return {
                keyId: keyData.keyId,
                key: keyData.key,
                algorithm: keyData.algorithm || 'quantum-safe',
                keySize: keyData.keySize,
                timestamp: keyData.timestamp,
                source: 'custom',
                etsi_compliant: false
            };
        }
    }

    /**
     * Get server status from both systems
     */
    async getSystemStatus() {
        const status = {
            etsi: { available: false, error: null },
            custom: { available: false, error: null },
            preferred_mode: this.preferredMode,
            fallback_enabled: this.fallbackEnabled
        };

        // Check ETSI server
        try {
            const etsiStatus = await this.etsiClient.getServerStatus();
            if (etsiStatus.success) {
                status.etsi = {
                    available: true,
                    status: etsiStatus.status,
                    version: etsiStatus.version,
                    protocols: etsiStatus.supported_protocols,
                    capabilities: etsiStatus.capabilities,
                    connections: etsiStatus.active_connections,
                    key_streams: etsiStatus.active_key_streams
                };
            } else {
                status.etsi.error = etsiStatus.error;
            }
        } catch (error) {
            status.etsi.error = error.message;
        }

        // Check custom server
        try {
            const customStatus = await this.customClient.getStatus();
            status.custom = {
                available: true,
                status: customStatus.status,
                keys_available: customStatus.keysAvailable,
                keys_in_use: customStatus.keysInUse
            };
        } catch (error) {
            status.custom.error = error.message;
        }

        return status;
    }

    /**
     * Get ETSI statistics
     */
    async getETSIStatistics() {
        try {
            return await this.etsiClient.getStatistics();
        } catch (error) {
            console.error('[ETSI Key Manager] Failed to get ETSI statistics:', error.message);
            return { success: false, error: error.message };
        }
    }

    /**
     * Open ETSI connection manually
     */
    async openETSIConnection(source, destination, qosRequirements = {}) {
        try {
            const result = await this.etsiClient.openConnection(source, destination, qosRequirements);
            if (result.success) {
                this.connectionCache.set(result.connection_id, {
                    source,
                    destination,
                    created_at: new Date().toISOString()
                });
            }
            return result;
        } catch (error) {
            console.error('[ETSI Key Manager] Failed to open ETSI connection:', error.message);
            return { success: false, error: error.message };
        }
    }

    /**
     * Close ETSI connection
     */
    async closeETSIConnection(connectionId) {
        try {
            const result = await this.etsiClient.closeConnection(connectionId);
            if (result.success) {
                this.connectionCache.delete(connectionId);
            }
            return result;
        } catch (error) {
            console.error('[ETSI Key Manager] Failed to close ETSI connection:', error.message);
            return { success: false, error: error.message };
        }
    }

    /**
     * Get active ETSI connections
     */
    getActiveETSIConnections() {
        return this.etsiClient.getActiveConnections();
    }

    /**
     * Switch preferred mode
     */
    setPreferredMode(mode) {
        if (mode === 'etsi' || mode === 'custom') {
            this.preferredMode = mode;
            console.log(`[ETSI Key Manager] Switched to ${mode} mode`);
        } else {
            throw new Error('Invalid mode. Use "etsi" or "custom"');
        }
    }

    /**
     * Enable/disable fallback
     */
    setFallbackEnabled(enabled) {
        this.fallbackEnabled = enabled;
        console.log(`[ETSI Key Manager] Fallback ${enabled ? 'enabled' : 'disabled'}`);
    }

    /**
     * Test connectivity to both systems
     */
    async testConnectivity() {
        const results = {
            etsi: { success: false, latency: null, error: null },
            custom: { success: false, latency: null, error: null }
        };

        // Test ETSI
        try {
            const startTime = Date.now();
            const etsiStatus = await this.etsiClient.getServerStatus();
            results.etsi.latency = Date.now() - startTime;
            results.etsi.success = etsiStatus.success;
            if (!etsiStatus.success) {
                results.etsi.error = etsiStatus.error;
            }
        } catch (error) {
            results.etsi.error = error.message;
        }

        // Test Custom
        try {
            const startTime = Date.now();
            const customStatus = await this.customClient.getStatus();
            results.custom.latency = Date.now() - startTime;
            results.custom.success = true;
        } catch (error) {
            results.custom.error = error.message;
        }

        return results;
    }

    /**
     * Cleanup all connections
     */
    async cleanup() {
        console.log('[ETSI Key Manager] Cleaning up...');
        
        try {
            await this.etsiClient.cleanup();
        } catch (error) {
            console.error('[ETSI Key Manager] Error during ETSI cleanup:', error.message);
        }

        this.connectionCache.clear();
        console.log('[ETSI Key Manager] Cleanup completed');
    }

    /**
     * Get configuration info
     */
    getConfiguration() {
        return {
            etsi_server: this.etsiServerUrl,
            custom_server: this.customServerUrl,
            preferred_mode: this.preferredMode,
            fallback_enabled: this.fallbackEnabled,
            active_connections: this.connectionCache.size
        };
    }
}

module.exports = { ETSIKeyManager };
