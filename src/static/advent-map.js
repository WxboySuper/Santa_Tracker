// Advent North Pole Map Progressive Unlock UI
// Handles fetching advent calendar data, rendering buildings, and displaying content

(function() {
    'use strict';

    // State
    let currentModal = null;

    // Icons for different content types
    const contentIcons = {
        fact: '📚',
        game: '🎮',
        story: '📖',
        video: '🎥',
        activity: '🎨',
        quiz: '❓'
    };

    // Initialize when DOM is ready
    document.addEventListener('DOMContentLoaded', function() {
        initAdventMap();
    });

    /**
     * Initialize the advent map
     */
    function initAdventMap() {
        showLoading(true);
        fetchAdventManifest()
            .then(manifest => {
                renderBuildings(manifest.days);
                showLoading(false);
            })
            .catch(error => {
                console.error('Error loading advent calendar:', error);
                showError('Failed to load advent calendar. Please try again later.');
                showLoading(false);
            });

        // Set up modal close handlers
        setupModalHandlers();
    }

    /**
     * Fetch the advent calendar manifest from the API
     * @returns {Promise<Object>} The advent manifest data
     */
    function fetchAdventManifest() {
        return fetch('/api/advent/manifest')
            .then(response => {
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                return response.json();
            });
    }

    /**
     * Fetch content for a specific day
     * @param {number} dayNumber - The day number (1-24)
     * @returns {Promise<Object>} The day content
     */
    function fetchDayContent(dayNumber) {
        return fetch(`/api/advent/day/${dayNumber}`)
            .then(response => {
                if (!response.ok) {
                    if (response.status === 403) {
                        throw new Error('This day is still locked. Check back later!');
                    }
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                return response.json();
            });
    }

    /**
     * Render all buildings on the map
     * @param {Array} days - Array of advent day objects
     */
    function renderBuildings(days) {
        const container = document.getElementById('advent-buildings');
        if (!container) {
            console.error('Buildings container not found');
            return;
        }

        container.innerHTML = '';

        days.forEach(day => {
            const building = createBuildingElement(day);
            container.appendChild(building);
        });
    }

    /**
     * Create a building element for a day
     * @param {Object} day - The day object
     * @returns {HTMLElement} The building element
     */
    function createBuildingElement(day) {
        const building = document.createElement('div');
        building.className = 'advent-building';
        building.setAttribute('role', 'button');
        building.setAttribute('tabindex', '0');
        building.setAttribute('data-day', day.day);

        // Set locked/unlocked state
        if (day.is_unlocked) {
            building.classList.add('unlocked');
            building.setAttribute('aria-label', 
                `Day ${day.day}: ${day.title} - Click to view content`);
        } else {
            building.classList.add('locked');
            building.setAttribute('aria-label', 
                `Day ${day.day}: Locked - Unlocks on ${formatUnlockTime(day.unlock_time)}`);
            building.setAttribute('aria-disabled', 'true');
        }

        // Day number
        const dayNumber = document.createElement('div');
        dayNumber.className = 'building-day-number';
        dayNumber.textContent = day.day;
        building.appendChild(dayNumber);

        // Icon based on content type
        const icon = document.createElement('div');
        icon.className = 'building-icon';
        icon.textContent = contentIcons[day.content_type] || '🎁';
        icon.setAttribute('aria-hidden', 'true');
        building.appendChild(icon);

        // Lock icon for locked days
        if (!day.is_unlocked) {
            const lockIcon = document.createElement('div');
            lockIcon.className = 'lock-icon';
            lockIcon.textContent = '🔒';
            lockIcon.setAttribute('aria-hidden', 'true');
            building.appendChild(lockIcon);
        }

        // Title
        const title = document.createElement('div');
        title.className = 'building-title';
        title.textContent = day.is_unlocked ? day.title : 'Locked';
        building.appendChild(title);

        // Add click handler for unlocked days
        if (day.is_unlocked) {
            building.addEventListener('click', () => handleBuildingClick(day.day));
            building.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleBuildingClick(day.day);
                }
            });
        }

        return building;
    }

    /**
     * Handle building click to show day content
     * @param {number} dayNumber - The day number
     */
    function handleBuildingClick(dayNumber) {
        showLoading(true);
        fetchDayContent(dayNumber)
            .then(content => {
                showModal(content);
                showLoading(false);
            })
            .catch(error => {
                console.error('Error loading day content:', error);
                showError(error.message || 'Failed to load content. Please try again.');
                showLoading(false);
            });
    }

    /**
     * Show the modal with day content
     * @param {Object} content - The day content object
     */
    function showModal(content) {
        const modal = document.getElementById('advent-modal');
        const title = document.getElementById('modal-title');
        const contentArea = document.getElementById('modal-content-area');

        if (!modal || !title || !contentArea) {
            console.error('Modal elements not found');
            return;
        }

        // Set title
        title.textContent = `Day ${content.day}: ${content.title}`;

        // Render content based on type
        contentArea.innerHTML = renderContent(content);

        // Show modal
        modal.removeAttribute('hidden');
        currentModal = modal;

        // Focus on close button for accessibility
        const closeButton = modal.querySelector('.modal-close');
        if (closeButton) {
            closeButton.focus();
        }

        // Trap focus in modal
        trapFocus(modal);
    }

    /**
     * Render content based on content type
     * @param {Object} content - The day content object
     * @returns {string} HTML string for the content
     */
    function renderContent(content) {
        const payload = content.payload || {};
        let html = '';

        switch (content.content_type) {
        case 'fact':
        case 'story':
            html = '<div class="content-fact">';
            if (payload.image_url) {
                html += `<img src="${escapeHtml(payload.image_url)}" 
                                  alt="${escapeHtml(content.title)}" 
                                  class="content-image">`;
            }
            html += `<p class="content-text">${escapeHtml(payload.text || '')}</p>`;
            html += '</div>';
            break;

        case 'game':
            html = '<div class="content-game">';
            html += `<h3>${escapeHtml(payload.title || '')}</h3>`;
            html += `<p class="content-description">${escapeHtml(payload.description || '')}</p>`;
            if (payload.url) {
                html += `<a href="${escapeHtml(payload.url)}" 
                                class="content-link" 
                                target="_blank" 
                                rel="noopener noreferrer">Play Now!</a>`;
            }
            html += '</div>';
            break;

        case 'activity':
            // Handle recipe type activity
            if (payload.activity_type === 'recipe') {
                html = '<div class="recipe-section">';
                html += `<h3>${escapeHtml(payload.title || 'Recipe')}</h3>`;
                html += `<p class="content-description">${escapeHtml(payload.description || '')}</p>`;
                    
                if (payload.ingredients && Array.isArray(payload.ingredients)) {
                    html += '<div class="recipe-section">';
                    html += '<h4>Ingredients:</h4>';
                    html += '<ul class="recipe-ingredients">';
                    payload.ingredients.forEach(ingredient => {
                        html += `<li>${escapeHtml(ingredient)}</li>`;
                    });
                    html += '</ul></div>';
                }
                    
                if (payload.instructions) {
                    html += '<div class="recipe-section">';
                    html += '<h4>Instructions:</h4>';
                    html += `<div class="recipe-instructions">${escapeHtml(payload.instructions)}</div>`;
                    html += '</div>';
                }
                html += '</div>';
            } else {
                // Generic activity
                html = '<div class="content-activity">';
                html += `<h3>${escapeHtml(payload.title || '')}</h3>`;
                html += `<p class="content-description">${escapeHtml(payload.description || '')}</p>`;
                if (payload.url) {
                    html += `<a href="${escapeHtml(payload.url)}" 
                                    class="content-link" 
                                    target="_blank" 
                                    rel="noopener noreferrer">Start Activity</a>`;
                }
                html += '</div>';
            }
            break;

        case 'video':
            html = '<div class="content-video">';
            html += `<h3>${escapeHtml(payload.title || '')}</h3>`;
            html += `<p class="content-description">${escapeHtml(payload.description || '')}</p>`;
            if (payload.video_url) {
                html += `<video controls class="content-image">
                                <source src="${escapeHtml(payload.video_url)}" type="video/mp4">
                                Your browser does not support the video tag.
                             </video>`;
            }
            if (payload.special_message) {
                html += `<p class="content-text" style="margin-top: 20px; font-style: italic;">
                                ${escapeHtml(payload.special_message)}
                             </p>`;
            }
            html += '</div>';
            break;

        case 'quiz':
            html = '<div class="content-quiz">';
            html += `<h3>${escapeHtml(payload.title || 'Quiz')}</h3>`;
            html += `<p class="content-description">${escapeHtml(payload.description || '')}</p>`;
            if (payload.questions && Array.isArray(payload.questions)) {
                payload.questions.forEach((q, index) => {
                    html += '<div class="quiz-question">';
                    html += `<h4>Question ${index + 1}: ${escapeHtml(q.question || '')}</h4>`;
                    if (q.options && Array.isArray(q.options)) {
                        html += '<ul class="quiz-options">';
                        q.options.forEach((option, optIndex) => {
                            html += `<li tabindex="0" role="button" 
                                            data-question="${index}" 
                                            data-option="${optIndex}">
                                            ${escapeHtml(option)}
                                         </li>`;
                        });
                        html += '</ul>';
                    }
                    html += '</div>';
                });
            }
            html += '</div>';
            break;

        default:
            html = '<p class="content-text">Content not available.</p>';
        }

        return html;
    }

    /**
     * Set up modal event handlers
     */
    function setupModalHandlers() {
        const modal = document.getElementById('advent-modal');
        if (!modal) return;

        // Close button
        const closeButton = modal.querySelector('.modal-close');
        if (closeButton) {
            closeButton.addEventListener('click', closeModal);
        }

        // Overlay click
        const overlay = modal.querySelector('.modal-overlay');
        if (overlay) {
            overlay.addEventListener('click', closeModal);
        }

        // Escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && currentModal) {
                closeModal();
            }
        });
    }

    /**
     * Close the modal
     */
    function closeModal() {
        const modal = document.getElementById('advent-modal');
        if (modal) {
            modal.setAttribute('hidden', '');
            currentModal = null;
        }
    }

    /**
     * Trap focus within modal for accessibility
     * @param {HTMLElement} element - The element to trap focus in
     */
    function trapFocus(element) {
        const focusableElements = element.querySelectorAll(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        const firstFocusable = focusableElements[0];
        const lastFocusable = focusableElements[focusableElements.length - 1];

        element.addEventListener('keydown', function(e) {
            if (e.key === 'Tab') {
                if (e.shiftKey) {
                    if (document.activeElement === firstFocusable) {
                        lastFocusable.focus();
                        e.preventDefault();
                    }
                } else {
                    if (document.activeElement === lastFocusable) {
                        firstFocusable.focus();
                        e.preventDefault();
                    }
                }
            }
        });
    }

    /**
     * Show/hide loading indicator
     * @param {boolean} show - Whether to show the loading indicator
     */
    function showLoading(show) {
        const loading = document.getElementById('loading-indicator');
        if (loading) {
            if (show) {
                loading.removeAttribute('hidden');
            } else {
                loading.setAttribute('hidden', '');
            }
        }
    }

    /**
     * Show an error message
     * @param {string} message - The error message
     */
    function showError(message) {
        // Simple alert for now - could be improved with a custom error modal
        alert(message);
    }

    /**
     * Format unlock time for display
     * @param {string} unlockTime - ISO format unlock time
     * @returns {string} Formatted date string
     */
    function formatUnlockTime(unlockTime) {
        try {
            const date = new Date(unlockTime);
            return date.toLocaleDateString('en-US', { 
                month: 'short', 
                day: 'numeric',
                year: 'numeric'
            });
        } catch (e) {
            return 'soon';
        }
    }

    /**
     * Escape HTML to prevent XSS
     * @param {string} text - Text to escape
     * @returns {string} Escaped text
     */
    function escapeHtml(text) {
        if (typeof text !== 'string') return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

})();
