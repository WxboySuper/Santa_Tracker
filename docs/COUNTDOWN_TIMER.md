# Countdown Timer

The countdown timer is a core feature that builds excitement for Santa's Christmas Eve journey.

## 🎯 Overview

The countdown timer displays real-time countdown to midnight December 25th in UTC+14 (the first timezone to reach Christmas), which is when Santa begins his journey.

### Key Features
- **Live Updates**: Refreshes every second
- **Timezone-Aware**: Targets UTC+14 (10:00 UTC on Dec 24)
- **Auto-Rollover**: Targets next year after Christmas
- **Completion Message**: Shows festive message when tour begins
- **Accessible**: Screen reader compatible

## 📐 Implementation

### Location
`src/static/countdown.js`

### Architecture
The countdown is implemented as a modular JavaScript component with a clean API for reusability.

### Basic Usage

```javascript
// Create countdown instance
const countdown = window.CountdownModule.createCountdown({
    targetElement: document.getElementById('countdown'),
    useLocalTime: false,  // Use UTC+14 for Santa's actual start
    onUpdate: (timeData) => {
        console.log(`${timeData.days} days remaining`);
    }
});

// Start the countdown
countdown.start();

// Stop the countdown (cleanup)
countdown.stop();
```

## ⚙️ Configuration Options

### targetElement (required)
DOM element where countdown will be displayed.

```javascript
targetElement: document.getElementById('countdown')
```

