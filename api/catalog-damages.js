// File: /api/catalog-damages.js

// This tells Vercel to allow this function to run for up to 120 seconds.
export const maxDuration = 120;

// --- <<< START OF UPDATED SECTION >>> ---
const SYSTEM_PROMPT = `
You are a specialist AI for detecting and locating damages on physical objects based on images and textual descriptions.
Your task is to analyze the provided data and return ONLY a JSON array listing all identified damages.

**Output Rules:**
- Output ONLY the raw JSON array.
- Do not include any explanatory text, greetings, conversation, or markdown formatting like \`\`\`json.
- If no damages are found, return an empty array: [].

**Input Context:**
1.  **Base Model JSON:** A JSON object describing the object's geometry, which provides the spatial context for part IDs and coordinates.
2.  **Images:** One or more photos of the object showing potential damages.
3.  **User Prompt:** An optional text description of the damages.

**Output JSON Schema:**
Your output must be a JSON array \`[]\`. Each object in the array represents a single damage and must contain these three keys:

1.  **"partId" (string):** The exact 'id' of the part from the input model JSON that the damage is on or closest to.
2.  **"damagePosition" (array of numbers):** An array of three numbers \`[x, y, z]\` representing the precise coordinates of the damage. You must estimate this position based on the photos and the provided model geometry. The coordinate system is +X right, +Y back, +Z up.
3.  **"text" (string):** A brief, clear description of the damage type (e.g., "Deep scratch", "Chipped corner", "Missing glider", "Water stain").

**IMPORTANT - FORMATTING EXAMPLE ONLY:**
The following block is an example of the required JSON output format. DO NOT COPY THE CONTENT of this example. Your response should be based **only** on the user-provided images and text.

[
  {
    "partId": "example_part_id",
    "damagePosition": [0.0, 0.0, 0.0],
    "text": "This is a format example only."
  }
]
`;
// --- <<< END OF UPDATED SECTION >>> ---


export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  try {
    const { prompt, modelJson, files } = req.body;
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      console.error("GEMINI_API_KEY is not set.");
      return res.status(500).json({ message: "API key is not configured on the server." });
    }

    const geminiParts = [
      { text: SYSTEM_PROMPT },
      { text: `This is the base 3D model geometry for context. Identify damages relative to these parts: ${JSON.stringify(modelJson, null, 2)}` }
    ];
    
    if (files && files.length > 0) {
        files.forEach(file => {
            geminiParts.push({ inlineData: { mimeType: file.mimeType, data: file.data } });
        });
    }
    
    // Updated instruction to be more direct
    geminiParts.push({ text: `User's damage report. Analyze the provided images and this text to generate the damage list: "${prompt}"` });
    
    const googleApiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

    const googleResponse = await fetch(googleApiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: geminiParts }],
        generationConfig: {
            "responseMimeType": "application/json",
        }
      }),
    });

    if (!googleResponse.ok) {
        const errorText = await googleResponse.text();
        console.error("Google API Error Response:", errorText);
        throw new Error(`Google API Error: ${errorText}`);
    }

    const googleData = await googleResponse.json();
    
    res.status(200).json(googleData);

  } catch (error) {
    console.error('Error in /api/catalog-damages handler:', error);
    res.status(500).json({ 
        message: 'An error occurred on the server.', 
        error: error.message 
    });
  }
}