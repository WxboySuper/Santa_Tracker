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

// Tree Drawing Constants (for drawTree function)
const TREE = {
    // Trunk dimensions
    TRUNK_WIDTH: 50,
    TRUNK_HEIGHT: 50,
    TRUNK_Y: 450,
    TRUNK_SHADOW_WIDTH: 8,
    
    // Tree layer widths (half-width for each side)
    BOTTOM_WIDTH: 230,
    MIDDLE_WIDTH: 180,
    TOP_WIDTH: 130,
    CONE_WIDTH: 80,
    
    // Tree layer Y positions
    CONE_TIP_Y: 60,
    CONE_BASE_Y: 160,
    TOP_TIP_Y: 140,
    TOP_BASE_Y: 280,
    MIDDLE_TIP_Y: 260,
    MIDDLE_BASE_Y: 380,
    BOTTOM_TIP_Y: 360,
    BOTTOM_BASE_Y: 460,
    
    // Shadow offsets
    SHADOW_OFFSET: 50,
    SHADOW_SMALL: 30,
    
    // Star properties
    STAR_Y: 50,
    STAR_SIZE: 18,
    STAR_GLOW_RADIUS: 30,
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
const gameAnnouncements = document.getElementById('gameAnnouncements');

// Audio Context for synthetic sounds
let audioContext = null;

// Announce game state to screen readers
function announceToScreenReader(message) {
    if (gameAnnouncements) {
        gameAnnouncements.textContent = message;
    }
}

// Tree colors from CSS variables
const getTreeColors = () => {
    const root = document.documentElement;
    const style = getComputedStyle(root);
    return {
        base: style.getPropertyValue('--tree-base').trim() || '#165b33',
        layer2: style.getPropertyValue('--tree-layer-2').trim() || '#1a7040',
        layer3: style.getPropertyValue('--tree-layer-3').trim() || '#228b4d',
        top: style.getPropertyValue('--tree-top').trim() || '#2e9c5a',
        shadow: style.getPropertyValue('--tree-shadow').trim() || '#0f4d2a',
        trunk: style.getPropertyValue('--tree-trunk').trim() || '#6d4c3b',
        trunkShadow: style.getPropertyValue('--tree-trunk-shadow').trim() || '#4a3327'
    };
};

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

// Track page visibility
let isPageVisible = true;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    setupCanvas();
    initSnowflakes();
    
    startButton.addEventListener('click', () => {
        initAudio(); // Initialize audio on user interaction
        startGame();
    });
    function handlePlayAgainClick() {
        hideWinOverlay();
        resetGame();
        initAudio(); // Ensure audio context is initialized for replay
        startGame();
    }
    playAgainButton.addEventListener('click', handlePlayAgainClick);
    
    canvas.addEventListener('click', handleCanvasClick);
    canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
    
    // Handle page visibility changes
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    // Start a passive render loop that only draws background elements
    passiveRender();
});

// Handle visibility changes (pause/resume passive render)
function handleVisibilityChange() {
    isPageVisible = !document.hidden;
    
    // Resume passive render if page becomes visible and game is not playing
    if (isPageVisible && !gameState.isPlaying) {
        passiveRender();
    }
}

// Setup canvas with proper sizing
function setupCanvas() {
    // Set canvas dimensions to fit modal better (560x500)
    canvas.width = 560;
    canvas.height = 500;
}

// Initialize Web Audio API
function initAudio() {
    // Only create AudioContext if it doesn't exist
    if (!audioContext) {
        try {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
        } catch (e) {
            console.warn('Web Audio API not supported');
            return;
        }
    }
    
    // Resume the context if it's suspended
    if (audioContext && audioContext.state === 'suspended') {
        audioContext.resume();
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
    oscillator.frequency.linearRampToValueAtTime(200, audioContext.currentTime + 0.1);
    
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
            speed: Math.random() + 0.5,
            drift: Math.random() * 0.5 - 0.25,
        });
    }
}

