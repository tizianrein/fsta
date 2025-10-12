/**
 * /api/guide-repair_new
 * Next.js or Vercel serverless style handler
 * Expects JSON body: { question: string, stepContext: object, systemPrompt?: string }
 *
 * Env:
 *   GEMINI_API_KEY = your Google Generative Language API key
 *
 * Response 200:
 *   { answer: string, raw: object }
 */

export default async function handler(req, res) {
  try {
    // Only allow POST
    if (req.method !== 'POST') {
      return res.status(405).json({ message: 'Method not allowed. Use POST.' });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ message: 'Server misconfigured. Missing GEMINI_API_KEY.' });
    }

    // Parse input
    const { question, stepContext, systemPrompt } = safeJson(req.body);

    if (!question || typeof question !== 'string') {
      return res.status(400).json({ message: 'Missing or invalid "question".' });
    }

    // Optional system prompt
    const SYSTEM_PROMPT =
      typeof systemPrompt === 'string' && systemPrompt.trim()
        ? systemPrompt.trim()
        : [
            'You are H.E.L.G.A., a helpful repair guide for architectural and furniture repair.',
            'Answer clearly and concisely.',
            'Stay on topic. If information is missing, state the assumption and continue.',
          ].join('\n');

    // Build request body for Gemini
    const body = {
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [
        {
          role: 'user',
          parts: [
            {
              text:
                'Current Repair Step Context:\n' +
                pretty(stepContext ?? {}, 2),
            },
            { text: 'User Question:\n' + question },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.6,
        maxOutputTokens: 350,
        responseMimeType: 'text/plain',
      },
      safetySettings: [
        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' },
        { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_ONLY_HIGH' },
        { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_ONLY_HIGH' },
        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_ONLY_HIGH' },
      ],
    };

    const url =
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=' +
      encodeURIComponent(apiKey);

    const googleResponse = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    // Pass through non OK responses with payload for debugging
    if (!googleResponse.ok) {
      let payload;
      try {
        payload = await googleResponse.json();
      } catch {
        payload = { error: await googleResponse.text() };
      }
      console.error('Google API Error:', payload);
      return res.status(googleResponse.status).json(payload);
    }

    // OK branch
    const googleData = await googleResponse.json();

    // If blocked or empty candidates, surface clear message
    if (!googleData.candidates || googleData.candidates.length === 0) {
      const pf = googleData.promptFeedback;
      if (pf?.blockReason) {
        return res.status(400).json({
          message:
            'AI blocked the request for policy reasons. Reason: ' +
            pf.blockReason +
            '. Try rephrasing your question or remove sensitive terms.',
          details: pf,
          raw: googleData,
        });
      }
      console.error('No candidates in response:', googleData);
      return res.status(500).json({
        message: 'AI returned no candidates.',
        raw: googleData,
      });
    }

    // Robust text extraction across shapes
    const first = googleData.candidates[0];
    let helgaText = '';

    // Standard content parts shape
    if (first.content?.parts && Array.isArray(first.content.parts)) {
      helgaText = first.content.parts
        .map((p) => (typeof p.text === 'string' ? p.text : ''))
        .filter(Boolean)
        .join('\n')
        .trim();
    }

    // Some SDKs return top level text
    if (!helgaText && typeof first.text === 'string') {
      helgaText = first.text.trim();
    }

    // Fallback to finishMessage if present
    if (!helgaText && typeof googleData.output_text === 'string') {
      helgaText = googleData.output_text.trim();
    }

    if (!helgaText) {
      console.error('Unexpected Gemini response shape:', googleData);
      return res.status(500).json({
        message: 'Failed to extract a valid response from the AI.',
        raw: googleData,
      });
    }

    // Return both extracted text and full raw payload for frontend debugging
    return res.status(200).json({ answer: helgaText, raw: googleData });
  } catch (err) {
    console.error('Server Error:', err);
    return res.status(500).json({ message: 'Server error in guide-repair_new.', error: stringifyErr(err) });
  }
}

/* ---------------- Helpers ---------------- */

function safeJson(body) {
  if (typeof body === 'object' && body !== null) return body;
  try {
    return JSON.parse(body);
  } catch {
    return {};
  }
}

function pretty(obj, spaces = 2) {
  try {
    return JSON.stringify(obj, null, spaces);
  } catch {
    return String(obj);
  }
}

function stringifyErr(err) {
  try {
    if (err && typeof err === 'object') {
      const plain = {
        name: err.name,
        message: err.message,
        stack: err.stack,
      };
      return JSON.stringify(plain, null, 2);
    }
    return String(err);
  } catch {
    return 'Unknown error';
  }
}
