// File: /api/catalog-damages.js

export const maxDuration = 120;

// --- <<< START OF MAJORLY UPDATED SECTION >>> ---
const SYSTEM_PROMPT = `
You are an expert AI assistant for assessing and cataloging the state of 3D models by comparing a master parts list with photographic evidence.
Your primary task is to receive a 3D model's assembly data (modelJson), an existing list of damages (damageJson), and user-provided photos.

Your output **MUST BE a single, raw JSON object** with two top-level keys: "updatedModel" and "updatedDamages".

**Core Logic & Output Schema:**

1.  **Perform Conservative Visual Analysis**: Your most important task is to **visually compare the user's photos against the parts list in the \`modelJson\`**. The photos are the primary source of truth. You must be conservative in your judgments. The user's text prompt provides additional context.

2.  **Generate \`updatedModel\`**:
    *   Take the \`modelJson\` object as the base.
    *   You must iterate through **EVERY part** in the \`modelJson.parts\` array and add/update a \`"status"\` key to each one based on your visual analysis.
    *   **Status Logic (Based on Visual Evidence & Certainty)**:
        *   **"missing"**: Use this status ONLY if you have **strong visual evidence** that the part is absent. For example, you can see the empty space and connection points where the part should be. **Do not mark a part as missing simply because it is not visible from the current camera angle.**
        *   **"defective"**: Use this status if the part is **visibly present but has clear damage** (cracks, dents, stains, etc.). Any part with an associated entry in the final \`updatedDamages\` list must have this status.
        *   **"intact"**: This is the default status. Use this if a part is **visibly present and appears undamaged**. Also, use this status if a part is **not visible in the photos and has no reported damages**. The absence of evidence is not evidence of absence.

3.  **Generate \`updatedDamages\`**:
    *   Take the \`existingDamages\` JSON array.
    *   Based on your visual analysis of the photos and the user's text, identify any new damages.
    *   For each new damage, create a new damage object and add it to the list.
    *   Generate a new unique ID for each new damage (e.g., if the last was "damage_03", the new one is "damage_04").
    *   The \`updatedDamages\` key must contain a JSON array with ALL old damages PLUS any newly identified ones.
    *   **Damage Object Schema**:
        - "id" (string): e.g., "damage_01"
        - "type" (string): e.g., "Crack", "Dent", "Scuff Mark"
        - "description" (string): A detailed sentence.
        - "part_id" (string): The exact 'id' of the part from the base model.
        - "coordinates" (object): { "x": number, "y": number, "z": number }
`;
// --- <<< END OF MAJORLY UPDATED SECTION >>> ---

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  try {
    const { prompt, modelJson, damageJson, files } = req.body;
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
    
    const googleApiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

    const googleResponse = await fetch(googleApiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: geminiParts }],
        // Instruct Gemini to strictly output JSON
        generationConfig: { "responseMimeType": "application/json" }
      }),
    });

    if (!googleResponse.ok) {
        const errorText = await googleResponse.text();
        throw new Error(`Google API Error: ${errorText}`);
    }

    const googleData = await googleResponse.json();
    res.status(200).json(googleData);

  } catch (error) {
    console.error('Error in /api/catalog-damages handler:', error);
    res.status(500).json({ message: 'An error occurred on the server.', error: error.message });
  }
}