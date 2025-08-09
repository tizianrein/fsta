// File: /api/catalog-damages.js

export const maxDuration = 120;

// --- <<< START OF MAJORLY UPDATED SECTION >>> ---
const SYSTEM_PROMPT = `
You are an expert AI assistant for cataloging damages on 3D models.
Your primary task is to receive an existing list of damages (as a JSON array), a user prompt describing a new damage, and then return a **complete, updated JSON array** that includes all old damages plus the new one.

**Core Logic:**
1.  **Receive Existing Data:** You will be given a JSON array named "existingDamages". This represents the current state.
2.  **Receive New Instruction:** You will be given a "userPrompt" with photos and/or text describing a new damage to add.
3.  **Analyze and Add:** Analyze the new instruction to determine the properties of the new damage.
4.  **Generate New ID:** Create a new unique ID for the new damage (e.g., if the last ID was "damage_03", the new one should be "damage_04").
5.  **Return Complete List:** Your final output must be a single JSON array containing all the objects from the original "existingDamages" list PLUS the newly created damage object. DO NOT lose any of the old damages.

**Output Rules:**
- Output ONLY the raw JSON array. Do not use markdown or any other text.
- If the initial "existingDamages" list is empty or null, create the very first damage object inside a new array.

**JSON Schema for Each Damage Object:**
Each object in the array must have these keys:
- **"id" (string):** A unique identifier, e.g., "damage_01", "damage_02".
- **"type" (string):** A short category for the damage (e.g., "Crack", "Scratch", "Dent", "Scuff Mark", "Stain").
- **"description" (string):** A detailed sentence describing the damage.
- **"part_id" (string):** The exact 'id' of the part from the base model JSON that the damage is on.
- **"coordinates" (object):** An object containing the x, y, z coordinates. The coordinate system is +X right, +Y back, +Z up.
    - **"x" (number):**
    - **"y" (number):**
    - **"z" (number):**

**Formatting Example (FOR REFERENCE ONLY - DO NOT COPY CONTENT):**
*If the user's prompt was "add a dent to the backrest", and the existing list had one item, your output should look like this:*
[
  {
    "id": "damage_01",
    "type": "Crack",
    "description": "A fine crack on the top surface of the front left leg.",
    "part_id": "front_left_leg",
    "coordinates": { "x": -0.235, "y": -0.22, "z": 0.434 }
  },
  {
    "id": "damage_02",
    "type": "Dent",
    "description": "A small dent in the middle of the backrest.",
    "part_id": "backrest",
    "coordinates": { "x": 0.0, "y": 0.21, "z": 0.7 }
  }
]
`;
// --- <<< END OF MAJORLY UPDATED SECTION >>> ---

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  try {
    // Now expecting `damageJson` in the payload
    const { prompt, modelJson, damageJson, files } = req.body;
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.status(500).json({ message: "API key is not configured on the server." });
    }

    const geminiParts = [
      { text: SYSTEM_PROMPT },
      { text: `Base 3D Model Geometry (for context): ${JSON.stringify(modelJson, null, 2)}` },
      // Send the existing damages to the AI
      { text: `Existing Damages List (add to this): ${JSON.stringify(damageJson, null, 2)}` },
      // The user prompt is the instruction for the *new* damage
      { text: `User Prompt for New Damage: "${prompt}"` }
    ];
    
    if (files && files.length > 0) {
        files.forEach(file => {
            geminiParts.push({ inlineData: { mimeType: file.mimeType, data: file.data } });
        });
    }
    
    const googleApiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

    const googleResponse = await fetch(googleApiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: geminiParts }],
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