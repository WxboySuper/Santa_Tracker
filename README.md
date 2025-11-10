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
- ⏱️ **Countdown Timer**: Live countdown to Christmas Eve tour launch with days, hours, minutes, and seconds (supports both local time and UTC)
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
- **Leaflet.js**: Interactive mapping library
- **Moment.js**: Date and time manipulation
- **Vanilla JavaScript**: Core functionality
- **CSS3**: Modern styling and animations

### DevOps
- **GitHub Actions**: CI/CD automation
- **Dependabot**: Dependency updates
- **DeepSource**: Code quality analysis

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
```

### Countdown Timer Configuration

The countdown timer can be configured to use either local time or UTC for the Christmas Eve tour launch. To customize the countdown behavior, edit the `COUNTDOWN_CONFIG` object in `src/static/script.js`:

```javascript
const COUNTDOWN_CONFIG = {
    USE_UTC: false, // Set to true to use UTC time instead of local time
    TARGET_MONTH: 11, // December (0-indexed, so 11 = December)
    TARGET_DAY: 24, // Christmas Eve
    TARGET_HOUR: 0, // Midnight
    TARGET_MINUTE: 0,
    TARGET_SECOND: 0
};
```

**Configuration Options:**
- `USE_UTC`: Set to `true` to count down to Christmas Eve at midnight UTC, or `false` (default) to use the user's local timezone
- `TARGET_MONTH`: Month of the year (0-indexed, where 0 = January, 11 = December)
- `TARGET_DAY`: Day of the month (24 for Christmas Eve)
- `TARGET_HOUR`, `TARGET_MINUTE`, `TARGET_SECOND`: Time of day for the launch

The countdown automatically updates every second and displays:
- Days remaining until the launch
- Hours, minutes, and seconds (formatted with leading zeros)
- Current timezone indicator (when using UTC)
- Special message when Santa's tour has started

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