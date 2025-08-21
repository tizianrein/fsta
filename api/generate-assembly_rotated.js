// File: /api/generate.js

// --- NEW CONFIGURATION LINE ---
// This tells Vercel to allow this function to run for up to 120 seconds instead of the default 10.
export const maxDuration = 120;

const SYSTEM_PROMPT = `
You are an expert 3D modeler and data structuring AI. Your task is to analyze the provided data and generate a single, complete JSON object with absolute precision.

**CRITICAL INSTRUCTIONS:**
1.  Your entire output must be ONLY the raw JSON content.
2.  Do NOT use any markdown formatting like \`\`\`json.
3.  Do NOT include any text, explanations, or greetings before or after the JSON block.

**JSON STRUCTURE:**
The root of the object must contain 'objectName' and 'parts'. Each part has:
- **id** (string): Unique identifier.
- **origin** (object): The center point of the part in meters {x, y, z}.
- **dimensions** (object): Size in meters {width, height, depth}.
- **rotation** (object): Rotation in radians {x, y, z}.
- **connections** (array of strings): IDs of connected parts.

**COORDINATE SYSTEM:**
- **+X** is to the object's **right**.
- **+Y** is **upwards**.
- **+Z** is to the object's **back**.

**ROTATION CONVENTION (VERY IMPORTANT):**
Rotations follow the right-hand rule.
- **Rotation around X-axis:** A **POSITIVE** value tilts the top of the part **BACKWARDS** (towards +Z). A **NEGATIVE** value tilts it **FORWARDS** (towards -Z).
- **Rotation around Y-axis:** A **POSITIVE** value turns the part **COUNTER-CLOCKWISE** when viewed from above (left turn).
- **Rotation around Z-axis:** A **POSITIVE** value rolls the top of the part to the **LEFT** (towards -X).

**EXAMPLE OF ROTATION DIRECTION:**
To create a panel tilted by 45 degrees (0.7854 radians):

// To tilt it BACKWARDS (like a chair backrest):
{
  "id": "tilted_panel_backwards",
  "rotation": { "x": 0.7854, "y": 0, "z": 0 } // POSITIVE X rotation
}

// To tilt it FORWARDS:
{
  "id": "tilted_panel_forwards",
  "rotation": { "x": -0.7854, "y": 0, "z": 0 } // NEGATIVE X rotation
}
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
    
    const googleApiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=${apiKey}`;

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