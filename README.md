# 🎅 Santa Tracker

[![GitHub Workflow Status](https://img.shields.io/github/actions/workflow/status/WxboySuper/Santa_Tracker/testing.yml?branch=main&label=tests&style=flat-square)](https://github.com/WxboySuper/Santa_Tracker/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](https://opensource.org/licenses/MIT)
[![Python Version](https://img.shields.io/badge/python-3.10%2B-blue?style=flat-square)](https://www.python.org/downloads/)
[![Code Quality](https://img.shields.io/badge/code%20quality-A-brightgreen?style=flat-square)](https://deepsource.io/gh/WxboySuper/Santa_Tracker)

Track Santa's magical journey around the world on Christmas Eve! This interactive Progressive Web App provides real-time updates on Santa's location, destinations, and estimated arrival times.

## ✨ Features

- 🗺️ **Interactive Map** - Real-time visualization using Leaflet.js with OpenStreetMap
- 📍 **Location Tracking** - Current location, next destination, and route visualization
- 📏 **Distance Calculator** - Calculate distance from Santa to your location
- ⏱️ **Countdown Timer** - Live countdown to Christmas (UTC+14 timezone-aware)
- 🎄 **Advent Calendar** - Daily unlockable Christmas content (facts, games, stories, videos)
- 🔐 **Admin Dashboard** - Comprehensive route and location management
- 📱 **Progressive Web App** - Installable with offline support
- ♿ **Accessible** - Full ARIA support, keyboard navigation, screen reader compatible
- 🎨 **Responsive Design** - Works seamlessly on all devices

## 🚀 Quick Start

### Prerequisites
- Python 3.10+
- pip (Python package manager)
- Modern web browser

### Installation

```bash
# Clone the repository
git clone https://github.com/WxboySuper/Santa_Tracker.git
cd Santa_Tracker

# Create virtual environment (recommended)
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt
npm install  # For frontend linting tools

# Run the application
python src/app.py

# Development mode with debug enabled
FLASK_DEBUG=True python src/app.py
```

Navigate to `http://localhost:5000` to start tracking Santa!

## 📁 Project Structure

```
Santa_Tracker/
├── src/
│   ├── static/          # CSS, JavaScript, images
│   ├── templates/       # HTML templates
│   ├── utils/           # Core logic (tracker, locations, advent)
│   └── app.py           # Flask application
├── docs/                # Documentation
├── tests/               # Test suite
├── config.py            # Configuration
└── requirements.txt     # Python dependencies
```

## 🛠️ Technology Stack

**Backend:** Flask, Gunicorn, Geopy, Python-dotenv  
**Frontend:** Tailwind CSS (CDN), Leaflet.js, Vanilla JavaScript, CSS3  
**DevOps:** GitHub Actions, Dependabot, DeepSource

## 📚 Documentation

- **[Architecture Guide](docs/ARCHITECTURE.md)** - Design choices, performance, accessibility
- **[Development Guide](docs/DEVELOPMENT.md)** - Testing, linting, building, static generation
- **[Admin Dashboard](docs/ADMIN_DASHBOARD.md)** - Route management and admin features
- **[Countdown Timer](docs/COUNTDOWN_TIMER.md)** - Timer implementation details
- **[Advent Calendar API](docs/ADVENT_CALENDAR_API.md)** - Advent calendar system documentation
- **[Configuration](docs/CONFIGURATION.md)** - Environment variables and settings
- **[Deployment](docs/DEPLOYMENT.md)** - Deployment to Heroku, Vercel, Netlify
- **[API Usage](docs/API.md)** - API integration guide

## 🤝 Contributing

We welcome contributions! Here's how:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes and test thoroughly
4. Commit your changes (`git commit -m 'Add amazing feature'`)
5. Push to the branch (`git push origin feature/amazing-feature`)
6. Open a Pull Request

See our [Pull Request Template](.github/pull_request_template.md) for guidelines.

### Issue Templates
- 🐛 [Bug Reports](.github/ISSUE_TEMPLATE/bug_report.yml)
- ✨ [Feature Requests](.github/ISSUE_TEMPLATE/feature_request.yml)
- ❓ [Questions](.github/ISSUE_TEMPLATE/question.yml)

## 🔒 Security

Report security vulnerabilities via [GitHub Security Advisories](https://github.com/WxboySuper/Santa_Tracker/security/advisories). All dependencies are automatically updated via Dependabot.

## 📄 License

Licensed under the MIT License - see [LICENSE](LICENSE) file for details.

## 👨‍💻 Author

**WxboySuper** - [@WxboySuper](https://github.com/WxboySuper)

## 🎄 Acknowledgments

- Santa tracking route inspired by NORAD Santa Tracker
- Map tiles by OpenStreetMap contributors
- Icons from open-source projects

## 📞 Support

- 📫 [Create an issue](https://github.com/WxboySuper/Santa_Tracker/issues/new/choose)
- 💬 [Start a discussion](https://github.com/WxboySuper/Santa_Tracker/discussions)
- ⭐ Star this repo if you find it helpful!

---

<div align="center">
  Made with ❤️ for the holiday season
  <br>
  <sub>May your Christmas be merry and bright! 🎅🎄</sub>
</div>
