// Ornament Smash - Game Logic
// Canvas-based ornament tapping game with particle effects

// Game Configuration
const CONFIG = {
    targetCount: 20,           // Total ornaments to clear
    maxOrnaments: 6,           // Max ornaments on screen
    spawnInterval: 1500,       // Milliseconds between spawns
    ornamentLifetime: 4000,    // How long ornaments stay visible
    ornamentRadius: 25,        // Base ornament size
    snowflakeCount: 50,        // Background snowflakes
    particleCount: 15,         // Particles per smash
};

// Game State
const gameState = {
    isPlaying: false,
    ornaments: [],
    snowflakes: [],
    particles: [],
    cleared: 0,
    remaining: CONFIG.targetCount,
    spawnTimer: null,
    animationId: null,
};

// Canvas Setup
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// DOM Elements
const startOverlay = document.getElementById('startOverlay');
const winOverlay = document.getElementById('winOverlay');
const gameHUD = document.getElementById('gameHUD');
const startButton = document.getElementById('startButton');
const playAgainButton = document.getElementById('playAgainButton');
const remainingCountEl = document.getElementById('remainingCount');
const badgeNotification = document.getElementById('badgeNotification');

// Audio Context for synthetic sounds
let audioContext = null;

// Tree boundary (triangular area where ornaments can spawn)
const treeBounds = {
    top: 80,
    bottom: 450,
    getWidth: (y) => {
        // Tree gets wider from top to bottom
        const progress = (y - treeBounds.top) / (treeBounds.bottom - treeBounds.top);
        const topWidth = 100;
        const bottomWidth = 420;
        return topWidth + (bottomWidth - topWidth) * progress;
    }
};

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    setupCanvas();
    initSnowflakes();
    
    startButton.addEventListener('click', () => {
        initAudio(); // Initialize audio on user interaction
        startGame();
    });
    playAgainButton.addEventListener('click', () => {
        hideWinOverlay();
        resetGame();
        startGame();
    });
    
    canvas.addEventListener('click', handleCanvasClick);
    canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
    
    // Start rendering loop
    render();
});

// Setup canvas with proper sizing
function setupCanvas() {
    // Set canvas dimensions to fit modal better (560x500)
    canvas.width = 560;
    canvas.height = 500;
}

// Initialize Web Audio API
function initAudio() {
    try {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) {
        console.warn('Web Audio API not supported');
    }
}

// Play synthetic pop sound
function playPopSound() {
    if (!audioContext) return;
    
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(200, audioContext.currentTime + 0.1);
    
    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.linearRampToValueAtTime(0, audioContext.currentTime + 0.1);
    
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.1);
}

// Play win sound
function playWinSound() {
    if (!audioContext) return;
    
    const notes = [523.25, 659.25, 783.99, 1046.50]; // C, E, G, C
    
    notes.forEach((freq, i) => {
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        oscillator.frequency.value = freq;
        
        const startTime = audioContext.currentTime + (i * 0.15);
        gainNode.gain.setValueAtTime(0.2, startTime);
        gainNode.gain.linearRampToValueAtTime(0, startTime + 0.3);
        
        oscillator.start(startTime);
        oscillator.stop(startTime + 0.3);
    });
}

// Initialize snowflakes
function initSnowflakes() {
    gameState.snowflakes = [];
    for (let i = 0; i < CONFIG.snowflakeCount; i++) {
        gameState.snowflakes.push({
            x: Math.random() * canvas.width,
            y: Math.random() * canvas.height,
            radius: Math.random() * 2 + 1,
            speed: Math.random() * 1 + 0.5,
            drift: Math.random() * 0.5 - 0.25,
        });
    }
}

// Start the game
function startGame() {
    gameState.isPlaying = true;
    startOverlay.classList.add('hidden');
    gameHUD.classList.remove('hidden');
    
    // Start spawning ornaments
    spawnOrnament();
    gameState.spawnTimer = setInterval(() => {
        if (gameState.ornaments.length < CONFIG.maxOrnaments && gameState.isPlaying) {
            spawnOrnament();
        }
    }, CONFIG.spawnInterval);
}

