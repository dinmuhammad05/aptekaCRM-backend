/** Sana yordamchilari — hisobotlar va obuna muddati uchun umumiy */

/** Kun boshi (00:00:00.000), mahalliy vaqt bo'yicha */
export function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Kun oxiri (23:59:59.999), mahalliy vaqt bo'yicha */
export function endOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

/**
 * Sanaga `months` oy qo'shadi, oy oxiri kunlarini to'g'ri qisqartiradi.
 * JS `setMonth` oyni "to'lib ketganda" keyingi oyga o'tkazib yuboradi
 * (mas: 31-yanvar + 1 oy → 3-mart); bu yordamchi kunni oy uzunligiga
 * moslab cheklaydi (31-yanvar + 1 oy → 28/29-fevral).
 */
export function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + months);
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, lastDay));
  return d;
}
