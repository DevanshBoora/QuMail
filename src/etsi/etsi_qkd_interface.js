const axios = require('axios');

/**
 * ETSI GS QKD 004 v2.1.1 Client Interface
 * Provides standardized client-side implementation for ETSI QKD protocols
 */
class ETSIQKDInterface {
    constructor(serverUrl = 'http://localhost:3443', options = {}) {
        this.serverUrl = serverUrl;
        this.timeout = options.timeout || 10000;
        this.retryAttempts = options.retryAttempts || 3;
        this.retryDelay = options.retryDelay || 1000;
        
        // ETSI connection management
        this.activeConnections = new Map();
        this.connectionPool = [];
        
        // TLS/Certificate options for production
        this.tlsOptions = options.tls || {};
        
        console.log(`[ETSI QKD Interface] Initialized with server: ${serverUrl}`);
    }

    /**
     * Open ETSI QKD Connection
     * Implements ETSI GS QKD 004 open_connect operation
     */
    async openConnection(source, destination, qosRequirements = {}) {
        try {
            console.log(`[ETSI QKD Interface] Opening connection: ${source} -> ${destination}`);
            
            const response = await this.makeRequest('POST', '/api/v1/keys/open_connect', {
                source: source,
                destination: destination,
                qos_requirements: qosRequirements
            });

            if (response.connection_id) {
                const connectionInfo = {
                    connection_id: response.connection_id,
                    source: source,
                    destination: destination,
                    status: response.status,
                    created_at: new Date().toISOString(),
                    qos_requirements: qosRequirements
                };

                this.activeConnections.set(response.connection_id, connectionInfo);
                console.log(`[ETSI QKD Interface] Connection established: ${response.connection_id}`);
                
                return {
                    success: true,
                    connection_id: response.connection_id,
                    status: response.status,
                    message: response.message
                };
            }

            throw new Error('Invalid response from ETSI QKD server');

        } catch (error) {
            console.error('[ETSI QKD Interface] Failed to open connection:', error.message);
            return {
                success: false,
                error: error.message,
                code: 'CONNECTION_FAILED'
            };
        }
    }

    /**
     * Get Quantum Keys
     * Implements ETSI GS QKD 004 get_key operation
     */
    async getQuantumKeys(connectionId, options = {}) {
        try {
            const keyCount = options.number || 1;
            const keySize = options.size || 256;

            console.log(`[ETSI QKD Interface] Requesting ${keyCount} keys of ${keySize} bits for connection: ${connectionId}`);

            const response = await this.makeRequest('POST', '/api/v1/keys/get_key', {
                connection_id: connectionId,
                number: keyCount,
                size: keySize
            });

            if (response.keys && Array.isArray(response.keys)) {
                console.log(`[ETSI QKD Interface] Received ${response.keys.length} quantum keys`);
                
                return {
                    success: true,
                    keys: response.keys.map(key => ({
                        ksid: key.ksid,
                        key: key.key,
                        size: key.size,
                        status: key.status,
                        algorithm: 'ETSI_QUANTUM_SAFE',
                        timestamp: response.timestamp
                    })),
                    connection_id: connectionId,
                    timestamp: response.timestamp
                };
            }

            throw new Error('Invalid key response from ETSI QKD server');

        } catch (error) {
            console.error('[ETSI QKD Interface] Failed to get quantum keys:', error.message);
            return {
                success: false,
                error: error.message,
                code: 'KEY_REQUEST_FAILED'
            };
        }
    }

    /**
     * Get Connection Status
     * Implements ETSI GS QKD 004 get_status operation
     */
    async getConnectionStatus(connectionId) {
        try {
            console.log(`[ETSI QKD Interface] Getting status for connection: ${connectionId}`);

            const response = await this.makeRequest('POST', '/api/v1/keys/get_status', {
                connection_id: connectionId
            });

            return {
                success: true,
                connection_id: response.connection_id,
                status: response.status,
                source: response.source,
                destination: response.destination,
                active_keys: response.active_keys,
                created_at: response.created_at,
                last_activity: response.last_activity,
                qos_requirements: response.qos_requirements
            };

        } catch (error) {
            console.error('[ETSI QKD Interface] Failed to get connection status:', error.message);
            return {
                success: false,
                error: error.message,
                code: 'STATUS_REQUEST_FAILED'
            };
        }
    }

