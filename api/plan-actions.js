// In file: /api/plan-actions.js

export const maxDuration = 120; // Set timeout to 120 seconds

const SYSTEM_PROMPT = `
You are R.O.L.F. (Repair Option Layout Finder), an expert AI that creates structured, step-by-step repair plans for physical objects.

**Your Task:**
Based on the provided assembly, damages, an optional repair philosophy ('Brain'), and any user instructions, you will generate or modify a repair plan.

**Input You Will Receive:**
1.  **modelJson**: A JSON object describing the object's parts and their connections.
2.  **damageJson**: A JSON array listing all documented damages.
3.  **brain**: An optional object describing a guiding philosophy for the repair.
4.  **userPrompt**: A text prompt from the user for generating or modifying the plan.
5.  **existingPlan**: A previously generated plan JSON. If present, the user is requesting a modification.

**Core Logic:**
1.  **Analyze Context:** Deeply understand the object's structure and the documented damages.
2.  **Formulate Strategy:** 
    - If a 'brain' philosophy is provided, your plan MUST strictly adhere to its core tenets. This is the top priority.
    - If no 'brain' is provided, you MUST generate a standard, logical, and straightforward repair plan based on common best practices. Keep it simple and effective.
3.  **Handle User Modifications:** If an \`existingPlan\` and \`userPrompt\` are provided, modify the plan accordingly (e.g., remove a step, suggest an alternative).
4.  **Produce JSON Output:** Your response MUST be a single, raw JSON object. Do NOT use markdown (like \`\`\`json) or any other text.

**Output JSON Schema:**
The root must be an object with one key: "steps". "steps" must be an array of step objects. Each step object MUST have:
-   **"step_number" (number):** Sequential order (1, 2, 3...).
-   **"title" (string):** A short, clear title (e.g., "Stabilize the Crack").
-   **"description" (string):** A detailed explanation of the action.
-   **"tools_required" (array of strings):** Tools needed for this step.
-   **"affected_parts" (array of strings):** Part 'id's from \`modelJson\` involved in this step.
-   **"affected_damages" (array of strings):** Damage 'id's from \`damageJson\` addressed by this step.
`;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  try {
    const { modelJson, damageJson, brain, userPrompt, existingPlan } = req.body;
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.status(500).json({ message: "API key is not configured." });
    }
    if (!modelJson || !damageJson) {
      return res.status(400).json({ message: "Missing model and damage data." });
    }

    const geminiParts = [
      { text: SYSTEM_PROMPT },
      { text: `Assembly Geometry: ${JSON.stringify(modelJson, null, 2)}` },
      { text: `Cataloged Damages: ${JSON.stringify(damageJson, null, 2)}` },
    ];
    
    if (brain) {
        geminiParts.push({ text: `Chosen Repair Philosophy (Brain): Name: "${brain.name}". This is the primary guide for the repair.` });
    }
    if (existingPlan) {
        geminiParts.push({ text: `Existing Repair Plan (to be modified): ${JSON.stringify(existingPlan, null, 2)}` });
    }
    
    // Determine the final instruction for the AI
    let instruction = userPrompt || (existingPlan ? "Modify the plan as requested." : (brain ? `Generate a new plan based on the chosen brain: ${brain.name}.` : "Generate a new, standard repair plan."));
    geminiParts.push({ text: `User Instruction: "${instruction}"` });

    const googleApiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
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
    if (!googleData.candidates || googleData.candidates.length === 0) {
        const feedback = googleData.promptFeedback || {};
        throw new Error(`Generation failed. Reason: ${feedback.blockReason || 'Empty response'}. Details: ${JSON.stringify(feedback.safetyRatings)}`);
    }
    
    res.status(200).json(googleData);

  } catch (error) {
    console.error('Error in /api/plan-actions handler:', error);
    res.status(500).json({ message: 'An error occurred on the server.', error: error.message });
  }
}