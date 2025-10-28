// File: /api/generate-from-scrapwood.js

export const maxDuration = 120; // Allow up to 120 seconds for complex generations

const SYSTEM_PROMPT = `
You are an expert AI for waste-material fabrication. Your task is to design a 3D assembly for a user-described object using ONLY a provided list of scrapwood pieces.

**CORE DIRECTIVE:**
You MUST construct the object using ONLY the materials listed. You are FORBIDDEN from inventing new pieces or using more material than is available in the list. The final assembly must be physically plausible.

**CRITICAL RULES:**
1.  **Material Constraint:** You will be given a JSON array of available scrapwood pieces with their dimensions. This is your entire inventory.
2.  **Cutting is Allowed:** You can cut, shorten, or divide the provided pieces.
3.  **Handling Cuts:** When a piece is cut:
    a.  The original piece in the 'parts' array must have its 'dimensions' and 'origin' updated to reflect its new, smaller size.
    b.  You MUST create a NEW part entry for the "offcut" (the piece that was removed).
    c.  This new offcut part MUST have a unique ID (e.g., "original_id_offcut"), its correct dimensions, and its `status` property MUST be set to `"discarded"`.
4.  **Asymmetry is Encouraged:** The design does NOT need to be symmetrical. Create a functional and creative assembly that works with the given, often irregular, pieces.
5.  **Output Raw JSON Only:** Your entire response must be ONLY the raw JSON object. Do not use markdown (like \`\`\`json) or add any explanatory text.

**JSON OUTPUT STRUCTURE:**
The root object must contain 'objectName' (string) and 'parts' (array). Each part object in the array MUST have:
- **id** (string): A unique, human-readable identifier (e.g., "table_leg_1", "seat_surface").
- **origin** (object): The center point of the part in meters {x, y, z}.
- **dimensions** (object): The size in meters {width, height, depth}.
- **connections** (array of strings): IDs of other parts it is physically connected to.
- **status** (string, optional): Only use "discarded" for offcuts. Do not add a status for parts that are in use.

**COORDINATE SYSTEM:**
- The ground is the X-Z plane.
- **+Y is UP.**
- **+X is RIGHT.**
- **+Z is BACK.**
- The origin (0,0,0) is at the center of the object's base on the ground.
`;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  try {
    const { prompt, scrapwood, freakyness } = req.body;
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.status(500).json({ message: "API key is not configured on the server." });
    }
    if (!prompt || !scrapwood || scrapwood.length === 0) {
        return res.status(400).json({ message: "Missing 'prompt' or 'scrapwood' list in the request."});
    }

    const userInstruction = `
        Here is my inventory of scrapwood pieces (in meters):
        ${JSON.stringify(scrapwood, null, 2)}

        Using only these pieces, please generate a JSON assembly for the following object: "${prompt}"
    `;

    const geminiParts = [
      { text: SYSTEM_PROMPT },
      { text: userInstruction }
    ];
    
    // Use a model that is good with creative tasks and following complex instructions
    const model = 'gemini-1.5-pro-latest';
    const temp = freakyness !== undefined ? freakyness : 0.5;
    
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
        throw new Error(`Google API responded with status ${googleResponse.status}: ${errorText}`);
    }

    const googleData = await googleResponse.json();
    res.status(200).json(googleData);

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'An error occurred on the server.', error: error.message });
  }
}