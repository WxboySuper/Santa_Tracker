import json
import os

import folium

# --- 1. CONFIGURATION ---

# The script will always load your anchor skeleton
ANCHOR_FILE = "phase1_anchors.json"

# --- !!! ---
# --- THIS IS THE ONLY LINE YOU'LL CHANGE ---
# Set this to the timezone you want to curate.
TARGET_TIMEZONE_NAME = "UTC+14:00"
# --- !!! ---

# Automatically determines which files to load and save
CANDIDATE_FILE_TO_LOAD = (
    f"phase2_candidates_{TARGET_TIMEZONE_NAME.replace(':', '_')}.json"
)
OUTPUT_MAP_FILE = f"map_viz_{TARGET_TIMEZONE_NAME.replace(':', '_')}.html"

# --- 2. MAP GENERATION LOGIC ---


def create_visualization_map():

    # --- Step 1: Create a base map ---
    print("Creating base map...")
    m = folium.Map(location=[0, 180], zoom_start=3)

    # --- Step 2: Create "layers" for our markers ---
    anchors_group = folium.FeatureGroup(name=f"Anchors ({TARGET_TIMEZONE_NAME})")
    candidates_group = folium.FeatureGroup(name=f"Candidates ({TARGET_TIMEZONE_NAME})")

    # --- Step 3: Load and FILTER Anchors (in RED) ---
    if not os.path.exists(ANCHOR_FILE):
        print(f"Warning: Anchor file not found at '{ANCHOR_FILE}'. Skipping.")
    else:
        print(
            f"Loading anchors from '{ANCHOR_FILE}' and "
            f"filtering for {TARGET_TIMEZONE_NAME}..."
        )
        with open(ANCHOR_FILE, "r", encoding="utf-8") as f:
            anchor_data = json.load(f)

        filtered_anchor_count = 0
        for city in anchor_data:
            try:
                # --- THIS IS THE NEW FILTER LOGIC ---
                is_in_target_tz = False
                # The 'timezones' field is a list of dicts
                timezones_list = city.get("timezones", [])

                for tz_info in timezones_list:
                    if tz_info.get("gmtOffsetName") == TARGET_TIMEZONE_NAME:
                        is_in_target_tz = True
                        break

                if not is_in_target_tz:
                    continue  # Skip this anchor, it's not in our target timezone
                # --- END OF FILTER LOGIC ---

                lat = float(city["latitude"])
                lon = float(city["longitude"])
                name = city["name"]

                folium.Marker(
                    location=[lat, lon],
                    popup=f"ANCHOR: {name}",
                    icon=folium.Icon(color="red"),
                ).add_to(anchors_group)
                filtered_anchor_count += 1

            except (KeyError, TypeError, ValueError):
                bad_name = city.get("name")
                print(f"  > Warning: Skipping anchor with invalid data: {bad_name}")

        anchors_group.add_to(m)
        print(f"Added {filtered_anchor_count} *filtered* anchors to map (in red).")

    # --- Step 4: Load and plot CANDIDATES (in BLUE) ---
    if not os.path.exists(CANDIDATE_FILE_TO_LOAD):
        print(f"ERROR: Candidate file not found at '{CANDIDATE_FILE_TO_LOAD}'.")
        print("Did you run the Phase 2 generator script for this timezone yet?")
    else:
        print(f"Loading candidates from '{CANDIDATE_FILE_TO_LOAD}'...")
        with open(CANDIDATE_FILE_TO_LOAD, "r", encoding="utf-8") as f:
            candidate_data = json.load(f)

        # Center the map on the first candidate in this file
        if candidate_data:
            try:
                first_lat = float(candidate_data[0]["latitude"])
                first_lon = float(candidate_data[0]["longitude"])
                m.location = [first_lat, first_lon]
                m.zoom_start = 5  # Zoom in closer for a regional view
            except (KeyError, TypeError, ValueError, IndexError):
                pass  # Stick with the default view

        for city in candidate_data:
            try:
                lat = float(city["latitude"])
                lon = float(city["longitude"])
                name = city["name"]

                folium.Marker(
                    location=[lat, lon],
                    popup=f"CANDIDATE: {name}",
                    icon=folium.Icon(color="blue"),
                ).add_to(candidates_group)
            except (KeyError, TypeError, ValueError):
                print(
                    "  > Warning: Skipping candidate with invalid data: "
                    f"{city.get('name')}"
                )

        candidates_group.add_to(m)
        print(f"Added {len(candidate_data)} candidates to map (in blue).")

    # --- Step 5: Add Layer Control and Save ---
    folium.LayerControl().add_to(m)

    m.save(OUTPUT_MAP_FILE)
    print(f"\nSuccess! Map saved to '{OUTPUT_MAP_FILE}'.")
    print("Open this file in your browser to see the interactive map.")


# --- 3. RUN THE SCRIPT ---
if __name__ == "__main__":
    create_visualization_map()
