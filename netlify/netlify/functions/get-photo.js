// netlify/functions/get-photo.js
//
// Takes a search query (e.g. "Sedona red rocks Arizona") and returns a
// verified, accurate photo URL from Unsplash's real Search API —
// replacing guessed/hardcoded photo IDs and the deprecated source.unsplash.com
// redirect endpoint.

exports.handler = async function (event) {
  const query = event.queryStringParameters && event.queryStringParameters.query;

  if (!query) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Missing query parameter' })
    };
  }

  const accessKey = process.env.UNSPLASH_ACCESS_KEY;

  if (!accessKey) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Unsplash API key not configured' })
    };
  }

  try {
    const url = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=3&orientation=landscape`;

    const response = await fetch(url, {
      headers: {
        Authorization: `Client-ID ${accessKey}`
      }
    });

    if (!response.ok) {
      const errText = await response.text();
      return {
        statusCode: 502,
        body: JSON.stringify({ error: 'Unsplash API error', detail: errText })
      };
    }

    const data = await response.json();

    if (!data.results || data.results.length === 0) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: 'No photos found for query', query })
      };
    }

    // Return the top result's relevant image sizes + required attribution
    const photo = data.results[0];

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=86400' // cache for 24h to save API calls
      },
      body: JSON.stringify({
        url: photo.urls.regular,
        urlSmall: photo.urls.small,
        photographerName: photo.user.name,
        photographerUrl: photo.user.links.html,
        unsplashUrl: photo.links.html,
        downloadLocation: photo.links.download_location // required for "trigger downloads" guideline
      })
    };

  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Server error', detail: err.message })
    };
  }
};
