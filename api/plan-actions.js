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
- Analyze the provided 'modelJson' to understand the object's assembly and parts.
- Analyze the 'damageJson' to understand the specific issues that need to be addressed.
- If an 'existingPlan' is provided, use the 'userPrompt' to intelligently modify that plan.
- If 'existingPlan' is null, create a brand new plan from scratch based on the damages.

**TASK DECOMPOSITION:**
- **Decompose Complex Actions:** Your primary goal is to break down the repair process into the smallest possible, logical actions. A user should be able to complete one step without needing to guess what to do next. [1, 7, 12]
- **More Steps are Better:** Always favor creating more, simpler steps over fewer, complicated ones. For example, instead of one step for "Remove the back panel," create separate steps for "Unscrew the four corner screws," "Gently pry open the left seam," and "Lift the panel away."
- **Sequential and Logical:** The plan must follow a logical and safe sequence. Steps must build upon each other correctly from disassembly to repair to reassembly.

**JSON OUTPUT SCHEMA:**
The root object must contain a single key: "steps".
The "steps" key must contain an array of step objects. Each step object MUST have the following structure:
- "step_number" (number): The sequential number of the step, starting from 1.
- "title" (string): **A short, action-focused title with a MAXIMUM of eight words.** Do NOT mention the location of the damage or the part in the title (e.g., use "Clamp and Glue Crack" instead of "Clamp and Glue Crack on Back Left Leg").
- "description" (string): **A precise, rich, and highly detailed explanation of the action.** This must be thorough enough for a novice to follow. Include specific instructions on what to look for, what physical motions to make (e.g., "turn counter-clockwise," "apply even pressure," "pull gently upwards"), the expected outcome of the action, and any relevant safety advice.
- "tools_required" (array of strings): A list of all tools or materials needed for this specific step (e.g., "Phillips #1 Screwdriver," "Wood Glue").
- "affected_parts" (array of strings): A list of part 'id's from the modelJson that are directly manipulated or affected in this step.
- "affected_damages" (array of strings): A list of damage 'id's from the damageJson that this step directly addresses or contributes to fixing.
`;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  try {
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
    
    const googleApiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

    const googleResponse = await fetch(googleApiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: geminiParts }],
        generationConfig: { 
            "responseMimeType": "application/json" 
        }
      }),
    });

    if (!googleResponse.ok) {
        const errorText = await googleResponse.text();
        throw new Error(`Google API Error: ${errorText}`);
    }

    const googleData = await googleResponse.json();
    res.status(200).json(googleData);

  } catch (error) {
    console.error('Error in /api/plan-actions handler:', error);
    res.status(500).json({ message: 'An error occurred on the server.', error: error.message });
  }
}