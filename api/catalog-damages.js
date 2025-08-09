// File: /api/catalog-damages.js

// This tells Vercel to allow this function to run for up to 120 seconds.
export const maxDuration = 120;

// This is the crucial instruction for the AI. It tells it exactly how to behave.
const SYSTEM_PROMPT = `
You are a specialist AI for detecting and locating damages on physical objects based on images and textual descriptions.
Your task is to analyze the provided data and return a JSON array listing all identified damages.

Output ONLY the JSON content. Do not include any explanatory text, greetings, or other conversation. Do not use markdown formatting like \`\`\`json.

**Input Context:**
1.  **Base Model JSON:** A JSON object describing the object's geometry, composed of parts with names, origins, and dimensions. This provides the spatial context.
2.  **Images:** One or more photos of the specific object instance, showing potential damages.
3.  **User Prompt:** An optional text description of the damages.

**Output JSON Format:**
Your output must be a JSON array `[]`. Each element in the array must be an object `{}` representing a single, distinct damage point, with the following three keys:

1.  **"partId" (string):** The exact 'id' of the part from the input model JSON that the damage is on or closest to.
2.  **"damagePosition" (array of numbers):** An array of three numbers `[x, y, z]` representing the precise coordinates of the damage in the object's global coordinate system. You must estimate this position based on the photos and the provided model geometry. The coordinate system is the same as the input model: +X is right, +Y is back, +Z is up.
3.  **"text" (string):** A brief, clear description of the damage type (e.g., "Deep scratch", "Chipped corner", "Missing glider", "Water stain").

**Example Output:**
[
  {
    "partId": "front_left_leg",
    "damagePosition": [-0.245, -0.220, 0.150],
    "text": "Deep scratch along the leg"
  },
  {
    "partId": "seat",
    "damagePosition": [0.100, -0.150, 0.434],
    "text": "Chipped wood on the front edge"
  }
]
`;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  try {
    const { prompt, modelJson, files } = req.body;
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.status(500).json({ message: "API key is not configured on the server." });
    }

    // --- Construct the multi-part request for Gemini ---
    const geminiParts = [
      { text: SYSTEM_PROMPT },
      { text: `This is the base 3D model geometry for context. Identify damages relative to these parts: ${JSON.stringify(modelJson, null, 2)}` }
    ];
    
    // Add image files if they exist
    if (files && files.length > 0) {
        files.forEach(file => {
            geminiParts.push({ inlineData: { mimeType: file.mimeType, data: file.data } });
        });
    }
    
    // Add the user's text prompt
    geminiParts.push({ text: `Analyze the images and this user description to identify all damages: "${prompt}"` });
    
    const googleApiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

    const googleResponse = await fetch(googleApiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: geminiParts }],
        // Adding a response schema can improve the reliability of the JSON output
        "generationConfig": {
            "responseMimeType": "application/json",
        }
      }),
    });

    if (!googleResponse.ok) {
        const errorText = await googleResponse.text();
        console.error("Google API Error:", errorText);
        throw new Error(`Google API responded with status ${googleResponse.status}: ${errorText}`);
    }

    const googleData = await googleResponse.json();
    
    // Forward the successful response to the frontend
    res.status(200).json(googleData);

  } catch (error) {
    console.error('Error in /api/catalog-damages:', error);
    res.status(500).json({ message: 'An error occurred on the server.', error: error.message });
  }
}