import sqlite3
import json
import os

# --- 1. CONFIGURATION ---

# Paths to your database files
COUNTRIES_DB_PATH = "countries.sqlite3"
CITIES_DB_PATH = "cities.sqlite3"

# This is the name of the file the script will create
OUTPUT_FILE = "phase1_anchors.json"

# --- 2. DEFINE THE "MEGA-CITY" ANCHORS ---
# Format: (city_name, country_code)
# This list is now a combination of culturally significant anchors
# and all cities from your >5 million population list.

MEGA_CITY_LIST = [
    # North America
    ("New York City", "US"),
    ("Los Angeles", "US"),
    ("Chicago", "US"),
    ("Houston", "US"),  # Kept from old list
    ("Toronto", "CA"),
    ("Montréal", "CA"),  # Kept from old list
    # South America
    ("São Paulo", "BR"),
    ("Rio de Janeiro", "BR"),
    ("Guayaquil", "EC"),
    # Europe
    ("Istanbul", "TR"),
    ("Saint Petersburg", "RU"),
    ("Milan", "IT"),  # Kept from old list
    ("Barcelona", "ES"),  # Kept from old list
    ("Munich", "DE"),  # Kept from old list
    # Asia
    ("Shanghai", "CN"),
    ("Guangzhou", "CN"),  # New
    ("Shenzhen", "CN"),  # New
    ("Tianjin", "CN"),  # New
    ("Chongqing", "CN"),  # New
    ("Mumbai", "IN"),
    ("Kolkata", "IN"),  # New
    ("Chennai", "IN"),  # New
    ("Hyderabad", "IN"),  # New
    ("Karachi", "PK"),
    ("Lahore", "PK"),  # New
    ("Osaka", "JP"),
    ("Nagoya", "JP"),  # New
    ("Yangon", "MM"),  # New
    ("Busan", "KR"),  # New
    ("Surabaya", "ID"),  # New
    ("Jeddah", "SA"),  # New
    ("Mashhad", "IR"),  # New
    ("Ho Chi Minh City", "VN"),  # Kept from old list
    # Africa
    ("Lagos", "NG"),
    ("Johannesburg", "ZA"),
    ("Dar es Salaam", "TZ"),  # New
    ("Douala", "CM"),  # New
    ("Alexandria", "EG"),  # New
    ("Casablanca", "MA"),  # Kept from old list
    # Oceania
    ("Sydney", "AU"),
    ("Melbourne", "AU"),
    ("Perth", "AU"),  # New
    ("Auckland", "NZ"),  # Kept from old list
]

# --- Suppressed anchors ---
# List of (city_name, country_code) tuples that are expected to be missing
# from the `cities.sqlite3` database and should NOT produce a warning.
# Add entries here for small or intentionally excluded anchors.
SUPPRESSED_ANCHORS = [
    # Examples:
    # ("Small Village", "XX"),
    ("Antananarivo", "MG"),  # Capital of Madagascar, often missing
    ("Dushanbe", "TJ"),  # Capital of Tajikistan, often missing
    ("Douglas, Isle of Man", "IM"),
    ("Mata Utu", "WF"),  # Capital of Wallis and Futuna
    ("Macao", "MO"),  # Special Administrative Region of China
    ("St Peter Port", "GG"),  # Capital of Guernsey
    ("Cayenne", "GF"),  # Capital of French Guiana
    ("West Island", "CC"),  # Cocos (Keeling) Islands
    ("Juba", "SS"),  # Capital of Somalia
    ("Plymouth", "MS"),  # Capital of Montserrat
    ("Kralendijk", "BQ"),  # Capital of Bonaire
    ("Road Town", "VG"),  # Capital of British Virgin Islands
    ("Kingston", "NF"),  # Capital of Norfolk Island
    ("Flying Fish Cove", "CX"),  # Capital of Christmas Island
    ("Belgrade", "RS"),  # Capital of Serbia
    ("Cockburn Town", "TC"),  # Capital of Turks and Caicos Islands
    ("Stanley", "FK"),  # Capital of Falkland Islands
    ("Adamstown", "PN"),  # Capital of Pitcairn Islands
    ("Diego Garcia", "IO"),  # British Indian Ocean Territory
    ("Majuro", "MH"),  # Capital of Marshall Islands
    ("Vatican City", "VA"),  # Capital of Vatican City
    ("Hagatna", "GU"),  # Capital of Guam
    ("Manila", "PH"),  # Capital of Philippines
    ("Bissau", "GW"),  # Capital of Guinea-Bissau
    ("Marigot", "MF"),  # Capital of Saint Martin
    ("Pago Pago", "AS"),  # Capital of American Samoa
    ("Saint-Pierre", "PM"),  # Capital of Saint Pierre and Miquelon
    ("Gibraltar", "GI"),  # Capital of Gibraltar
    ("Longyearbyen", "SJ"),  # Capital of Svalbard
    ("Saint Helier", "JE"),  # Capital of Jersey
    ("Oranjestad", "AW"),  # Capital of Aruba
    ("Monaco", "MC"),  # Capital of Monaco
    ("Pristina", "XK"),  # Capital of Kosovo
    ("Jamestown", "SH"),  # Capital of Saint Helena
    ("Willemstad", "CW"),  # Capital of Curaçao
    ("Avarua", "CK"),  # Capital of Cook Islands
    ("Niamey", "NE"),  # Capital of Niger
    ("Gustavia", "BL"),  # Capital of Saint Barthelemy
    ("Philipsburg", "SX"),  # Capital of Sint Maarten
    ("Port-aux-Francais", "TF"),  # Capital of French Southern Territories
    ("Saipan", "MP"),  # Capital of Northern Mariana Islands
    ("Asuncion", "PY"),  # Capital of Paraguay
    ("Alofi", "NU"),  # Capital of Niue
    ("El-Aaiun", "EH"),  # Capital of Western Sahara
    ("Grytviken", "GS"),  # Capital of South Georgia and the South Sandwich Islands
    ("Basseterre", "KN"),  # Capital of Saint Kitts and Nevis
    ("The Valley", "AI"),  # Capital of Anguilla
    ("Mariehamn", "AX"),  # Capital of Åland Islands
    ("Nouakchott", "MR"),  # Capital of Mauritania
    ("Mamoudzou", "YT"),  # Capital of Mayotte
    ("Buenos Aires", "AR"),  # Capital of Argentina
]
# --- 3. DATABASE AND QUERY LOGIC ---


