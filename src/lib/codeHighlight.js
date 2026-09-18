const MAX_HIGHLIGHT = 200_000;

const SQL_KEYWORDS = new Set(
  `
  add all alter and any as asc begin between by case cast check close
  cluster column commit constraint create cross current database date
  datetime decimal declare default delete desc distinct drop else end
  except exists explain false fetch first for foreign from full function
  grant group having if ilike in index inner insert intersect into is
  join key last left like limit loop match max min minus natural not
  null of offset on only or order outer over partition primary procedure
  references recursive right rollback row rows schema select set similar
  some table then to true truncate union unique update using values view
  when where window with without
  bigint binary blob bool boolean char character clob double float int
  integer nchar nvarchar number numeric real smallint text time timestamp
  varchar
  `
    .trim()
    .split(/\s+/),
);

const CSS_KEYWORDS = new Set([
  "and", "auto", "block", "bold", "border-box", "both", "bottom", "center",
  "content-box", "currentcolor", "dashed", "dotted", "fixed", "flex", "from",
  "grid", "hidden", "important", "inherit", "initial", "inline", "italic",
  "left", "none", "normal", "not", "nowrap", "only", "or", "relative",
  "repeat", "revert", "right", "solid", "sticky", "to", "top", "transparent",
  "unset", "visible", "wrap",
]);

function push(tokens, src, type, start, end) {
  if (end > start) tokens.push({ type, text: src.slice(start, end) });
}

function isWs(ch) {
  return ch === " " || ch === "\t" || ch === "\n" || ch === "\r";
}

function isDigit(ch) {
  return ch >= "0" && ch <= "9";
}

function isIdentStart(ch) {
  return (ch >= "A" && ch <= "Z") || (ch >= "a" && ch <= "z") || ch === "_" || ch === "$";
}

function isIdentChar(ch) {
  return isIdentStart(ch) || isDigit(ch) || ch === "-";
}

function readQuoted(src, i, tokens, type = "string") {
  const n = src.length;
  const q = src[i];
  const start = i;
  i += 1;
  while (i < n) {
    const ch = src[i];
    if (ch === "\\") {
      i += i + 1 < n ? 2 : 1;
      continue;
    }
    if (ch === q) {
      if (src[i + 1] === q) {
        i += 2;
        continue;
      }
      i += 1;
      break;
    }
    i += 1;
  }
  push(tokens, src, type, start, i);
  return i;
}

function tokenizeSql(src) {
  const tokens = [];
  const n = src.length;
  let i = 0;

  while (i < n) {
    const ch = src[i];
    if (isWs(ch)) {
      const start = i;
      i += 1;
      while (i < n && isWs(src[i])) i += 1;
      push(tokens, src, "ws", start, i);
      continue;
    }
    if (ch === "-" && src[i + 1] === "-") {
      const start = i;
      i += 2;
      while (i < n && src[i] !== "\n") i += 1;
      push(tokens, src, "comment", start, i);
      continue;
    }
    if (ch === "/" && src[i + 1] === "*") {
      const start = i;
      i += 2;
      while (i < n && !(src[i] === "*" && src[i + 1] === "/")) i += 1;
      if (i < n) i += 2;
      push(tokens, src, "comment", start, i);
      continue;
    }
    if (ch === "#") {
      const start = i;
      i += 1;
      while (i < n && src[i] !== "\n") i += 1;
      push(tokens, src, "comment", start, i);
      continue;
    }
    if (ch === "'" || ch === '"' || ch === "`") {
      i = readQuoted(src, i, tokens, ch === "`" ? "ident" : "string");
      continue;
    }
    if (ch === "[") {
      const start = i;
      i += 1;
      while (i < n && src[i] !== "]") i += 1;
      if (i < n) i += 1;
      push(tokens, src, "ident", start, i);
      continue;
    }
    if (isDigit(ch) || (ch === "." && isDigit(src[i + 1]))) {
      const start = i;
      i += 1;
      while (i < n && (isDigit(src[i]) || src[i] === "." || src[i] === "e" || src[i] === "E" || src[i] === "+" || src[i] === "-")) {
        i += 1;
      }
      push(tokens, src, "number", start, i);
      continue;
    }
    if (isIdentStart(ch)) {
      const start = i;
      i += 1;
      while (i < n && (isIdentChar(src[i]) || src[i] === ".")) i += 1;
      const word = src.slice(start, i);
      const low = word.toLowerCase();
      if (low === "true" || low === "false") push(tokens, src, "boolean", start, i);
      else if (low === "null") push(tokens, src, "null", start, i);
      else if (SQL_KEYWORDS.has(low)) push(tokens, src, "keyword", start, i);
      else push(tokens, src, "ident", start, i);
      continue;
    }
    push(tokens, src, "punct", i, i + 1);
    i += 1;
  }
  return tokens;
}

