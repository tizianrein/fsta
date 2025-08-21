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

**JSON STRUCTURE:**const SYSTEM_PROMPT = `
You are an expert 3D modeler and data structuring AI. Your task is to analyze the provided data and generate a single, complete JSON object based on a hierarchical structure.

**CRITICAL INSTRUCTIONS:**
1.  Your entire output must be ONLY the raw JSON content.
2.  Do NOT use any markdown formatting like \`\`\`json.
3.  Do NOT include any text, explanations, or greetings before or after the JSON block.

**JSON STRUCTURE (HIERARCHICAL):**
The root of the object contains 'objectName' (string) and 'parts' (array). Parts are defined by their relationship to each other.

Each part object MUST have:
- **id** (string): A unique, human-readable identifier.
- **parent** (string or null): The 'id' of the part this part is attached to. A `null` parent means it is a root part of the object.
- **dimensions** (object): The size of the part with width (X), height (Y), and depth (Z) in meters.
- **attachment** (object): Describes how this part connects to its parent.
    - **origin** (object): The x, y, z offset of the child's pivot point relative to the parent's pivot point, in the parent's coordinate system.
    - **rotation** (object): The x, y, z rotation in radians of the child, relative to the parent.
- **connections** (array of strings): A list of the 'id's of other parts physically connected to this one (for graph visualization).

**COORDINATE SYSTEM & PIVOTS:**
- Each part's pivot point or local origin (0,0,0) is its **geometric center**.
- **+X** is right, **+Y** is up, **+Z** is back.
- The `attachment.origin` positions a child's center relative to its parent's center. For example, an origin of `{x: 0, y: 0.5, z: 0}` on a child would place its center directly on the top surface of a 1m tall parent.

**EXAMPLE HIERARCHY:**
A 1m cube with a 0.5m cube placed on top of it.
{
  "objectName": "Stacked Cubes",
  "parts": [
    {
      "id": "base_cube",
      "parent": null,
      "dimensions": { "width": 1.0, "height": 1.0, "depth": 1.0 },
      "attachment": {
        "origin": { "x": 0, "y": 0.5, "z": 0 }, // Positioned in world space
        "rotation": { "x": 0, "y": 0, "z": 0 }
      },
      "connections": ["top_cube"]
    },
    {
      "id": "top_cube",
      "parent": "base_cube",
      "dimensions": { "width": 0.5, "height": 0.5, "depth": 0.5 },
      "attachment": {
        "origin": { "x": 0, "y": 0.75, "z": 0 }, // (ParentHeight/2 + ChildHeight/2) = 0.5 + 0.25 = 0.75
        "rotation": { "x": 0, "y": 0, "z": 0 }
      },
      "connections": ["base_cube"]
    }
  ]
}
`;
The root of the object must contain two keys: 'objectName' (string) and 'parts' (array).

The 'parts' array contains part objects. Each part object MUST have the following keys:
- **id** (string): A unique, human-readable identifier for the part (e.g., "left_leg", "seat_surface").
- **origin** (object): An object with x, y, and z keys. This represents the **center point** of the part in meters.
- **dimensions** (object): An object with width (along X), height (along Y), and depth (along Z) keys, all in meters.
- **rotation** (object): An object with x, y, and z keys, all in radians. Rotations are applied in 'YXZ' order.
    - x: Rotation around the X-axis (Pitch).
    - y: Rotation around the Y-axis (Yaw).
    - z: Rotation around the Z-axis (Roll).
- **connections** (array of strings): A list of the 'id's of other parts that this part is physically connected to.

**COORDINATE SYSTEM (IMPORTANT):**
- The origin (0,0,0) is at the center of the object's footprint on the ground plane.
- **+X** is to the object's **right**.
- **+Y** is **upwards**.
- **+Z** is to the object's **back**.

**EXAMPLE OF A ROTATED PART:**
To create a panel that is tilted back by 45 degrees (like a chair backrest), you must apply a **positive rotation around the X-axis**.
{
  "id": "tilted_panel",
  "origin": { "x": 0, "y": 0.5, "z": 0 },
  "dimensions": { "width": 1.0, "height": 1.0, "depth": 0.1 },
  "rotation": { "x": 0.7854, "y": 0, "z": 0 }, // 0.7854 radians is 45 degrees
  "connections": []
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