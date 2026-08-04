export const CYRILLIC_TO_LATIN: Record<string, string> = {
  'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'yo', 'ж': 'j', 'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm', 'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u', 'ф': 'f', 'х': 'x', 'ц': 'ts', 'ч': 'ch', 'ш': 'sh', 'щ': 'sh', 'ъ': '', 'ы': 'i', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya'
};

export const LATIN_TO_CYRILLIC: Record<string, string> = {
  'yo': 'ё', 'zh': 'ж', 'ch': 'ч', 'sh': 'ш', 'yu': 'ю', 'ya': 'я', 'ts': 'ц', 'o\'': 'ў', 'g\'': 'ғ',
  'a': 'а', 'b': 'б', 'v': 'в', 'g': 'г', 'd': 'д', 'e': 'е', 'j': 'ж', 'z': 'з', 'i': 'и', 'y': 'й', 'k': 'к', 'l': 'л', 'm': 'м', 'n': 'н', 'o': 'о', 'p': 'п', 'r': 'р', 's': 'с', 't': 'т', 'u': 'у', 'f': 'ф', 'x': 'х', 'c': 'ц', 'h': 'х', 'q': 'к', 'w': 'в'
};

export function transliterate(text: string): { original: string; variants: string[] } {
  if (!text) return { original: '', variants: [] };
  const lower = text.toLowerCase();
  const isCyrillic = /[а-яё]/i.test(lower);
  let converted = lower;
  if (isCyrillic) {
    converted = lower.split('').map(char => CYRILLIC_TO_LATIN[char] || char).join('');
  } else {
    converted = lower
      .replace(/yo|zh|ch|sh|yu|ya|ts|o\'|g\'/g, match => LATIN_TO_CYRILLIC[match])
      .split('')
      .map(char => LATIN_TO_CYRILLIC[char] || char)
      .join('');
  }
  return { original: lower, variants: converted !== lower ? [converted] : [] };
}

export function buildSearchConditions(search: string): any[] {
  const { original, variants } = transliterate(search);
  const conditions: any[] = [
    { name: { contains: original, mode: 'insensitive' } },
    { barcode: { contains: original } }
  ];
  variants.forEach(v => {
    conditions.push({ name: { contains: v, mode: 'insensitive' } });
  });
  return conditions;
}
