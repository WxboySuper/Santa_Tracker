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

// Countdown to Santa's Tour Launch (Christmas Eve)
// Uses the CountdownModule for consistent countdown behavior
function initCountdown() {
    const countdownElement = document.getElementById('countdown');
    if (!countdownElement) return;
    
    // Create countdown instance using the CountdownModule
    const countdown = window.CountdownModule.createCountdown({
        targetElement: countdownElement,
        useLocalTime: true, // Use local time for user convenience
        onUpdate: (timeData) => {
            // Optional: Add custom behavior on each update
            // For example, change styling when close to launch
            if (timeData.days === 0 && timeData.hours < 1) {
                countdownElement.classList.add('countdown-urgent');
            }
        }
    });
    
    countdown.start();
    
    // Store countdown instance for cleanup
    countdownInterval = countdown;
}