def generate_anchor_list():

    # --- Step 1: Load ALL country data into a lookup map ---
    print(f"Step 1: Connecting to {COUNTRIES_DB_PATH} to build country data map...")

    if not os.path.exists(COUNTRIES_DB_PATH):
        print(f"ERROR: File not found: {COUNTRIES_DB_PATH}")
        return

    country_data_map = (
        {}
    )  # This will store { 'US': { capital: '...', timezones: '...' }, ... }
    capital_search_list = []

    try:
        conn_countries = sqlite3.connect(COUNTRIES_DB_PATH)
        conn_countries.row_factory = sqlite3.Row
        cursor = conn_countries.cursor()

        # 'iso2' is the country_code we need
        query = "SELECT capital, iso2, timezones FROM countries"
        cursor.execute(query)
        all_countries = cursor.fetchall()

        for country in all_countries:
            country_code = country["iso2"]
            country_data_map[country_code] = dict(country)

            # While we're here, let's get the capital
            capital_name = country["capital"]
            if capital_name and capital_name != "":
                capital_search_list.append((capital_name, country_code))

        print(f"Built map for {len(country_data_map)} countries.")
        print(f"Found {len(capital_search_list)} capitals to search for.")

    except sqlite3.Error as e:
        print(f"An SQLite error occurred with {COUNTRIES_DB_PATH}: {e}")
        return
    finally:
        if "conn_countries" in locals():
            conn_countries.close()

    # --- Step 2: Combine capital list with our manual mega-city list ---
    # Use a set to avoid duplicates
    anchor_search_list = list(set(capital_search_list + MEGA_CITY_LIST))
    print(f"Total unique anchors to find in cities.sqlite3: {len(anchor_search_list)}")

    # Build a fast lookup set for suppressed anchors so expected-missing
    # entries do not generate warnings.
    suppressed_set = set(SUPPRESSED_ANCHORS)

    # --- Step 3: Loop, find city data, and MERGE with country data ---
    print(f"Step 2: Connecting to {CITIES_DB_PATH} to find and merge data...")

    if not os.path.exists(CITIES_DB_PATH):
        print(f"ERROR: File not found: {CITIES_DB_PATH}")
        return

    final_anchor_list = []
    try:
        conn_cities = sqlite3.connect(CITIES_DB_PATH)
        conn_cities.row_factory = sqlite3.Row
        cursor_cities = conn_cities.cursor()

        for city_name, country_code in anchor_search_list:
            # Query the cities table for the matching city and country code
            query = "SELECT * FROM cities WHERE name = ? AND country_code = ?"
            cursor_cities.execute(query, (city_name, country_code))
            city_result = cursor_cities.fetchone()

            if city_result:
                # --- THIS IS THE KEY MERGE STEP ---

                # 1. Convert the city database row to a standard dictionary
                merged_data = dict(city_result)

                # 2. Look up the country data we stored in our map
                country_data = country_data_map.get(country_code)

                # 3. Add the timezone data (and parse it from a JSON string)
                if country_data and country_data["timezones"]:
                    merged_data["timezones"] = json.loads(country_data["timezones"])
                else:
                    merged_data["timezones"] = []  # Add empty list if none found

                final_anchor_list.append(merged_data)
                # --- END OF MERGE STEP ---

            else:
                # If this missing city is on the suppressed list, skip warning.
                if (city_name, country_code) in suppressed_set:
                    continue

                print(
                    f"  > Warning: Could not find '{city_name}, {country_code}' "
                    "in cities.sqlite3."
                )

    except sqlite3.Error as e:
        print(f"An SQLite error occurred with {CITIES_DB_PATH}: {e}")
        return
    finally:
        if "conn_cities" in locals():
            conn_cities.close()

    # --- Step 4: Save the final compiled list to a JSON file ---
    print(
        f"Step 3: Saving {len(final_anchor_list)} complete anchors to {OUTPUT_FILE}..."
    )
    try:
        # We sort the list by country_code just for a cleaner output file
        final_anchor_list.sort(key=lambda x: x["country_code"])

        with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
            json.dump(final_anchor_list, f, indent=4)
        print("Success! Anchor file generated.")

    except IOError as e:
        print(f"Error writing to file {OUTPUT_FILE}: {e}")


# --- 5. RUN THE SCRIPT ---
if __name__ == "__main__":
    generate_anchor_list()
