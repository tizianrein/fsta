// File: /api/create-intervention.js

export const maxDuration = 120; // Allow up to 120 seconds for complex modifications

const SYSTEM_PROMPT = `
You are an expert AI assistant specializing in modifying 3D assemblies for repair planning.
Your task is to take an EXISTING assembly JSON and a user instruction, and return a NEW, complete JSON that precisely reflects the requested change.

**CRITICAL INSTRUCTIONS:**
1.  **Status Management:** This is a primary rule.
    *   When you ADD a completely new part (not from a cut), you MUST set its \`status\` property to \`"new"\`.
    *   When a user asks to REMOVE or DISCARD a part, DO NOT delete its entry from the 'parts' array. Instead, you MUST change its \`status\` property to \`"discarded"\`.
    *   For all other parts that are not the subject of the user's instruction, their original \`status\` MUST be preserved.
2.  **Handling 'Cut' or 'Shorten' Operations:** When a user asks to cut, shorten, or trim a part:
    a.  **Modify the Original Part:** Adjust the \`dimensions\` of the original part to make it smaller. You MUST also adjust its \`origin\` (center point) to reflect the change. For example, cutting 10cm off the +X end of a 50cm beam moves its center in the -X direction.
    b.  **Create an Offcut Part:** Create a NEW part entry in the \`parts\` array to represent the piece that was cut off.
    c.  **Offcut Properties:** This new offcut part needs a unique ID (e.g., \`original_id_offcut\`), dimensions matching the removed section, and an origin placing it in the space it originally occupied.
    d.  **Offcut Status:** The offcut part's \`status\` MUST be set to \`"discarded"\` unless the user explicitly asks for a replacement, in which case it would be \`"new"\`. Default to \`"discarded"\`.
3.  **Be Conservative:** Only add, remove, or modify the parts explicitly mentioned or clearly implied in the user's instruction.
4.  **Preserve Everything Else:** All other parts, their properties (connections, etc.), and the objectName MUST be preserved exactly as they were in the input JSON.
5.  **Update Connections:** If you add or remove a part, ensure the 'connections' array of any affected parts is correctly updated.
6.  **Output Raw JSON Only:** Your entire response must be the raw JSON object, starting with \`{\` and ending with \`}\`. Do not use markdown (\`\`\`json) or add any other text.
7.  **Follow Schema:** The output must strictly follow the assembly JSON schema (objectName, parts array with id, origin, dimensions, connections, status, rotation etc.).
8.  **Coordinate System:** The ground plane is X-Z. +Y is UP. +X is RIGHT. +Z is BACK.
`;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  try {
    const { modelJson, userPrompt, geminiModel, temperature } = req.body;
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.status(500).json({ message: "API key is not configured on the server." });
    }
    if (!modelJson || !userPrompt) {
        return res.status(400).json({ message: "Missing 'modelJson' or 'userPrompt' in the request."});
    }

    const geminiParts = [
      { text: SYSTEM_PROMPT },
      { text: `Here is the current assembly JSON to modify: ${JSON.stringify(modelJson, null, 2)}` },
      { text: `User's modification instruction: "${userPrompt}"` }
    ];

    const model = geminiModel || 'gemini-1.5-flash';
    const temp = temperature !== undefined ? temperature : 0.4;

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
    console.error('Error in /api/create-intervention handler:', error);
    res.status(500).json({ message: 'An error occurred on the server.', error: error.message });
  }
}