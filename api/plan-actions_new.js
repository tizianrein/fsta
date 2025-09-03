// File: /api/plan-actions_new.js

export const maxDuration = 120;

const SYSTEM_PROMPT = `
You are an expert AI assistant specializing in creating repair plans for 3D objects.
Your primary task is to generate a step-by-step repair plan based on a 3D model's assembly data, a list of damages, and user instructions.

**CRITICAL OUTPUT REQUIREMENTS:**
1.  Your entire output **MUST BE a single, raw JSON object**.
2.  Do NOT use any markdown formatting like \`\`\`json. Your response must start with \`{\` and end with \`}\`.
3.  Do NOT include any explanatory text, greetings, or apologies before or after the JSON content.

**PLAN GENERATION LOGIC & DEPENDENCY MODELING:**
- **Model as a Graph:** You must model the repair as a network of dependent tasks (a Directed Acyclic Graph). Your final output will be a list of step objects that collectively define this graph.
- **Identify Atomic Tasks:** Break down the entire repair into the smallest possible, logical actions.
- **Determine Dependencies:** For each task, identify which other tasks MUST be completed before it can begin.
- **Recognize Parallel Paths:** Correctly identify tasks that can be done in parallel. For example, repairing a cracked leg and treating a dent in the backrest can happen independently after disassembly. Their 'prerequisites' would be the same disassembly step, but they would not be prerequisites for each other.
- **Final Output:** Your final JSON must represent this graph structure as a flat list of step objects.

**TASK DECOMPOSITION:**
- **Decompose Complex Actions:** Your primary goal is to break down the repair process into the smallest possible, logical actions.
- **More Steps are Better:** Always favor creating more, simpler steps over fewer, complicated ones. For example, instead of one step for "Remove the back panel," create separate steps for "Unscrew the four corner screws," "Gently pry open the left seam," and "Lift the panel away."
- **Sequential and Logical:** The overall flow defined by the prerequisites must be logical and safe.

**JSON OUTPUT SCHEMA:**
The root object must contain a single key: "steps". Each step object MUST have the following structure:
- "step_id" (string): A unique, descriptive, machine-readable ID in snake_case (e.g., "sand_surface", "apply_first_coat").
- "title" (string): A short, action-focused title with a MAXIMUM of four words.
- "description" (string): A precise, rich, and highly detailed explanation of the action.
- "tools_required" (array of strings): Tools or materials for this specific step.
- "affected_parts" (array of strings): Part 'id's from modelJson directly manipulated in this step.
- "affected_damages" (array of strings): Damage 'id's from damageJson addressed in this step.
- "prerequisites" (array of strings): An array of 'step_id's for all steps that MUST be completed before this step can begin. The first step(s) in the plan will have an empty prerequisites array \`[]\`. This structure defines the dependency graph.
`;

const BRAIN_PROMPTS = {
    "janitors-cookbook": "REPAIR PHILOSOPHY: Expedience and durability. Fix failures quickly, cheaply, and robustly using pragmatic techniques like clamping or welding. Abandon weak elements. The result is resilient and repeatable, like industrial maintenance.",
    "long-term-thinker": "REPAIR PHILOSOPHY: Temporal model of shearing layers. Repair is a systemic intervention in time, preparing for future failures. Design for reversibility, modularity, and access to preserve long-term adaptability.",
    "readymade-brain": "REPAIR PHILOSOPHY: Repair as an act of selection and re-contextualization. Use a commonplace industrial object already in circulation as the solution. The value is in the wit, irony, and clever re-appropriation of the chosen 'readymade'.",
    "anarchitect": "REPAIR PHILOSOPHY: Repair through subtraction, not addition. Cut away or destabilize material to expose hidden structures and create new perceptions. Transform the object into a state of critical tension, revealing fragility and voids, even at the cost of functionality.",
    "purist": "REPAIR PHILOSOPHY: The passage of time is sacred. Interventions are limited to stabilization—no replacement or beautification. Every repair must be scrupulously honest, distinct from the original, and legible. Scars are celebrated as evidence of authenticity.",
    "gentle-craftsman": "REPAIR PHILOSOPHY: Conservative repair (SPAB philosophy). Use modest, careful acts to patch and mend. Retain as much original material as possible with traditional skills and sympathetic materials. The goal is continuous maintenance ('stave off decay by daily care') to preserve continuity and patina.",
    "jeweler-of-joints": "REPAIR PHILOSOPHY: Elevate repair to an art form. The joint between old and new is not hidden but celebrated as a crafted, ornamental detail. The fix is a jewel-like connection that emphasizes contrast, precision, and eloquence, creating an exquisite hinge between times.",
    "urbanist": "REPAIR PHILOSOPHY: Expand repair to include social and urban consequences. Judge an intervention by how it fosters human-scale vitality, safety, and community interaction. Prioritize civic action and the ecosystem around the object over merely restoring function.",
    "preservation-scientist": "REPAIR PHILOSOPHY: Ground decisions in scientific evidence and predictive modeling. Repair is a technical process of risk assessment, material analysis, and system optimization. Solutions are chosen for demonstrable performance and durability based on precise, measured data.",
    "stylistic-idealist": "REPAIR PHILOSOPHY: Repair as completion, not conservation. Realize a perfected stylistic whole, rather than preserving decay. Reconstruct, supplement, or invent missing parts to create an idealized state that may have never existed. Authenticity lies in stylistic unity, not original fabric."
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