// Start the game
function startGame() {
    gameState.isPlaying = true;
    startOverlay.classList.add('hidden');
    gameHUD.classList.remove('hidden');
    
    // Announce game start
    announceToScreenReader('Game started! Tap ornaments as they appear. 20 ornaments remaining');
    
    // Start spawning ornaments
    spawnOrnament();
    gameState.spawnTimer = setInterval(() => {
        if (gameState.ornaments.length < CONFIG.maxOrnaments && gameState.isPlaying) {
            spawnOrnament();
        }
    }, CONFIG.spawnInterval);
    
    // Start active render loop
    render();
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
        '#ff0000', '#00ff00', '#0000ff', '#ffd700', 
        '#ff69b4', '#ff8c00', '#9370db', '#00ced1'
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
    
    // Announce to screen readers
    if (gameState.remaining > 0) {
        announceToScreenReader(`${gameState.remaining} ornaments remaining`);
    }
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
    
    // Announce win to screen readers
    announceToScreenReader('Congratulations! You cleared all ornaments and won the game!');
    
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
// Update snowflakes animation
function updateSnowflakes() {
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
    updateSnowflakes();
}

// Passive render loop for background elements only (when game is not playing)
function passiveRender() {
    // Stop if page is hidden or game is playing
    if (!isPageVisible || gameState.isPlaying) {
        return;
    }
    
    // Clear canvas
    ctx.fillStyle = '#e0f2fe';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Draw snowflakes
    drawSnowflakes();
    
    // Draw Christmas tree
    drawTree();
    
    // Update snowflakes only
    updateSnowflakes();
    
    // Continue passive loop if page is visible and game is not playing
    if (isPageVisible && !gameState.isPlaying) {
        requestAnimationFrame(passiveRender);
    }
}

// Render game (active loop during gameplay)
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
    
    // Continue active loop only while game is playing
    if (gameState.isPlaying) {
        gameState.animationId = requestAnimationFrame(render);
    } else {
        // Switch back to passive render when game stops
        passiveRender();
    }
}

// Cleanup function to stop animation and timers
function cleanup() {  // skipcq: JS-0128
    // Stop game if playing
    gameState.isPlaying = false;
    
    // Cancel animation frames
    if (gameState.animationId) {
        cancelAnimationFrame(gameState.animationId);
        gameState.animationId = null;
    }
    
    // Clear timers
    if (gameState.spawnTimer) {
        clearInterval(gameState.spawnTimer);
        gameState.spawnTimer = null;
    }
    
    // Remove canvas event listeners
    canvas.removeEventListener('click', handleCanvasClick);
    canvas.removeEventListener('touchstart', handleTouchStart);
    
    // Remove visibility change listener
    document.removeEventListener('visibilitychange', handleVisibilityChange);
}

// Expose cleanup function globally for modal/component lifecycle
if (typeof window !== 'undefined') {
    window.ornamentSmashCleanup = cleanup;
}

