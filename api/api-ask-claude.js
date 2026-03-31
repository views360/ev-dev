// api/ask-claude.js - Vercel Serverless Function
// Place this in: your-repo/api/ask-claude.js

const Anthropic = require("@anthropic-ai/sdk");

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const EV_SYSTEM_PROMPT = `You are an expert EV (Electric Vehicle) assistant specializing in helping drivers understand all aspects of electric vehicle ownership. You provide accurate, helpful information about:

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

Always provide practical, specific advice. When discussing percentages or numbers, cite general industry standards. Be concise but thorough. If a question is outside your EV expertise, politely redirect back to EV topics. Maintain a friendly, approachable tone suitable for both EV newcomers and experienced drivers.`;

module.exports = async (req, res) => {
  // Enable CORS
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET,OPTIONS,PATCH,DELETE,POST,PUT"
  );
  res.setHeader(
    "Access-Control-Allow-Headers",
    "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version"
  );

  // Handle OPTIONS request
  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }

  // Only accept POST requests
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { message } = req.body;

    // Validate input
    if (!message || typeof message !== "string") {
      return res.status(400).json({ error: "Invalid message" });
    }

    if (message.length > 2000) {
      return res
        .status(400)
        .json({ error: "Message too long (max 2000 characters)" });
    }

    // Call Claude API
    const response = await client.messages.create({
      model: "claude-opus-4-20250805",
      max_tokens: 1024,
      system: EV_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: message,
        },
      ],
    });

    // Extract text from response
    const assistantMessage = response.content[0];
    if (assistantMessage.type !== "text") {
      throw new Error("Unexpected response type from Claude");
    }

    return res.status(200).json({
      response: assistantMessage.text,
    });
  } catch (error) {
    console.error("Error calling Claude API:", error);

    // Don't expose internal error details to client
    if (error.message.includes("401")) {
      return res.status(500).json({
        error: "Authentication failed. Check your API key.",
      });
    }

    if (error.message.includes("429")) {
      return res.status(429).json({
        error: "Rate limit exceeded. Please try again in a moment.",
      });
    }

    return res.status(500).json({
      error: "Failed to process request. Please try again later.",
    });
  }
};