    /**
     * Close Connection
     * Implements ETSI GS QKD 004 close operation
     */
    async closeConnection(connectionId) {
        try {
            console.log(`[ETSI QKD Interface] Closing connection: ${connectionId}`);

            const response = await this.makeRequest('POST', '/api/v1/keys/close', {
                connection_id: connectionId
            });

            // Remove from active connections
            this.activeConnections.delete(connectionId);

            console.log(`[ETSI QKD Interface] Connection closed: ${connectionId}`);

            return {
                success: true,
                connection_id: response.connection_id,
                status: response.status,
                message: response.message,
                keys_removed: response.keys_removed
            };

        } catch (error) {
            console.error('[ETSI QKD Interface] Failed to close connection:', error.message);
            return {
                success: false,
                error: error.message,
                code: 'CONNECTION_CLOSE_FAILED'
            };
        }
    }

    /**
     * Get Server Status and Capabilities
     */
    async getServerStatus() {
        try {
            const response = await this.makeRequest('GET', '/api/v1/status');
            
            return {
                success: true,
                status: response.status,
                version: response.version,
                supported_protocols: response.supported_protocols,
                capabilities: {
                    max_key_size: response.max_key_size,
                    max_key_count: response.max_key_count,
                    supported_algorithms: response.supported_algorithms
                },
                active_connections: response.active_connections,
                active_key_streams: response.active_key_streams,
                timestamp: response.timestamp
            };

        } catch (error) {
            console.error('[ETSI QKD Interface] Failed to get server status:', error.message);
            return {
                success: false,
                error: error.message,
                code: 'SERVER_UNAVAILABLE'
            };
        }
    }

    /**
     * Get ETSI Statistics
     */
    async getStatistics() {
        try {
            const response = await this.makeRequest('GET', '/api/v1/statistics');
            return {
                success: true,
                statistics: response
            };
        } catch (error) {
            console.error('[ETSI QKD Interface] Failed to get statistics:', error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * High-level method to get a single quantum key with automatic connection management
     */
    async getQuantumKey(source = 'qumail_client', destination = 'qumail_server', keySize = 256) {
        try {
            // Try to reuse existing connection
            let connectionId = null;
            for (const [id, conn] of this.activeConnections) {
                if (conn.source === source && conn.destination === destination) {
                    connectionId = id;
                    break;
                }
            }

            // Open new connection if needed
            if (!connectionId) {
                const connectionResult = await this.openConnection(source, destination);
                if (!connectionResult.success) {
                    throw new Error(`Failed to open connection: ${connectionResult.error}`);
                }
                connectionId = connectionResult.connection_id;
            }

            // Get quantum key
            const keyResult = await this.getQuantumKeys(connectionId, { number: 1, size: keySize });
            if (!keyResult.success) {
                throw new Error(`Failed to get quantum key: ${keyResult.error}`);
            }

            const key = keyResult.keys[0];
            return {
                success: true,
                keyId: key.ksid,
                key: key.key,
                algorithm: key.algorithm,
                keySize: key.size,
                timestamp: key.timestamp,
                connection_id: connectionId,
                etsi_compliant: true
            };

        } catch (error) {
            console.error('[ETSI QKD Interface] Failed to get quantum key:', error.message);
            return {
                success: false,
                error: error.message,
                etsi_compliant: false
            };
        }
    }

    /**
     * Make HTTP request with retry logic and error handling
     */
    async makeRequest(method, endpoint, data = null) {
        let lastError = null;

        for (let attempt = 1; attempt <= this.retryAttempts; attempt++) {
            try {
                const config = {
                    method: method,
                    url: `${this.serverUrl}${endpoint}`,
                    timeout: this.timeout,
                    headers: {
                        'Content-Type': 'application/json',
                        'User-Agent': 'QuMail-ETSI-Client/1.0.0'
                    }
                };

                if (data) {
                    config.data = data;
                }

                // Add TLS options for production
                if (this.tlsOptions.cert) {
                    config.httpsAgent = new (require('https')).Agent(this.tlsOptions);
                }

                const response = await axios(config);
                return response.data;

            } catch (error) {
                lastError = error;
                console.warn(`[ETSI QKD Interface] Request attempt ${attempt}/${this.retryAttempts} failed:`, error.message);

                if (attempt < this.retryAttempts) {
                    await new Promise(resolve => setTimeout(resolve, this.retryDelay * attempt));
                }
            }
        }

        throw lastError;
    }

    /**
     * Cleanup all active connections
     */
    async cleanup() {
        console.log('[ETSI QKD Interface] Cleaning up active connections...');
        
        const closePromises = Array.from(this.activeConnections.keys()).map(connectionId => 
            this.closeConnection(connectionId)
        );

        await Promise.allSettled(closePromises);
        this.activeConnections.clear();
        
        console.log('[ETSI QKD Interface] Cleanup completed');
    }

    /**
     * Get active connections info
     */
    getActiveConnections() {
        return Array.from(this.activeConnections.values());
    }
}

module.exports = { ETSIQKDInterface };