// Reset game state
function resetGame() {
    gameState.isPlaying = false;
    gameState.ornaments = [];
    gameState.particles = [];
    gameState.cleared = 0;
    gameState.remaining = CONFIG.targetCount;
    
    if (gameState.spawnTimer) {
        clearInterval(gameState.spawnTimer);
        gameState.spawnTimer = null;
    }
    
    updateRemainingCount();
}

// Spawn a new ornament
function spawnOrnament() {
    const y = treeBounds.top + Math.random() * (treeBounds.bottom - treeBounds.top);
    const treeWidth = treeBounds.getWidth(y);
    const centerX = canvas.width / 2;
    const x = centerX + (Math.random() - 0.5) * treeWidth;
    
    const colors = [
        '#FF0000', '#00FF00', '#0000FF', '#FFD700', 
        '#FF69B4', '#FF8C00', '#9370DB', '#00CED1'
    ];
    
    gameState.ornaments.push({
        x,
        y,
        radius: CONFIG.ornamentRadius,
        color: colors[Math.floor(Math.random() * colors.length)],
        createdAt: Date.now(),
        scale: 0,
        targetScale: 1,
    });
}

// Handle canvas click
function handleCanvasClick(e) {
    if (!gameState.isPlaying) return;
    
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;
    
    checkOrnamentHit(x, y);
}

// Handle touch events
function handleTouchStart(e) {
    if (!gameState.isPlaying) return;
    
    e.preventDefault();
    const touch = e.touches[0];
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = (touch.clientX - rect.left) * scaleX;
    const y = (touch.clientY - rect.top) * scaleY;
    
    checkOrnamentHit(x, y);
}

// Check if an ornament was hit
function checkOrnamentHit(x, y) {
    for (let i = gameState.ornaments.length - 1; i >= 0; i--) {
        const ornament = gameState.ornaments[i];
        const distance = Math.sqrt(
            Math.pow(x - ornament.x, 2) + 
            Math.pow(y - ornament.y, 2)
        );
        
        if (distance < ornament.radius * ornament.scale) {
            // Hit!
            smashOrnament(ornament, i);
            return;
        }
    }
}

// Smash ornament with particle effect
function smashOrnament(ornament, index) {
    // Create particles
    for (let i = 0; i < CONFIG.particleCount; i++) {
        const angle = (Math.PI * 2 * i) / CONFIG.particleCount;
        const speed = Math.random() * 3 + 2;
        
        gameState.particles.push({
            x: ornament.x,
            y: ornament.y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            color: ornament.color,
            radius: Math.random() * 3 + 2,
            life: 1.0,
        });
    }
    
    // Remove ornament
    gameState.ornaments.splice(index, 1);
    
    // Update score
    gameState.cleared++;
    gameState.remaining--;
    updateRemainingCount();
    
    // Play sound
    playPopSound();
    
    // Screen shake effect (subtle)
    shakeScreen();
    
    // Check win condition
    if (gameState.remaining <= 0) {
        endGame();
    }
}

// Subtle screen shake effect
function shakeScreen() {
    const shakeMagnitude = 3;
    const originalTransform = canvas.style.transform;
    
    canvas.style.transform = `translate(${Math.random() * shakeMagnitude - shakeMagnitude/2}px, ${Math.random() * shakeMagnitude - shakeMagnitude/2}px)`;
    
    setTimeout(() => {
        canvas.style.transform = originalTransform;
    }, 50);
}

// Update remaining count display
function updateRemainingCount() {
    remainingCountEl.textContent = gameState.remaining;
}

// End game and show win screen
function endGame() {
    gameState.isPlaying = false;
    
    if (gameState.spawnTimer) {
        clearInterval(gameState.spawnTimer);
        gameState.spawnTimer = null;
    }
    
    gameHUD.classList.add('hidden');
    
    // Play win sound
    playWinSound();
    
    // Check if first time win
    const isFirstWin = !localStorage.getItem('santa_advent_day_1_complete');
    
    if (isFirstWin) {
        localStorage.setItem('santa_advent_day_1_complete', 'true');
        badgeNotification.classList.remove('hidden');
    } else {
        badgeNotification.classList.add('hidden');
    }
    
    // Show win overlay after a brief delay
    setTimeout(() => {
        winOverlay.classList.remove('hidden');
    }, 500);
}

// Hide win overlay
function hideWinOverlay() {
    winOverlay.classList.add('hidden');
}