// Ensure cleanup is called when the window is unloaded
window.addEventListener('beforeunload', cleanup);
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
    const colors = getTreeColors();
    
    // Tree trunk
    ctx.fillStyle = colors.trunk;
    ctx.fillRect(centerX - TREE.TRUNK_WIDTH / 2, TREE.TRUNK_Y, TREE.TRUNK_WIDTH, TREE.TRUNK_HEIGHT);
    
    // Trunk shadow/depth
    ctx.fillStyle = colors.trunkShadow;
    ctx.fillRect(centerX - TREE.TRUNK_WIDTH / 2, TREE.TRUNK_Y, TREE.TRUNK_SHADOW_WIDTH, TREE.TRUNK_HEIGHT);
    
    // Bottom tree layer
    ctx.fillStyle = colors.base;
    ctx.beginPath();
    ctx.moveTo(centerX, TREE.BOTTOM_TIP_Y);
    ctx.lineTo(centerX - TREE.BOTTOM_WIDTH, TREE.BOTTOM_BASE_Y);
    ctx.lineTo(centerX + TREE.BOTTOM_WIDTH, TREE.BOTTOM_BASE_Y);
    ctx.closePath();
    ctx.fill();
    
    // Bottom layer shadow
    ctx.fillStyle = colors.shadow;
    ctx.beginPath();
    ctx.moveTo(centerX, TREE.BOTTOM_TIP_Y);
    ctx.lineTo(centerX - TREE.BOTTOM_WIDTH, TREE.BOTTOM_BASE_Y);
    ctx.lineTo(centerX - TREE.MIDDLE_WIDTH, TREE.BOTTOM_BASE_Y);
    ctx.closePath();
    ctx.fill();
    
    // Middle tree layer
    ctx.fillStyle = colors.layer2;
    ctx.beginPath();
    ctx.moveTo(centerX, TREE.MIDDLE_TIP_Y);
    ctx.lineTo(centerX - TREE.MIDDLE_WIDTH, TREE.MIDDLE_BASE_Y);
    ctx.lineTo(centerX + TREE.MIDDLE_WIDTH, TREE.MIDDLE_BASE_Y);
    ctx.closePath();
    ctx.fill();
    
    // Middle layer shadow
    ctx.fillStyle = colors.shadow;
    ctx.beginPath();
    ctx.moveTo(centerX, TREE.MIDDLE_TIP_Y);
    ctx.lineTo(centerX - TREE.MIDDLE_WIDTH, TREE.MIDDLE_BASE_Y);
    ctx.lineTo(centerX - TREE.TOP_WIDTH - 10, TREE.MIDDLE_BASE_Y);
    ctx.closePath();
    ctx.fill();
    
    // Top tree layer
    ctx.fillStyle = colors.layer3;
    ctx.beginPath();
    ctx.moveTo(centerX, TREE.TOP_TIP_Y);
    ctx.lineTo(centerX - TREE.TOP_WIDTH, TREE.TOP_BASE_Y);
    ctx.lineTo(centerX + TREE.TOP_WIDTH, TREE.TOP_BASE_Y);
    ctx.closePath();
    ctx.fill();
    
    // Top layer shadow
    ctx.fillStyle = colors.layer2;
    ctx.beginPath();
    ctx.moveTo(centerX, TREE.TOP_TIP_Y);
    ctx.lineTo(centerX - TREE.TOP_WIDTH, TREE.TOP_BASE_Y);
    ctx.lineTo(centerX - TREE.TOP_WIDTH + TREE.SHADOW_SMALL, TREE.TOP_BASE_Y);
    ctx.closePath();
    ctx.fill();
    
    // Tree top cone
    ctx.fillStyle = colors.top;
    ctx.beginPath();
    ctx.moveTo(centerX, TREE.CONE_TIP_Y);
    ctx.lineTo(centerX - TREE.CONE_WIDTH, TREE.CONE_BASE_Y);
    ctx.lineTo(centerX + TREE.CONE_WIDTH, TREE.CONE_BASE_Y);
    ctx.closePath();
    ctx.fill();
    
    // Add some snow on branches
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    
    // Snow on bottom layer
    ctx.beginPath();
    ctx.arc(centerX - 150, TREE.BOTTOM_BASE_Y - 10, 12, 0, Math.PI, true);
    ctx.arc(centerX - 50, TREE.BOTTOM_BASE_Y - 15, 10, 0, Math.PI, true);
    ctx.arc(centerX + 50, TREE.BOTTOM_BASE_Y - 15, 10, 0, Math.PI, true);
    ctx.arc(centerX + 150, TREE.BOTTOM_BASE_Y - 10, 12, 0, Math.PI, true);
    ctx.fill();
    
    // Snow on middle layer
    ctx.beginPath();
    ctx.arc(centerX - 120, TREE.MIDDLE_BASE_Y - 10, 10, 0, Math.PI, true);
    ctx.arc(centerX, TREE.MIDDLE_BASE_Y - 15, 8, 0, Math.PI, true);
    ctx.arc(centerX + 120, TREE.MIDDLE_BASE_Y - 10, 10, 0, Math.PI, true);
    ctx.fill();
    
    // Snow on top layer
    ctx.beginPath();
    ctx.arc(centerX - TREE.CONE_WIDTH, TREE.TOP_BASE_Y - 5, 8, 0, Math.PI, true);
    ctx.arc(centerX + TREE.CONE_WIDTH, TREE.TOP_BASE_Y - 5, 8, 0, Math.PI, true);
    ctx.fill();
    
    // Star on top with glow
    const starGlow = ctx.createRadialGradient(centerX, TREE.STAR_Y, 0, centerX, TREE.STAR_Y, TREE.STAR_GLOW_RADIUS);
    starGlow.addColorStop(0, 'rgba(255, 215, 0, 0.6)');
    starGlow.addColorStop(1, 'rgba(255, 215, 0, 0)');
    ctx.fillStyle = starGlow;
    ctx.beginPath();
    ctx.arc(centerX, TREE.STAR_Y, TREE.STAR_GLOW_RADIUS, 0, Math.PI * 2);
    ctx.fill();
    
    // Draw star
    drawStar(centerX, TREE.STAR_Y, TREE.STAR_SIZE, '#FFD700');
    
    // Star sparkle
    ctx.strokeStyle = '#FFF';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(centerX, TREE.STAR_Y - 15);
    ctx.lineTo(centerX, TREE.STAR_Y + 15);
    ctx.moveTo(centerX - 15, TREE.STAR_Y);
    ctx.lineTo(centerX + 15, TREE.STAR_Y);
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
