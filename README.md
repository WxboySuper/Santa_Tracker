# README.md for Santa Tracker Project

# Santa Tracker

Welcome to the Santa Tracker project! This application allows you to track Santa's journey on Christmas Eve, providing real-time updates for your family.

## Project Structure

```
santa-tracker
├── src
│   ├── static
│   │   ├── styles.css       # CSS styles for the application
│   │   └── script.js        # JavaScript for client-side functionality
│   ├── templates
│   │   ├── base.html        # Base HTML template
│   │   └── index.html       # Main HTML page for the application
│   ├── app.py               # Main entry point of the application
│   └── utils
│       ├── __init__.py      # Marks the utils directory as a Python package
│       ├── tracker.py       # Tracker class for tracking Santa's location
│       └── locations.py     # Functions for managing location data
├── requirements.txt          # Python dependencies for the project
└── config.py                 # Configuration settings for the application
```

## Setup Instructions

1. Clone the repository:
   ```
   git clone <repository-url>
   cd santa-tracker
   ```

2. Install the required dependencies:
   ```
   pip install -r requirements.txt
   ```

3. Run the application:
   ```
   python src/app.py
   ```

4. Open your web browser and navigate to `http://localhost:5000` to view the Santa Tracker.

## Usage

- The application provides a user-friendly interface to track Santa's journey.
- You can view updates on Santa's location and estimated arrival times.

## Contributing

Feel free to submit issues or pull requests to improve the Santa Tracker project!

## License

This project is licensed under the MIT License.