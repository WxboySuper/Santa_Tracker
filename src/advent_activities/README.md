# 🎄 Advent Activities - Table of Contents

Welcome to the Santa Tracker Advent Activities collection! This directory contains all 25 daily unlockable modules for the Advent Calendar feature.

## 📖 Overview

Each day from December 1st to 24th (and a special Christmas Day activity), users can unlock a new interactive activity. These modules are designed to be:

- **Self-contained** - Each activity is a standalone module
- **Lightweight** - No heavy frameworks or large dependencies
- **Responsive** - Works on all devices (mobile, tablet, desktop)
- **Embeddable** - Can be integrated via iframe or direct import
- **Festive** - Christmas-themed and family-friendly

## 🗂️ Directory Structure

```
src/advent_activities/
├── README.md (this file)
├── day1_ornament_smash/
│   ├── index.html
│   ├── game.js
│   ├── styles.css
│   └── README.md
├── day2_[activity_name]/
│   └── ...
├── day3_[activity_name]/
│   └── ...
└── ...
```

## 📅 Activities List

| Day | Activity Name | Type | Status | Description | localStorage Key |
|-----|--------------|------|--------|-------------|------------------|
| 1 | Ornament Smash | Game | ✅ Complete | Whack-a-mole style ornament tapping game | `santa_advent_day_1_complete` |
| 2 | TBD | - | 🔜 Planned | Coming soon | `santa_advent_day_2_complete` |
| 3 | TBD | - | 🔜 Planned | Coming soon | `santa_advent_day_3_complete` |
| 4 | TBD | - | 🔜 Planned | Coming soon | `santa_advent_day_4_complete` |
| 5 | TBD | - | 🔜 Planned | Coming soon | `santa_advent_day_5_complete` |
| ... | ... | ... | ... | ... | ... |
| 24 | TBD | - | 🔜 Planned | Coming soon | `santa_advent_day_24_complete` |

## 🎮 Activity Types

Activities can be of different types:

- **🎮 Game** - Interactive games (puzzles, arcade, matching, etc.)
- **📖 Story** - Interactive stories or narratives
- **🎨 Activity** - Creative activities (coloring, decorating, building)
- **🧩 Quiz** - Knowledge tests and trivia
- **🎬 Video** - Video content or animated shorts
- **📚 Fact** - Interesting facts with interactive elements

## 🔧 Technical Architecture

### Integration Methods

Each activity supports multiple integration methods:

#### 1. Standalone Deployment
```bash
cd src/advent_activities/day1_ornament_smash
python -m http.server 8000
```

#### 2. Iframe Embedding
```html
<iframe 
    src="/advent_activities/day1_ornament_smash/index.html"
    width="100%"
    height="700px"
></iframe>
```

#### 3. Direct Import (Flask/Jinja)
```python
@app.route('/advent/day/<int:day>')
def advent_day(day):
    return send_from_directory(
        f'advent_activities/day{day}_*/', 
        'index.html'
    )
```

### Common Patterns

All activities follow these conventions:

1. **Self-Contained HTML** - Each `index.html` is a complete page
2. **Tailwind CSS** - Using CDN for consistent styling
3. **Vanilla JavaScript** - No framework dependencies
4. **localStorage Keys** - Format: `santa_advent_day_{N}_complete`
5. **Responsive Design** - Mobile-first approach
6. **Accessibility** - ARIA labels, keyboard navigation, screen reader support

## 💾 Local Storage Schema

Activities use localStorage to track user progress:

### Completion Flags

```javascript
// Format: santa_advent_day_{day_number}_complete
localStorage.setItem('santa_advent_day_1_complete', 'true');
localStorage.setItem('santa_advent_day_2_complete', 'true');
// etc.
```

### Reading Progress

```javascript
// Check if a specific day is complete
const isDayComplete = (day) => {
    return localStorage.getItem(`santa_advent_day_${day}_complete`) === 'true';
};

// Get all completed days
const getCompletedDays = () => {
    const completed = [];
    for (let i = 1; i <= 24; i++) {
        if (isDayComplete(i)) {
            completed.push(i);
        }
    }
    return completed;
};

// Calculate completion percentage
const getCompletionPercentage = () => {
    const completed = getCompletedDays();
    return (completed.length / 24) * 100;
};
```

### High Scores (Optional)

Some activities may also store high scores or achievements:

```javascript
// Format: santa_advent_day_{day_number}_score
localStorage.setItem('santa_advent_day_1_score', '1250');
localStorage.setItem('santa_advent_day_1_best_time', '45.3');
```

## 🎨 Styling Guidelines

### Color Palette

Use Christmas-themed colors consistently:

```css
/* Primary Colors */
--christmas-red: #C41E3A;
--christmas-green: #165b33;
--christmas-gold: #FFD700;

/* Secondary Colors */
--snow-white: #FFFFFF;
--night-blue: #0f3057;
--silver: #C0C0C0;

/* Backgrounds */
--bg-light: #e0f2fe;
--bg-dark: #1e3a8a;
```

### Typography

