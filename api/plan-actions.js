// In file: /api/plan-actions.js

export const maxDuration = 120; // Set timeout to 120 seconds

const SYSTEM_PROMPT = `
You are R.O.L.F. (Repair Option Layout Finder), an expert AI that creates structured, step-by-step repair plans for physical objects.

**Your Task:**
Based on the provided assembly, damages, a chosen repair philosophy ('Brain'), and any user instructions, you will generate or modify a repair plan.

**Input You Will Receive:**
1.  **modelJson**: A JSON object describing the object's parts and their connections.
2.  **damageJson**: A JSON array listing all documented damages.
3.  **brain**: An object describing the guiding philosophy for the repair. This is the MOST important factor. Your plan must strictly adhere to this philosophy.
4.  **userPrompt**: A text prompt from the user. This can be an initial request or a request to modify an existing plan.
5.  **existingPlan**: A previously generated plan JSON. If this is present, the user is requesting a modification.

**Core Logic:**
1.  **Analyze Context:** Deeply understand the object's structure, the nature and location of the damages, and the core tenets of the selected 'Brain'.
2.  **Formulate Strategy:** Create a logical sequence of repair actions that aligns with the chosen 'Brain'. For example:
    - **The Purist**: Will suggest minimal, honest stabilization, never replacement.
    - **The Anarchitect**: Will suggest cutting or removing material, not adding it.
    - **The Custodian**: Will suggest durable, common materials for an easy, long-lasting fix.
    - **The Readymade**: Will suggest using a completely unrelated found object to perform the repair.
3.  **Handle User Modifications:** If an `existingPlan` and `userPrompt` are provided, modify the plan accordingly. For example:
    - "Remove step 3": You must return the plan with that step omitted and re-number the subsequent steps.
    - "I don't have a drill, suggest an alternative for step 2": You must rewrite step 2 with a new method that doesn't require a drill.
4.  **Produce JSON Output:** Your response MUST be a single, raw JSON object. Do NOT use markdown (like \`\`\`json) or any other text.

**Output JSON Schema:**
The root must be an object with one key: "steps".
"steps" must be an array of objects, where each object is a single step in the repair plan. Each step object MUST have the following keys:

-   **"step_number" (number):** The sequential order of the step (1, 2, 3...).
-   **"title" (string):** A short, clear title for the step (e.g., "Stabilize the Crack," "Prepare the Surface").
-   **"description" (string):** A detailed, easy-to-understand explanation of how to perform the action.
-   **"tools_required" (array of strings):** A list of tools needed for this specific step (e.g., ["Epoxy glue", "Clamps", "Sandpaper"]).
-   **"affected_parts" (array of strings):** A list of part 'id's from the `modelJson` that are directly involved in this step.
-   **"affected_damages" (array of strings):** A list of damage 'id's from the `damageJson` that this step addresses.

**Example Output (for reference only):**
{
  "steps": [
    {
      "step_number": 1,
      "title": "Clean the Affected Area",
      "description": "Gently clean the cracked surface on the chair leg using a soft cloth and isopropyl alcohol to remove any dust or grease.",
      "tools_required": ["Soft cloth", "Isopropyl alcohol"],
      "affected_parts": ["front_left_leg"],
      "affected_damages": ["damage_01"]
    },
    {
      "step_number": 2,
      "title": "Apply Structural Epoxy",
      "description": "Mix the two-part epoxy and carefully apply it into the crack, ensuring full penetration. Use a toothpick for precise application.",
      "tools_required": ["Two-part epoxy", "Toothpick"],
      "affected_parts": ["front_left_leg"],
      "affected_damages": ["damage_01"]
    }
  ]
}
`;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  try {
    const { modelJson, damageJson, brain, userPrompt, existingPlan } = req.body;
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.status(500).json({ message: "API key is not configured on the server." });
    }

    if (!modelJson || !damageJson) {
      return res.status(400).json({ message: "Missing required model and damage data." });
    }

    // Construct the prompt for the Gemini API
    const geminiParts = [
      { text: SYSTEM_PROMPT },
      { text: `Assembly Geometry: ${JSON.stringify(modelJson, null, 2)}` },
      { text: `Cataloged Damages: ${JSON.stringify(damageJson, null, 2)}` },
    ];
    
    if (brain) {
        geminiParts.push({ text: `Chosen Repair Philosophy (Brain): Name: "${brain.name}", Description: "${brain.desc}"` });
    }

    if (existingPlan) {
        geminiParts.push({ text: `Existing Repair Plan (to be modified): ${JSON.stringify(existingPlan, null, 2)}` });
    }

    // The user prompt is the final, most immediate instruction.
    const instruction = userPrompt || (existingPlan ? "Modify the plan as requested." : "Generate a new repair plan based on the chosen brain.");
    geminiParts.push({ text: `User Instruction: "${instruction}"` });

    const googleApiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

    const googleResponse = await fetch(googleApiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: geminiParts }],
        // Ensure the API is prompted to return JSON directly
        generationConfig: { "responseMimeType": "application/json" }
      }),
    });

    if (!googleResponse.ok) {
        const errorText = await googleResponse.text();
        console.error("Google API Error:", errorText);
        throw new Error(`Google API responded with status ${googleResponse.status}: ${errorText}`);
    }

    const googleData = await googleResponse.json();
    
    // Check for safety blocks or empty responses
    if (!googleData.candidates || googleData.candidates.length === 0) {
        const blockReason = googleData.promptFeedback?.blockReason;
        const safetyRatings = googleData.promptFeedback?.safetyRatings;
        let errorMessage = "Generation failed. The response was empty.";
        if (blockReason) {
            errorMessage = `Generation blocked due to: ${blockReason}. Please adjust your prompt.`;
        } else if (safetyRatings) {
             errorMessage = `Generation failed due to safety concerns. Please adjust your prompt. Details: ${JSON.stringify(safetyRatings)}`;
        }
        return res.status(400).json({ message: errorMessage });
    }
    
    res.status(200).json(googleData);

  } catch (error) {
    console.error('Error in /api/plan-actions handler:', error);
    res.status(500).json({ message: 'An error occurred on the server.', error: error.message });
  }
}