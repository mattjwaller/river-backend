require('dotenv').config();
const fetch = require('node-fetch');

async function fetchWeather() {
  console.log('Starting weather forecast fetch at', new Date().toISOString());
  
  try {
    // Use localhost with the PORT environment variable for internal API calls
    const port = process.env.PORT || 3000;
    const apiUrl = `http://localhost:${port}`;
    
    console.log(`Making request to: ${apiUrl}/api/forecast/fetch`);
    
    const response = await fetch(`${apiUrl}/api/forecast/fetch`, {
      method: 'POST',
      headers: {
        'x-api-key': process.env.API_KEY
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch weather: ${response.status} ${response.statusText}`);
    }

    const result = await response.json();
    console.log('Weather forecast fetch completed:', result);
  } catch (error) {
    console.error('Error fetching weather:', error);
    process.exit(1);
  }
}

// Run the fetch
fetchWeather(); 