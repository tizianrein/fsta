export const maxDuration = 120;

const SYSTEM_PROMPT = `
You are an expert AI assistant specializing in creating repair plans for 3D objects and assemblies.
Your output MUST be a single raw JSON object with one top level key called "steps".
Do not use markdown.

You are given:
1. modelJson
2. damageJson
3. repairIntent with axes, summary, and constraints
4. userPrompt
5. optionally an existing plan for replanning

Planning rules:
- Represent the workflow as a directed acyclic graph.
- Break the repair down into logical, precise, actionable steps.
- Every step must have:
  step_id, title, description, rationale, tools_required, affected_parts, affected_damages, prerequisites.
- Titles must be short, maximum four words.
- Prefer grouped and efficient steps where appropriate.
- Exclude initial inspection and documentation steps.
- Start with preparation steps when needed.
- Allow parallel branches only when truly independent.
- Use the repairIntent as the primary steering input.

Interpret repairIntent this way:
- The axes define the value hierarchy.
- The summary explains the intended repair character.
- The constraints are hard limits or preferences.
- Only use tools and operations that are allowed by the constraints unless the user explicitly requests otherwise.
- If time or budget are tight, simplify the plan accordingly.
- If reversibility, authenticity, or craft continuity are emphasized, adapt the rationale and step choices accordingly.

Return only JSON.
`;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method Not Allowed' });

  try {
    const { modelJson, damageJson, repairIntent, userPrompt, existingPlan, geminiModel, temperature } = req.body;
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return res.status(500).json({ message: 'API key is not configured on the server.' });

    const parts = [
      { text: SYSTEM_PROMPT },
      { text: `modelJson:\n${JSON.stringify(modelJson, null, 2)}` },
      { text: `damageJson:\n${JSON.stringify(damageJson, null, 2)}` },
      { text: `repairIntent:\n${JSON.stringify(repairIntent, null, 2)}` },
      { text: `userPrompt:\n${JSON.stringify(userPrompt || '', null, 2)}` },
    ];

    if (existingPlan) parts.push({ text: `existingPlan for replanning:\n${JSON.stringify(existingPlan, null, 2)}` });

    const model = geminiModel || 'gemini-2.5-pro';
    const temp = temperature ?? 0.45;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const googleResponse = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: {
          temperature: temp,
          responseMimeType: 'application/json',
        }
      })
    });

    if (!googleResponse.ok) {
      const errorText = await googleResponse.text();
      throw new Error(`Google API Error: ${errorText}`);
    }

    const data = await googleResponse.json();
    res.status(200).json(data);
  } catch (error) {
    console.error('Error in /api/repair-plan handler:', error);
    res.status(500).json({ message: 'An error occurred on the server.', error: error.message });
  }
}
