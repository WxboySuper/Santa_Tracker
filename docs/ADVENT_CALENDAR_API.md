# Advent Calendar API Documentation

## Overview

The Advent Calendar Core Engine provides a backend system for storing, unlocking, and serving daily Advent content for December 1-24. The system uses server-authoritative unlock logic based on UTC time and supports admin overrides for testing and special cases.

## Features

- **Server-Controlled Unlocking**: Days unlock automatically at UTC midnight based on configured unlock times
- **Admin Override Support**: Force unlock or lock specific days regardless of time
- **Content Types**: Support for facts, games, stories, videos, activities, and quizzes
- **Secure API**: Locked days don't expose content payload, preventing client-side tampering
- **Extensible Design**: Easy to add new content types and expand functionality

## Data Model

### AdventDay

Each day in the Advent calendar is represented by an `AdventDay` object with the following fields:

```python
{
    "day": int,                    # Day number (1-24)
    "title": str,                  # Title of the content
    "unlock_time": str,            # ISO 8601 UTC datetime (e.g., "2024-12-01T00:00:00Z")
    "content_type": str,           # Type: "fact", "game", "story", "video", "activity", "quiz"
    "payload": dict,               # Content payload (structure varies by content_type)
    "is_unlocked_override": bool   # Optional admin override (null/true/false)
}
```

### Content Types

#### 1. Fact
Interesting Christmas facts or trivia.
```json
{
    "text": "Did you know? Santa's workshop...",
    "image_url": "/static/images/advent/day1.jpg"
}
```

#### 2. Game
Interactive mini-games.
```json
{
    "game_type": "memory",
    "title": "Match the Snowflakes",
    "description": "Test your memory!",
    "difficulty": "easy",
    "url": "/games/snowflake-memory"
}
```

#### 3. Story
Christmas stories or legends.
```json
{
    "text": "Legend has it that in 1670...",
    "image_url": "/static/images/advent/day5.jpg"
}
```

#### 4. Video
Video content.
```json
{
    "title": "Virtual Tour of Santa's Workshop",
    "description": "Take a magical journey...",
    "video_url": "/videos/workshop-tour.mp4",
    "duration_minutes": 5
}
```

#### 5. Activity
Interactive activities.
```json
{
    "activity_type": "creative",
    "title": "Virtual Tree Decorator",
    "description": "Decorate your own virtual Christmas tree!",
    "url": "/activities/tree-decorator"
}
```

#### 6. Quiz
Quizzes with multiple choice questions.
```json
{
    "title": "Test Your Christmas Knowledge",
    "description": "How well do you know Christmas traditions?",
    "questions": [
        {
            "question": "In which country did the tradition originate?",
            "options": ["Germany", "England", "America", "France"],
            "correct_answer": 0
        }
    ]
}
```

## API Endpoints

### GET /api/advent/manifest

Get the complete Advent calendar manifest with unlock status for all days.

**Response:** 200 OK
```json
{
    "total_days": 24,
    "days": [
        {
            "day": 1,
            "title": "Welcome to the Advent Calendar!",
            "unlock_time": "2024-12-01T00:00:00Z",
            "content_type": "fact",
            "is_unlocked": true
        },
        {
            "day": 2,
            "title": "Reindeer Facts",
            "unlock_time": "2024-12-02T00:00:00Z",
            "content_type": "fact",
            "is_unlocked": false
        }
        // ... more days
    ]
}
```

**Notes:**
- The manifest does NOT include payload data (to prevent spoilers)
- `is_unlocked` reflects the current unlock status based on UTC time
- Use this endpoint to display the calendar grid in the UI

### GET /api/advent/day/:id

Get content for a specific day if it's unlocked.

**Parameters:**
- `id` (path parameter): Day number (1-24)

**Response: 200 OK** (if unlocked)
```json
{
    "day": 1,
    "title": "Welcome to the Advent Calendar!",
    "unlock_time": "2024-12-01T00:00:00Z",
    "content_type": "fact",
    "is_unlocked": true,
    "payload": {
        "text": "Did you know? Santa's workshop...",
        "image_url": "/static/images/advent/day1.jpg"
    }
}
```

