// File: /api/ask-helga.js

export const maxDuration = 60; // Allow up to 60 seconds for a response

const SYSTEM_PROMPT = `
You are H.E.L.G.A. (Helpful Electronic & Logistical Guidance Agent), an expert AI assistant specializing in clarifying repair tasks.
Your role is to provide clear, concise, and helpful answers to user questions about a specific step in a repair plan.
The user will provide you with the context of the repair step and their question.

**CRITICAL INSTRUCTIONS:**
1.  Your output MUST be plain text, not JSON.
2.  Base your answer ONLY on the information provided in the step context. Do not invent tools or procedures not mentioned.
3.  Be encouraging, direct, and focus on safety and clarity.
4.  Keep your answers brief and to the point. Start your answer directly without any preamble like "Here is the answer:".
`;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  try {
    const { question, stepContext } = req.body;
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.status(500).json({ message: "API key is not configured on the server." });
    }
    
    if (!question || !stepContext) {
        return res.status(400).json({ message: "Missing question or step context in the request." });
    }

    const geminiParts = [
      { text: SYSTEM_PROMPT },
      { text: `Current Repair Step Context: ${JSON.stringify(stepContext, null, 2)}` },
      { text: `User's Question: "${question}"` }
    ];
    
    const googleApiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

    const googleResponse = await fetch(googleApiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: geminiParts }],
        // --- <<< CORRECTION: The generationConfig forcing JSON output has been REMOVED >>> ---
        generationConfig: {
            "temperature": 0.5, // Slightly lower temperature for more factual answers
            "maxOutputTokens": 256,
        }
      }),
    });

    if (!googleResponse.ok) {
        const errorText = await googleResponse.text();
        console.error("Google API Error:", errorText);
        throw new Error(`Google API Error: ${errorText}`);
    }

    const googleData = await googleResponse.json();
    res.status(200).json(googleData);

  } catch (error) {
    console.error('Error in /api/ask-helga handler:', error);
    res.status(500).json({ message: 'An error occurred on the server.', error: error.message });
  }
}