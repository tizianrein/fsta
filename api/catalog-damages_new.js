// File: /api/catalog-damages.js

export const maxDuration = 120;

// --- <<< START OF MAJORLY UPDATED SECTION >>> ---
const SYSTEM_PROMPT = `
You are an expert AI assistant for assessing and cataloging the state of 3D models by comparing a master parts list with photographic evidence.
Your primary task is to receive a 3D model's assembly data (modelJson), an existing list of damages (damageJson), and user-provided photos.

Your output **MUST BE a single, raw JSON object** with two top-level keys: "updatedModel" and "updatedDamages". Do NOT use markdown formatting like \`\`\`json.

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
    *   Take the \`existingDamages\` JSON array as a base.
    *   Based on your visual analysis of the photos and the user's text, identify any new damages.
    *   For each new damage, create a new damage object and add it to the list. Ensure the final list contains ALL old damages plus any newly identified ones.
    *   Generate a new unique ID for each new damage (e.g., if the last was "damage_03", the new one is "damage_04").
    *   **Damage Object Schema (CRITICAL):**
        - "id" (string): A new unique ID for the damage (e.g., "damage_04").
        - "part_id" (string): The exact 'id' of the affected part from the 'modelJson'.
        - "type" (string): A specific damage category (e.g., "Crack", "Dent", "Scuff Mark", "Corrosion").
        - "description" (string): A detailed sentence describing the damage, its appearance, and location.
        - "coordinates" (object): The estimated center of the damage on the part's surface in the model's coordinate system { "x": number, "y": number, "z": number }.
          **VERY IMPORTANT GEOMETRY RULE:** Parts may have a "rotation" property. The part's "origin" is its center *before* rotation. For a rotated part, you CANNOT simply take the origin's X/Z and change the Y value to estimate a location. This will be wrong.
          **A much better strategy is to use the part's "origin" as the starting point for your coordinate estimation.** This will place the damage along the central axis of the part. From there, you can make a small adjustment based on the damage description (e.g., 'lower end', 'top corner'), but the final coordinate should be very close to the part's origin. It is better to be centered on the part than to be floating in space.
        - "severity" (string): An assessment of the damage level. MUST be one of: "minor", "moderate", "major", "critical".
        - "confidence" (number): Your confidence in this assessment, from 0.0 (uncertain) to 1.0 (certain).
        - "evidence" (string): A brief description of the visual evidence from the photos that supports this finding. e.g., "A hairline fracture is visible on the upper left corner of the part in the first image."
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