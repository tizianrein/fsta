// File: /api/generate-assembly.js

// This tells Vercel to allow this function to run for up to 120 seconds.
export const maxDuration = 120;

const SYSTEM_PROMPT = `
You are an expert 3D modeler and data structuring AI. Your task is to analyze the provided data of an object and generate a JSON file that describes its structure as a collection of simple box-like parts.

Output ONLY the JSON content. Do not include any explanatory text, greetings, or other conversation before or after the JSON block. Do not use markdown formatting like \`\`\`json.

**JSON Output Format and Conventions:**
Your output must strictly adhere to the following JSON structure.

*   **`objectName` (string):** A descriptive name for the entire object.
*   **`parts` (array):** An array of objects, where each object represents a single part.

**Each Part Object must contain:**
*   **`id` (string):** A UNIQUE, human-readable identifier for the part (e.g., "left_leg", "seat_surface", "top_rail"). This is mandatory and must be unique across all parts.
*   **`origin` (object):** The corner of the box with the minimum x, y, and z values.
    *   Coordinate System: The origin (0,0,0) is at the center of the object's footprint. +X is right, +Y is back, +Z is up.
*   **`dimensions` (object):** The size of the box in meters (width, depth, height).
*   **`connections` (array of strings):** A list of the 'id's of other parts that this part is physically connected to. For example, if a "table_leg" connects to the "table_top", its connections array would be ["table_top"]. If a part is not connected to anything, provide an empty array [].

**Example Part:**
{
  "id": "front_left_leg",
  "origin": { "x": -0.4, "y": -0.2, "z": 0.0 },
  "dimensions": { "width": 0.05, "depth": 0.05, "height": 0.7 },
  "connections": ["side_apron_left", "front_apron"]
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
        geminiParts.push({ text: `Here is the current JSON assembly to modify: ${JSON.stringify(modelJson, null, 2)}` });
        geminiParts.push({ text: `User's modification instruction: "${prompt}"` });
    }
    else {
        geminiParts.push({ text: `User's instruction: "${prompt}"` });
    }
    
    const googleApiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

    const googleResponse = await fetch(googleApiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: geminiParts }],
        // --- START: CRITICAL FIX ---
        // This forces the API to return its response in JSON format.
        generationConfig: { "responseMimeType": "application/json" }
        // --- END: CRITICAL FIX ---
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