// File: /api/catalog-damages.js

export const maxDuration = 120;

// --- <<< START OF MAJORLY UPDATED SECTION >>> ---
const SYSTEM_PROMPT = `
You are an expert AI assistant for assessing and cataloging the state of 3D models by comparing a master parts list with photographic evidence.
Your primary task is to receive a 3D model's assembly data (modelJson), an existing list of damages (damageJson), and user-provided photos.

Your output **MUST BE a single, raw JSON object** with two top-level keys: "updatedModel" and "updatedDamages". Do NOT use markdown formatting like \`\`\`json.

**Core Logic & Output Schema:**

1.  **Perform Visual Analysis**: Compare the user's photos against the parts list in the \`modelJson\`. The user's text prompt provides additional context.

2.  **Generate \`updatedModel\`**:
    *   Take the \`modelJson\` object as the base.
    *   Iterate through **EVERY part** in the \`modelJson.parts\` array and add/update a \`"status"\` key for each one.
    *   **Status Logic**: "missing" (strong visual evidence of absence), "defective" (visibly present but damaged), "intact" (default; visibly present and undamaged, or not visible).

3.  **Generate \`updatedDamages\`**:
    *   Take the \`existingDamages\` array as a base and add new damage objects.
    *   **Damage Object Schema (CRITICAL):**
        - "id" (string): A new unique ID for the damage (e.g., "damage_04").
        - "part_id" (string): The exact 'id' of the affected part from the 'modelJson'.
        - "type" (string): A specific damage category (e.g., "Crack", "Dent", "Scuff Mark").
        - "description" (string): A detailed sentence describing the damage.
        - "coordinates" (object): Estimate the damage's exact coordinates { "x": number, "y": number, "z": number } as if the part had NO rotation. Use the parts origin and size in order to estimate the location of the damage on the part.
        - "severity" (string): "minor", "moderate", "major", or "critical".
        - "confidence" (number): 0.0 to 1.0.
        - "evidence" (string): Brief description of visual evidence.
`;
// --- <<< END OF MAJORLY UPDATED SECTION >>> ---

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  try {
    const { prompt, modelJson, damageJson, files, geminiModel, temperature } = req.body;
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.status(500).json({ message: "API key is not configured on the server." });
    }

    const geminiParts = [
      { text: SYSTEM_PROMPT },
      { text: `Base 3D Model Geometry (the parts manifest to compare against): ${JSON.stringify(modelJson, null, 2)}` },
      { text: `Existing Damages List (add to this): ${JSON.stringify(damageJson, null, 2)}` },
      { text: `User Prompt (for context): "${prompt}"` }
    ];
    
    // Add the image files for visual analysis
    if (files && files.length > 0) {
        files.forEach(file => {
            geminiParts.push({ inlineData: { mimeType: file.mimeType, data: file.data } });
        });
    }
    
    const model = geminiModel || 'gemini-2.5-flash';
    const temp = temperature !== undefined ? temperature : 0.4; // Lower default temp for factual analysis

    const googleApiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const googleResponse = await fetch(googleApiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: geminiParts }],
        generationConfig: { 
            "temperature": temp,
            "responseMimeType": "application/json" 
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
    console.error('Error in /api/catalog-damages handler:', error);
    res.status(500).json({ message: 'An error occurred on the server.', error: error.message });
  }
}