function tokenizeMarkup(src) {
  const tokens = [];
  const n = src.length;
  let i = 0;

  while (i < n) {
    if (src.startsWith("<!--", i)) {
      const start = i;
      const end = src.indexOf("-->", i + 4);
      i = end === -1 ? n : end + 3;
      push(tokens, src, "comment", start, i);
      continue;
    }
    if (src.startsWith("<![CDATA[", i)) {
      push(tokens, src, "punct", i, i + 9);
      i += 9;
      const end = src.indexOf("]]>", i);
      const textEnd = end === -1 ? n : end;
      push(tokens, src, "string", i, textEnd);
      i = textEnd;
      if (end !== -1) {
        push(tokens, src, "punct", i, i + 3);
        i += 3;
      }
      continue;
    }
    if (src.startsWith("<!", i) || src.startsWith("<?", i)) {
      const start = i;
      const endCh = src[i + 1] === "?" ? "?>" : ">";
      const end = src.indexOf(endCh, i + 2);
      i = end === -1 ? n : end + endCh.length;
      push(tokens, src, "keyword", start, i);
      continue;
    }
    if (src[i] === "<") {
      push(tokens, src, "punct", i, i + 1);
      i += 1;
      if (src[i] === "/") {
        push(tokens, src, "punct", i, i + 1);
        i += 1;
      }
      const nameStart = i;
      while (i < n && /[A-Za-z0-9:_-]/.test(src[i])) i += 1;
      push(tokens, src, "tag", nameStart, i);
      while (i < n && src[i] !== ">") {
        if (src[i] === "/" && src[i + 1] === ">") {
          push(tokens, src, "punct", i, i + 2);
          i += 2;
          break;
        }
        if (isWs(src[i])) {
          const start = i;
          while (i < n && isWs(src[i])) i += 1;
          push(tokens, src, "ws", start, i);
          continue;
        }
        if (src[i] === "'" || src[i] === '"') {
          i = readQuoted(src, i, tokens, "string");
          continue;
        }
        if (src[i] === "=") {
          push(tokens, src, "punct", i, i + 1);
          i += 1;
          continue;
        }
        if (/[A-Za-z_:]/.test(src[i])) {
          const start = i;
          i += 1;
          while (i < n && /[A-Za-z0-9_:.-]/.test(src[i])) i += 1;
          push(tokens, src, "attr", start, i);
          continue;
        }
        push(tokens, src, "punct", i, i + 1);
        i += 1;
      }
      if (i < n && src[i] === ">") {
        push(tokens, src, "punct", i, i + 1);
        i += 1;
      }
      continue;
    }
    if (src[i] === "&") {
      const start = i;
      i += 1;
      while (i < n && src[i] !== ";" && src[i] !== "<" && src[i] !== "&" && !isWs(src[i])) i += 1;
      if (src[i] === ";") i += 1;
      push(tokens, src, "entity", start, i);
      continue;
    }
    const start = i;
    while (i < n && src[i] !== "<" && src[i] !== "&") i += 1;
    push(tokens, src, "text", start, i);
  }
  return tokens;
}

