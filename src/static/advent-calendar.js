// Advent Calendar - Simple Grid Implementation
(function() {
    'use strict';

    // Content type icons
    const ICONS = {
        fact: '📚',
        game: '🎮',
        story: '📖',
        video: '🎥',
        activity: '🎨',
        quiz: '❓'
    };

    // Initialize on DOM load
    document.addEventListener('DOMContentLoaded', init);

    function init() {
        showLoading(true);
        fetchManifest()
            .then(renderCalendar)
            .then(() => showLoading(false))
            .catch(handleError);

        setupModalHandlers();
    }

    function fetchManifest() {
        return fetch('/api/advent/manifest')
            .then(res => {
                if (!res.ok) throw new Error('Failed to load calendar');
                return res.json();
            });
    }

    function fetchDay(dayNumber) {
        return fetch(`/api/advent/day/${dayNumber}`)
            .then(res => {
                if (!res.ok) {
                    if (res.status === 403) throw new Error('This day is still locked!');
                    throw new Error('Failed to load content');
                }
                return res.json();
            });
    }

    function renderCalendar(data) {
        const container = document.getElementById('advent-calendar');
        if (!container) return;

        container.innerHTML = '';
        
        data.days.forEach(day => {
            const card = createDayCard(day);
            container.appendChild(card);
        });
    }

    function createDayCard(day) {
        const card = document.createElement('div');
        card.className = `calendar-day ${day.is_unlocked ? 'unlocked' : 'locked'}`;
        card.setAttribute('role', 'button');
        card.setAttribute('tabindex', day.is_unlocked ? '0' : '-1');
        card.setAttribute('aria-label', 
            day.is_unlocked 
                ? `Day ${day.day}: ${day.title} - Click to view`
                : `Day ${day.day}: Locked`
        );

        // Day number
        const number = document.createElement('div');
        number.className = 'day-number';
        number.textContent = day.day;
        card.appendChild(number);

        // Icon
        const icon = document.createElement('div');
        icon.className = 'day-icon';
        icon.textContent = ICONS[day.content_type] || '🎁';
        icon.setAttribute('aria-hidden', 'true');
        card.appendChild(icon);

        // Lock icon for locked days
        if (!day.is_unlocked) {
            const lock = document.createElement('div');
            lock.className = 'lock-icon';
            lock.textContent = '🔒';
            lock.setAttribute('aria-hidden', 'true');
            card.appendChild(lock);
        }

        // Title
        const title = document.createElement('div');
        title.className = 'day-title';
        title.textContent = day.is_unlocked ? day.title : 'Locked';
        card.appendChild(title);

        // Click handler
        if (day.is_unlocked) {
            card.addEventListener('click', () => openDay(day.day));
            card.addEventListener('keydown', e => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    openDay(day.day);
                }
            });
        }

        return card;
    }

    function openDay(dayNumber) {
        showLoading(true);
        fetchDay(dayNumber)
            .then(showModal)
            .then(() => showLoading(false))
            .catch(err => {
                showLoading(false);
                alert(err.message);
            });
    }

    function showModal(content) {
        const modal = document.getElementById('advent-modal');
        const title = document.getElementById('modal-title');
        const body = document.getElementById('modal-body');

        if (!modal || !title || !body) return;

        title.textContent = `Day ${content.day}: ${content.title}`;
        body.innerHTML = renderContent(content);

        modal.removeAttribute('hidden');

        // Focus close button
        const closeBtn = modal.querySelector('.modal-close');
        if (closeBtn) closeBtn.focus();
    }

    function renderContent(content) {
        const payload = content.payload || {};
        let html = '';

        switch (content.content_type) {
        case 'fact':
        case 'story':
            if (payload.image_url) {
                html += `<img src="${escapeHtml(payload.image_url)}" 
                              alt="${escapeHtml(content.title)}" 
                              class="content-image">`;
            }
            html += `<p class="content-text">${escapeHtml(payload.text || '')}</p>`;
            break;

        case 'game':
        case 'activity':
            html += `<h3>${escapeHtml(payload.title || '')}</h3>`;
            html += `<p class="content-text">${escapeHtml(payload.description || '')}</p>`;
            if (payload.url) {
                html += `<a href="${escapeHtml(payload.url)}" 
                            class="content-link" 
                            target="_blank" 
                            rel="noopener noreferrer">Start</a>`;
            }
            break;

        case 'video':
            html += `<h3>${escapeHtml(payload.title || '')}</h3>`;
            html += `<p class="content-text">${escapeHtml(payload.description || '')}</p>`;
            if (payload.video_url) {
                html += `<video controls class="content-image">
                            <source src="${escapeHtml(payload.video_url)}" type="video/mp4">
                            Your browser does not support video.
                         </video>`;
            }
            if (payload.special_message) {
                html += `<p class="content-text" style="margin-top: 1rem; font-style: italic;">
                            ${escapeHtml(payload.special_message)}
                         </p>`;
            }
            break;

        case 'quiz':
            html += `<h3>${escapeHtml(payload.title || 'Quiz')}</h3>`;
            html += `<p class="content-text">${escapeHtml(payload.description || '')}</p>`;
            // Quiz rendering simplified for now
            break;

        default:
            html = '<p class="content-text">Content not available.</p>';
        }

        return html;
    }

    function setupModalHandlers() {
        const modal = document.getElementById('advent-modal');
        if (!modal) return;

        // Close button
        const closeBtn = modal.querySelector('.modal-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', closeModal);
        }

        // Overlay click
        const overlay = modal.querySelector('.modal-overlay');
        if (overlay) {
            overlay.addEventListener('click', closeModal);
        }

        // Escape key
        document.addEventListener('keydown', e => {
            if (e.key === 'Escape' && !modal.hidden) {
                closeModal();
            }
        });
    }

    function closeModal() {
        const modal = document.getElementById('advent-modal');
        if (modal) {
            modal.setAttribute('hidden', '');
        }
    }

    function showLoading(show) {
        const loading = document.getElementById('loading');
        if (loading) {
            if (show) {
                loading.removeAttribute('hidden');
            } else {
                loading.setAttribute('hidden', '');
            }
        }
    }

    function handleError(error) {
        console.error('Advent calendar error:', error);
        showLoading(false);
        alert('Failed to load advent calendar. Please try again.');
    }

    function escapeHtml(text) {
        if (typeof text !== 'string') return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

})();
