// Advent Calendar - Grid-Based Interactive Features

// State management
let adventData = null;
let currentDayContent = null;
let shuffledDays = [];
let modalListenersInitialized = false;
let lastFocusedElement = null;

// Color schemes for calendar cells
const cellColors = [
    '#8b0000', '#165b33', '#8b4513', '#ffd700', '#ff69b4', '#4169e1',
    '#ffffff', '#165b33', '#c71585', '#dc143c', '#b0e0e6', '#d2691e',
    '#9370db', '#4682b4', '#ff8c00', '#708090', '#20b2aa', '#b22222',
    '#ffffff', '#191970', '#8b4513', '#daa520', '#556b2f', '#c41e3a'
];

// DOM Elements
const loadingEl = document.getElementById('loading');
const errorEl = document.getElementById('error');
const errorMessageEl = document.getElementById('error-message');
const gridEl = document.getElementById('advent-grid');
const modalEl = document.getElementById('content-modal');
const modalTitleEl = document.getElementById('modal-title');
const modalContentTypeEl = document.getElementById('modal-content-type');
const modalBodyEl = document.getElementById('modal-body');
const closeModalBtn = document.getElementById('close-modal');

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
    initAdventCalendar();
    setupModalListeners();
});

/**
 * Initialize the Advent Calendar by fetching manifest data
 */
async function initAdventCalendar() {
    try {
        showLoading();
        
        // Fetch manifest data from API
        const response = await fetch('/api/advent/manifest');
        
        if (!response.ok) {
            throw new Error(`Failed to load advent calendar: ${response.statusText}`);
        }
        
        adventData = await response.json();
        
        // Create shuffled array of days (1-24)
        shuffledDays = shuffleArray([...Array(24).keys()].map(i => i + 1));
        
        // Generate and render the grid
        generateGrid();
        
        hideLoading();
        showGrid();
        
    } catch (error) {
        console.error('Error initializing advent calendar:', error);
        showError(error.message);
    }
}

/**
 * Shuffle array using Fisher-Yates algorithm
 * @param {Array} array - Array to shuffle
 * @returns {Array} New shuffled array (does not modify original)
 */
function shuffleArray(array) {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

/**
 * Generate the grid HTML
 */
function generateGrid() {
    if (!adventData || !adventData.days) {
        console.error('No advent data available');
        return;
    }
    
    // Create lookup map for O(1) access
    const dayDataMap = new Map(adventData.days.map(d => [d.day, d]));
    
    const gridContainer = document.createElement('div');
    gridContainer.className = 'advent-grid';
    gridContainer.setAttribute('role', 'list');
    gridContainer.setAttribute('aria-label', 'Advent calendar days 1 through 24');
    
    shuffledDays.forEach(dayNumber => {
        const dayData = dayDataMap.get(dayNumber);
        if (!dayData) return;
        
        const cell = document.createElement('div');
        cell.className = 'calendar-cell';
        cell.setAttribute('data-day', dayNumber);
        cell.setAttribute('role', 'button');
        cell.setAttribute('tabindex', '0');
        cell.setAttribute('aria-label', `Day ${dayNumber}: ${dayData.title}`);
        
        // Set color with bounds checking
        const colorIndex = Math.max(0, Math.min(dayNumber - 1, cellColors.length - 1));
        cell.style.backgroundColor = cellColors[colorIndex];
        cell.style.color = getContrastColor(cellColors[colorIndex]);
        
        // Add day number
        cell.textContent = dayNumber;
        
        // Apply unlock state
        if (dayData.is_unlocked) {
            cell.classList.add('unlocked');
            cell.setAttribute('aria-disabled', 'false');
        } else {
            cell.classList.add('locked');
            cell.setAttribute('aria-disabled', 'true');
        }
        
        // Add event listeners
        cell.addEventListener('click', () => handleCellClick(dayNumber));
        cell.addEventListener('keydown', (e) => handleCellKeydown(e, dayNumber));
        
        gridContainer.appendChild(cell);
    });
    
    gridEl.innerHTML = '';
    gridEl.appendChild(gridContainer);
}

/**
 * Get contrasting text color (black or white) based on background color.
 * @param {string} hexColor - Hex color string in format #RRGGBB
 * @returns {string} '#000000' for light backgrounds, '#ffffff' for dark backgrounds
 */
function getContrastColor(hexColor) {
    // Validate hex color format
    if (!hexColor || typeof hexColor !== 'string' || !/^#[0-9A-Fa-f]{6}$/.test(hexColor)) {
        console.warn(`Invalid hex color: ${hexColor}, defaulting to white`);
        return '#ffffff';
    }
    
    // Convert hex to RGB
    const red = parseInt(hexColor.slice(1, 3), 16);
    const green = parseInt(hexColor.slice(3, 5), 16);
    const blue = parseInt(hexColor.slice(5, 7), 16);
    
    // Calculate relative luminance
    const luminance = (0.299 * red + 0.587 * green + 0.114 * blue) / 255;
    
    return luminance > 0.5 ? '#000000' : '#ffffff';
}

/**
 * Setup modal event listeners
 */
function setupModalListeners() {
    if (modalListenersInitialized) return;
    modalListenersInitialized = true;
    
    // Modal close events
    closeModalBtn.addEventListener('click', closeModal);
    
    // Close modal on overlay click
    const modalOverlay = modalEl.querySelector('.modal-overlay');
    if (modalOverlay) {
        modalOverlay.addEventListener('click', closeModal);
    }
    
    // Close modal on Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modalEl.style.display !== 'none') {
            closeModal();
        }
    });
}

