/**
 * Quantum Visualizer - Real-time Quantum Security Visualization
 * Creates stunning visual representations of quantum key generation and security states
 */
class QuantumVisualizer {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.canvas = null;
        this.ctx = null;
        this.animationId = null;
        this.particles = [];
        this.quantumKeys = [];
        this.securityLevel = 'medium';
        this.isGeneratingKey = false;
        this.keyGenerationProgress = 0;
        
        // Quantum visualization settings
        this.settings = {
            particleCount: 50,
            maxParticles: 100,
            keyVisualizationTime: 3000,
            colors: {
                quantum: '#8b5cf6',
                entangled: '#06d6a0',
                secure: '#22c55e',
                warning: '#f59e0b',
                danger: '#ef4444'
            }
        };
        
        this.init();
    }

    init() {
        this.createCanvas();
        this.createParticles();
        this.startAnimation();
        this.setupEventListeners();
        console.log('[Quantum Visualizer] Initialized with quantum particle simulation');
    }

    createCanvas() {
        // Create main canvas
        this.canvas = document.createElement('canvas');
        this.canvas.id = 'quantum-canvas';
        this.canvas.width = 800;
        this.canvas.height = 400;
        this.ctx = this.canvas.getContext('2d');
        
        // Create container structure
        this.container.innerHTML = `
            <div class="quantum-visualizer">
                <div class="quantum-header">
                    <h3>🔬 Quantum Security Visualization</h3>
                    <div class="quantum-status">
                        <div class="status-indicator" id="quantum-status">
                            <div class="status-dot"></div>
                            <span>Quantum Field Active</span>
                        </div>
                    </div>
                </div>
                
                <div class="quantum-canvas-container">
                    <div class="quantum-overlay">
                        <div class="security-level-indicator" id="security-level">
                            <div class="level-bar">
                                <div class="level-fill" id="level-fill"></div>
                            </div>
                            <span class="level-text" id="level-text">Security Level: MEDIUM</span>
                        </div>
                        
                        <div class="key-generation-indicator" id="key-generation" style="display: none;">
                            <div class="generation-progress">
                                <div class="progress-bar">
                                    <div class="progress-fill" id="progress-fill"></div>
                                </div>
                                <span class="generation-text">Generating Quantum Key...</span>
                            </div>
                        </div>
                        
                        <div class="quantum-metrics" id="quantum-metrics">
                            <div class="metric">
                                <span class="metric-label">Entangled Pairs:</span>
                                <span class="metric-value" id="entangled-count">0</span>
                            </div>
                            <div class="metric">
                                <span class="metric-label">Quantum Keys:</span>
                                <span class="metric-value" id="key-count">0</span>
                            </div>
                            <div class="metric">
                                <span class="metric-label">Security Entropy:</span>
                                <span class="metric-value" id="entropy-level">HIGH</span>
                            </div>
                        </div>
                    </div>
                </div>
                
                <div class="quantum-controls">
                    <button class="quantum-btn" id="generate-key-btn">
                        ⚡ Generate Quantum Key
                    </button>
                    <button class="quantum-btn secondary" id="security-scan-btn">
                        🔍 Security Scan
                    </button>
                    <button class="quantum-btn secondary" id="entangle-particles-btn">
                        🌀 Entangle Particles
                    </button>
                </div>
            </div>
        `;
        
        // Append canvas to container
        const canvasContainer = this.container.querySelector('.quantum-canvas-container');
        canvasContainer.appendChild(this.canvas);
    }

    createParticles() {
        this.particles = [];
        for (let i = 0; i < this.settings.particleCount; i++) {
            this.particles.push(this.createParticle());
        }
    }

    createParticle() {
        return {
            x: Math.random() * this.canvas.width,
            y: Math.random() * this.canvas.height,
            vx: (Math.random() - 0.5) * 2,
            vy: (Math.random() - 0.5) * 2,
            size: Math.random() * 3 + 1,
            color: this.getQuantumColor(),
            entangled: false,
            entangledWith: null,
            energy: Math.random(),
            phase: Math.random() * Math.PI * 2,
            lifetime: Math.random() * 1000 + 500
        };
    }

    getQuantumColor() {
        const colors = [
            this.settings.colors.quantum,
            this.settings.colors.entangled,
            this.settings.colors.secure
        ];
        return colors[Math.floor(Math.random() * colors.length)];
    }

    startAnimation() {
        const animate = () => {
            this.update();
            this.draw();
            this.animationId = requestAnimationFrame(animate);
        };
        animate();
    }

    update() {
        // Update particles
        this.particles.forEach((particle, index) => {
            // Update position
            particle.x += particle.vx;
            particle.y += particle.vy;
            
            // Bounce off walls
            if (particle.x <= 0 || particle.x >= this.canvas.width) {
                particle.vx *= -1;
            }
            if (particle.y <= 0 || particle.y >= this.canvas.height) {
                particle.vy *= -1;
            }
            
            // Keep particles in bounds
            particle.x = Math.max(0, Math.min(this.canvas.width, particle.x));
            particle.y = Math.max(0, Math.min(this.canvas.height, particle.y));
            
            // Update quantum properties
            particle.phase += 0.05;
            particle.energy = (Math.sin(particle.phase) + 1) / 2;
            
            // Update lifetime
            particle.lifetime--;
            if (particle.lifetime <= 0) {
                this.particles[index] = this.createParticle();
            }
        });
        
        // Update entanglements
        this.updateEntanglements();
        
        // Update metrics
        this.updateMetrics();
        
        // Update key generation progress
        if (this.isGeneratingKey) {
            this.keyGenerationProgress += 2;
            if (this.keyGenerationProgress >= 100) {
                this.completeKeyGeneration();
            }
            this.updateKeyGenerationUI();
        }
    }

    updateEntanglements() {
        // Create quantum entanglements between nearby particles
        this.particles.forEach((particle1, i) => {
            this.particles.forEach((particle2, j) => {
                if (i !== j) {
                    const distance = Math.sqrt(
                        Math.pow(particle1.x - particle2.x, 2) + 
                        Math.pow(particle1.y - particle2.y, 2)
                    );
                    
                    if (distance < 50 && Math.random() < 0.01) {
                        particle1.entangled = true;
                        particle2.entangled = true;
                        particle1.entangledWith = j;
                        particle2.entangledWith = i;
                    }
                }
            });
        });
    }

    draw() {
        // Clear canvas with quantum field background
        const gradient = this.ctx.createRadialGradient(
            this.canvas.width / 2, this.canvas.height / 2, 0,
            this.canvas.width / 2, this.canvas.height / 2, this.canvas.width / 2
        );
        gradient.addColorStop(0, 'rgba(139, 92, 246, 0.1)');
        gradient.addColorStop(1, 'rgba(17, 24, 39, 0.95)');
        
        this.ctx.fillStyle = gradient;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Draw quantum field grid
        this.drawQuantumGrid();
        
        // Draw entanglement connections
        this.drawEntanglements();
        
        // Draw particles
        this.drawParticles();
        
        // Draw quantum keys
        this.drawQuantumKeys();
        
        // Draw key generation effect
        if (this.isGeneratingKey) {
            this.drawKeyGenerationEffect();
        }
    }

    drawQuantumGrid() {
        this.ctx.strokeStyle = 'rgba(139, 92, 246, 0.1)';
        this.ctx.lineWidth = 1;
        
        const gridSize = 40;
        for (let x = 0; x < this.canvas.width; x += gridSize) {
            this.ctx.beginPath();
            this.ctx.moveTo(x, 0);
            this.ctx.lineTo(x, this.canvas.height);
            this.ctx.stroke();
        }
        
        for (let y = 0; y < this.canvas.height; y += gridSize) {
            this.ctx.beginPath();
            this.ctx.moveTo(0, y);
            this.ctx.lineTo(this.canvas.width, y);
            this.ctx.stroke();
        }
    }

    drawEntanglements() {
        this.ctx.strokeStyle = this.settings.colors.entangled;
        this.ctx.lineWidth = 1;
        this.ctx.globalAlpha = 0.6;
        
        this.particles.forEach((particle, i) => {
            if (particle.entangled && particle.entangledWith !== null) {
                const partner = this.particles[particle.entangledWith];
                if (partner && partner.entangled) {
                    this.ctx.beginPath();
                    this.ctx.moveTo(particle.x, particle.y);
                    this.ctx.lineTo(partner.x, partner.y);
                    this.ctx.stroke();
                }
            }
        });
        
        this.ctx.globalAlpha = 1;
    }

    drawParticles() {
        this.particles.forEach(particle => {
            const alpha = particle.energy;
            const size = particle.size * (0.5 + alpha * 0.5);
            
            // Draw particle glow
            const gradient = this.ctx.createRadialGradient(
                particle.x, particle.y, 0,
                particle.x, particle.y, size * 3
            );
            gradient.addColorStop(0, particle.color + 'AA');
            gradient.addColorStop(1, particle.color + '00');
            
            this.ctx.fillStyle = gradient;
            this.ctx.beginPath();
            this.ctx.arc(particle.x, particle.y, size * 3, 0, Math.PI * 2);
            this.ctx.fill();
            
            // Draw particle core
            this.ctx.fillStyle = particle.color;
            this.ctx.beginPath();
            this.ctx.arc(particle.x, particle.y, size, 0, Math.PI * 2);
            this.ctx.fill();
            
            // Draw entanglement indicator
            if (particle.entangled) {
                this.ctx.strokeStyle = this.settings.colors.entangled;
                this.ctx.lineWidth = 2;
                this.ctx.beginPath();
                this.ctx.arc(particle.x, particle.y, size + 5, 0, Math.PI * 2);
                this.ctx.stroke();
            }
        });
    }

    drawQuantumKeys() {
        this.quantumKeys.forEach((key, index) => {
            const alpha = Math.max(0, key.lifetime / 100);
            this.ctx.globalAlpha = alpha;
            
            // Draw key visualization
            const gradient = this.ctx.createRadialGradient(
                key.x, key.y, 0,
                key.x, key.y, 20
            );
            gradient.addColorStop(0, this.settings.colors.secure + 'FF');
            gradient.addColorStop(1, this.settings.colors.secure + '00');
            
            this.ctx.fillStyle = gradient;
            this.ctx.beginPath();
            this.ctx.arc(key.x, key.y, 20, 0, Math.PI * 2);
            this.ctx.fill();
            
            // Draw key symbol
            this.ctx.fillStyle = '#ffffff';
            this.ctx.font = '16px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.fillText('🔑', key.x, key.y + 5);
            
            key.lifetime--;
            if (key.lifetime <= 0) {
                this.quantumKeys.splice(index, 1);
            }
        });
        
        this.ctx.globalAlpha = 1;
    }

    drawKeyGenerationEffect() {
        const centerX = this.canvas.width / 2;
        const centerY = this.canvas.height / 2;
        const radius = (this.keyGenerationProgress / 100) * 100;
        
        // Draw expanding quantum field
        const gradient = this.ctx.createRadialGradient(
            centerX, centerY, 0,
            centerX, centerY, radius
        );
        gradient.addColorStop(0, this.settings.colors.quantum + '44');
        gradient.addColorStop(1, this.settings.colors.quantum + '00');
        
        this.ctx.fillStyle = gradient;
        this.ctx.beginPath();
        this.ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
        this.ctx.fill();
        
        // Draw energy rings
        for (let i = 0; i < 3; i++) {
            const ringRadius = radius * (0.3 + i * 0.3);
            this.ctx.strokeStyle = this.settings.colors.quantum + '88';
            this.ctx.lineWidth = 2;
            this.ctx.beginPath();
            this.ctx.arc(centerX, centerY, ringRadius, 0, Math.PI * 2);
            this.ctx.stroke();
        }
    }

    setupEventListeners() {
        // Generate Key button
        document.getElementById('generate-key-btn').addEventListener('click', () => {
            this.startKeyGeneration();
        });
        
        // Security Scan button
        document.getElementById('security-scan-btn').addEventListener('click', () => {
            this.performSecurityScan();
        });
        
        // Entangle Particles button
        document.getElementById('entangle-particles-btn').addEventListener('click', () => {
            this.entangleRandomParticles();
        });
    }

    startKeyGeneration() {
        if (this.isGeneratingKey) return;
        
        this.isGeneratingKey = true;
        this.keyGenerationProgress = 0;
        
        document.getElementById('key-generation').style.display = 'block';
        document.getElementById('generate-key-btn').disabled = true;
        
        console.log('[Quantum Visualizer] Starting quantum key generation visualization');
    }

    completeKeyGeneration() {
        this.isGeneratingKey = false;
        this.keyGenerationProgress = 0;
        
        // Add new quantum key to visualization
        this.quantumKeys.push({
            x: this.canvas.width / 2 + (Math.random() - 0.5) * 100,
            y: this.canvas.height / 2 + (Math.random() - 0.5) * 100,
            lifetime: 300
        });
        
        document.getElementById('key-generation').style.display = 'none';
        document.getElementById('generate-key-btn').disabled = false;
        
        // Trigger visual celebration
        this.celebrateKeyGeneration();
        
        console.log('[Quantum Visualizer] Quantum key generation completed');
    }

    celebrateKeyGeneration() {
        // Add burst of particles
        for (let i = 0; i < 20; i++) {
            this.particles.push({
                ...this.createParticle(),
                x: this.canvas.width / 2,
                y: this.canvas.height / 2,
                vx: (Math.random() - 0.5) * 10,
                vy: (Math.random() - 0.5) * 10,
                color: this.settings.colors.secure,
                lifetime: 100
            });
        }
    }

    performSecurityScan() {
        console.log('[Quantum Visualizer] Performing quantum security scan');
        
        // Animate security scan
        this.particles.forEach(particle => {
            particle.color = this.settings.colors.warning;
        });
        
        setTimeout(() => {
            this.particles.forEach(particle => {
                particle.color = this.settings.colors.secure;
            });
            this.updateSecurityLevel('high');
        }, 2000);
    }

    entangleRandomParticles() {
        console.log('[Quantum Visualizer] Creating quantum entanglements');
        
        // Entangle random particles
        for (let i = 0; i < 10; i++) {
            const particle1 = this.particles[Math.floor(Math.random() * this.particles.length)];
            const particle2 = this.particles[Math.floor(Math.random() * this.particles.length)];
            
            if (particle1 !== particle2) {
                particle1.entangled = true;
                particle2.entangled = true;
                particle1.entangledWith = this.particles.indexOf(particle2);
                particle2.entangledWith = this.particles.indexOf(particle1);
            }
        }
    }

    updateMetrics() {
        const entangledCount = this.particles.filter(p => p.entangled).length;
        const keyCount = this.quantumKeys.length;
        
        document.getElementById('entangled-count').textContent = entangledCount;
        document.getElementById('key-count').textContent = keyCount;
        
        // Update entropy based on entanglements
        const entropyLevel = entangledCount > 20 ? 'MAXIMUM' : 
                           entangledCount > 10 ? 'HIGH' : 
                           entangledCount > 5 ? 'MEDIUM' : 'LOW';
        document.getElementById('entropy-level').textContent = entropyLevel;
    }

    updateKeyGenerationUI() {
        const progressFill = document.getElementById('progress-fill');
        if (progressFill) {
            progressFill.style.width = `${this.keyGenerationProgress}%`;
        }
    }

    updateSecurityLevel(level) {
        this.securityLevel = level;
        const levelFill = document.getElementById('level-fill');
        const levelText = document.getElementById('level-text');
        
        const levels = {
            low: { width: '25%', color: this.settings.colors.danger, text: 'LOW' },
            medium: { width: '50%', color: this.settings.colors.warning, text: 'MEDIUM' },
            high: { width: '75%', color: this.settings.colors.secure, text: 'HIGH' },
            maximum: { width: '100%', color: this.settings.colors.entangled, text: 'MAXIMUM' }
        };
        
        const config = levels[level];
        if (config) {
            levelFill.style.width = config.width;
            levelFill.style.backgroundColor = config.color;
            levelText.textContent = `Security Level: ${config.text}`;
        }
    }

    // Public API methods
    triggerKeyGeneration() {
        this.startKeyGeneration();
    }

    setSecurityLevel(level) {
        this.updateSecurityLevel(level);
    }

    addQuantumKey() {
        this.quantumKeys.push({
            x: Math.random() * this.canvas.width,
            y: Math.random() * this.canvas.height,
            lifetime: 300
        });
    }

    destroy() {
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
        }
        console.log('[Quantum Visualizer] Destroyed');
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { QuantumVisualizer };
}
