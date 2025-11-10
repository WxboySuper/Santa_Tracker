// filepath: /static/script.js
// Wait for the DOM to be fully loaded

// skipcq: JS-0241
document.addEventListener('DOMContentLoaded', function() {
    // Initialize countdown timer first (independent of map)
    updateCountdown();
    setInterval(updateCountdown, 1000);

    // Initialize map (wrapped in try-catch to prevent blocking countdown)
    try {
        // skipcq: JS-0125
        const map = L.map('map').setView([90, 0], 3);
        
        // skipcq: JS-0125
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors'
        }).addTo(map);

        // Event System for handling updates
        const EventSystem = (function() {
            const events = {};
            
            return {
                subscribe(event, callback) {
                    if (!events[event]) events[event] = [];
                    events[event].push(callback);
                },
                emit(event, data) {
                    if (events[event]) {
                        events[event].forEach(callback => callback(data));
                    }
                }
            };
        })();

        // Create Santa's marker
        // skipcq: JS-0125
        const santaMarker = L.marker([90, 0], {
            // skipcq: JS-0125
            icon: L.icon({
                iconUrl: 'src/static/images/santa-icon.png',
                iconSize: [38, 38]
            })
        }).addTo(map);

        // Subscribe to Santa location updates
        EventSystem.subscribe('santaMove', (position) => {
            santaMarker.setLatLng(position);
            map.panTo(position);
        });

        // Example update (replace with real tracking logic)
        setInterval(() => {
            const newPosition = [
                90 - Math.random() * 10,
                Math.random() * 360 - 180
            ];
            EventSystem.emit('santaMove', newPosition);
        }, 5000);
    } catch (error) {
        console.error('Map initialization failed:', error);
    }
});

/**
 * Countdown Timer Configuration
 * Set USE_UTC to true to count down to Christmas Eve UTC, false for local time
 */
const COUNTDOWN_CONFIG = {
    USE_UTC: false, // Change to true to use UTC time instead of local time
    TARGET_MONTH: 11, // December (0-indexed, so 11 = December)
    TARGET_DAY: 24, // Christmas Eve
    TARGET_HOUR: 0, // Midnight
    TARGET_MINUTE: 0,
    TARGET_SECOND: 0
};

/**
 * Get the target date for Santa's tour launch (Christmas Eve)
 * @returns {Date} Target date for countdown
 */
function getTargetDate() {
    const now = new Date();
    const currentYear = now.getFullYear();
    
    let targetDate;
    if (COUNTDOWN_CONFIG.USE_UTC) {
        // Create date in UTC
        targetDate = new Date(Date.UTC(
            currentYear,
            COUNTDOWN_CONFIG.TARGET_MONTH,
            COUNTDOWN_CONFIG.TARGET_DAY,
            COUNTDOWN_CONFIG.TARGET_HOUR,
            COUNTDOWN_CONFIG.TARGET_MINUTE,
            COUNTDOWN_CONFIG.TARGET_SECOND
        ));
    } else {
        // Create date in local time
        targetDate = new Date(
            currentYear,
            COUNTDOWN_CONFIG.TARGET_MONTH,
            COUNTDOWN_CONFIG.TARGET_DAY,
            COUNTDOWN_CONFIG.TARGET_HOUR,
            COUNTDOWN_CONFIG.TARGET_MINUTE,
            COUNTDOWN_CONFIG.TARGET_SECOND
        );
    }
    
    // If the target date has passed this year, set it to next year
    if (targetDate < now) {
        if (COUNTDOWN_CONFIG.USE_UTC) {
            targetDate = new Date(Date.UTC(
                currentYear + 1,
                COUNTDOWN_CONFIG.TARGET_MONTH,
                COUNTDOWN_CONFIG.TARGET_DAY,
                COUNTDOWN_CONFIG.TARGET_HOUR,
                COUNTDOWN_CONFIG.TARGET_MINUTE,
                COUNTDOWN_CONFIG.TARGET_SECOND
            ));
        } else {
            targetDate = new Date(
                currentYear + 1,
                COUNTDOWN_CONFIG.TARGET_MONTH,
                COUNTDOWN_CONFIG.TARGET_DAY,
                COUNTDOWN_CONFIG.TARGET_HOUR,
                COUNTDOWN_CONFIG.TARGET_MINUTE,
                COUNTDOWN_CONFIG.TARGET_SECOND
            );
        }
    }
    
    return targetDate;
}

/**
 * Format a number to always have at least 2 digits
 * @param {number} num - Number to format
 * @returns {string} Formatted number string
 */
function padZero(num) {
    return num.toString().padStart(2, '0');
}

/**
 * Update the countdown timer display
 * Shows days, hours, minutes, and seconds until Santa's tour launch
 */
function updateCountdown() {
    const countdownElement = document.getElementById('countdown');
    if (!countdownElement) {
        console.error('Countdown element not found');
        return;
    }
    
    const targetDate = getTargetDate();
    const now = new Date();
    const diff = targetDate - now;
    
    // If we've reached or passed the target date
    if (diff <= 0) {
        countdownElement.innerHTML = '🎅 Santa is on his way! 🎄';
        countdownElement.classList.add('countdown-active');
        return;
    }
    
    // Calculate time components
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);
    
    // Format the countdown display
    const timeZoneLabel = COUNTDOWN_CONFIG.USE_UTC ? ' (UTC)' : '';
    countdownElement.innerHTML = `
        <div class="countdown-label">Santa's Tour Launch:</div>
        <div class="countdown-time">
            <span class="countdown-unit">
                <span class="countdown-value">${days}</span>
                <span class="countdown-text">day${days !== 1 ? 's' : ''}</span>
            </span>
            <span class="countdown-separator">:</span>
            <span class="countdown-unit">
                <span class="countdown-value">${padZero(hours)}</span>
                <span class="countdown-text">hrs</span>
            </span>
            <span class="countdown-separator">:</span>
            <span class="countdown-unit">
                <span class="countdown-value">${padZero(minutes)}</span>
                <span class="countdown-text">min</span>
            </span>
            <span class="countdown-separator">:</span>
            <span class="countdown-unit">
                <span class="countdown-value">${padZero(seconds)}</span>
                <span class="countdown-text">sec</span>
            </span>
        </div>
        <div class="countdown-timezone">${timeZoneLabel}</div>
    `;
}