# Admin Dashboard

The Santa Tracker includes a comprehensive admin dashboard for managing locations, routes, and content.

## 🔑 Accessing the Dashboard

### Setup
1. Set the admin password as an environment variable:
   ```bash
   export ADMIN_PASSWORD="your-secure-password"
   ```
   Or add to `.env` file:
   ```env
   ADMIN_PASSWORD=your-secure-password
   ```

2. Start the application:
   ```bash
   python src/app.py
   ```

3. Navigate to `http://localhost:5000/admin`

4. Enter your admin password to log in

### Session Management
- Sessions are secure with Bearer token authentication
- Sessions expire after inactivity
- Multiple admin sessions supported
- Logout available via interface

## 📍 Location Management

### Add Location
Create new stops on Santa's route with complete details:

**Required Fields:**
- **Location Name**: City, town, or landmark name
- **Latitude**: Geographic latitude (-90 to 90)
- **Longitude**: Geographic longitude (-180 to 180)
- **UTC Offset**: Timezone offset from UTC (e.g., -5, +1)

**Optional Fields:**
- **Country**: Country name
- **Population**: City population
- **Priority**: 1 (highest) to 3 (lowest)
- **Arrival Time**: Scheduled arrival (ISO 8601 format)
- **Departure Time**: Scheduled departure (ISO 8601 format)
- **Notes**: Additional information

**Example:**
```json
{
  "name": "New York City",
  "latitude": 40.7128,
  "longitude": -74.0060,
  "utc_offset": -5,
  "country": "United States",
  "population": 8336817,
  "priority": 1,
  "notes": "Times Square celebration"
}
```

### Edit Location
Modify existing locations:
1. Select location from list
2. Update any fields
3. Save changes
4. Re-run route precomputation if timing changed

### Delete Location
Remove locations from the route:
1. Select location to delete
2. Confirm deletion
3. Location removed permanently
4. Re-precompute route to update timing

### Import Locations
Bulk import from JSON files:

**Supported Formats:**
```json
// Format 1: Array in "route" key
{
  "route": [
    {"name": "City1", "latitude": 40.0, "longitude": -74.0, ...},
    {"name": "City2", "latitude": 51.5, "longitude": -0.1, ...}
  ]
}

// Format 2: Array in "locations" key
{
  "locations": [...]
}

// Format 3: Direct array
[
  {"name": "City1", ...},
  {"name": "City2", ...}
]

// Format 4: Single object
{
  "name": "City1",
  "latitude": 40.0,
  ...
}
```

**Import Modes:**
- **Append**: Add to existing locations
- **Replace**: Clear existing, then import

### Validate Locations
Check route data for errors:
- Missing required fields
- Invalid coordinates
- Duplicate locations
- Timezone inconsistencies
- Invalid date formats

Results show:
- ✅ Validation passed
- ❌ Errors found with details
- Suggestions for fixes

## 🗺️ Route Management

### Precompute Route
Automatically calculate optimal route timing:

**Process:**
1. Sorts locations by UTC offset (follows time zones)
2. Assigns arrival/departure times
3. Calculates stop durations based on priority:
   - Priority 1: Longer stops (major cities)
   - Priority 2: Medium stops
   - Priority 3: Shorter stops (small towns)
4. Ensures logical progression through time zones

**Configuration:**
- Start time: December 24, 00:00 UTC+14
- Travel time calculated by distance
- Stop duration based on priority and population

**Usage:**
1. Click "Precompute Route" button
2. Review confirmation dialog
3. Wait for processing
4. Check route status for results

### View Route Status
Display comprehensive route statistics:

**Metrics:**
- **Total Locations**: Number of stops on route
- **Locations with Times**: Complete timing data
- **Priority Breakdown**: Distribution of priorities
- **Last Modified**: Most recent update timestamp
- **Completion Status**: Overall route readiness

**Status Indicators:**
- 🟢 Complete: All locations have timing
- 🟡 Incomplete: Some locations missing data
- 🔴 Empty: No locations in route

## 💾 Data Management

