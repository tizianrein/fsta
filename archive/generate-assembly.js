// File: /api/generate.js

// --- NEW CONFIGURATION LINE ---
// This tells Vercel to allow this function to run for up to 120 seconds instead of the default 10.
export const maxDuration = 120;

const SYSTEM_PROMPT = `
You are an expert 3D modeler and data structuring AI. Your task is to analyze the provided data of an object or architectural structure and generate a JSON file that describes its structure as a collection of simple box-like parts.

Output ONLY the JSON content. Do not include any explanatory text, greetings, or other conversation before or after the JSON block. Do not use markdown formatting like \`\`\`json.

Input:

A single image, multiple images, and/or PDFs of an object or architectural structure. It can also be a request to modify an existing JSON structure.

Output JSON Format and Conventions:
Your output must strictly adhere to the following JSON structure. You will decompose the subject into its primary constituent cuboid (box-like) components.
Scale Estimation: Estimate all dimensions in meters based on the visual proportions in the input. If the scale is ambiguous, use a common real-world scale appropriate for the identified object type (e.g., a piece of furniture is human-scaled; a building is architectural-scaled). Prioritize any explicit visual cues for scale (e.g., people, doors, other known objects).

Coordinate System:
The origin (0,0,0) is at the center of the object's footprint on the ground/floor plane.
The +X axis points to the object's right.
The +Y axis points to the object's back.
The +Z axis points upwards.

Part Origin: For each part, the origin coordinates (x, y, z) must represent the corner of the box with the minimum x, y, and z values within the global coordinate system.
Part Dimensions: dimensions (width, depth, height) correspond to the extent of the box along the +X, +Y, and +Z axes respectively, starting from its origin.

Spatial Relationships: Pay close attention to how parts connect and are positioned relative to each other. The goal is to represent the 3D assembly as accurately as possible using box primitives.
"Defective" Status: If a part appears clearly damaged, broken, or missing a piece, mark its status as "defective". Otherwise, use "intact". This should only be used for obvious, significant visual defects on a specific, identifiable part.
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