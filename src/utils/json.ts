/**
 * As instruções do prompt pedem "sem markdown", mas o modelo às vezes
 * devolve a resposta envolta em ```json ... ``` mesmo assim. Em vez de
 * gastar uma tentativa de retry inteira (chamada de API) toda vez que isso
 * acontece, removemos a cerca de markdown antes de tentar o JSON.parse.
 */
export function extractJsonPayload(texto: string): string {
  const trimmed = texto.trim();
  const match = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return match ? match[1] : trimmed;
}
