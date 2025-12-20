// Santa Tracker Landing Page - Interactive Features

// Interval variable for cleanup
let countdownInterval = null;

document.addEventListener('DOMContentLoaded', () => {
    // Initialize snowfall
    initSnowfall();
    
    // Initialize countdown
    initCountdown();
    
    // Set current year
    document.getElementById('year').textContent = new Date().getFullYear();
});

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    countdownInterval?.stop?.();
});

// Snowfall effect
function initSnowfall() {
    const snowfallContainer = document.getElementById('snowfall');
    if (!snowfallContainer) return;

    // Check if user prefers reduced motion
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) return;

    const snowflakeCount = 40;
    const snowflakes = ['❄', '❅', '❆'];

    for (let i = 0; i < snowflakeCount; i++) {
        const snowflake = document.createElement('div');
        snowflake.className = 'snowflake';
        snowflake.textContent = snowflakes[Math.floor(Math.random() * snowflakes.length)];
        snowflake.style.left = `${Math.random() * 100}vw`;
        snowflake.style.fontSize = `${Number(Math.random()) * 1.5 + 0.8}em`;
        snowflake.style.animationDuration = `${Math.random() * 10 + 10}s`;
        snowflake.style.animationDelay = `${Math.random() * 10}s`;
        snowflake.style.opacity = Math.random() * 0.6 + 0.4;
        
        // Alternate animation direction
        snowflake.style.animationName = i % 2 === 0 ? 'snowfall' : 'snowfall-left';
        
        snowfallContainer.appendChild(snowflake);
    }
}

// Countdown to Santa's Tour Launch (Christmas Day)
// Uses the CountdownModule for consistent countdown behavior
function initCountdown() {
    const countdownElement = document.getElementById('countdown');
    if (!countdownElement) return;
    
    // Prefer the route's anchor departure if available; otherwise fall back
    // to the CountdownModule's default tour launch target.
    fetch('/static/data/santa_route.json').then(r => r.json()).then(data => {
        const nodes = data.route_nodes || data.route || [];
        const anchor = nodes.find(n => {
            try {
                const nid = String(n.id || '').toLowerCase();
                const ntype = String(n.type || '').toLowerCase();
                return nid === 'node_000_north_pole' || nid.includes('north_pole') || ntype === 'start';
            } catch (e) {
                console.debug('Error parsing route node for countdown anchor', e);
                return false;
            }
        }) || nodes[0];

        const targetRaw = anchor ? (anchor.schedule?.departure_time || anchor.schedule?.arrival_time || anchor.schedule?.departure_utc || anchor.schedule?.arrival_utc || null) : null;

        if (targetRaw) {
            const targetDate = new Date(targetRaw);
            if (!isNaN(targetDate.getTime())) {
                // Adjust to current season year similar to tracker logic
                const now = new Date();
                const currentYear = now.getFullYear();
                const adjusted = new Date(targetDate);
                adjusted.setUTCFullYear(currentYear);
                const tourEndThisYear = new Date(Date.UTC(currentYear, 11, 26, 0, 0, 0));
                if (now > tourEndThisYear) adjusted.setUTCFullYear(currentYear + 1);

                // Local enforcer: update the DOM every second using human-friendly format
                let enforcerId = null;
                const formatDurationMs = (diff) => {
                    if (diff <= 0) return '00:00:00';
                    const totalSeconds = Math.floor(diff / 1000);
                    const days = Math.floor(totalSeconds / (24 * 3600));
                    const hours = Math.floor((totalSeconds % (24 * 3600)) / 3600);
                    const minutes = Math.floor((totalSeconds % 3600) / 60);
                    const seconds = totalSeconds % 60;
                    if (days > 0) return `${days}d ${hours}h ${String(minutes).padStart(2,'0')}m ${String(seconds).padStart(2,'0')}s`;
                    if (hours > 0) return `${hours}h ${String(minutes).padStart(2,'0')}m ${String(seconds).padStart(2,'0')}s`;
                    return `${String(minutes).padStart(2,'0')}m ${String(seconds).padStart(2,'0')}s`;
                };

                const tick = () => {
                    const nowTick = new Date();
                    const diff = adjusted - nowTick;
                    if (diff <= 0) {
                        countdownElement.textContent = '00:00:00';
                        clearInterval(enforcerId);
                        enforcerId = null;
                        return;
                    }
                    countdownElement.textContent = formatDurationMs(diff);
                };

                tick();
                enforcerId = setInterval(tick, 1000);
                // store for cleanup
                countdownInterval = { stop: () => { if (enforcerId) clearInterval(enforcerId); } };
                return;
            }
        }

        // If anchor not usable, fall back to CountdownModule
        if (window.CountdownModule && typeof window.CountdownModule.createCountdown === 'function') {
            const countdown = window.CountdownModule.createCountdown({
                targetElement: countdownElement,
                useLocalTime: false,
                onUpdate: (timeData) => {
                    if (timeData.days === 0 && timeData.hours < 1) countdownElement.classList.add('countdown-urgent');
                }
            });
            countdown.start();
            countdownInterval = countdown;
        }
    }).catch(err => {
        console.debug('Home countdown: failed to fetch route; falling back to module', err);
        if (window.CountdownModule && typeof window.CountdownModule.createCountdown === 'function') {
            const countdown = window.CountdownModule.createCountdown({ targetElement: countdownElement, useLocalTime: false });
            countdown.start();
            countdownInterval = countdown;
        }
    });
}
