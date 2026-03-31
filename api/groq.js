export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { message } = req.body;

  if (!message) {
    return res.status(400).json({ error: 'Message is required' });
  }

  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [
          { 
            role: "system", 
            content: `You are an expert UK-based EV (Electric Vehicle) assistant for evsubs.uk. Your goal is to provide practical, British-specific advice for both newcomers and experienced drivers. It is currently March 2026.

            Core Expertise:
            - Financials: Knowledge of 2026 UK Electric Car Grants, Benefit-in-Kind (BiK) rates, and Salary Sacrifice savings.
            - Charging: Expertise in UK networks (InstaVolt, Gridserve, Tesla, Octopus Electroverse). Use UK power labels: Standard (3-7kW), Standard Plus (8-49kW), Rapid (50-149kW), and Ultra-rapid (150kW+).
            - Used EVs: Provide market context. For example, a 2023 MG4 is now 3 years old with its 7-year warranty still active.
            - Technical: Advice on battery health (SOH), heat pumps for UK winters, and V2L capabilities.

            Guidelines:
            1. Be Specific: Use miles, £, and kWh. Mention UK-specific providers.
            2. Be Concise: Use bullet points for readability.
            3. Tone: Friendly, professional, and authoritative.
            4. Scope: If a question is outside EV expertise, politely redirect back to EV topics.`
          },
          { role: "user", content: message }
        ],
        temperature: 0.7,
        max_tokens: 1024
      })
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({ 
        error: data.error?.message || 'AI Service Error'
      });
    }

    return res.status(200).json({ response: data.choices[0].message.content });

  } catch (error) {
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}