// Update game state
function update() {
    const now = Date.now();
    
    // Update ornaments
    for (let i = gameState.ornaments.length - 1; i >= 0; i--) {
        const ornament = gameState.ornaments[i];
        const age = now - ornament.createdAt;
        
        // Grow animation
        if (ornament.scale < ornament.targetScale) {
            ornament.scale = Math.min(ornament.targetScale, ornament.scale + 0.05);
        }
        
        // Remove old ornaments
        if (age > CONFIG.ornamentLifetime) {
            gameState.ornaments.splice(i, 1);
        }
    }
    
    // Update particles
    for (let i = gameState.particles.length - 1; i >= 0; i--) {
        const particle = gameState.particles[i];
        
        particle.x += particle.vx;
        particle.y += particle.vy;
        particle.vy += 0.15; // Gravity
        particle.life -= 0.02;
        
        if (particle.life <= 0) {
            gameState.particles.splice(i, 1);
        }
    }
    
    // Update snowflakes
    gameState.snowflakes.forEach(flake => {
        flake.y += flake.speed;
        flake.x += flake.drift;
        
        if (flake.y > canvas.height) {
            flake.y = -10;
            flake.x = Math.random() * canvas.width;
        }
        
        if (flake.x > canvas.width) flake.x = 0;
        if (flake.x < 0) flake.x = canvas.width;
    });
}

// Render game
function render() {
    // Clear canvas
    ctx.fillStyle = '#e0f2fe';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Draw snowflakes
    drawSnowflakes();
    
    // Draw Christmas tree
    drawTree();
    
    // Draw ornaments
    drawOrnaments();
    
    // Draw particles
    drawParticles();
    
    // Update and continue loop
    update();
    requestAnimationFrame(render);
}

// Draw snowflakes
function drawSnowflakes() {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    gameState.snowflakes.forEach(flake => {
        ctx.beginPath();
        ctx.arc(flake.x, flake.y, flake.radius, 0, Math.PI * 2);
        ctx.fill();
    });
}

