import figlet from "figlet/browser";
import standard from "figlet/fonts/Standard";
import slant from "figlet/fonts/Slant";
import small from "figlet/fonts/Small";
import pluralize from "pluralize";
import lunar from "lunar-javascript";
figlet.parseFont("Standard", standard);
figlet.parseFont("Slant", slant);
figlet.parseFont("Small", small);
export function banner(text, font = "Standard", width = 80, align = "left") {
  width = Number(width);
  if (!Number.isInteger(width) || width < 20 || width > 200 || !['left','center','right'].includes(align))
    throw new Error("Invalid banner width or alignment");
  if (text.length > 200 || !/^[\x20-\x7e\r\n]*$/.test(text))
    throw new Error("Use up to 200 ASCII characters");
  if (!["Standard", "Slant", "Small"].includes(font))
    throw new Error("Invalid font");
  const result = figlet.textSync(text, {
    font,
    width: Math.max(20, Math.min(200, Number(width))),
    whitespaceBreak: true,
  });
  return result
    .split("\n")
    .map((line) =>
      align === "right"
        ? line.padStart(Number(width))
        : align === "center"
          ? " ".repeat(
              Math.max(0, Math.floor((Number(width) - line.length) / 2)),
            ) + line
          : line,
    )
    .join("\n");
}
export function englishNouns(text, singular = false) {
  return text.replace(/\b[A-Za-z]+\b/g, (word) =>
    singular ? pluralize.singular(word) : pluralize.plural(word),
  );
}
export function lunarConvert({
  solarDate,
  year,
  month,
  day,
  leap = false,
  direction = "solar",
}) {
  let result;
  if (direction === "solar") {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(solarDate))
      throw new Error("Use YYYY-MM-DD");
    const [y, m, d] = solarDate.split("-").map(Number);
    if (
      y < 1900 ||
      y > 2100 ||
      new Date(Date.UTC(y, m - 1, d)).toISOString().slice(0, 10) !== solarDate
    )
      throw new Error("Supported years: 1900–2100");
    result = lunar.Solar.fromYmd(y, m, d).getLunar();
  } else {
    if (
      !Number.isInteger(year) ||
      year < 1900 ||
      year > 2100 ||
      !Number.isInteger(month) ||
      month < 1 ||
      month > 12 ||
      !Number.isInteger(day) ||
      day < 1 ||
      day > 30
    )
      throw new Error("Invalid lunar date");
    result = lunar.Lunar.fromYmd(year, leap ? -month : month, day);
    const round = result.getSolar().getLunar();
    if (
      round.getYear() !== year ||
      round.getMonth() !== (leap ? -month : month) ||
      round.getDay() !== day
    )
      throw new Error("Invalid lunar date");
  }
  return {
    solar: result.getSolar().toYmd(),
    lunarYear: result.getYear(),
    lunarMonth: Math.abs(result.getMonth()),
    leapMonth: result.getMonth() < 0,
    lunarDay: result.getDay(),
    description: result.toString(),
  };
}