function tokenizeYaml(src) {
  const tokens = [];
  const n = src.length;
  let i = 0;

  const yamlBreak = (ch) =>
    !ch || isWs(ch) || "#{}[],:&*!|>?'\"".includes(ch);

  while (i < n) {
    const atLine = i === 0 || src[i - 1] === "\n";
    if (atLine) {
      const start = i;
      while (i < n && (src[i] === " " || src[i] === "\t")) i += 1;
      push(tokens, src, "ws", start, i);
      if (src.startsWith("---", i) || src.startsWith("...", i)) {
        push(tokens, src, "punct", i, i + 3);
        i += 3;
        continue;
      }
    }
    const ch = src[i];
    if (!ch) break;
    if (ch === "#") {
      const start = i;
      while (i < n && src[i] !== "\n") i += 1;
      push(tokens, src, "comment", start, i);
      continue;
    }
    if (ch === "\n" || ch === "\r") {
      const start = i;
      i += ch === "\r" && src[i + 1] === "\n" ? 2 : 1;
      push(tokens, src, "ws", start, i);
      continue;
    }
    if (ch === " " || ch === "\t") {
      const start = i;
      while (i < n && (src[i] === " " || src[i] === "\t")) i += 1;
      push(tokens, src, "ws", start, i);
      continue;
    }
    if (ch === "'" || ch === '"') {
      i = readQuoted(src, i, tokens, "string");
      continue;
    }
    if (ch === "-" && (i + 1 >= n || isWs(src[i + 1]))) {
      push(tokens, src, "punct", i, i + 1);
      i += 1;
      continue;
    }
    if ("{}[],:&*!|>?".includes(ch)) {
      push(tokens, src, "punct", i, i + 1);
      i += 1;
      continue;
    }
    if (isDigit(ch) || (ch === "-" && isDigit(src[i + 1])) || (ch === "." && isDigit(src[i + 1]))) {
      const start = i;
      if (ch === "-") i += 1;
      while (i < n && (isDigit(src[i]) || src[i] === "." || src[i] === "e" || src[i] === "E" || src[i] === "+" || src[i] === "-")) {
        i += 1;
      }
      push(tokens, src, "number", start, i);
      continue;
    }
    if (!yamlBreak(ch)) {
      const start = i;
      i += 1;
      while (i < n && !yamlBreak(src[i])) i += 1;
      let j = i;
      while (j < n && (src[j] === " " || src[j] === "\t")) j += 1;
      if (src[j] === ":" && (j + 1 >= n || isWs(src[j + 1]) || "{}[],#".includes(src[j + 1]))) {
        push(tokens, src, "key", start, i);
        continue;
      }
      const word = src.slice(start, i).toLowerCase();
      if (word === "true" || word === "false" || word === "yes" || word === "no" || word === "on" || word === "off") {
        push(tokens, src, "boolean", start, i);
      } else if (word === "null" || word === "~") {
        push(tokens, src, "null", start, i);
      } else {
        push(tokens, src, "string", start, i);
      }
      continue;
    }
    push(tokens, src, "punct", i, i + 1);
    i += 1;
  }
  return tokens;
}

function isCssPropertyName(src, identEnd) {
  const n = src.length;
  let i = identEnd;
  while (i < n && isWs(src[i])) i += 1;
  if (src[i] !== ":") return false;
  i += 1;
  while (i < n && isWs(src[i])) i += 1;
  for (; i < n; i += 1) {
    if (src[i] === "{") return false;
    if (src[i] === ";" || src[i] === "}") return true;
  }
  return true;
}

