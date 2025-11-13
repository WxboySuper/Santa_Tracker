import json
import os
import sqlite3

# --- 1. CONFIGURATION ---

# !!! --- YOU WILL CHANGE THIS FOR EACH RUN --- !!!
#
# Use the 'gmtOffsetName' from the 'timezones' column in your JSON.
# Examples: "UTC+14:00", "UTC+13:00", "UTC+12:00", "UTC-05:00"
#
TARGET_TIMEZONE_NAME = "UTC+14:00"
#
# !!! ----------------------------------------- !!!

# Paths to your database files
COUNTRIES_DB_PATH = "countries.sqlite3"
CITIES_DB_PATH = "cities.sqlite3"

# The script will create a file like 'phase2_candidates_UTC+14_00.json'
# It replaces ':' with '_' to avoid filename issues
safe_filename = f"phase2_candidates_{TARGET_TIMEZONE_NAME.replace(':', '_')}.json"
OUTPUT_FILE = safe_filename

# --- 2. DATABASE AND QUERY LOGIC ---


def generate_candidate_pool():

    # --- Step 1: Find all countries in the target timezone ---
    print(
        f"Step 1: Connecting to {COUNTRIES_DB_PATH} "
        f"to find countries in {TARGET_TIMEZONE_NAME}..."
    )

    if not os.path.exists(COUNTRIES_DB_PATH):
        print(f"ERROR: File not found: {COUNTRIES_DB_PATH}")
        return

    matching_country_codes = []
    try:
        conn_countries = sqlite3.connect(COUNTRIES_DB_PATH)
        conn_countries.row_factory = sqlite3.Row
        cursor = conn_countries.cursor()

        # We need to pull the timezones blob and check it in Python
        query = "SELECT iso2, timezones FROM countries"
        cursor.execute(query)
        all_countries = cursor.fetchall()

        for country in all_countries:
            country_code = country["iso2"]
            timezones_json = country["timezones"]

            if not timezones_json:
                continue

            try:
                # Parse the JSON string
                timezones_list = json.loads(timezones_json)

                # Check each timezone in the list for a match
                for tz in timezones_list:
                    if tz.get("gmtOffsetName") == TARGET_TIMEZONE_NAME:
                        matching_country_codes.append(country_code)
                        # Found a match; no need to check other timezones
                        # for this country
                        break

            except json.JSONDecodeError:
                print(f"  > Warning: Could not parse timezone JSON for {country_code}")

        print(
            "Found {} countries in this timezone: {}".format(
                len(matching_country_codes), matching_country_codes
            )
        )

    except sqlite3.Error as e:
        print(f"An SQLite error occurred with {COUNTRIES_DB_PATH}: {e}")
        return
    finally:
        if "conn_countries" in locals():
            conn_countries.close()

    if not matching_country_codes:
        print("No countries found for this timezone. No file will be created.")
        return

    # --- Step 2: Get all cities from those matching countries ---
    print(
        f"Step 2: Connecting to {CITIES_DB_PATH} "
        "to get all cities for these countries..."
    )

    if not os.path.exists(CITIES_DB_PATH):
        print(f"ERROR: File not found: {CITIES_DB_PATH}")
        return

    final_candidate_list = []
    try:
        conn_cities = sqlite3.connect(CITIES_DB_PATH)
        conn_cities.row_factory = sqlite3.Row
        cursor_cities = conn_cities.cursor()

        # We need to build a query with a dynamic number of placeholders
        # e.g., "WHERE country_code IN (?, ?, ?)"
        placeholders = ",".join(["?"] * len(matching_country_codes))
        query = f"SELECT * FROM cities WHERE country_code IN ({placeholders})"

        cursor_cities.execute(query, matching_country_codes)
        city_results = cursor_cities.fetchall()

        # Convert all results to standard dictionaries
        final_candidate_list = [dict(row) for row in city_results]

    except sqlite3.Error as e:
        print(f"An SQLite error occurred with {CITIES_DB_PATH}: {e}")
        return
    finally:
        if "conn_cities" in locals():
            conn_cities.close()

    # --- Step 3: Save the final compiled list to a JSON file ---
    print(
        f"Step 3: Saving {len(final_candidate_list)} found candidate "
        f"cities to {OUTPUT_FILE}..."
    )
    try:
        with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
            json.dump(final_candidate_list, f, indent=4)
        print("Success! Candidate file generated.")

    except IOError as e:
        print(f"Error writing to file {OUTPUT_FILE}: {e}")


# --- 4. RUN THE SCRIPT ---
if __name__ == "__main__":
    generate_candidate_pool()
