// Santa Tracker Landing Page - Interactive Features

document.addEventListener('DOMContentLoaded', function() {
    // Initialize snowfall
    initSnowfall();
    
    // Initialize countdown
    initCountdown();
    
    // Set current year
    document.getElementById('year').textContent = new Date().getFullYear();
});

// Snowfall effect
function initSnowfall() {
    const snowfallContainer = document.getElementById('snowfall');
    if (!snowfallContainer) return;

    // Check if user prefers reduced motion
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) return;

    const snowflakeCount = 40;
    const snowflakes = ['❄', '❅', '❆', '✳'];

    for (let i = 0; i < snowflakeCount; i++) {
        const snowflake = document.createElement('div');
        snowflake.className = 'snowflake';
        snowflake.textContent = snowflakes[Math.floor(Math.random() * snowflakes.length)];
        snowflake.style.left = Math.random() * 100 + 'vw';
        snowflake.style.fontSize = (Math.random() * 1.5 + 0.8) + 'em';
        snowflake.style.animationDuration = (Math.random() * 10 + 10) + 's';
        snowflake.style.animationDelay = Math.random() * 10 + 's';
        snowflake.style.opacity = Math.random() * 0.6 + 0.4;
        
        // Alternate animation direction
        snowflake.style.animationName = i % 2 === 0 ? 'snowfall' : 'snowfall-left';
        
        snowfallContainer.appendChild(snowflake);
    }
}

// Countdown to Christmas
function initCountdown() {
    updateCountdown();
    setInterval(updateCountdown, 1000);
}

function updateCountdown() {
    const countdownElement = document.getElementById('countdown');
    if (!countdownElement) return;
    
    const now = new Date();
    const currentYear = now.getFullYear();
    const christmas = new Date(currentYear, 11, 25, 0, 0, 0);
    
    // If Christmas has passed this year, show next year's Christmas
    if (now > christmas) {
        christmas.setFullYear(currentYear + 1);
    }
    
    const diff = christmas - now;
    
    if (diff <= 0) {
        countdownElement.innerHTML = '🎄 Merry Christmas! 🎅';
        return;
    }
    
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);
    
    countdownElement.innerHTML = `${days}d ${hours}h ${minutes}m ${seconds}s`;
}