function tokenizeCss(src) {
  const tokens = [];
  const n = src.length;
  let i = 0;
  let depth = 0;
  let expectProperty = false;

  while (i < n) {
    const ch = src[i];
    if (isWs(ch)) {
      const start = i;
      i += 1;
      while (i < n && isWs(src[i])) i += 1;
      push(tokens, src, "ws", start, i);
      continue;
    }
    if (ch === "/" && src[i + 1] === "*") {
      const start = i;
      i += 2;
      while (i < n && !(src[i] === "*" && src[i + 1] === "/")) i += 1;
      if (i < n) i += 2;
      push(tokens, src, "comment", start, i);
      continue;
    }
    if (ch === "'" || ch === '"') {
      i = readQuoted(src, i, tokens, "string");
      continue;
    }
    if (ch === "{") {
      depth += 1;
      expectProperty = true;
      push(tokens, src, "punct", i, i + 1);
      i += 1;
      continue;
    }
    if (ch === "}") {
      depth = Math.max(0, depth - 1);
      expectProperty = depth > 0;
      push(tokens, src, "punct", i, i + 1);
      i += 1;
      continue;
    }
    if (ch === ";") {
      expectProperty = depth > 0;
      push(tokens, src, "punct", i, i + 1);
      i += 1;
      continue;
    }
    if (ch === ":") {
      expectProperty = false;
      push(tokens, src, "punct", i, i + 1);
      i += 1;
      continue;
    }
    if (ch === "#") {
      const start = i;
      i += 1;
      while (i < n && /[0-9A-Fa-f]/.test(src[i])) i += 1;
      if (i - start === 4 || i - start === 7 || i - start === 9) push(tokens, src, "number", start, i);
      else {
        while (i < n && (isIdentChar(src[i]) || src[i] === "-")) i += 1;
        push(tokens, src, "ident", start, i);
      }
      continue;
    }
    if (ch === "@") {
      const start = i;
      i += 1;
      while (i < n && isIdentChar(src[i])) i += 1;
      push(tokens, src, "keyword", start, i);
      continue;
    }
    if (ch === "!" ) {
      push(tokens, src, "punct", i, i + 1);
      i += 1;
      continue;
    }
    if (isDigit(ch) || (ch === "." && isDigit(src[i + 1]))) {
      const start = i;
      i += 1;
      while (i < n && (isDigit(src[i]) || src[i] === ".")) i += 1;
      const numEnd = i;
      while (i < n && /[A-Za-z%]/.test(src[i])) i += 1;
      if (i > numEnd) {
        push(tokens, src, "number", start, numEnd);
        push(tokens, src, "ident", numEnd, i);
      } else {
        push(tokens, src, "number", start, i);
      }
      continue;
    }
    if (isIdentStart(ch) || ch === "-" || ch === ".") {
      const start = i;
      i += 1;
      while (i < n && (isIdentChar(src[i]) || src[i] === ".")) i += 1;
      const word = src.slice(start, i);
      const low = word.toLowerCase();
      if (CSS_KEYWORDS.has(low)) push(tokens, src, "keyword", start, i);
      else if (depth > 0 && expectProperty && isCssPropertyName(src, i)) push(tokens, src, "key", start, i);
      else if (src[i] === "(") push(tokens, src, "ident", start, i);
      else if (word[0] === "." || word[0] === "#") push(tokens, src, "ident", start, i);
      else if (depth === 0 || expectProperty) push(tokens, src, "tag", start, i);
      else push(tokens, src, "ident", start, i);
      continue;
    }
    push(tokens, src, "punct", i, i + 1);
    i += 1;
  }
  return tokens;
}

function joinTokens(tokens) {
  let out = "";
  for (const tok of tokens) out += tok.text;
  return out;
}

export function tokenizeCode(text, language = "sql") {
  const src = String(text ?? "");
  if (!src) return [];
  if (src.length > MAX_HIGHLIGHT) return [{ type: "text", text: src }];

  let tokens;
  switch (language) {
    case "xml":
    case "html":
      tokens = tokenizeMarkup(src);
      break;
    case "yaml":
      tokens = tokenizeYaml(src);
      break;
    case "css":
      tokens = tokenizeCss(src);
      break;
    default:
      tokens = tokenizeSql(src);
  }
  if (joinTokens(tokens) !== src) return [{ type: "text", text: src }];
  return tokens;
}
