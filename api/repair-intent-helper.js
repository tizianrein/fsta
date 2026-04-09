export const maxDuration = 120;

const SYSTEM_PROMPT = `
You are an expert conservator and repair strategist.
The user will provide their current repair intent slider values (between 0 and 1) and constraints.
Your task is to analyze the specific weights of these axes and infer a holistic repair strategy from them.

Return one raw JSON object with keys:
- axes: an array of objects (id, label, value). If the user provided a specific prompt asking for changes (e.g., "make it more sustainable"), adjust the values accordingly. Otherwise, echo the values exactly as they are currently provided.
- summary: A plain text string containing a catchy, creative heading (e.g., "THE JANITOR'S COOKBOOK", "THE PURIST", "THE QUICK & DIRTY", "THE SHIP OF THESEUS") followed by a line break, and then 2-3 sentences explaining what this specific combination of values means for how the repair should be physically approached.

Ensure the summary perfectly reflects which values are high and which are low.
Return ONLY valid JSON. Do not wrap it in markdown code blocks (\`\`\`json).
`;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method Not Allowed' });

  try {
    const { prompt, currentIntent, constraints } = req.body;
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return res.status(500).json({ message: 'API key is not configured on the server.' });

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    const googleResponse = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [
          { text: SYSTEM_PROMPT },
          { text: `User request/prompt: ${prompt || 'Interpret my current slider values.'}` },
          { text: `currentIntent:\n${JSON.stringify(currentIntent || {}, null, 2)}` },
          { text: `constraints:\n${JSON.stringify(constraints || {}, null, 2)}` },
        ] }],
        generationConfig: { 
          responseMimeType: 'application/json', 
          temperature: 0.7 // Slightly higher temperature so it gets creative with the headings
        }
      })
    });

    if (!googleResponse.ok) throw new Error(await googleResponse.text());
    res.status(200).json(await googleResponse.json());
  } catch (error) {
    console.error('Error in /api/repair-intent-helper handler:', error);
    res.status(500).json({ message: 'An error occurred on the server.', error: error.message });
  }
}