// File: /api/plan-actions.js

// Allow the function to run for up to 120 seconds for complex plans
export const maxDuration = 120;

// --- A NEW, MORE ROBUST SYSTEM PROMPT ---
const SYSTEM_PROMPT = `
You are an expert AI assistant specializing in creating repair plans for 3D objects.
Your primary task is to generate a step-by-step repair plan based on a 3D model's assembly data, a list of damages, and user instructions.

**CRITICAL OUTPUT REQUIREMENTS:**
1.  Your entire output **MUST BE a single, raw JSON object**.
2.  Do NOT use any markdown formatting like \`\`\`json. Your response must start with \`{\` and end with \`}\`.
3.  Do NOT include any explanatory text, greetings, or apologies before or after the JSON content.

**PLAN GENERATION LOGIC:**
- Analyze the provided 'modelJson' to understand the object's parts.
- Analyze the 'damageJson' to understand the specific issues to address.
- If an 'existingPlan' is provided, use the 'userPrompt' to modify that plan.
- If 'existingPlan' is null, create a brand new plan from scratch based on the damages.
- The plan should be logical and sequential.

**JSON OUTPUT SCHEMA:**
The root object must contain a single key: "steps".
The "steps" key must contain an array of step objects. Each step object MUST have the following structure:
- "step_number" (number): The sequential number of the step, starting from 1.
- "title" (string): A short, descriptive title for the step (e.g., "Stabilize Chair Frame").
- "description" (string): A more detailed explanation of the action to be taken.
- "tools_required" (array of strings): A list of tools or materials needed for this step.
- "affected_parts" (array of strings): A list of part 'id's from the modelJson that are affected by this step.
- "affected_damages" (array of strings): A list of damage 'id's from the damageJson that this step addresses.
`;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  try {
    // Note: We are no longer expecting 'brain' in the request body
    const { modelJson, damageJson, userPrompt, existingPlan } = req.body;
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.status(500).json({ message: "API key is not configured on the server." });
    }

    const geminiParts = [
      { text: SYSTEM_PROMPT },
      { text: `Base 3D Model: ${JSON.stringify(modelJson, null, 2)}` },
      { text: `List of Damages to Address: ${JSON.stringify(damageJson, null, 2)}` },
      { text: `Existing Plan (modify this if not null): ${JSON.stringify(existingPlan, null, 2)}` },
      { text: `User's Instructions: "${userPrompt || 'No specific instructions provided.'}"` }
    ];
    
    const googleApiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

    const googleResponse = await fetch(googleApiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: geminiParts }],
        // This new configuration is critical: it forces the Gemini model to output valid JSON.
        generationConfig: { 
            "responseMimeType": "application/json" 
        }
      }),
    });

    if (!googleResponse.ok) {
        const errorText = await googleResponse.text();
        // This will now give us a much more detailed error from the Google API side
        throw new Error(`Google API Error: ${errorText}`);
    }

    const googleData = await googleResponse.json();
    res.status(200).json(googleData);

  } catch (error) {
    console.error('Error in /api/plan-actions handler:', error);
    res.status(500).json({ message: 'An error occurred on the server.', error: error.message });
  }
}