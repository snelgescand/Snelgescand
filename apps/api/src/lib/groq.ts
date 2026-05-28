/**
 * Groq AI-client op basis van native fetch (OpenAI-compatibele API).
 *
 * Groq draait open Llama-modellen razendsnel. We gebruiken:
 *   - meta-llama/llama-4-scout-17b-16e-instruct → vision + tekst, JSON-mode,
 *     tot 5 images (max 4MB). Geschikt voor zowel foto's als tekst-parsing.
 *
 * De API-key staat in env-var GROQ_API_KEY en wordt ALLEEN server-side gebruikt.
 *
 * BELANGRIJK: Groq leest GEEN PDF binär. PDF's moeten eerst naar tekst worden
 * geëxtraheerd (zie schema-import route, via unpdf). Groq ondersteunt wél
 * afbeeldingen (image_url met data-URI) en platte tekst.
 *
 * Abstractie: dit is een OpenAI-compatibele chat/completions-aanroep. Wil je
 * later naar een andere provider (Anthropic, OpenAI, Bedrock), dan pas je
 * alleen `callAi` aan — de aanroepende code blijft gelijk.
 */

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
/** Vision + tekst model. Scout is niet gedeprecate (Maverick wél, feb 2026). */
const MODEL = 'meta-llama/llama-4-scout-17b-16e-instruct';

/**
 * OpenAI-stijl message-content: tekst en/of afbeeldingen.
 * Voor afbeeldingen gebruikt Groq een data-URI: data:image/jpeg;base64,<data>
 */
export type AiContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

export interface CallAiOptions {
  system?: string;
  /** User-message content: string (alleen tekst) of array (tekst + images). */
  content: string | AiContentPart[];
  maxTokens?: number;
  /** Forceer geldige JSON-output (Groq JSON-mode). Vereist 'json' in de prompt. */
  jsonMode?: boolean;
}

export class AiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/**
 * Roept Groq aan en geeft de tekst-output van het model terug.
 * Gooit AiError bij problemen (geen key, API-fout, timeout).
 */
export async function callAi(opts: CallAiOptions): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new AiError(500, 'GROQ_API_KEY is niet ingesteld op de server. Voeg deze toe in de Render environment-variabelen.');
  }

  const messages: Array<{ role: string; content: unknown }> = [];
  if (opts.system) messages.push({ role: 'system', content: opts.system });
  messages.push({ role: 'user', content: opts.content });

  const body: Record<string, unknown> = {
    model: MODEL,
    messages,
    max_tokens: opts.maxTokens ?? 4096,
    temperature: 0.2, // laag — we willen feitelijke extractie, geen creativiteit
  };
  if (opts.jsonMode) {
    body.response_format = { type: 'json_object' };
  }

  let res: Response;
  try {
    res = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60_000),
    });
  } catch (err) {
    throw new AiError(502, `Kon Groq API niet bereiken: ${err instanceof Error ? err.message : String(err)}`);
  }

  if (!res.ok) {
    let detail = `${res.status} ${res.statusText}`;
    try {
      const errBody = await res.json() as { error?: { message?: string } };
      if (errBody?.error?.message) detail = errBody.error.message;
    } catch { /* ignore */ }
    // 413 = payload te groot (image > 4MB)
    if (res.status === 413) detail = 'Het bestand is te groot voor de AI (max ~4MB voor afbeeldingen). Maak een kleinere scan/foto.';
    throw new AiError(res.status, `Groq API-fout: ${detail}`);
  }

  const data = await res.json() as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const tekst = data.choices?.[0]?.message?.content?.trim();
  if (!tekst) {
    throw new AiError(502, 'Groq gaf een lege respons terug.');
  }
  return tekst;
}

/**
 * Haalt een JSON-object/array uit de AI-respons. Strip eventuele markdown-fences
 * en pak het eerste { ... } of [ ... ] blok. Werkt ook als JSON-mode al schone
 * JSON gaf.
 */
export function parseAiJson<T = unknown>(tekst: string): T {
  let schoon = tekst.trim();
  schoon = schoon.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  const objMatch = schoon.match(/\{[\s\S]*\}/);
  const arrMatch = schoon.match(/\[[\s\S]*\]/);
  // Bij JSON-mode komt een object terug; pak object eerst, anders array
  const kandidaat = objMatch?.[0] ?? arrMatch?.[0] ?? schoon;
  return JSON.parse(kandidaat) as T;
}