/**
 * Handle cell click
 */
async function handleCellClick(day) {
    const dayData = adventData.days.find(d => d.day === day);
    if (!dayData) return;
    
    if (!dayData.is_unlocked) {
        showLockedMessage(day);
        return;
    }
    
    await loadDayContent(day);
}

/**
 * Handle cell keyboard navigation
 */
function handleCellKeydown(event, day) {
    if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        handleCellClick(day);
    }
}

/**
 * Show message for locked days
 */
function showLockedMessage(day) {
    const dayData = adventData.days.find(d => d.day === day);
    if (!dayData) return;
    
    const unlockDate = new Date(dayData.unlock_time);
    const formattedDate = unlockDate.toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        timeZone: 'UTC'
    });
    
    modalTitleEl.textContent = `Day ${day}: ${dayData.title}`;
    modalContentTypeEl.textContent = '🔒 Locked';
    modalBodyEl.innerHTML = `
        <div class="locked-message-container">
            <p class="locked-message-icon">🔒</p>
            <p class="locked-message-title">
                This content is locked!
            </p>
            <p class="locked-message-text">
                Come back on <strong>${escapeHtml(formattedDate)}</strong> to unlock this surprise.
            </p>
        </div>
    `;
    
    showModal();
}

/**
 * Load day content from API
 */
async function loadDayContent(day) {
    try {
        const response = await fetch(`/api/advent/day/${day}`);
        
        if (!response.ok) {
            if (response.status === 403) {
                // Day is locked
                showLockedMessage(day);
                return;
            }
            throw new Error(`Failed to load day ${day} content`);
        }
        
        currentDayContent = await response.json();
        displayDayContent(currentDayContent);
        
    } catch (error) {
        console.error(`Error loading day ${day} content:`, error);
        modalTitleEl.textContent = 'Error';
        modalContentTypeEl.textContent = '';
        modalBodyEl.innerHTML = `
            <div class="error-message-container">
                <p>Failed to load content. Please try again later.</p>
            </div>
        `;
        showModal();
    }
}

/**
 * Display day content in modal
 */
