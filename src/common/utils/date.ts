// src/common/utils/date.ts
const LOCALE = 'es-CO';
export const DEFAULT_TIME_ZONE = 'America/Bogota'; // cámbiala por la zona horaria de tu negocio

// Convierte espacios especiales (no separables, estrechos) en espacios normales
const normalizeSpaces = (s: string) => s.replace(/\s+/g, ' ').trim();

export function formatDateEs(
  date: Date,
  timeZone: string = DEFAULT_TIME_ZONE,
): string {
  const day = new Intl.DateTimeFormat(LOCALE, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone,
  }).format(date);

  const time = new Intl.DateTimeFormat(LOCALE, {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone,
  }).format(date);

  // "a la 1:00 p. m." vs "a las 3:30 p. m."
  const hour24 = Number(
    new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit',
      hourCycle: 'h23',
      timeZone,
    }).format(date),
  );
  const article = hour24 % 12 === 1 ? 'a la' : 'a las';

  return normalizeSpaces(`${day} ${article} ${time}`);
}
