# 🤖 Prompt for Async Coding Agent: Santa Route Editor Tool

## Subject: Build a Nested "Santa Route Editor" Internal Tool

Goal: Create a local, web-based "Route Editor" tool to visually construct a path of coordinates and metadata for a Santa Tracker application.

⚠️ Important Architecture Note:
This tool must be built as a nested, standalone application within an existing repository. It must reside in a dedicated subdirectory (e.g., /tools/route-editor) and have its own isolated environment and dependencies (package.json) so it does not interact with or affect the main application's build process.

🛠 Technical Stack

Framework: React (Vite) — chosen for lightweight isolation.

Map Engine: Leaflet.js (via react-leaflet).

Styling: Tailwind CSS (or standard CSS modules).

Icons: lucide-react or react-icons.

Data Export: Standard client-side JSON download.

🌟 Core Features Required

1. The Map Interface

    Full-Screen Map: Implement a full-screen interactive world map using react-leaflet.

    Tile Layer: Use a clear, free provider like OpenStreetMap or CartoDB (Voyager) for high visibility of labels.

    Timezone Overlay:

    Load a GeoJSON layer showing world timezones.

    These should be visually distinct (e.g., color-coded bands or clear outlines) so the user can distinguish between UTC+14, UTC+13, etc.

    Note: You may use a placeholder GeoJSON file or fetch a standard open-source dataset.

2. Location Selection (The "Input")

    Search Bar: Implement a geocoding search bar (floating over the map) to find cities/landmarks.

    Use the OpenStreetMap Nominatim API (free) for geocoding.

    When a result is selected, pan the map to that location and temporarily show a marker.

    Context Menu / Click-to-Add:

    Allow the user to Right-Click anywhere on the map to open a context menu or immediately drop a pin.

    This action should create a new "Stop" entry in the sidebar.

3. The Route Sidebar (The "Editor")

    Panel: A sidebar panel (collapsible or fixed) that lists selected locations in order.

    Drag-and-Drop: The user must be able to reorder the list items to define the route sequence (e.g., using dnd-kit or react-beautiful-dnd).

    Editable Fields: Each list item must be an expandable card containing inputs for:

    Name (Auto-filled from search/geocoding if possible, but editable)

    Country (Editable)

    Priority (Dropdown: 1, 2, 3)

    Notes (Text area for fun facts)

    Stop Duration (Number, in minutes)

    UTC Offset (Number, e.g., 14, -5. Auto-fill if possible via timezone lookup, otherwise manual).

    Actions: A "Delete" button to remove the stop from the route.

4. Visual Feedback

    Polyline Connection: Draw a line connecting the markers on the map in the exact order they appear in the sidebar.

    Markers: Use distinct icons for the markers.

    Start Point: Green icon.

    End Point: Red icon.

    Intermediate: Blue icons.

5. Export Function

"Export Route" Button: A primary action button.

Output: Generates and downloads a .json file.

Schema: The output must match the following schema exactly:

```json
    [
    {
        "name": "City Name",
        "latitude": 0.0,
        "longitude": 0.0,
        "utc_offset": 0,
        "country": "Country Name",
        "population": 0, // (Optional/Default to 0)
        "priority": 1,
        "notes": "User entered notes here..."
    }
    ]
```

📂 Deliverables & File Structure

Please provide the complete code structure assuming the root is /tools/route-editor.

package.json (With isolated dependencies: vite, react, react-dom, leaflet, react-leaflet, tailwindcss, etc.).

vite.config.js (Configured for this sub-project).

src/main.jsx (Entry point).

src/App.jsx (Main layout shell).

src/components/MapEditor.jsx (Leaflet logic, timezone layer, click handlers).

src/components/Sidebar.jsx (List display, drag-and-drop logic, form inputs).

src/utils/exportUtils.js (JSON generation)

Instructions on how to run this tool independently