function displayDayContent(dayContent) {
    modalTitleEl.textContent = `Day ${dayContent.day}: ${dayContent.title}`;
    modalContentTypeEl.textContent = `${getContentTypeIcon(dayContent.content_type)} ${dayContent.content_type}`;
    
    const payload = dayContent.payload;
    let bodyHTML = '';
    
    switch (dayContent.content_type) {
    case 'fact':
    case 'story':
        bodyHTML = renderFactOrStory(payload);
        break;
    case 'game':
        bodyHTML = renderGame(payload);
        break;
    case 'activity':
        bodyHTML = renderActivity(payload);
        break;
    case 'video':
        bodyHTML = renderVideo(payload);
        break;
    case 'quiz':
        bodyHTML = renderQuiz(payload);
        break;
    default:
        bodyHTML = '<p>Content type not supported.</p>';
    }
    
    modalBodyEl.innerHTML = bodyHTML;
    
    // Attach event listeners for quiz options if content type is quiz
    if (dayContent.content_type === 'quiz') {
        modalBodyEl.querySelectorAll('.quiz-option').forEach(btn => {
            btn.addEventListener('click', () => {
                const questionIndex = parseInt(btn.dataset.question, 10);
                const optIndex = parseInt(btn.dataset.option, 10);
                const correctAnswer = parseInt(btn.dataset.correct, 10);
                checkQuizAnswer(questionIndex, optIndex, correctAnswer);
            });
        });
    }
    
    showModal();
}

/**
 * Escape HTML to prevent XSS attacks
 * @param {string} text - Text to escape
 * @returns {string} Escaped HTML
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Render fact or story content
 * @param {Object} payload - Content payload from API
 * @param {string} payload.text - The fact or story text
 * @param {string} [payload.image_url] - Optional image URL
 * @returns {string} HTML string
 */
function renderFactOrStory(payload) {
    if (!payload || typeof payload.text !== 'string') {
        return '<p>Content unavailable.</p>';
    }
    
    let html = `<p>${escapeHtml(payload.text)}</p>`;
    if (payload.image_url) {
        const img = document.createElement('img');
        img.src = payload.image_url;
        img.alt = 'Day illustration';
        img.addEventListener('error', function() { this.style.display = 'none'; });
        html += img.outerHTML;
    }
    return html;
}

/**
 * Render game content
 * @param {Object} payload - Content payload from API
 * @returns {string} HTML string
 */
function renderGame(payload) {
    if (!payload || typeof payload.title !== 'string') {
        return '<p>Content unavailable.</p>';
    }
    
    return `
        <div class="game-container">
            <h3>${escapeHtml(payload.title)}</h3>
            <p>${escapeHtml(payload.description || '')}</p>
            <p class="game-info">
                <strong>Difficulty:</strong> ${escapeHtml(payload.difficulty || 'Unknown')}
            </p>
            <p class="game-url-box">
                🎮 Game will be available at: <strong>${escapeHtml(payload.url || '')}</strong>
            </p>
        </div>
    `;
}

/**
 * Render activity content
 * @param {Object} payload - Content payload from API
 * @returns {string} HTML string
 */
function renderActivity(payload) {
    if (!payload || typeof payload.title !== 'string') {
        return '<p>Content unavailable.</p>';
    }
    
    let html = `
        <div class="activity-container">
            <h3>${escapeHtml(payload.title)}</h3>
            <p>${escapeHtml(payload.description || '')}</p>
    `;
    
    if (payload.activity_type === 'recipe' && payload.ingredients && Array.isArray(payload.ingredients)) {
        html += `
            <div class="recipe-section">
                <h4 class="recipe-heading">Ingredients:</h4>
                <ul class="ingredient-list">
                    ${payload.ingredients.map(ing => `<li>${escapeHtml(ing)}</li>`).join('')}
                </ul>
                <h4 class="recipe-heading">Instructions:</h4>
                <p>${escapeHtml(payload.instructions || '')}</p>
            </div>
        `;
    } else if (payload.url) {
        html += `
            <p class="activity-url-box">
                🎨 Activity available at: <strong>${escapeHtml(payload.url)}</strong>
            </p>
        `;
    }
    
    html += '</div>';
    return html;
}

/**
 * Render video content
 * @param {Object} payload - Content payload from API
 * @returns {string} HTML string
 */