### Export Backup
Download complete route data:

**Features:**
- Full location details included
- Timing information preserved
- Timestamped filename: `santa_route_backup_YYYYMMDD_HHMMSS.json`
- Can be reimported later

**Usage:**
1. Click "Export Backup"
2. File downloads automatically
3. Store safely for disaster recovery

**File Structure:**
```json
{
  "exported_at": "2024-12-01T10:30:00Z",
  "version": "1.0",
  "total_locations": 150,
  "route": [
    {
      "name": "Wellington",
      "latitude": -41.2865,
      "longitude": 174.7762,
      "utc_offset": 13,
      "priority": 1,
      "arrival_time": "2024-12-24T11:00:00Z",
      "departure_time": "2024-12-24T11:15:00Z"
    }
  ]
}
```

### Import from Backup
Restore from previously exported backup:
1. Click "Import Locations"
2. Select backup JSON file
3. Choose mode (append/replace)
4. Confirm import
5. Validate imported data

## 🔄 Admin Workflow

### Initial Setup
1. **Access Dashboard**
   - Set ADMIN_PASSWORD
   - Log in to admin interface

2. **Import Initial Data**
   - Use bulk import for starter data
   - Or manually add locations

3. **Set Priorities**
   - Assign priorities (1-3)
   - Priority 1 for major cities
   - Priority 3 for small towns

4. **Validate Data**
   - Run validation check
   - Fix any reported errors

### Route Preparation
1. **Precompute Timing**
   - Click "Precompute Route"
   - Wait for completion
   - Review route status

2. **Review Results**
   - Check all locations have times
   - Verify logical progression
   - Adjust if needed

3. **Export Backup**
   - Download backup before going live
   - Store in safe location

### Ongoing Maintenance
1. **Add New Locations**
   - Add as requested
   - Re-run precomputation

2. **Update Timing**
   - Edit locations as needed
   - Precompute to recalculate

3. **Regular Backups**
   - Export weekly during setup
   - Export daily during live tracking

4. **Data Quality**
   - Run validation regularly
   - Address issues promptly

## 🔐 Security Best Practices

### Password Security
- Use strong, unique password (16+ characters)
- Include uppercase, lowercase, numbers, symbols
- Never reuse passwords
- Store securely (password manager recommended)
- Never commit to version control

### Production Security
- **Always use HTTPS** in production
- Enable firewall rules
- Limit admin IP addresses if possible
- Use environment variables, not hardcoded passwords
- Rotate passwords periodically

### Access Control
- Limit admin access to trusted individuals
- Log admin actions for audit trail
- Use separate admin passwords per environment
- Revoke access when no longer needed

### Data Protection
- Export regular backups
- Store backups securely offline
- Test backup restoration periodically
- Use version control for configuration
- Monitor for unauthorized access

## 🐛 Troubleshooting

### Cannot Log In
- Verify ADMIN_PASSWORD is set correctly
- Check environment variables are loaded
- Clear browser cookies/cache
- Try incognito/private browsing mode

### Import Fails
- Validate JSON format (use JSONLint)
- Check file encoding (UTF-8 required)
- Verify all required fields present
- Check for special characters

### Precompute Errors
- Ensure locations have coordinates
- Validate UTC offsets
- Check for duplicate locations
- Review error messages for details

### Export Issues
- Check browser popup blocker
- Ensure write permissions
- Try different browser
- Use "Save As" if auto-download fails

## 📊 Best Practices

### Data Quality
- Verify coordinates with maps
- Use consistent naming conventions
- Include country for clarity
- Add notes for special considerations
- Keep population data current

### Route Optimization
- Balance major and minor stops
- Consider real-world time zones
- Account for travel distances
- Test route before going live
- Plan for edge cases (date line, poles)

### Backup Strategy
- Export before major changes
- Keep multiple backup versions
- Store in multiple locations
- Document backup schedule
- Test restoration process

### Performance
- Keep route size reasonable (<1000 locations)
- Precompute during off-peak hours
- Monitor server resources
- Optimize large imports
- Cache frequently accessed data
