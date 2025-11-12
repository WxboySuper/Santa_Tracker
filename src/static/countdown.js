// filepath: /static/countdown.js
// Santa Tracker Countdown Module - Countdown to Christmas Morning Tour Launch
//
// This module provides countdown functionality for Santa's Christmas morning tour launch.
// Santa's tour traditionally begins at midnight on December 25th (Christmas morning)
// in the first time zone (UTC+14, Line Islands), which is 10:00 UTC on December 24th.
//
// Usage:
//   // In the browser (after including countdown.js as a script):
//   const countdown = window.CountdownModule.createCountdown({
//     targetElement: document.getElementById('countdown'),
//     onUpdate: (timeData) => console.log(timeData),
//     useLocalTime: false  // false for UTC+14-based tour launch
//   });
//   countdown.start();
//   countdown.stop();
//
//   // In Node.js/CommonJS:
//   const { createCountdown } = require('./countdown.js');
//   const countdown = createCountdown({
//     targetElement: document.getElementById('countdown'),
//     onUpdate: (timeData) => console.log(timeData),
//     useLocalTime: false  // false for UTC+14-based tour launch
//   });
//   countdown.start();
//   countdown.stop();

/**
 * Configuration for countdown behavior
 * @typedef {Object} CountdownConfig
 * @property {HTMLElement} targetElement - DOM element to update with countdown
 * @property {Function} [onUpdate] - Callback function called on each update
 * @property {boolean} [useLocalTime] - Use local time (true) or UTC+14 time for Santa's tour start (false)
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
 * Get the target date for Santa's tour launch.
 * When useLocalTime is true, returns midnight on December 25th in the user's local time zone.
 * When useLocalTime is false, returns midnight on December 25th in UTC+14 (Line Islands),
 * which is 10:00 UTC on December 24th. This matches the traditional start of Santa's tour.
 * 
 * @param {boolean} useLocalTime - If true, use local midnight Dec 25; if false, use UTC+14 midnight Dec 25 (10:00 UTC Dec 24)
 * @returns {Date} Target date for tour launch
 */
function getTourLaunchDate(useLocalTime = true) {
    const now = new Date();
    const currentYear = now.getFullYear();
    
    let tourLaunchDate = useLocalTime 
        ? new Date(currentYear, 11, 25, 0, 0, 0)  // Local midnight Dec 25
        : new Date(Date.UTC(currentYear, 11, 24, 10, 0, 0));  // UTC+14 midnight = Dec 24 10:00 UTC
    
    // If we've passed the launch this year, target next year
    if (now > tourLaunchDate) {
        tourLaunchDate = useLocalTime
            ? new Date(currentYear + 1, 11, 25, 0, 0, 0)
            : new Date(Date.UTC(currentYear + 1, 11, 24, 10, 0, 0));
    }
    
    return tourLaunchDate;
}

/**
 * Calculate time remaining until target date
 * Keeps completion message during Santa's delivery (all of Christmas Day)
 * @param {Date} targetDate - Target date to count down to
 * @returns {TimeData} Time data object
 */
function calculateTimeRemaining(targetDate) {
    const now = new Date();
    const diff = targetDate - now;
    
    // Check if Santa's tour has started (past midnight Dec 25)
    if (diff <= 0) {
        // Determine if targetDate is UTC-based (Dec 24 10:00 UTC for UTC+14 midnight)
        // UTC+14 mode: targetDate is Dec 24, 10:00 UTC (= Dec 25, 00:00 UTC+14)
        // Local mode: targetDate is Dec 25, 00:00 local
        const isUTCMode = (
            targetDate.getUTCHours() === 10 &&
            targetDate.getUTCMinutes() === 0 &&
            targetDate.getUTCDate() === 24 &&
            targetDate.getUTCMonth() === 11
        );
        
        const christmasEnd = isUTCMode
            ? new Date(targetDate.getTime() + 24 * 60 * 60 * 1000)  // UTC mode: Add 24 hours
            : (() => {
                // Local mode: Add 1 day using local date methods
                const end = new Date(targetDate);
                end.setDate(end.getDate() + 1);
                return end;
            })();
        
        // If we're still on Christmas Day (Santa is still delivering), show completion message
        if (now < christmasEnd) {
            return {
                days: 0,
                hours: 0,
                minutes: 0,
                seconds: 0,
                totalMilliseconds: 0,
                isComplete: true
            };
        }
        // Christmas Day has passed, countdown will restart for next year
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
    const daysStr = String(days);
    const hoursStr = String(hours).padStart(2, '0');
    const minutesStr = String(minutes).padStart(2, '0');
    const secondsStr = String(seconds).padStart(2, '0');
    
    return `${daysStr}d ${hoursStr}h ${minutesStr}m ${secondsStr}s`;
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
        
        // Update DOM element - use textContent for security
        const formattedTime = formatFunction(timeData);
        targetElement.textContent = formattedTime;
        
        // Trigger callback if provided
        if (onUpdate && typeof onUpdate === 'function') {
            onUpdate(timeData);
        }
        
        // Note: We do NOT stop the countdown when complete. This allows it to
        // automatically restart for next year after midnight December 26th.
        // The completion message will show throughout Christmas Day (Dec 25),
        // then the countdown will automatically roll over to next year.
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
// Check for both module and module.exports to avoid false positives
// eslint-disable-next-line no-undef
if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
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
