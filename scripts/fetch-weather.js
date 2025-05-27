require('dotenv').config();
const fetch = require('node-fetch');

async function fetchWeather() {
  console.log('Starting weather forecast fetch at', new Date().toISOString());
  
  try {
    const response = await fetch(`${process.env.API_URL}/api/forecast/fetch`, {
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