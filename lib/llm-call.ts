// Shared LLM JSON call supporting OpenAI-compatible chat endpoints and the
// native Google Gemini generateContent API (required for inline base64 images).
export async function llmJsonCall(input: { baseUrl: string; apiKey: string; model: string; system: string; userText: string; images?: string[]; temperature: number; timeoutMs: number; signal?: AbortSignal }): Promise<{ text: string; inputTokens: number; outputTokens: number }> {
  const base = input.baseUrl.replace(/\/$/, "");
  const isGemini = /generativelanguage\.googleapis\.com/i.test(base);
  const signal = input.signal ? AbortSignal.any([input.signal, AbortSignal.timeout(input.timeoutMs)]) : AbortSignal.timeout(input.timeoutMs);
  let response: Response;
  if (isGemini) {
    const model = input.model.replace(/^models\//, "");
    const parts: Array<Record<string, unknown>> = [{ text: input.userText }];
    for (const image of input.images ?? []) {
      const match = /^data:([^;]+);base64,(.+)$/s.exec(image);
      if (match) parts.push({ inline_data: { mime_type: match[1], data: match[2] } });
    }
    response = await fetch(`${base.replace(/\/v1beta\/openai$/, "")}/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "x-goog-api-key": input.apiKey, "content-type": "application/json" },
      signal,
      body: JSON.stringify({
        contents: [{ role: "user", parts }],
        systemInstruction: { parts: [{ text: input.system }] },
        generationConfig: { temperature: input.temperature, responseMimeType: "application/json" },
      }),
    });
    if (!response.ok) throw new Error(`LLM returned HTTP ${response.status}`);
    const payload = await response.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>; usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number } };
    const text = (payload.candidates?.[0]?.content?.parts ?? []).map((part) => part.text ?? "").join("");
    if (!text) throw new Error("No structured response was returned.");
    return { text, inputTokens: payload.usageMetadata?.promptTokenCount ?? 0, outputTokens: payload.usageMetadata?.candidatesTokenCount ?? 0 };
  }
  response = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: { authorization: `Bearer ${input.apiKey}`, "content-type": "application/json" },
    signal,
    body: JSON.stringify({ model: input.model, temperature: input.temperature, response_format: { type: "json_object" }, messages: [
      { role: "system", content: input.system },
      { role: "user", content: [{ type: "text", text: input.userText }, ...(input.images ?? []).map((image) => ({ type: "image_url", image_url: { url: image, detail: "low" } }))] }],
    }),
  });
  if (!response.ok) throw new Error(`LLM returned HTTP ${response.status}`);
  const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }>; usage?: { prompt_tokens?: number; completion_tokens?: number } };
  const text = payload.choices?.[0]?.message?.content;
  if (!text) throw new Error("No structured response was returned.");
  return { text, inputTokens: payload.usage?.prompt_tokens ?? 0, outputTokens: payload.usage?.completion_tokens ?? 0 };
}