### useLocalTime (optional, default: false)
- `false`: Use UTC+14 timezone (Santa's official start time)
- `true`: Use user's local timezone

**Recommendation:** Keep as `false` for accurate Santa tracking.

```javascript
useLocalTime: false  // Use UTC+14 (recommended)
```

### formatFunction (optional)
Custom formatting function for countdown display.

**Default format:** `"Xd XXh XXm XXs"`

```javascript
formatFunction: (days, hours, minutes, seconds) => {
    return `${days} days, ${hours} hours, ${minutes} minutes, ${seconds} seconds`;
}
```

### onUpdate (optional)
Callback triggered on each countdown update (every second).

```javascript
onUpdate: (timeData) => {
    // timeData contains: days, hours, minutes, seconds, totalSeconds
    console.log('Time remaining:', timeData);
    updateCustomUI(timeData);
}
```

## 🕐 Time Calculation

### Target Time: UTC+14 Midnight
Santa begins at midnight December 25th in UTC+14 (Kiribati):
- **UTC+14 Time**: December 25, 00:00
- **UTC Time**: December 24, 10:00
- **First location**: Line Islands, Kiribati

### Calculation Method
```javascript
// Calculate target (UTC+14 midnight = UTC 10:00 previous day)
const now = new Date();
const currentYear = now.getUTCFullYear();
const currentMonth = now.getUTCMonth();
const currentDay = now.getUTCDate();

// Target: Dec 24 at 10:00 UTC (= Dec 25 00:00 UTC+14)
let target = new Date(Date.UTC(currentYear, 11, 24, 10, 0, 0));

// If we've passed this year's target, use next year
if (now >= target) {
    target = new Date(Date.UTC(currentYear + 1, 11, 24, 10, 0, 0));
}
```

### Time Components
```javascript
const timeRemaining = {
    days: Math.floor(totalSeconds / 86400),
    hours: Math.floor((totalSeconds % 86400) / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60,
    totalSeconds: totalSeconds
};
```

## 🎨 Display Formatting

### Default Format
Days, hours, minutes, seconds with labels:
```
"5d 14h 32m 18s"
```

### Custom Format Examples

**Verbose:**
```javascript
formatFunction: (d, h, m, s) => {
    return `${d} days, ${h} hours, ${m} minutes, ${s} seconds`;
}
// Output: "5 days, 14 hours, 32 minutes, 18 seconds"
```

**Compact:**
```javascript
formatFunction: (d, h, m, s) => {
    return `${d}:${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}
// Output: "5:14:32:18"
```

**Conditional:**
```javascript
formatFunction: (d, h, m, s) => {
    if (d > 0) return `${d}d ${h}h remaining`;
    if (h > 0) return `${h}h ${m}m remaining`;
    return `${m}m ${s}s remaining`;
}
// Output: "5d 14h remaining" or "32m 18s remaining"
```

## 🎄 Completion State

### When Countdown Reaches Zero
The timer displays a festive completion message:

```
🎅 Santa's Tour Has Begun! 🎄
```

### Custom Completion Message
```javascript
formatFunction: (d, h, m, s) => {
    if (d === 0 && h === 0 && m === 0 && s === 0) {
        return "🎁 Santa is on his way! Track him now! 🎁";
    }
    return `${d}d ${h}h ${m}m ${s}s`;
}
```

## 🔄 Update Lifecycle

### Update Frequency
- **Interval**: 1 second (1000ms)
- **Precision**: Second-level accuracy
- **Performance**: Minimal CPU usage

### Lifecycle Hooks
```javascript
const countdown = window.CountdownModule.createCountdown({
    targetElement: element,
    onUpdate: (timeData) => {
        // Called every second
        updateAnalytics(timeData);
        
        if (timeData.days === 0 && timeData.hours === 1) {
            sendNotification("Only 1 hour until Santa begins!");
        }
    }
});
```

## ♿ Accessibility

### Screen Reader Support
The countdown uses ARIA live regions for screen reader announcements:

```html
<div id="countdown" 
     role="timer" 
     aria-live="polite" 
     aria-atomic="true">
    5d 14h 32m 18s
</div>
```

### Best Practices
- Use `aria-live="polite"` to avoid interrupting users
- Set `aria-atomic="true"` to read entire countdown
- Provide descriptive label: `aria-label="Time until Santa begins"`
- Consider reducing update frequency for screen readers

### Reduced Motion
Respect user preferences:
```javascript
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

if (prefersReducedMotion) {
    // Update less frequently (e.g., every 10 seconds)
    updateInterval = 10000;
}
```

## 🧪 Testing

### Manual Testing
```javascript
// Test with custom target (2 minutes from now)
const testCountdown = window.CountdownModule.createCountdown({
    targetElement: document.getElementById('test-countdown'),
    targetDate: new Date(Date.now() + 120000), // 2 minutes
    onUpdate: (time) => {
        console.log('Test countdown:', time);
    }
});
testCountdown.start();
```

### Automated Testing
```javascript
// Mock Date for testing
const originalDate = Date;
global.Date = class extends Date {
    constructor() {
        return new originalDate('2024-12-24T09:00:00Z');
    }
};

// Test countdown calculation
const countdown = createCountdown({...});
// Assert countdown shows "1h 0m 0s"
```

## 🐛 Troubleshooting

### Countdown Shows Negative Time
**Cause**: Target date in the past  
**Solution**: Verify year rollover logic working correctly

### Countdown Doesn't Update
**Cause**: JavaScript error or element not found  
**Solution**: Check console for errors, verify element exists

### Wrong Timezone
**Cause**: `useLocalTime` set incorrectly  
**Solution**: Set `useLocalTime: false` for UTC+14

### Performance Issues
**Cause**: Too many countdown instances  
**Solution**: Reuse single instance, update multiple displays in `onUpdate`

## 💡 Advanced Usage

### Multiple Countdowns
```javascript
// Main countdown
const mainCountdown = window.CountdownModule.createCountdown({
    targetElement: document.getElementById('main-countdown')
});

// Sidebar countdown (shares calculation)
const sidebarCountdown = window.CountdownModule.createCountdown({
    targetElement: document.getElementById('sidebar-countdown'),
    formatFunction: (d, h, m, s) => `${d}d ${h}h`
});

mainCountdown.start();
sidebarCountdown.start();
```

### Analytics Integration
```javascript
const countdown = window.CountdownModule.createCountdown({
    targetElement: element,
    onUpdate: (timeData) => {
        // Track milestone events
        if (timeData.days === 7 && timeData.hours === 0) {
            analytics.track('countdown_one_week');
        }
        if (timeData.days === 1 && timeData.hours === 0) {
            analytics.track('countdown_one_day');
        }
    }
});
```

### Progressive Enhancement
```javascript
// Fallback for no JavaScript
<div id="countdown">
    Christmas begins December 25th!
</div>

<script>
    // JavaScript available - enhance with live countdown
    if (window.CountdownModule) {
        const countdown = window.CountdownModule.createCountdown({
            targetElement: document.getElementById('countdown')
        });
        countdown.start();
    }
</script>
```

## 📚 API Reference

### createCountdown(options)
Creates and returns a countdown instance.

**Parameters:**
- `options.targetElement` (Element, required): DOM element for display
- `options.useLocalTime` (Boolean, optional): Use local timezone (default: false)
- `options.formatFunction` (Function, optional): Custom format function
- `options.onUpdate` (Function, optional): Update callback

**Returns:** Countdown instance with `start()` and `stop()` methods

### countdown.start()
Starts the countdown timer and begins updates.

### countdown.stop()
Stops the countdown and clears the interval.

## 🔮 Future Enhancements

- Multiple language support
- Custom themes/styling
- Sound effects at milestones
- Animation effects
- Mobile notifications
- Calendar integration
- Social media sharing
- Countdown to other events (e.g., "Santa arrived in your city")
