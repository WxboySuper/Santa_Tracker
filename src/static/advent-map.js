// Advent Calendar - North Pole Map Interactive Features

// State management
let adventData = null;
let currentDayContent = null;

// DOM Elements
const loadingEl = document.getElementById('loading');
const errorEl = document.getElementById('error');
const errorMessageEl = document.getElementById('error-message');
const mapEl = document.getElementById('north-pole-map');
const legendEl = document.getElementById('legend');
const modalEl = document.getElementById('content-modal');
const modalTitleEl = document.getElementById('modal-title');
const modalContentTypeEl = document.getElementById('modal-content-type');
const modalBodyEl = document.getElementById('modal-body');
const closeModalBtn = document.getElementById('close-modal');

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
    initAdventCalendar();
    setupEventListeners();
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
        
        // Render the map with unlock states
        renderMap();
        
        hideLoading();
        showMap();
        
    } catch (error) {
        console.error('Error initializing advent calendar:', error);
        showError(error.message);
    }
}

/**
 * Render the map by applying unlock states to buildings
 */
function renderMap() {
    if (!adventData || !adventData.days) {
        console.error('No advent data available');
        return;
    }
    
    // Update each building based on unlock status
    adventData.days.forEach(day => {
        const buildingEl = document.getElementById(`building-${day.day}`);
        if (!buildingEl) {
            console.warn(`Building element not found for day ${day.day}`);
            return;
        }
        
        if (day.is_unlocked) {
            buildingEl.classList.add('unlocked');
            buildingEl.classList.remove('locked');
            buildingEl.setAttribute('aria-disabled', 'false');
        } else {
            buildingEl.classList.add('locked');
            buildingEl.classList.remove('unlocked');
            buildingEl.setAttribute('aria-disabled', 'true');
        }
    });
}

/**
 * Setup event listeners for interaction
 */
function setupEventListeners() {
    // Building click/keyboard events
    const buildings = document.querySelectorAll('.building');
    buildings.forEach(building => {
        building.addEventListener('click', handleBuildingClick);
        building.addEventListener('keydown', handleBuildingKeydown);
    });
    
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
 * Handle building click
 */
async function handleBuildingClick(event) {
    const building = event.currentTarget;
    const day = parseInt(building.dataset.day, 10);
    
    if (building.classList.contains('locked')) {
        showLockedMessage(day);
        return;
    }
    
    await loadDayContent(day);
}

/**
 * Handle building keyboard navigation
 */
function handleBuildingKeydown(event) {
    if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        handleBuildingClick(event);
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
        <div style="text-align: center; padding: 2rem;">
            <p style="font-size: 3rem; margin-bottom: 1rem;">🔒</p>
            <p style="font-size: 1.25rem; font-weight: 600; margin-bottom: 1rem;">
                This content is locked!
            </p>
            <p style="color: #666;">
                Come back on <strong>${formattedDate}</strong> to unlock this surprise.
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
            <div style="text-align: center; padding: 2rem; color: var(--christmas-red);">
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
    showModal();
}

/**
 * Render fact or story content
 */
function renderFactOrStory(payload) {
    let html = `<p>${payload.text}</p>`;
    if (payload.image_url) {
        html += `<img src="${payload.image_url}" alt="Day illustration" onerror="this.style.display='none'">`;
    }
    return html;
}

/**
 * Render game content
 */
function renderGame(payload) {
    return `
        <div style="text-align: center;">
            <h3>${payload.title}</h3>
            <p>${payload.description}</p>
            <p style="margin-top: 1.5rem;">
                <strong>Difficulty:</strong> ${payload.difficulty}
            </p>
            <p style="margin-top: 1rem; padding: 1rem; background: #f0f0f0; border-radius: 8px;">
                🎮 Game will be available at: <strong>${payload.url}</strong>
            </p>
        </div>
    `;
}

/**
 * Render activity content
 */
function renderActivity(payload) {
    let html = `
        <div style="text-align: center;">
            <h3>${payload.title}</h3>
            <p>${payload.description}</p>
    `;
    
    if (payload.activity_type === 'recipe' && payload.ingredients) {
        html += `
            <div style="text-align: left; margin-top: 1.5rem;">
                <h4 style="color: var(--christmas-green);">Ingredients:</h4>
                <ul>
                    ${payload.ingredients.map(ing => `<li>${ing}</li>`).join('')}
                </ul>
                <h4 style="color: var(--christmas-green); margin-top: 1rem;">Instructions:</h4>
                <p>${payload.instructions}</p>
            </div>
        `;
    } else if (payload.url) {
        html += `
            <p style="margin-top: 1rem; padding: 1rem; background: #f0f0f0; border-radius: 8px;">
                🎨 Activity available at: <strong>${payload.url}</strong>
            </p>
        `;
    }
    
    html += '</div>';
    return html;
}

/**
 * Render video content
 */
function renderVideo(payload) {
    let html = `
        <div style="text-align: center;">
            <h3>${payload.title}</h3>
            <p>${payload.description}</p>
            <p style="margin-top: 1rem;">
                <strong>Duration:</strong> ${payload.duration_minutes} minutes
            </p>
    `;
    
    if (payload.special_message) {
        html += `
            <div style="margin-top: 1.5rem; padding: 1rem; background: linear-gradient(135deg, var(--christmas-red), var(--christmas-green)); color: white; border-radius: 8px;">
                <p style="font-size: 1.1rem; font-weight: 600;">${payload.special_message}</p>
            </div>
        `;
    }
    
    html += `
        <p style="margin-top: 1rem; padding: 1rem; background: #f0f0f0; border-radius: 8px;">
            🎥 Video available at: <strong>${payload.video_url}</strong>
        </p>
        </div>
    `;
    return html;
}

/**
 * Render quiz content
 */
function renderQuiz(payload) {
    let html = `
        <div>
            <h3>${payload.title}</h3>
            <p>${payload.description}</p>
            <div style="margin-top: 1.5rem;">
    `;
    
    payload.questions.forEach((q, index) => {
        html += `
            <div class="quiz-question">
                <h4>Question ${index + 1}: ${q.question}</h4>
                <div class="quiz-options">
                    ${q.options.map((opt, optIndex) => `
                        <button 
                            class="quiz-option" 
                            data-question="${index}" 
                            data-option="${optIndex}"
                            onclick="checkQuizAnswer(${index}, ${optIndex}, ${q.correct_answer})"
                        >
                            ${opt}
                        </button>
                    `).join('')}
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
        } else if (option === selectedOption && option !== correctAnswer) {
            btn.classList.add('incorrect');
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
}

/**
 * Show loading state
 */
function showLoading() {
    loadingEl.style.display = 'block';
    loadingEl.setAttribute('aria-busy', 'true');
    errorEl.style.display = 'none';
    mapEl.style.display = 'none';
    legendEl.style.display = 'none';
}

/**
 * Hide loading state
 */
function hideLoading() {
    loadingEl.style.display = 'none';
    loadingEl.setAttribute('aria-busy', 'false');
}

/**
 * Show map
 */
function showMap() {
    mapEl.style.display = 'block';
    legendEl.style.display = 'flex';
}

/**
 * Show error state
 */
function showError(message) {
    hideLoading();
    errorEl.style.display = 'block';
    errorMessageEl.textContent = message || 'Something went wrong. Please try again later.';
}

// Make checkQuizAnswer available globally for onclick handlers
window.checkQuizAnswer = checkQuizAnswer;
