#!/bin/bash

# Coordinates for the location (from forecastRoutes.js)
LAT=52.0181248
LON=-1.3819986

# Make the request to MET.no API
curl -v "https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=${LAT}&lon=${LON}" \
  -H "User-Agent: RiverMonitor/1.0 (https://github.com/mattjwaller/river-backend)" \
  | jq '.properties.timeseries[0:5]'  # Show first 5 entries for readability

# Print the total number of entries
echo -e "\nTotal number of forecast entries:"
curl -s "https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=${LAT}&lon=${LON}" \
  -H "User-Agent: RiverMonitor/1.0 (https://github.com/mattjwaller/river-backend)" \
  | jq '.properties.timeseries | length' 