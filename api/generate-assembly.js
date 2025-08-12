// File: /api/generate.js

// --- NEW CONFIGURATION LINE ---
// This tells Vercel to allow this function to run for up to 120 seconds instead of the default 10.
export const maxDuration = 120;

const SYSTEM_PROMPT = `
You are an expert 3D modeler and data structuring AI. Your task is to analyze the provided data and generate a single, complete JSON object.

**CRITICAL INSTRUCTIONS:**
1.  Your entire output must be ONLY the raw JSON content.
2.  Do NOT use any markdown formatting like \`\`\`json.
3.  Do NOT include any text, explanations, or greetings before or after the JSON block.

**JSON STRUCTURE:**
The root of the object must contain two keys: 'objectName' (string) and 'parts' (array).

The 'parts' array contains part objects. Each part object MUST have the following keys:
- **id** (string): A unique, human-readable identifier for the part (e.g., "left_leg", "seat_surface").
- **origin** (object): An object with x, y, and z keys. This is the corner of the box with the minimum x, y, and z values in meters.
- **dimensions** (object): An object with width, depth, and height keys, all in meters.
- **connections** (array of strings): A list of the 'id's of other parts that this part is physically connected to.

**COORDINATE SYSTEM:**
- The origin (0,0,0) is at the center of the object's footprint on the ground plane.
- +X is to the object's right.
- +Y is to the object's back.
- +Z is upwards.
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

    const geminiParts = [
      { text: SYSTEM_PROMPT },
    ];
    
    if (files && files.length > 0) {
        files.forEach(file => {
            geminiParts.push({ inlineData: { mimeType: file.mimeType, data: file.data } });
        });
        geminiParts.push({ text: `User's textual instruction: "${prompt}"` });
    } 
    else if (modelJson) {
        geminiParts.push({ text: `Here is the current JSON model to modify: ${JSON.stringify(modelJson, null, 2)}` });
        geminiParts.push({ text: `User's modification instruction: "${prompt}"` });
    }
    else {
        geminiParts.push({ text: `User's instruction: "${prompt}"` });
    }
    
    const googleApiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

    const googleResponse = await fetch(googleApiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: geminiParts }],
      }),
    });

    if (!googleResponse.ok) {
        const errorText = await googleResponse.text();
        console.error("Google API Error:", errorText);
        throw new Error(`Google API responded with status ${googleResponse.status}`);
    }

    const googleData = await googleResponse.json();
    
    res.status(200).json(googleData);

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'An error occurred on the server.', error: error.message });
  }
}