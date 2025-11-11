# 🎅 Santa Tracker

[![GitHub Workflow Status](https://img.shields.io/github/actions/workflow/status/WxboySuper/Santa_Tracker/testing.yml?branch=main&label=tests&style=flat-square)](https://github.com/WxboySuper/Santa_Tracker/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](https://opensource.org/licenses/MIT)
[![Python Version](https://img.shields.io/badge/python-3.10%2B-blue?style=flat-square)](https://www.python.org/downloads/)
[![Code Quality](https://img.shields.io/badge/code%20quality-A-brightgreen?style=flat-square)](https://deepsource.io/gh/WxboySuper/Santa_Tracker)

Track Santa's magical journey around the world on Christmas Eve! This interactive web application provides real-time updates on Santa's location, next destinations, and estimated arrival times for your family to enjoy.

## ✨ Features

- 🗺️ **Interactive Map**: Real-time visualization of Santa's journey using Leaflet.js
- 📍 **Location Tracking**: See Santa's current location and next destination
- 📏 **Distance Calculator**: Calculate the distance from Santa to your location
- ⏱️ **Countdown Timer**: Countdown to Christmas Eve and Santa's departure
- 📱 **Progressive Web App**: Install on your device for offline access
- 🎨 **Responsive Design**: Works seamlessly on desktop, tablet, and mobile devices
- ♿ **Accessibility**: ARIA labels and screen reader support

## 🚀 Quick Start

### Prerequisites

- Python 3.10 or higher
- pip (Python package manager)
- Modern web browser (Chrome, Firefox, Safari, or Edge)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/WxboySuper/Santa_Tracker.git
   cd Santa_Tracker
   ```

2. **Create a virtual environment** (recommended)
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

3. **Install dependencies**
   ```bash
   pip install -r requirements.txt
   npm install  # For frontend dependencies
   ```

4. **Run the application**
   ```bash
   python src/app.py
   ```
   
   For development with debug mode enabled:
   ```bash
   FLASK_DEBUG=True python src/app.py
   ```

5. **Open your browser**
   Navigate to `http://localhost:5000` to start tracking Santa!

## 🏗️ Project Structure

```
Santa_Tracker/
├── .github/                  # GitHub configuration and workflows
│   ├── ISSUE_TEMPLATE/      # Issue templates
│   ├── workflows/           # CI/CD workflows
│   └── pull_request_template.md
├── src/                     # Source code
│   ├── static/              # Static assets
│   │   ├── styles.css       # CSS styles
│   │   ├── script.js        # JavaScript functionality
│   │   └── images/          # Images and icons
│   ├── templates/           # HTML templates
│   │   ├── base.html        # Base template
│   │   └── index.html       # Main page
│   ├── utils/               # Utility modules
│   │   ├── tracker.py       # Location tracking logic
│   │   └── locations.py     # Location data management
│   └── app.py               # Flask application entry point
├── config.py                # Configuration settings
├── requirements.txt         # Python dependencies
├── package.json             # Node.js dependencies
└── README.md                # This file
```

## 🛠️ Technology Stack

### Backend
- **Flask**: Lightweight Python web framework
- **Gunicorn**: Production WSGI server
- **Geopy**: Geographic location library
- **Python-dotenv**: Environment variable management

### Frontend
- **Tailwind CSS**: Utility-first CSS framework via CDN (cost-free, no build step)
- **Leaflet.js**: Interactive mapping library with OpenStreetMap tiles (free and open-source)
- **Leaflet.markercluster**: Plugin for efficient marker clustering
- **Vanilla JavaScript**: Core functionality with modern ES6+ features
- **CSS3**: Custom animations and festive theming

### DevOps
- **GitHub Actions**: CI/CD automation
- **Dependabot**: Dependency updates
- **DeepSource**: Code quality analysis

## 🎨 Design Choices

### UI/UX Design
- **Mobile-First Approach**: Responsive design with breakpoints optimized for mobile, tablet, and desktop
- **Accessibility**: Full ARIA labels, keyboard navigation, screen reader support, and reduced motion preferences
- **Christmas Color Palette**: 
  - Christmas Red (#C41E3A) - Primary action color
  - Christmas Green (#165B33) - Secondary/accent color
  - Gold (#FFD700) - Highlights and borders
  - Blue gradient background - Night sky theme
- **Festive Elements**:
  - Animated snowfall effect with 40 snowflakes using pure CSS/JS
  - Emoji-based icons for visual appeal and better compatibility
  - Gradient backgrounds with festive colors
  - Smooth animations and transitions (respecting `prefers-reduced-motion`)

### Map Implementation
- **Cost-Free Solution**: OpenStreetMap tiles (no API key required)
- **Marker Clustering**: Leaflet.markercluster for performance with many route points
- **Smooth Animations**: 30-step interpolation for Santa's movement (1.5s transitions)
- **Keyboard Accessible**: Arrow keys for pan, +/- for zoom
- **Custom Santa Icon**: 48x48px with hover effects

### Performance Optimizations
- **CDN Resources**: Tailwind CSS and Leaflet from CDN for fast loading
- **Lazy Animations**: Snowfall respects `prefers-reduced-motion` media query
- **Efficient Clustering**: Marker grouping reduces DOM elements for better performance
- **Minimal Dependencies**: Only essential libraries included

### Accessibility Features
- **ARIA Labels**: All interactive elements properly labeled
- **Live Regions**: Real-time updates announced to screen readers
- **Keyboard Navigation**: Full keyboard support for map and controls
- **Focus Indicators**: High-contrast focus outlines (3px gold)
- **Semantic HTML**: Proper heading hierarchy and landmark regions
- **High Contrast Support**: Tested with `prefers-contrast: high`

## 🧪 Development

### Running Tests

```bash
# Run all tests
python -m pytest

# Run tests with coverage
coverage run -m pytest
coverage report
```

### Static Site Generation

Generate a static version of the site:

```bash
python src/generate_static.py
```

### Code Quality

The project uses automated code quality checks:
- **DeepSource**: Automated code review
- **GitHub Actions**: Continuous integration
- **Linting**: Comprehensive linting for all file types

#### Running Linters

**Python Linters:**
```bash
# Install development dependencies
pip install -r requirements-dev.txt

# Run all Python linters
black --check .      # Code formatting
isort --check-only . # Import sorting
flake8 .            # Style guide enforcement

# Auto-fix Python code
black .
isort .
```

**JavaScript/CSS/HTML Linters:**
```bash
# Install Node.js dependencies
npm install

# Run individual linters
npm run lint:js    # ESLint for JavaScript
npm run lint:css   # Stylelint for CSS
npm run lint:html  # HTMLHint for HTML

# Run all frontend linters
npm run lint
```

## 🤝 Contributing

We love contributions! Here's how you can help:

1. 🍴 Fork the repository
2. 🔨 Create a feature branch (`git checkout -b feature/amazing-feature`)
3. ✅ Make your changes and test thoroughly
4. 💾 Commit your changes (`git commit -m 'Add some amazing feature'`)
5. 📤 Push to the branch (`git push origin feature/amazing-feature`)
6. 🎉 Open a Pull Request

Please read our [Contributing Guidelines](.github/pull_request_template.md) and follow our [Code of Conduct](CODE_OF_CONDUCT.md).

### Issue Templates

We have templates for:
- 🐛 [Bug Reports](.github/ISSUE_TEMPLATE/bug_report.yml)
- ✨ [Feature Requests](.github/ISSUE_TEMPLATE/feature_request.yml)
- ❓ [Questions](.github/ISSUE_TEMPLATE/question.yml)

## 📝 Configuration

Create a `.env` file in the root directory for environment variables:

```env
FLASK_ENV=development
FLASK_DEBUG=True
SECRET_KEY=your-secret-key-here
ADMIN_PASSWORD=your-secure-admin-password
```

**Important:** Never commit your `.env` file to version control. Add it to `.gitignore` to keep your credentials secure.

## 🌐 Deployment

The application can be deployed to various platforms:

### Heroku
```bash
heroku create santa-tracker-app
git push heroku main
```

### Vercel/Netlify
Use the static site generation feature for serverless deployment.

## 📊 API Usage

Currently, the Santa Tracker uses simulated location data. To integrate with a real Santa tracking API:

1. Update `src/utils/tracker.py` with API credentials
2. Configure the API endpoint in `config.py`
3. Restart the application

## 🔐 Admin Dashboard

The Santa Tracker includes a comprehensive admin dashboard for managing locations and route data.

### Accessing the Admin Dashboard

1. Navigate to `http://localhost:5000/admin`
2. Set the `ADMIN_PASSWORD` environment variable before starting the application:
   ```bash
   export ADMIN_PASSWORD="your-secure-password"
   python src/app.py
   ```
3. Log in with your admin password

### Admin Features

#### Location Management
- **Add Location**: Create new stops on Santa's route with coordinates, UTC offset, and optional details
- **Edit Location**: Modify existing location data including timing and priority
- **Delete Location**: Remove locations from the route
- **Import Locations**: Bulk import locations from JSON files
  - Supports both append and replace modes
  - Accepts various JSON formats (`route`, `locations` arrays, or single objects)
- **Validate Locations**: Check route data for errors and inconsistencies

#### Route Management
- **Precompute Route**: Automatically calculate arrival/departure times for all locations
  - Sorts locations by UTC offset to follow time zones
  - Assigns default stop durations based on location priority
  - Ensures optimal route timing for Christmas Eve delivery
- **View Route Status**: Display comprehensive statistics about the current route:
  - Total number of locations
  - Locations with complete timing information
  - Priority breakdown
  - Last modification timestamp
  - Overall route completion status

#### Data Backup & Export
- **Export Backup**: Download complete route data as JSON
  - Includes all location details and timing information
  - Timestamped filename for version tracking
  - Can be reimported later to restore data

### Admin Workflow

**Initial Setup:**
1. Access the admin dashboard and log in
2. Import initial location data or add locations manually
3. Set priorities for important stops (1 = highest, 3 = lowest)
4. Validate the location data to check for errors

**Route Preparation:**
1. Click "Precompute Route" to calculate optimal timing
2. Review the route status to ensure completeness
3. Export a backup before finalizing

**Ongoing Management:**
1. Add/edit/delete locations as needed
2. Re-run precomputation after making changes
3. Regularly export backups for data safety
4. Use validation to maintain data quality

### Security Best Practices

- Use a strong, unique password for `ADMIN_PASSWORD`
- Keep the admin password secure and never commit it to version control
- In production, use HTTPS to encrypt admin traffic
- Regularly export backups to prevent data loss
- The admin interface uses session-based authentication with Bearer tokens

## 🔒 Security

- Report security vulnerabilities via [GitHub Security Advisories](https://github.com/WxboySuper/Santa_Tracker/security/advisories)
- All dependencies are automatically updated via Dependabot
- Code is scanned for vulnerabilities with DeepSource

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 👨‍💻 Author

**WxboySuper**
- GitHub: [@WxboySuper](https://github.com/WxboySuper)

## 🎄 Acknowledgments

- Santa tracking route data inspired by NORAD Santa Tracker
- Map tiles provided by OpenStreetMap contributors
- Icons and graphics from various open-source projects

## 📞 Support

- 📫 Create an [issue](https://github.com/WxboySuper/Santa_Tracker/issues/new/choose)
- 💬 Start a [discussion](https://github.com/WxboySuper/Santa_Tracker/discussions)
- ⭐ Star this repository if you find it helpful!

---

<div align="center">
  Made with ❤️ for the holiday season
  <br>
  <sub>May your Christmas be merry and bright! 🎅🎄</sub>
</div>