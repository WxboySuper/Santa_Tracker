# Advent Calendar North Pole Map Feature

## Overview

The Advent Calendar North Pole Map is an interactive UI feature that displays 24 clickable buildings/areas on a festive North Pole-themed map, with each building representing a day in December leading up to Christmas (Dec 1-24). Buildings unlock progressively based on the date, creating an engaging daily experience for users.

## Features

### Core Functionality

- **24 Interactive Buildings**: Grid layout of clickable building elements, each representing one day of the advent calendar
- **Progressive Unlock System**: Buildings automatically unlock based on server-side date validation via the `/api/advent/manifest` endpoint
- **Visual Lock/Unlock States**: 
  - Locked buildings appear grayed out with a lock icon
  - Unlocked buildings display in full color with content type icons
- **Unlock Animations**: Smooth CSS animations when buildings transition from locked to unlocked state
- **Content Modal Display**: Clicking unlocked buildings opens a modal overlay displaying the day's content

### Content Types Supported

The advent map supports various content types fetched from `/api/advent/day/<day>`:

1. **Facts** (`fact`) - Educational information with optional images
2. **Stories** (`story`) - Holiday stories and traditions
3. **Games** (`game`) - Links to interactive games
4. **Videos** (`video`) - Holiday video content with embedded player
5. **Activities** (`activity`) - Creative activities and crafts
6. **Quizzes** (`quiz`) - Interactive question-and-answer content
7. **Recipes** (`activity` with `activity_type: recipe`) - Holiday recipes with ingredients and instructions

### Responsive Design

- **Desktop**: 6-column grid layout (1200px max width)
- **Tablet** (≤1024px): 4-column grid layout
- **Mobile** (≤768px): 3-column grid layout
- **Small Mobile** (≤480px): 2-column grid layout

### Accessibility Features

- **ARIA Labels**: All interactive elements have descriptive ARIA labels
- **Keyboard Navigation**: Full keyboard support with Tab and Enter/Space keys
- **Focus Management**: Modal traps focus and returns to trigger element on close
- **Screen Reader Support**: Proper semantic HTML and ARIA roles
- **Reduced Motion**: Respects `prefers-reduced-motion` media query

## Technical Architecture

### Frontend Components

#### HTML Template (`src/templates/advent.html`)
- Extends `base.html` for consistent layout
- Contains North Pole scene container
- Dynamic building grid container
- Modal dialog for content display
- Loading indicator

#### CSS (`src/static/advent-map.css`)
- North Pole themed gradient backgrounds
- Building grid layout with CSS Grid
- Lock/unlock state styling
- Modal overlay and content styling
- Responsive breakpoints
- Animation keyframes for unlock effects
- Content-type specific styling

#### JavaScript (`src/static/advent-map.js`)
- Fetches advent manifest from `/api/advent/manifest`
- Dynamically renders 24 building elements
- Handles building click events
- Fetches individual day content from `/api/advent/day/<day>`
- Manages modal display and closure
- Implements keyboard navigation
- XSS protection with HTML escaping

### Backend Integration

#### API Endpoints Used

1. **`GET /api/advent/manifest`**
   - Returns all 24 days with unlock status
   - Response includes: day number, title, unlock_time, content_type, is_unlocked
   - Used to render initial map state

2. **`GET /api/advent/day/<day_number>`**
   - Returns full content for a specific day if unlocked
   - Returns 403 error if day is still locked
   - Response includes complete payload data

#### Route (`src/app.py`)
```python
@app.route("/advent")
def advent():
    """Advent calendar with North Pole map."""
    return render_template("advent.html")
```

### Data Flow

1. Page loads → JavaScript fetches manifest → Renders 24 buildings
2. User clicks building → JavaScript checks if unlocked → Fetches day content
3. Content received → Renders in modal based on content_type
4. User closes modal → Returns to map view

## Building Layout

Buildings are arranged in a 6-column grid (desktop) with the following visual elements per building:

- **Day Number**: Large, prominent display (e.g., "1", "2", "24")
- **Content Icon**: Emoji representing content type (📚 for facts, 🎮 for games, etc.)
- **Lock Icon**: 🔒 displayed on locked buildings
- **Title**: Brief title of the day's content (visible only when unlocked)

## Unlock Logic

The unlock status is determined server-side in `src/utils/advent.py`:

```python
def is_unlocked(self, current_time: Optional[datetime] = None) -> bool:
    # Check admin override first
    if self.is_unlocked_override is not None:
        return self.is_unlocked_override
    
    # Compare current UTC time with unlock_time
    return current_time >= unlock_dt
```

This ensures:
- Server-authoritative unlock validation
- Admin override capability for testing
- Consistent unlock times in UTC

## Modal Content Rendering

Content is rendered dynamically based on `content_type`:

- **Text Content**: Displays in centered, readable paragraphs
- **Images**: Responsive images with alt text
- **Links**: Styled buttons for external content (games, activities)
- **Videos**: HTML5 video player with controls
- **Quizzes**: Interactive question list with options
- **Recipes**: Formatted ingredient list and instructions

## Navigation

Users can access the advent calendar from:

1. **Main Page**: "🎄 Advent Calendar" link in header navigation
2. **Direct URL**: `/advent`
3. **Back Link**: "← Back to Santa Tracker" returns to main page

## Browser Compatibility

- Modern browsers with CSS Grid support
- ES6 JavaScript (arrow functions, template literals, const/let)
- Fetch API for AJAX requests
- No external JavaScript libraries required (vanilla JS)

## Future Enhancements

Potential improvements for future iterations:

1. **Sound Effects**: Audio feedback for unlock animations
2. **Progress Tracking**: Save user's viewed days in localStorage
3. **Social Sharing**: Share individual day content
4. **Countdown Timer**: Display time until next unlock
5. **Animated Background**: Falling snow or aurora effects
6. **Achievement System**: Badges for viewing multiple days
7. **Leaderboard**: Compare progress with other users (if authentication added)

## Maintenance

### Updating Content

To modify advent calendar content:

1. Edit `src/static/data/advent_calendar.json`
2. Ensure each day has required fields: `day`, `title`, `unlock_time`, `content_type`, `payload`
3. Validate JSON structure matches schema in `src/utils/advent.py`

### Adding New Content Types

To support a new content type:

1. Add to `valid_content_types` in `AdventDay.__post_init__()` 
2. Add icon to `contentIcons` object in `advent-map.js`
3. Add rendering logic in `renderContent()` function
4. Add CSS styling for the new content type

## Testing

Manual testing checklist:

- [ ] All 24 buildings display correctly
- [ ] Locked buildings show lock icon and are not clickable
- [ ] Unlocked buildings open modal on click
- [ ] Modal displays correct content for each day
- [ ] Modal can be closed via close button, overlay click, or Escape key
- [ ] Mobile layout adjusts correctly at breakpoints
- [ ] Keyboard navigation works (Tab, Enter, Space, Escape)
- [ ] Screen reader announces elements correctly
- [ ] Images have appropriate alt text
- [ ] Links open in new tabs with security attributes

## Performance Considerations

- Content is loaded on-demand (not all 24 days at page load)
- Images are lazy-loaded by browser
- Modal reuses single DOM element for all days
- CSS animations use GPU-accelerated properties (transform, opacity)
- Minimal JavaScript bundle size (< 16KB)

## Security

- All user-generated content is escaped to prevent XSS
- External links use `rel="noopener noreferrer"`
- Server-side unlock validation prevents client-side tampering
- No inline event handlers (addEventListener only)
