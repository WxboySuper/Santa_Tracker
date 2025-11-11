// filepath: /static/countdown.js
// Santa Tracker Countdown Module - Countdown to Christmas Eve Tour Launch
//
// This module provides countdown functionality for Santa's Christmas Eve tour launch.
// Santa's tour traditionally begins on December 24th when it becomes Christmas Eve
// in the first time zone (UTC+14, Line Islands).
//
// Usage:
//   import { createCountdown } from './countdown.js';
//   
//   const countdown = createCountdown({
//     targetElement: document.getElementById('countdown'),
//     onUpdate: (timeData) => console.log(timeData),
//     useLocalTime: true  // false for UTC-based tour launch
//   });
//   
//   countdown.start();
//   countdown.stop();

/**
 * Configuration for countdown behavior
 * @typedef {Object} CountdownConfig
 * @property {HTMLElement} targetElement - DOM element to update with countdown
 * @property {Function} [onUpdate] - Callback function called on each update
 * @property {boolean} [useLocalTime] - Use local time (true) or UTC time (false)
 * @property {Function} [formatFunction] - Custom format function
 */

/**
 * Time data structure returned by countdown
 * @typedef {Object} TimeData
 * @property {number} days - Days remaining
 * @property {number} hours - Hours remaining
 * @property {number} minutes - Minutes remaining
 * @property {number} seconds - Seconds remaining
 * @property {number} totalMilliseconds - Total milliseconds remaining
 * @property {boolean} isComplete - Whether countdown has finished
 */

/**
 * Get the target date for Santa's tour launch
 * Santa's tour starts on December 24th at 10:00 AM in the first time zone to reach Christmas Eve
 * (UTC+14, Line Islands, which means Dec 24 10:00 local = Dec 23 20:00 UTC)
 * 
 * @param {boolean} useLocalTime - Whether to use local time or UTC
 * @returns {Date} Target date for tour launch
 */
function getTourLaunchDate(useLocalTime = true) {
    const now = new Date();
    const currentYear = now.getFullYear();
    
    let tourLaunchDate;
    
    if (useLocalTime) {
        // For local time: Tour launches Dec 24 at midnight local time
        tourLaunchDate = new Date(currentYear, 11, 24, 0, 0, 0);
        
        // If we've passed Christmas Eve this year, target next year
        if (now > tourLaunchDate) {
            tourLaunchDate = new Date(currentYear + 1, 11, 24, 0, 0, 0);
        }
    } else {
        // For UTC: Tour launches when it becomes Dec 24 in UTC+14 (earliest timezone)
        // UTC+14 on Dec 24 00:00 = Dec 23 10:00 UTC
        tourLaunchDate = new Date(Date.UTC(currentYear, 11, 23, 10, 0, 0));
        
        // If we've passed the launch this year, target next year
        if (now > tourLaunchDate) {
            tourLaunchDate = new Date(Date.UTC(currentYear + 1, 11, 23, 10, 0, 0));
        }
    }
    
    return tourLaunchDate;
}

/**
 * Calculate time remaining until target date
 * @param {Date} targetDate - Target date to count down to
 * @returns {TimeData} Time data object
 */
function calculateTimeRemaining(targetDate) {
    const now = new Date();
    const diff = targetDate - now;
    
    if (diff <= 0) {
        return {
            days: 0,
            hours: 0,
            minutes: 0,
            seconds: 0,
            totalMilliseconds: 0,
            isComplete: true
        };
    }
    
    return {
        days: Math.floor(diff / (1000 * 60 * 60 * 24)),
        hours: Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
        minutes: Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60)),
        seconds: Math.floor((diff % (1000 * 60)) / 1000),
        totalMilliseconds: diff,
        isComplete: false
    };
}

/**
 * Default format function for countdown display
 * @param {TimeData} timeData - Time data to format
 * @returns {string} Formatted countdown string
 */
function defaultFormatFunction(timeData) {
    if (timeData.isComplete) {
        return '🎅 Santa\'s Tour Has Begun! 🎄';
    }
    
    const { days, hours, minutes, seconds } = timeData;
    
    // Format with leading zeros for better visual consistency
    const d = String(days);
    const h = String(hours).padStart(2, '0');
    const m = String(minutes).padStart(2, '0');
    const s = String(seconds).padStart(2, '0');
    
    return `${d}d ${h}h ${m}m ${s}s`;
}

/**
 * Create a countdown timer instance
 * @param {CountdownConfig} config - Configuration object
 * @returns {Object} Countdown instance with start/stop methods
 */
function createCountdown(config) {
    const {
        targetElement,
        onUpdate = null,
        useLocalTime = true,
        formatFunction = defaultFormatFunction
    } = config;
    
    if (!targetElement) {
        throw new Error('targetElement is required for countdown');
    }
    
    let intervalId = null;
    let isRunning = false;
    
    /**
     * Update the countdown display and trigger callback
     */
    function update() {
        const targetDate = getTourLaunchDate(useLocalTime);
        const timeData = calculateTimeRemaining(targetDate);
        
        // Update DOM element
        const formattedTime = formatFunction(timeData);
        targetElement.innerHTML = formattedTime;
        
        // Trigger callback if provided
        if (onUpdate && typeof onUpdate === 'function') {
            onUpdate(timeData);
        }
        
        // Stop countdown if complete
        if (timeData.isComplete && isRunning) {
            stop();
        }
    }
    
    /**
     * Start the countdown timer
     */
    function start() {
        if (isRunning) return;
        
        isRunning = true;
        update(); // Initial update
        intervalId = setInterval(update, 1000); // Update every second
    }
    
    /**
     * Stop the countdown timer
     */
    function stop() {
        if (!isRunning) return;
        
        isRunning = false;
        if (intervalId) {
            clearInterval(intervalId);
            intervalId = null;
        }
    }
    
    /**
     * Check if countdown is currently running
     * @returns {boolean} True if running
     */
    function getIsRunning() {
        return isRunning;
    }
    
    /**
     * Get current time data without updating display
     * @returns {TimeData} Current time data
     */
    function getTimeData() {
        const targetDate = getTourLaunchDate(useLocalTime);
        return calculateTimeRemaining(targetDate);
    }
    
    return {
        start,
        stop,
        isRunning: getIsRunning,
        getTimeData
    };
}

// Export for use in other scripts
// For browsers without module support, attach to window
// eslint-disable-next-line no-undef
if (typeof module !== 'undefined' && module.exports) {
    // eslint-disable-next-line no-undef
    module.exports = {
        createCountdown,
        getTourLaunchDate,
        calculateTimeRemaining,
        defaultFormatFunction
    };
} else {
    window.CountdownModule = {
        createCountdown,
        getTourLaunchDate,
        calculateTimeRemaining,
        defaultFormatFunction
    };
}
