// netlify/functions/plan-trip.js
//
// This function receives the user's quiz answers (vibe, budget, travelers,
// transport, pet status, etc.) and calls the Claude API to generate
// real, dynamically-reasoned destination recommendations — replacing the
// hardcoded 5-destination list in the frontend.

exports.handler = async function (event) {
  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  let payload;
  try {
    payload = JSON.parse(event.body);
  } catch (err) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Invalid JSON body' })
    };
  }

  const {
    vibes,          // array of strings, e.g. ["beach","food"]
    adults,         // number
    children,       // number
    childAges,      // array of numbers
    occasion,       // string
    budget,         // number (per person, total)
    departure,      // string, e.g. "Chicago, IL"
    nights,         // string, e.g. "4–6 nights"
    travelWindow,   // string, e.g. "Summer 2025"
    transport,      // string: "fly" | "road trip" | "either" | "train"
    pet,            // string: "coming" | "sitter" | "none"
    avoidTourist,   // boolean
    contentMode,    // boolean
    relaxedPace     // boolean
  } = payload;

  // Build a clear, structured prompt for Claude
  const systemPrompt = `You are the trip-planning brain behind Letsgoo, a travel app that replaces endless tab-searching with one AI-generated answer. Given a traveler's vibe, budget, group, and constraints, you recommend exactly 3 real, specific destinations (city + region/country) that genuinely fit — not generic "anywhere" suggestions.

For each destination, return:
- name and state/country
- a realistic estimated total cost per person (based on the stated budget and trip length)
- a 1-2 sentence "why this fits you" explanation written in a warm, confident, slightly editorial voice (not corporate)
- 4-6 short descriptive tags
- a day-by-day rough itinerary (one line per day, matching the requested trip length)
- one standout "photo spot" recommendation with specific timing advice (e.g. golden hour, time of day) and what to wear/bring
- whether the destination is genuinely pet-friendly if relevant

Respond ONLY with valid JSON in this exact structure, no preamble, no markdown formatting, no code fences:

{
  "destinations": [
    {
      "name": "string",
      "region": "string",
      "estimatedCostPerPerson": number,
      "matchScore": number (0-100),
      "why": "string",
      "tags": ["string", ...],
      "days": [{"plan": "string"}, ...],
      "photoSpot": "string",
      "petFriendly": boolean
    }
  ]
}`;

  const userPrompt = `Plan a trip with these details:
- Vibes wanted: ${(vibes || []).join(', ') || 'open to anything'}
- Travelers: ${adults || 1} adult(s)${children ? `, ${children} child(ren) ages ${(childAges || []).join(', ')}` : ''}
- Occasion: ${occasion || 'just a trip'}
- Budget: $${budget || 2000} per person, total trip
- Departing from: ${departure || 'not specified'}
- Trip length: ${nights || '4-6 nights'}
- Travel window: ${travelWindow || 'flexible'}
- Transport preference: ${transport || 'either'}
- Pet: ${pet === 'coming' ? 'traveling with a pet, need pet-friendly destinations' : 'no pet involved'}
- Avoid tourist traps: ${avoidTourist ? 'yes, prioritize local/hidden gems' : 'no preference'}
- Wants photo/content spot ideas: ${contentMode ? 'yes' : 'no'}
- Pace preference: ${relaxedPace ? 'relaxed, not overpacked' : 'can be full/active'}

Return exactly 3 destinations as JSON per the format specified.`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 3000,
        system: systemPrompt,
        messages: [
          { role: 'user', content: userPrompt }
        ]
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      return {
        statusCode: 502,
        body: JSON.stringify({ error: 'Claude API error', detail: errText })
      };
    }

    const data = await response.json();

    // Claude's text response should be in data.content[0].text
    const rawText = data.content && data.content[0] && data.content[0].text
      ? data.content[0].text
      : null;

    if (!rawText) {
      return {
        statusCode: 502,
        body: JSON.stringify({ error: 'No content returned from Claude' })
      };
    }

    // Strip any accidental markdown code fences before parsing
    const cleaned = rawText.replace(/```json|```/g, '').trim();

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch (parseErr) {
      return {
        statusCode: 502,
        body: JSON.stringify({ error: 'Failed to parse Claude response as JSON', raw: rawText })
      };
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(parsed)
    };

  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Server error', detail: err.message })
    };
  }
};