**Response: 403 Forbidden** (if locked)
```json
{
    "error": "Day is locked",
    "day": 2,
    "title": "Reindeer Facts",
    "unlock_time": "2024-12-02T00:00:00Z"
}
```

**Response: 404 Not Found** (if day doesn't exist)
```json
{
    "error": "Day not found"
}
```

**Response: 500 Internal Server Error** (if server error)
```json
{
    "error": "Error message"
}
```

## Data File Location

The Advent calendar data is stored in:
```
src/static/data/advent_calendar.json
```

## Unlock Logic

### Server-Authoritative Unlocking

Days unlock automatically based on the `unlock_time` field:
- Compare current UTC time with `unlock_time`
- Day is unlocked if current time >= unlock time
- This happens on the server, preventing client-side tampering

### Admin Override

You can override the unlock status by setting `is_unlocked_override`:
- `null` (default): Use time-based unlock logic
- `true`: Force unlock regardless of time (useful for testing)
- `false`: Force lock regardless of time (useful for special cases)

**Example:**
```json
{
    "day": 24,
    "title": "Merry Christmas!",
    "unlock_time": "2024-12-24T00:00:00Z",
    "content_type": "video",
    "payload": { ... },
    "is_unlocked_override": true  // Always unlocked for testing
}
```

## Extensibility

### Adding New Content Types

1. Add the new content type to the validation list in `src/utils/advent.py`:
```python
valid_content_types = ["fact", "game", "story", "video", "activity", "quiz", "your_new_type"]
```

2. Document the payload structure in this file

3. Update frontend to handle the new content type

### Adding New Days

Simply add entries to `advent_calendar.json` with day numbers 1-24.

### Future Expansion Ideas

- **Leaderboards**: Track user progress and scores for games/quizzes
- **User Progress**: Store which days each user has completed
- **Notifications**: Send notifications when new days unlock
- **Shareable Content**: Allow users to share unlocked content on social media
- **Multilingual Support**: Add translations for content
- **Dynamic Content**: Pull content from external APIs or databases
- **Custom Calendars**: Allow admins to create custom calendars for different audiences
- **Analytics**: Track which content is most popular

## Testing

### Unit Tests

Run the comprehensive test suite:
```bash
python -m pytest tests/test_advent.py -v
python -m pytest tests/test_advent_api.py -v
```

### Manual Testing

1. **Test Unlocking**: Modify unlock times to test unlock logic
2. **Test Override**: Set `is_unlocked_override` to test forced unlock/lock
3. **Test API**: Use curl or a REST client to test endpoints

Example curl commands:
```bash
# Get manifest
curl http://localhost:5000/api/advent/manifest

# Get specific day
curl http://localhost:5000/api/advent/day/1

# Test locked day
curl http://localhost:5000/api/advent/day/25
```

## Security Considerations

- **Server-Side Validation**: All unlock logic runs on the server
- **No Payload Leakage**: Locked days don't return payload data
- **Input Validation**: Day numbers are validated (1-24 only)
- **Error Handling**: Proper error responses for invalid requests
- **UTC Time**: All times use UTC to ensure consistency across timezones
- **Stack Trace Protection**: Generic error messages prevent information disclosure

## Example Integration

### Frontend Usage

```javascript
// Fetch the manifest to display the calendar
fetch('/api/advent/manifest')
    .then(response => response.json())
    .then(data => {
        data.days.forEach(day => {
            renderCalendarDay(day);
        });
    });

// When user clicks a day
function openDay(dayNumber) {
    fetch(`/api/advent/day/${dayNumber}`)
        .then(response => {
            if (response.status === 403) {
                return response.json().then(data => {
                    showLockedMessage(data);
                });
            }
            if (response.status === 200) {
                return response.json().then(data => {
                    displayDayContent(data);
                });
            }
        });
}
```

## Sample Content for First Week

The included `advent_calendar.json` contains sample content for all 24 days, including:
- Days 1-3: Christmas facts about Santa, reindeer, and trees
- Day 4: Snowflake memory game
- Day 5: Candy cane story
- Day 6: Santa's workshop video tour
- Day 7: Christmas around the world fact

These samples demonstrate the variety of content types and provide a starting point for customization.
