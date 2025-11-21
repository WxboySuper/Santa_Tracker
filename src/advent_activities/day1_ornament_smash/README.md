# Day 1: Ornament Smash

A festive whack-a-mole style tapping game where players clear colorful ornaments from a Christmas tree.

## 🎮 Game Overview

**Objective:** Clear 20 ornaments from the Christmas tree by tapping/clicking them before they fade away.

**Features:**
- Canvas-based rendering with smooth animations
- Particle effects when ornaments are smashed
- Background snowfall animation
- Synthetic audio feedback using Web Audio API
- Responsive design (works on mobile and desktop)
- Local storage completion tracking
- Infinite replayability

## 📁 Files

- `index.html` - Main game container and UI structure
- `game.js` - Canvas logic, particle system, and game loop
- `styles.css` - Game-specific styling
- `README.md` - This documentation file

## 🔧 Integration Instructions

### Option 1: Standalone Deployment

Simply serve the `day1_ornament_smash` directory on a web server:

```bash
# Using Python's built-in server
cd src/advent_activities/day1_ornament_smash
python -m http.server 8000

# Or using Node.js
npx serve .
```

Then navigate to `http://localhost:8000` to play the game.

### Option 2: Iframe Embedding

Embed the game in your main application using an iframe:

```html
<iframe 
    src="/advent_activities/day1_ornament_smash/index.html"
    width="100%"
    height="700px"
    frameborder="0"
    title="Day 1: Ornament Smash Game"
    allow="autoplay"
></iframe>
```

### Option 3: Direct Component Import (Flask/Jinja)

If using Flask, create a route to serve the game:

```python
@app.route('/advent/day/1')
def advent_day_1():
    return send_from_directory(
        'advent_activities/day1_ornament_smash', 
        'index.html'
    )
```

Or render it as a template with your existing layout:

```html
{% extends "base.html" %}
{% block content %}
    <!-- Include game files -->
    <link rel="stylesheet" href="{{ url_for('static', filename='../advent_activities/day1_ornament_smash/styles.css') }}">
    
    <!-- Game container content -->
    {% include 'advent_activities/day1_ornament_smash/index.html' %}
    
    <script src="{{ url_for('static', filename='../advent_activities/day1_ornament_smash/game.js') }}"></script>
{% endblock %}
```

## ⚙️ Configuration

The game can be customized by modifying the `CONFIG` object in `game.js`:

```javascript
const CONFIG = {
    targetCount: 20,           // Total ornaments to clear (default: 20)
    maxOrnaments: 6,           // Max ornaments on screen (default: 6)
    spawnInterval: 1500,       // Milliseconds between spawns (default: 1500)
    ornamentLifetime: 4000,    // How long ornaments stay visible (default: 4000)
    ornamentRadius: 25,        // Base ornament size (default: 25)
    snowflakeCount: 50,        // Background snowflakes (default: 50)
    particleCount: 15,         // Particles per smash (default: 15)
};
```

### Difficulty Adjustments

**Easy Mode:**
```javascript
targetCount: 15,
maxOrnaments: 4,
ornamentLifetime: 5000,
```

**Hard Mode:**
```javascript
targetCount: 30,
maxOrnaments: 8,
ornamentLifetime: 3000,
```

## 💾 Local Storage

The game uses localStorage to track completion:

**Key:** `santa_advent_day_1_complete`  
**Value:** `"true"` (string)

### Checking Completion Status

```javascript
const isComplete = localStorage.getItem('santa_advent_day_1_complete') === 'true';
```

### Badge System Integration

The game shows a "Badge Unlocked" notification on first win. Your main app can check this flag to award badges:

```javascript
if (localStorage.getItem('santa_advent_day_1_complete')) {
    // Award Day 1 badge to user
    awardBadge('day_1_ornament_smash');
}
```

**Important:** The localStorage flag does NOT lock the game. The game remains playable indefinitely for fun and practice.

## 🎨 Customization

### Changing Colors

Ornament colors can be modified in the `spawnOrnament()` function:

```javascript
const colors = [
    '#FF0000', // Red
    '#00FF00', // Green
    '#0000FF', // Blue
    // Add more hex colors here
];
```

### Adjusting Tree Shape

Modify the `treeBounds` object to change the tree's triangular spawn area:

```javascript
const treeBounds = {
    top: 100,           // Y position of tree top
    bottom: 550,        // Y position of tree bottom
    getWidth: (y) => {
        // Customize width calculation
    }
};
```

## 🔊 Audio

The game uses the Web Audio API to generate synthetic sounds:

- **Pop Sound:** Plays when an ornament is smashed
- **Win Sound:** Plays when all ornaments are cleared

Audio is generated programmatically (no external audio files required) to keep the module lightweight.

### Disabling Audio

To disable audio, comment out the audio initialization:

```javascript
function initAudio() {
    // audioContext = new (window.AudioContext || window.webkitAudioContext)();
}
```

## 🐛 Browser Compatibility

**Supported Browsers:**
- Chrome/Edge 90+
- Firefox 88+
- Safari 14+
- Mobile browsers (iOS Safari, Chrome Mobile)

**Required APIs:**
- Canvas API
- Web Audio API (optional, gracefully degrades)
- localStorage
- Touch Events

## 📱 Mobile Optimization

The game is fully optimized for mobile devices:

- Touch events supported
- Responsive canvas sizing
- No hover-dependent interactions
- Appropriate button sizes for touch targets

## ⚡ Performance

**Lightweight Design:**
- No external dependencies (except Tailwind CSS CDN)
- No image assets required
- Procedurally generated graphics
- ~28KB total size (HTML + JS + CSS)

**Frame Rate:**
- Target: 60 FPS
- Canvas updates via `requestAnimationFrame`
- Efficient particle system with automatic cleanup

## 🧪 Testing

### Manual Testing Checklist

- [ ] Game starts on "Start Game" button click
- [ ] Ornaments appear within tree boundaries
- [ ] Ornaments can be clicked/tapped
- [ ] Particle effects appear on ornament smash
- [ ] Score decreases correctly
- [ ] Win overlay appears after clearing 20 ornaments
- [ ] "Play Again" button resets the game
- [ ] Badge notification shows on first win only
- [ ] localStorage flag is set on first win
- [ ] Game works on mobile devices
- [ ] Audio plays correctly (or degrades gracefully)

### Browser Testing

Test in multiple browsers to ensure compatibility:

```bash
# Desktop
- Chrome
- Firefox
- Safari
- Edge

# Mobile
- iOS Safari
- Chrome Mobile
- Samsung Internet
```

## 🔒 Security Notes

- No external scripts loaded (except Tailwind CSS CDN)
- No user data collected
- localStorage only stores completion flag
- No network requests made during gameplay

## 📦 Dependencies

**External:**
- Tailwind CSS (CDN) - UI styling

**Built-in APIs:**
- Canvas API - Rendering
- Web Audio API - Sound effects
- localStorage - Persistence

## 🎯 Future Enhancements

Potential improvements for future versions:

1. **Difficulty Levels** - Easy, Medium, Hard modes
2. **High Scores** - Track best completion times
3. **Combo System** - Bonus points for consecutive hits
4. **Power-ups** - Special ornaments with unique effects
5. **Achievements** - Multiple badges for different accomplishments
6. **Leaderboard** - Compare scores with other players
7. **Themes** - Different visual themes (winter, Santa's workshop, etc.)
8. **Sound Options** - Volume control and mute button

## 📄 License

This module is part of the Santa Tracker project. See the main repository for license information.

## 🤝 Contributing

To contribute improvements to this module:

1. Follow the existing code style
2. Test across multiple browsers and devices
3. Ensure accessibility features remain intact
4. Keep the module lightweight (no large dependencies)
5. Document any configuration changes

## 📞 Support

For issues or questions about this module, please refer to the main Santa Tracker repository or create an issue.

---

**Happy Holidays!** 🎄🎅🎁