// Draw Christmas tree
function drawTree() {
    const centerX = canvas.width / 2;
    
    // Tree trunk
    ctx.fillStyle = '#6d4c3b';
    ctx.fillRect(centerX - 25, 450, 50, 50);
    
    // Trunk shadow/depth
    ctx.fillStyle = '#4a3327';
    ctx.fillRect(centerX - 25, 450, 8, 50);
    
    // Bottom tree layer
    ctx.fillStyle = '#165b33';
    ctx.beginPath();
    ctx.moveTo(centerX, 360);
    ctx.lineTo(centerX - 230, 460);
    ctx.lineTo(centerX + 230, 460);
    ctx.closePath();
    ctx.fill();
    
    // Bottom layer shadow
    ctx.fillStyle = '#0f4d2a';
    ctx.beginPath();
    ctx.moveTo(centerX, 360);
    ctx.lineTo(centerX - 230, 460);
    ctx.lineTo(centerX - 180, 460);
    ctx.closePath();
    ctx.fill();
    
    // Middle tree layer
    ctx.fillStyle = '#1a7040';
    ctx.beginPath();
    ctx.moveTo(centerX, 260);
    ctx.lineTo(centerX - 180, 380);
    ctx.lineTo(centerX + 180, 380);
    ctx.closePath();
    ctx.fill();
    
    // Middle layer shadow
    ctx.fillStyle = '#0f4d2a';
    ctx.beginPath();
    ctx.moveTo(centerX, 260);
    ctx.lineTo(centerX - 180, 380);
    ctx.lineTo(centerX - 140, 380);
    ctx.closePath();
    ctx.fill();
    
    // Top tree layer
    ctx.fillStyle = '#228b4d';
    ctx.beginPath();
    ctx.moveTo(centerX, 140);
    ctx.lineTo(centerX - 130, 280);
    ctx.lineTo(centerX + 130, 280);
    ctx.closePath();
    ctx.fill();
    
    // Top layer shadow
    ctx.fillStyle = '#1a7040';
    ctx.beginPath();
    ctx.moveTo(centerX, 140);
    ctx.lineTo(centerX - 130, 280);
    ctx.lineTo(centerX - 100, 280);
    ctx.closePath();
    ctx.fill();
    
    // Tree top cone
    ctx.fillStyle = '#2e9c5a';
    ctx.beginPath();
    ctx.moveTo(centerX, 60);
    ctx.lineTo(centerX - 80, 160);
    ctx.lineTo(centerX + 80, 160);
    ctx.closePath();
    ctx.fill();
    
    // Add some snow on branches
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    
    // Snow on bottom layer
    ctx.beginPath();
    ctx.arc(centerX - 150, 450, 12, 0, Math.PI, true);
    ctx.arc(centerX - 50, 445, 10, 0, Math.PI, true);
    ctx.arc(centerX + 50, 445, 10, 0, Math.PI, true);
    ctx.arc(centerX + 150, 450, 12, 0, Math.PI, true);
    ctx.fill();
    
    // Snow on middle layer
    ctx.beginPath();
    ctx.arc(centerX - 120, 370, 10, 0, Math.PI, true);
    ctx.arc(centerX, 365, 8, 0, Math.PI, true);
    ctx.arc(centerX + 120, 370, 10, 0, Math.PI, true);
    ctx.fill();
    
    // Snow on top layer
    ctx.beginPath();
    ctx.arc(centerX - 80, 275, 8, 0, Math.PI, true);
    ctx.arc(centerX + 80, 275, 8, 0, Math.PI, true);
    ctx.fill();
    
    // Star on top with glow
    const starGlow = ctx.createRadialGradient(centerX, 50, 0, centerX, 50, 30);
    starGlow.addColorStop(0, 'rgba(255, 215, 0, 0.6)');
    starGlow.addColorStop(1, 'rgba(255, 215, 0, 0)');
    ctx.fillStyle = starGlow;
    ctx.beginPath();
    ctx.arc(centerX, 50, 30, 0, Math.PI * 2);
    ctx.fill();
    
    // Draw star
    drawStar(centerX, 50, 18, '#FFD700');
    
    // Star sparkle
    ctx.strokeStyle = '#FFF';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(centerX, 35);
    ctx.lineTo(centerX, 65);
    ctx.moveTo(centerX - 15, 50);
    ctx.lineTo(centerX + 15, 50);
    ctx.stroke();
}

// Draw a star
function drawStar(x, y, radius, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
        const angle = (i * 4 * Math.PI) / 5 - Math.PI / 2;
        const rad = i % 2 === 0 ? radius : radius / 2;
        const px = x + rad * Math.cos(angle);
        const py = y + rad * Math.sin(angle);
        
        if (i === 0) {
            ctx.moveTo(px, py);
        } else {
            ctx.lineTo(px, py);
        }
    }
    ctx.closePath();
    ctx.fill();
}

// Draw ornaments
function drawOrnaments() {
    gameState.ornaments.forEach(ornament => {
        const radius = ornament.radius * ornament.scale;
        
        // Ornament shadow
        ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
        ctx.beginPath();
        ctx.arc(ornament.x + 3, ornament.y + 3, radius, 0, Math.PI * 2);
        ctx.fill();
        
        // Ornament body
        ctx.fillStyle = ornament.color;
        ctx.beginPath();
        ctx.arc(ornament.x, ornament.y, radius, 0, Math.PI * 2);
        ctx.fill();
        
        // Ornament highlight (shiny effect)
        const gradient = ctx.createRadialGradient(
            ornament.x - radius / 3, 
            ornament.y - radius / 3, 
            0,
            ornament.x, 
            ornament.y, 
            radius
        );
        gradient.addColorStop(0, 'rgba(255, 255, 255, 0.8)');
        gradient.addColorStop(0.3, 'rgba(255, 255, 255, 0.2)');
        gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
        
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(ornament.x, ornament.y, radius, 0, Math.PI * 2);
        ctx.fill();
        
        // Ornament cap
        ctx.fillStyle = '#C0C0C0';
        ctx.fillRect(ornament.x - 5, ornament.y - radius - 5, 10, 5);
    });
}

// Draw particles
function drawParticles() {
    gameState.particles.forEach(particle => {
        ctx.globalAlpha = particle.life;
        ctx.fillStyle = particle.color;
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
        ctx.fill();
    });
    ctx.globalAlpha = 1.0;
}