function renderVideo(payload) {
    if (!payload || typeof payload.title !== 'string') {
        return '<p>Content unavailable.</p>';
    }
    
    let html = `
        <div class="video-container">
            <h3>${escapeHtml(payload.title)}</h3>
            <p>${escapeHtml(payload.description || '')}</p>
            <p class="video-info">
                <strong>Duration:</strong> ${escapeHtml(String(payload.duration_minutes || 0))} minutes
            </p>
    `;
    
    if (payload.special_message) {
        html += `
            <div class="special-message-box">
                <p>${escapeHtml(payload.special_message)}</p>
            </div>
        `;
    }
    
    html += `
        <p class="video-url-box">
            🎥 Video available at: <strong>${escapeHtml(payload.video_url || '')}</strong>
        </p>
        </div>
    `;
    return html;
}

/**
 * Render quiz content
 * @param {Object} payload - Content payload from API
 * @returns {string} HTML string
 */
function renderQuiz(payload) {
    if (!payload || typeof payload.title !== 'string' || !Array.isArray(payload.questions)) {
        return '<p>Content unavailable.</p>';
    }
    
    let html = `
        <div>
            <h3>${escapeHtml(payload.title)}</h3>
            <p>${escapeHtml(payload.description || '')}</p>
            <div class="quiz-container">
    `;
    
    payload.questions.forEach((q, index) => {
        html += `
            <div class="quiz-question">
                <h4>Question ${index + 1}: ${escapeHtml(q.question)}</h4>
                <div class="quiz-options">
        `;
        
        if (Array.isArray(q.options)) {
            q.options.forEach((opt, optIndex) => {
                html += `
                    <button 
                        type="button"
                        class="quiz-option" 
                        data-question="${index}" 
                        data-option="${optIndex}"
                        data-correct="${q.correct_answer}"
                        aria-label="Option ${optIndex + 1}: ${escapeHtml(opt)}"
                    >
                        ${escapeHtml(opt)}
                    </button>
                `;
            });
        } else {
            html += '<span class="quiz-options-unavailable">Options unavailable.</span>';
        }
        
        html += `
                </div>
            </div>
        `;
    });
    
    html += '</div></div>';
    return html;
}

/**
 * Check quiz answer
 */
function checkQuizAnswer(questionIndex, selectedOption, correctAnswer) {
    const buttons = document.querySelectorAll(`[data-question="${questionIndex}"]`);
    buttons.forEach(btn => {
        btn.disabled = true;
        const option = parseInt(btn.dataset.option, 10);
        if (option === correctAnswer) {
            btn.classList.add('correct');
            btn.setAttribute('aria-label', `${btn.getAttribute('aria-label')} - Correct answer`);
        } else if (option === selectedOption && option !== correctAnswer) {
            btn.classList.add('incorrect');
            btn.setAttribute('aria-label', `${btn.getAttribute('aria-label')} - Incorrect answer`);
        }
    });
}

/**
 * Get icon for content type
 */
function getContentTypeIcon(contentType) {
    const icons = {
        'fact': '📚',
        'story': '📖',
        'game': '🎮',
        'activity': '🎨',
        'video': '🎥',
        'quiz': '❓'
    };
    return icons[contentType] || '✨';
}

/**
 * Show modal
 */
function showModal() {
    lastFocusedElement = document.activeElement;
    modalEl.style.display = 'flex';
    modalEl.setAttribute('aria-hidden', 'false');
    closeModalBtn.focus();
    document.body.style.overflow = 'hidden';
}

/**
 * Close modal
 */
function closeModal() {
    modalEl.style.display = 'none';
    modalEl.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    currentDayContent = null;
    if (lastFocusedElement) {
        lastFocusedElement.focus();
    }
}

/**
 * Show loading state
 */
function showLoading() {
    loadingEl.style.display = 'block';
    loadingEl.setAttribute('aria-busy', 'true');
    errorEl.style.display = 'none';
    gridEl.style.display = 'none';
}

/**
 * Hide loading state
 */
function hideLoading() {
    loadingEl.style.display = 'none';
    loadingEl.setAttribute('aria-busy', 'false');
}

/**
 * Show grid
 */
function showGrid() {
    gridEl.style.display = 'block';
}

/**
 * Show error state
 */
function showError(message) {
    hideLoading();
    errorEl.style.display = 'block';
    errorMessageEl.textContent = message || 'Something went wrong. Please try again later.';
}
