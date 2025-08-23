// File: /api/generate-assembly_rotated.js

// --- NEW CONFIGURATION LINE ---
// This tells Vercel to allow this function to run for up to 120 seconds instead of the default 10.
export const maxDuration = 120;

const SYSTEM_PROMPT = `
You are an expert 3D modeler and data structuring AI. Your task is to analyze the provided data and generate a single, complete JSON object representing a 3D assembly.

**CRITICAL INSTRUCTIONS:**
1.  Your entire output must be ONLY the raw JSON content.
2.  Do NOT use any markdown formatting like \`\`\`json.
3.  Do NOT include any text, explanations, or greetings before or after the JSON block.

**JSON STRUCTURE:**
The root of the object must contain two keys: 'objectName' (string) and 'parts' (array).

Each object in the 'parts' array MUST have the following keys:
- **id** (string): A unique, human-readable identifier (e.g., "left_leg", "seat_surface").
- **origin** (object): The center point of the part in meters, with x, y, and z keys.
- **dimensions** (object): The size of the part in meters, with width (X-axis), height (Y-axis), and depth (Z-axis) keys.
- **rotation** (object): An object with x, y, and z keys, representing rotations in radians.
- **connections** (array of strings): IDs of other parts this part is physically connected to.

**COORDINATE SYSTEM & ROTATION (VERY IMPORTANT):**
- The ground plane is the X-Y plane.
- **+Z is UP.** This is the vertical direction. Ensure the model is not generated lying on its side.
- **+X is RIGHT.**
- **+Y is BACK.**
- The origin (0,0,0) is at the center of the object's base on the ground.

- **ROTATION IS APPLIED IN 'YXZ' ORDER:** The final orientation is achieved by applying rotations in this exact sequence:
    1.  **y:** First, rotation around the Y-axis (the back/front axis).
    2.  **x:** Second, rotation around the X-axis (the right/left axis).
    3.  **z:** Third, rotation around the Z-axis (the vertical/up axis).

- **GUIDANCE:** For most objects, the main components should have a rotation of {x: 0, y: 0, z: 0}. Only use non-zero rotation values for parts that are explicitly described as tilted, angled, or rotated. Double-check your final output to ensure the assembly is upright and correctly oriented according to the Z-up coordinate system.
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