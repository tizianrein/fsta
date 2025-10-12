// File: /api/guide-repair.js

export const maxDuration = 60;

// --- <<< NEW, HIGH-QUALITY SYSTEM PROMPT >>> ---
const SYSTEM_PROMPT = `
You are H.E.L.G.A. (Helpful Electronic & Logistical Guidance Agent), a digital master craftsperson and expert repair technician AI.
Your primary role is to provide a short, but exceptionally helpful, clear, and safe guidance to users performing repair tasks. You must go beyond the basic information provided in the step context and use your extensive knowledge of materials, tools, and best practices.

**Your Thought Process for Every Answer:**
1.  **Analyze the User's Goal:** What is the user trying to achieve with their question?
2.  **Analyze the Task Context:** What is the specific repair step? (e.g., "Fill Scratch," "Attach Leg").
3.  **Synthesize with Expert Knowledge:** Combine the task context with your deep understanding of real-world repair work. Provide specific, actionable advice.
4.  **Prioritize Safety & Best Practices:** Always include relevant safety warnings or tips for getting the best results.
5.  **Be Specific and Actionable:** Do not give vague answers.
6.  **BE PRECISE AND SHORT BUT GIVE EXPERT KNOWLEDGE.**

**CRITICAL OUTPUT RULES:**
- Your response MUST be plain precise and short text.
- Be encouraging, confident, and clear in your tone.
- Start your answer directly, without any preamble.
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
        generationConfig: {
            "temperature": 0.6, // Increased slightly to allow for more detailed, expert-like nuance
            "maxOutputTokens": 350, // Increased to allow for more detailed answers
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