```css
/* Headings */
font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;

/* Sizes */
--text-xs: 0.75rem;
--text-sm: 0.875rem;
--text-base: 1rem;
--text-lg: 1.125rem;
--text-xl: 1.25rem;
--text-2xl: 1.5rem;
--text-3xl: 1.875rem;
--text-4xl: 2.25rem;
```

## 🔊 Audio Guidelines

### Synthetic Audio (Preferred)

Use Web Audio API for sound effects to avoid external dependencies:

```javascript
function playSoundEffect(frequency, duration) {
    const audioContext = new AudioContext();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    oscillator.frequency.value = frequency;
    gainNode.gain.value = 0.3;
    
    oscillator.start();
    oscillator.stop(audioContext.currentTime + duration);
}
```

### Audio Files (If Necessary)

If using audio files, keep them:
- **Small** - < 100KB per file
- **Compressed** - MP3 or OGG format
- **Licensed** - Royalty-free or original
- **Optional** - Gracefully degrade if audio fails

## 📱 Mobile Optimization

All activities must support:

- **Touch Events** - Tap, swipe, pinch
- **Responsive Layout** - Adapt to screen sizes
- **Touch Targets** - Minimum 44x44px buttons
- **Performance** - 60 FPS on mobile devices
- **Battery Efficiency** - Pause when not visible

## ♿ Accessibility Requirements

Every activity must include:

- **ARIA Labels** - Descriptive labels for screen readers
- **Keyboard Navigation** - All interactions keyboard-accessible
- **Focus Indicators** - Visible focus states
- **Color Contrast** - WCAG AA compliant
- **Alt Text** - Descriptive text for images
- **Skip Links** - Skip to main content

## 🧪 Testing Checklist

Before marking an activity as complete:

- [ ] Test on Chrome, Firefox, Safari
- [ ] Test on mobile (iOS and Android)
- [ ] Verify keyboard navigation works
- [ ] Check with screen reader
- [ ] Validate localStorage persistence
- [ ] Test "play again" functionality
- [ ] Verify badge notification shows on first win
- [ ] Confirm no console errors
- [ ] Check performance (60 FPS)
- [ ] Validate responsive design

## 📦 Module Size Guidelines

Keep modules lightweight:

- **Target Size** - < 50KB total (HTML + JS + CSS)
- **Maximum Size** - < 100KB total
- **No Large Dependencies** - Avoid heavy libraries
- **Optimize Assets** - Compress images and sounds
- **Lazy Loading** - Load assets only when needed

## 🔒 Security Best Practices

- **No External Scripts**
- **Input Validation** - Sanitize all user input
- **localStorage Only** - No sensitive data storage
- **CSP Compliance** - Follow Content Security Policy
- **XSS Prevention** - Escape all dynamic content

## 🎯 Development Workflow

### Creating a New Activity

1. **Create Directory**
   ```bash
   mkdir src/advent_activities/day{N}_{activity_name}
   ```

2. **Add Required Files**
   - `index.html` - Main entry point
   - `game.js` or `script.js` - Activity logic
   - `styles.css` - Custom styles
   - `README.md` - Integration documentation

3. **Update This File**
   - Add entry to Activities List table
   - Update localStorage key reference

4. **Test Thoroughly**
   - Follow Testing Checklist above

5. **Submit for Review**
   - Create pull request
   - Include screenshots/demo

## 📚 Resources

### Helpful Links

- [Canvas API Documentation](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API)
- [Web Audio API Guide](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API)
- [Tailwind CSS Docs](https://tailwindcss.com/docs)
- [localStorage Guide](https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage)

### Code Examples

See `day1_ornament_smash/` for a complete reference implementation.

## 🤝 Contributing

To contribute a new activity:

1. Fork the repository
2. Create your activity following the guidelines
3. Test across browsers and devices
4. Submit a pull request with:
   - Complete activity code
   - Documentation (README.md)
   - Screenshots or demo video
   - Test results

## 📝 Naming Conventions

### Directory Names
```
day{number}_{activity_name_lowercase}
Examples:
  day1_ornament_smash
  day2_snowflake_match
  day3_reindeer_race
```

### File Names
```
index.html    - Always the main entry point
game.js       - For game logic
script.js     - For non-game activities
styles.css    - Custom styles
README.md     - Documentation
```

### localStorage Keys
```
santa_advent_day_{number}_complete
santa_advent_day_{number}_score (optional)
santa_advent_day_{number}_best_time (optional)
```

## 🎁 Activity Ideas

Inspiration for future days:

1. Memory matching game with Christmas icons
2. Snowman building activity
3. Christmas carol karaoke
4. Gingerbread house decorator
5. Reindeer naming quiz
6. Santa's sleigh route planner
7. Christmas lights pattern matcher
8. Elf workshop simulator
9. Present wrapping mini-game
10. Advent story adventure

## 📄 License

All activities are part of the Santa Tracker project. See the main repository LICENSE file.

---

**Happy Holidays and Happy Coding!** 🎄✨

For questions or support, please refer to the main Santa Tracker repository.
