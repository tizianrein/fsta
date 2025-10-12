// File: /api/generate-assembly_new.js

export const maxDuration = 120; // Allow up to 120 seconds for complex generations

// --- DYNAMIC SYSTEM PROMPT ---
// Base prompt with common instructions
const BASE_SYSTEM_PROMPT = `
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
- **connections** (array of strings): IDs of other parts this part is physically connected to.
- **material** (string, optional): The main material of this part (e.g., "timber", "metal", "plastic").

**COORDINATE SYSTEM (VERY IMPORTANT):**
- The ground plane is the X-Z plane.
- **+Y is UP.** This is the vertical direction.
- **+X is RIGHT.**
- **+Z is BACK.**
- The origin (0,0,0) is at the center of the object's base on the ground.
`;

// Segment for when rotations ARE allowed
const ROTATION_PROMPT_SEGMENT = `
**ROTATION (ENABLED - EXPERIMENTAL):**
- Each part object MUST include a 'rotation' key.
- The 'rotation' key should be an object with x, y, and z keys, representing rotations in radians.
- Use non-zero rotation values for parts that are explicitly described as tilted, angled, or rotated.
- **ROTATION IS APPLIED IN 'YXZ' ORDER:**
    1.  y (Yaw): Rotation around the vertical Y-axis.
    2.  x (Pitch): Rotation around the horizontal X-axis.
    3.  z (Roll): Rotation around the depth-wise Z-axis.
`;

// Segment for when rotations ARE NOT allowed
const NO_ROTATION_PROMPT_SEGMENT = `
**ROTATION (DISABLED):**
- You MUST **OMIT** the 'rotation' key entirely from all part objects.
- Do NOT include \`"rotation": {"x": 0, "y": 0, "z": 0}\`. The key should not be present at all.
- Achieve different orientations by carefully adjusting the 'origin' and 'dimensions' of the parts.
`;


export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  try {
    const { prompt, modelJson, files, temperature, geminiModel, allowRotations } = req.body;
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.status(500).json({ message: "API key is not configured on the server." });
    }

    // --- Conditionally construct the final system prompt ---
    const finalSystemPrompt = BASE_SYSTEM_PROMPT + (allowRotations ? ROTATION_PROMPT_SEGMENT : NO_ROTATION_PROMPT_SEGMENT);

    const geminiParts = [
      { text: finalSystemPrompt },
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
    
    const model = geminiModel || 'gemini-2.5-pro';
    const temp = temperature !== undefined ? temperature : 0.5;
    
    const googleApiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const googleResponse = await fetch(googleApiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: geminiParts }],
        generationConfig: {
            "temperature": temp,
            "responseMimeType": "application/json",
        }
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