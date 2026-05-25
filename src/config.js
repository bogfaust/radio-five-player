// Единый конфиг расширения — менять только здесь

export const STREAM_URL     = 'https://radiofive.org/radio.mp3';
export const API_BASE       = 'https://radiofive.ru';
export const STREAM_DELAY   = 16;   // секунды, буферная задержка потока

export function resolveStreamUrl(stored) {
  if (!stored) return STREAM_URL;
  return stored;
}
