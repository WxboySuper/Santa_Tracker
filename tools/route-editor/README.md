# 🎅 Santa Route Editor

A standalone web-based visual route editor for constructing Santa's journey with coordinates, metadata, and geographic information.

## 🌟 Features

- **Interactive Map Interface**: Full-screen Leaflet.js map with OpenStreetMap tiles
- **Location Search**: Geocoding search bar using OpenStreetMap Nominatim API
- **Click-to-Add**: Right-click anywhere on the map to add new stops
- **Drag-and-Drop Reordering**: Intuitive route sequencing with visual feedback
- **Editable Stop Details**: 
  - Name, Country, Priority (1-3)
  - UTC Offset, Stop Duration, Population
  - Custom notes for each location
- **Visual Route Display**: 
  - Color-coded markers (Green=Start, Red=End, Blue=Intermediate)
  - Connected polyline showing the route path
- **JSON Export**: Download route as properly formatted JSON file

## 🚀 Getting Started

### Prerequisites
- Node.js 16+ and npm

### Installation

```bash
# Navigate to the route editor directory
cd tools/route-editor

# Install dependencies
npm install

# Start the development server
npm run dev
```

The application will open automatically at `http://localhost:3000`

### Building for Production

```bash
# Build the application
npm run build

# Preview the production build
npm run preview
```

## 📖 Usage Guide

### Adding Locations

1. **Search Method**: 
   - Use the search bar at the top-left
   - Type a city or landmark name
   - Click on a result to add it to the route

2. **Map Click Method**:
   - Right-click anywhere on the map
   - A new stop will be added at that location
   - Location details are auto-filled via reverse geocoding

### Editing Locations

1. Click on a location card in the sidebar to expand it
2. Edit any of the fields:
   - **Name**: Custom location name
   - **Country**: Country name
   - **Priority**: 1 (High), 2 (Medium), or 3 (Low)
   - **UTC Offset**: Timezone offset (-12 to +14)
   - **Stop Duration**: Time spent at location (minutes)
   - **Notes**: Fun facts or special information
   - **Population**: Optional population data

### Reordering Stops

- Click and drag the grip icon (≡) on any location card
- Drop it in the desired position
- The map polyline updates automatically

### Deleting Stops

- Click the trash icon on any location card
- The stop is immediately removed from the route

### Exporting the Route

1. Click the "Export Route" button at the bottom of the sidebar
2. A JSON file will be downloaded with the filename format: `santa-route-YYYY-MM-DD.json`

## 📄 Export Format

The exported JSON follows this schema:

```json
[
  {
    "name": "City Name",
    "latitude": 0.0,
    "longitude": 0.0,
    "utc_offset": 0,
    "country": "Country Name",
    "population": 0,
    "priority": 1,
    "notes": "User entered notes here..."
  }
]
```

## 🛠️ Technical Stack

- **Framework**: React 18 with Vite
- **Map Engine**: Leaflet.js via react-leaflet
- **Styling**: Tailwind CSS
- **Icons**: lucide-react
- **Drag & Drop**: @dnd-kit
- **Geocoding**: OpenStreetMap Nominatim API

## 🗂️ Project Structure

```
route-editor/
├── src/
│   ├── components/
│   │   ├── MapEditor.jsx      # Map interface and location selection
│   │   └── Sidebar.jsx         # Route list and drag-and-drop editor
│   ├── utils/
│   │   └── exportUtils.js      # JSON export functionality
│   ├── App.jsx                 # Main application layout
│   ├── main.jsx                # Entry point
│   └── index.css               # Tailwind and global styles
├── index.html                  # HTML template
├── package.json                # Dependencies and scripts
├── vite.config.js              # Vite configuration
├── tailwind.config.js          # Tailwind configuration
└── postcss.config.js           # PostCSS configuration
```

## 🎨 Map Controls

- **Pan**: Click and drag
- **Zoom**: Scroll wheel or use +/- controls
- **Add Location**: Right-click on the map
- **View Details**: Click on a marker
- **Search**: Use the search bar in the top-left corner

## 🔄 Updating Dependencies

```bash
# Check for updates
npm outdated

# Update dependencies
npm update

# Update to latest versions (use with caution)
npm install <package>@latest
```

## 🐛 Troubleshooting

### Map tiles not loading
- Check your internet connection
- The app uses CARTO Voyager tiles from OpenStreetMap

### Search not working
- The Nominatim API has rate limits
- Wait a few seconds between searches
- Ensure you have an internet connection

### Markers not appearing
- Check browser console for errors
- Ensure Leaflet CSS is loaded correctly

## 📝 Notes

- This is a standalone tool and does not affect the main Santa Tracker application
- All processing happens client-side; no data is sent to external servers (except geocoding requests)
- The UTC offset calculation is approximate based on longitude
- For production use, consider implementing a proper timezone database

## 🤝 Contributing

This tool is part of the Santa Tracker project. To contribute:
1. Make changes in the `tools/route-editor` directory
2. Test thoroughly with `npm run dev`
3. Build with `npm run build` to ensure no errors
4. Submit a pull request to the main repository

## 📜 License

This tool is part of the Santa Tracker project and follows the same MIT License.
