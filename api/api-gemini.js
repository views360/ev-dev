// api/ask-claude.js - Google Gemini API Implementation
// FREE: 60 calls per minute (no expiry, no credit card needed)
// Setup: Get API key from https://makersuite.google.com/app/apikey
// Environment variable: GOOGLE_API_KEY

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader(
    'Access-Control-Allow-Methods',
    'GET,OPTIONS,PATCH,DELETE,POST,PUT'
  );
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  // Handle OPTIONS
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Only POST allowed
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { message } = req.body;

    // Validate input
    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'Invalid message' });
    }

    if (message.length > 2000) {
      return res.status(400).json({ error: 'Message too long (max 2000 characters)' });
    }

    const systemPrompt = `You are an expert EV (Electric Vehicle) assistant. Help drivers with:
- Battery health and charging
- Range and efficiency
- Home charging setup
- Ownership costs
- Winter driving tips
- Insurance and warranties
- Used EV buying
- EV myths and terminology

Be practical, friendly, and specific.`;

    // Call Google Gemini API
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${process.env.GOOGLE_API_KEY}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: `${systemPrompt}\n\nAnswer this question: ${message}`,
                },
              ],
            },
          ],
          generationConfig: {
            maxOutputTokens: 512,
            temperature: 0.7,
            topP: 0.9,
          },
        }),
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      console.error('Google API error:', errorData);
      throw new Error(`Google API error: ${response.status}`);
    }

    const data = await response.json();

    if (
      !data.candidates ||
      !data.candidates[0] ||
      !data.candidates[0].content ||
      !data.candidates[0].content.parts ||
      !data.candidates[0].content.parts[0]
    ) {
      throw new Error('Unexpected response format from Google Gemini');
    }

    const assistantMessage = data.candidates[0].content.parts[0].text;

    return res.status(200).json({
      response: assistantMessage,
    });
  } catch (error) {
    console.error('Error calling Google Gemini API:', error);

    if (error.message.includes('401') || error.message.includes('403')) {
      return res.status(500).json({
        error: 'Authentication failed. Check your GOOGLE_API_KEY.',
      });
    }

    if (error.message.includes('429')) {
      return res.status(429).json({
        error: 'Rate limit exceeded (60 calls/minute). Please wait a moment.',
      });
    }

    return res.status(500).json({
      error: 'Failed to process request. Please try again later.',
    });
  }
}
