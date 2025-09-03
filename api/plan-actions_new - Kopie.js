// File: /api/plan-actions_new.js

export const maxDuration = 120;

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
- **Decompose Complex Actions:** Your primary goal is to break down the repair process into the smallest possible, logical actions.
- **More Steps are Better:** Always favor creating more, simpler steps over fewer, complicated ones. For example, instead of one step for "Remove the back panel," create separate steps for "Unscrew the four corner screws," "Gently pry open the left seam," and "Lift the panel away."
- **Sequential and Logical:** The plan must follow a logical and safe sequence from disassembly to repair to reassembly.

**JSON OUTPUT SCHEMA:**
The root object must contain a single key: "steps". Each step object MUST have the following structure:
- "step_number" (number): Sequential number, starting from 1.
- "title" (string): A short, action-focused title with a MAXIMUM of four words.
- "description" (string): A precise, rich, and highly detailed explanation of the action.
- "tools_required" (array of strings): Tools or materials for this specific step.
- "affected_parts" (array of strings): Part 'id's from modelJson directly manipulated in this step.
- "affected_damages" (array of strings): Damage 'id's from damageJson addressed in this step.
`;

const BRAIN_PROMPTS = {
    "maintenance-maximalist": "REPAIR PHILOSOPHY: Over-engineer the solution for maximum durability and longevity. Suggest reinforcing weak areas, even if they aren't currently damaged. Favor modern, high-strength materials and techniques.",
    "gentle-repairer": "REPAIR PHILOSOPHY: Use the least invasive techniques possible. Prioritize preservation and reversibility. Avoid replacing original parts unless absolutely necessary. Use materials that are compatible with the original.",
    "purist": "REPAIR PHILOSOPHY: Restore the object to its exact original state using period-correct materials and techniques. The repair should be invisible. Authenticity is the highest priority.",
    "critical-conservator": "REPAIR PHILOSOPHY: Stabilize the object and prevent further decay. Clearly distinguish new materials from old ('legibility of the intervention'). The history of the object, including its damages, has value and should not be completely erased."
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  try {
    const { modelJson, damageJson, userPrompt, existingPlan, brainId, geminiModel, temperature } = req.body;
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.status(500).json({ message: "API key is not configured on the server." });
    }

    const geminiParts = [
      { text: SYSTEM_PROMPT }
    ];

    // Add brain-specific instructions if a valid brainId is provided
    if (brainId && BRAIN_PROMPTS[brainId]) {
        geminiParts.push({ text: BRAIN_PROMPTS[brainId] });
    }

    geminiParts.push(
      { text: `Base 3D Model: ${JSON.stringify(modelJson, null, 2)}` },
      { text: `List of Damages to Address: ${JSON.stringify(damageJson, null, 2)}` },
      { text: `Existing Plan (modify this if not null): ${JSON.stringify(existingPlan, null, 2)}` },
      { text: `User's Instructions: "${userPrompt || 'No specific instructions provided.'}"` }
    );
    
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