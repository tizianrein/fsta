// File: /api/catalog-damages.js

export const maxDuration = 120;

const SYSTEM_PROMPT = `
You are a specialist AI for detecting and locating damages on physical objects based on images and textual descriptions.
Your task is to analyze the provided data and return a JSON array listing all identified damages.

Output ONLY the JSON content. Do not include any explanatory text, greetings, or other conversation. Do not use markdown formatting like \`\`\`json.

**Input Context:**
1.  **Base Model JSON:** A JSON object describing the object's geometry, composed of parts with names, origins, and dimensions. This provides the spatial context.
2.  **Images:** One or more photos of the specific object instance, showing potential damages.
3.  **User Prompt:** An optional text description of the damages.

**Output JSON Format:**
Your output must be a JSON array \`[]\`. Each element in the array must be an object \`{}\` representing a single, distinct damage point, with the following three keys:

1.  **"partId" (string):** The exact 'id' of the part from the input model JSON that the damage is on or closest to.
2.  **"damagePosition" (array of numbers):** An array of three numbers \`[x, y, z]\` representing the precise coordinates of the damage in the object's global coordinate system. You must estimate this position based on the photos and the provided model geometry. The coordinate system is the same as the input model: +X is right, +Y is back, +Z is up.
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
    
    geminiParts.push({ text: `Analyze the images and this user description to identify all damages: "${prompt}"` });
    
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

    // If the Google API itself returns an error, capture it and send it back as a proper JSON error.
    if (!googleResponse.ok) {
        const errorText = await googleResponse.text();
        console.error("Google API Error Response:", errorText);
        // This makes sure the specific error from Google is sent to the frontend.
        throw new Error(`Google API Error: ${errorText}`);
    }

    const googleData = await googleResponse.json();
    
    res.status(200).json(googleData);

  } catch (error) {
    // This main catch block will now handle our thrown errors and any other unexpected errors.
    console.error('Error in /api/catalog-damages handler:', error);
    res.status(500).json({ 
        message: 'An error occurred on the server.', 
        // Pass the specific error message for better debugging.
        error: error.message 
    });
  }
}