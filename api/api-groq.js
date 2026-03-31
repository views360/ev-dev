// api/ask-claude.js - Groq API Implementation (FASTEST & FREE)
// Setup: Get API key from https://console.groq.com
// Environment variable: GROQ_API_KEY

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

    const systemPrompt = `You are an expert EV (Electric Vehicle) assistant specializing in helping drivers understand all aspects of electric vehicle ownership. You provide accurate, helpful information about:

- Battery health, charging, and maintenance
- Range, efficiency, and driving techniques
- Charging networks and home charging setup
- Cost of ownership and financial benefits
- Winter driving and seasonal considerations
- Insurance and warranty considerations
- Used EV buying guides
- EV myths and misconceptions
- Technical jargon and EV terminology
- Holiday travel and towing with EVs

Always provide practical, specific advice. Be concise but thorough. If a question is outside your EV expertise, politely redirect back to EV topics. Maintain a friendly, approachable tone suitable for both EV newcomers and experienced drivers.`;

    // Call Groq API (Ultra-fast inference)
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'mixtral-8x7b-32768', // or 'llama-2-70b-chat' for higher quality
        messages: [
          {
            role: 'system',
            content: systemPrompt,
          },
          {
            role: 'user',
            content: message,
          },
        ],
        temperature: 0.7,
        max_tokens: 512,
        top_p: 0.9,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('Groq API error:', errorData);
      throw new Error(`Groq API error: ${response.status}`);
    }

    const data = await response.json();

    if (!data.choices || !data.choices[0] || !data.choices[0].message) {
      throw new Error('Unexpected response format from Groq');
    }

    const assistantMessage = data.choices[0].message.content;

    return res.status(200).json({
      response: assistantMessage,
    });
  } catch (error) {
    console.error('Error calling Groq API:', error);

    if (error.message.includes('401')) {
      return res.status(500).json({
        error: 'Authentication failed. Check your GROQ_API_KEY.',
      });
    }

    if (error.message.includes('429')) {
      return res.status(429).json({
        error: 'Rate limit exceeded. Please try again in a moment.',
      });
    }

    return res.status(500).json({
      error: 'Failed to process request. Please try again later.',
    });
  }
}
