export const maxDuration = 120;

const SYSTEM_PROMPT = `
You help users define a repair intent.
Return one raw JSON object with keys:
- axes: array of objects with id, label, value between 0 and 1
- summary: short plain text summary

Use six to eight axes only.
Prefer these labels when relevant:
Material Authenticity
Structural Performance
Economic Viability
Cultural Continuity and Craft
Ecological Sustainability
Aesthetic Intervention
Reversibility
Ease of Future Maintenance

No markdown. Only JSON.
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
          { text: `prompt:\n${prompt || ''}` },
          { text: `currentIntent:\n${JSON.stringify(currentIntent || {}, null, 2)}` },
          { text: `constraints:\n${JSON.stringify(constraints || {}, null, 2)}` },
        ] }],
        generationConfig: { responseMimeType: 'application/json', temperature: 0.5 }
      })
    });

    if (!googleResponse.ok) throw new Error(await googleResponse.text());
    res.status(200).json(await googleResponse.json());
  } catch (error) {
    console.error('Error in /api/repair-intent-helper handler:', error);
    res.status(500).json({ message: 'An error occurred on the server.', error: error.message });
  }
}
