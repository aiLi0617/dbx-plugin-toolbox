import { L, localize, isZh, normalizeLocale, pick } from "./locale.js";
import { SIDECAR_ERRORS, APP_ERRORS } from "./i18nErrors.js";

export {
  L,
  localize,
  isZh,
  normalizeLocale,
  pick,
  SUPPORTED_LOCALES,
  DEFAULT_LOCALE,
  localeValues,
} from "./locale.js";

/** Localize fast-xml-parser / dataConvert detail fragments; returns null if unrecognized. */
function localizeXmlDetail(locale, raw) {
  const tagName = raw.match(/^Tag '(.+)' is an invalid name\.?$/);
  if (tagName) {
    return localize(locale, L(
      `Tag '${tagName[1]}' is an invalid name.`,
      `标签「${tagName[1]}」不是有效的 XML 名称`,
      `標籤「${tagName[1]}」不是有效的 XML 名稱`,
      `La etiqueta '${tagName[1]}' no es un nombre XML válido.`,
      `Il tag '${tagName[1]}' non è un nome XML valido.`,
      `タグ '${tagName[1]}' は有効な XML 名ではありません。`,
      `A tag '${tagName[1]}' não é um nome XML válido.`,
    ));
  }
  const attrName = raw.match(/^Attribute '(.+)' is an invalid name\.?$/);
  if (attrName) {
    return localize(locale, L(
      `Attribute '${attrName[1]}' is an invalid name.`,
      `属性「${attrName[1]}」不是有效的 XML 名称`,
      `屬性「${attrName[1]}」不是有效的 XML 名稱`,
      `El atributo '${attrName[1]}' no es un nombre XML válido.`,
      `L'attributo '${attrName[1]}' non è un nome XML valido.`,
      `属性 '${attrName[1]}' は有効な XML 名ではありません。`,
      `O atributo '${attrName[1]}' não é um nome XML válido.`,
    ));
  }
  const openQuote = raw.match(/^Attributes for '(.+)' have open quote\.?$/);
  if (openQuote) {
    return localize(locale, L(
      `Attributes for '${openQuote[1]}' have open quote.`,
      `标签「${openQuote[1]}」的属性引号未闭合`,
      `標籤「${openQuote[1]}」的屬性引號未閉合`,
      `Los atributos de '${openQuote[1]}' tienen comillas abiertas.`,
      `Gli attributi di '${openQuote[1]}' hanno virgolette aperte.`,
      `「${openQuote[1]}」の属性引用符が閉じていません。`,
      `Os atributos de '${openQuote[1]}' têm aspas abertas.`,
    ));
  }
  const closingBad = raw.match(/^Closing tag '(.+)' doesn't have proper closing\.?$/);
  if (closingBad) {
    return localize(locale, L(
      `Closing tag '${closingBad[1]}' doesn't have proper closing.`,
      `结束标签「${closingBad[1]}」写法不正确`,
      `結束標籤「${closingBad[1]}」寫法不正確`,
      `La etiqueta de cierre '${closingBad[1]}' no está bien formada.`,
      `Il tag di chiusura '${closingBad[1]}' non è scritto correttamente.`,
      `終了タグ「${closingBad[1]}」の書き方が正しくありません。`,
      `A tag de fechamento '${closingBad[1]}' não está bem formada.`,
    ));
  }
  const closingAttrs = raw.match(/^Closing tag '(.+)' can't have attributes or invalid starting\.?$/);
  if (closingAttrs) {
    return localize(locale, L(
      `Closing tag '${closingAttrs[1]}' can't have attributes or invalid starting.`,
      `结束标签「${closingAttrs[1]}」不能带属性或以非法方式开头`,
      `結束標籤「${closingAttrs[1]}」不能帶屬性或以非法方式開頭`,
      `La etiqueta de cierre '${closingAttrs[1]}' no puede tener atributos ni un inicio inválido.`,
      `Il tag di chiusura '${closingAttrs[1]}' non può avere attributi o un inizio non valido.`,
      `終了タグ「${closingAttrs[1]}」に属性や不正な開始は使えません。`,
      `A tag de fechamento '${closingAttrs[1]}' não pode ter atributos nem início inválido.`,
    ));
  }
  const closingUnopened = raw.match(/^Closing tag '(.+)' has not been opened\.?$/);
  if (closingUnopened) {
    return localize(locale, L(
      `Closing tag '${closingUnopened[1]}' has not been opened.`,
      `结束标签「${closingUnopened[1]}」没有对应的开始标签`,
      `結束標籤「${closingUnopened[1]}」沒有對應的開始標籤`,
      `La etiqueta de cierre '${closingUnopened[1]}' no tiene apertura.`,
      `Il tag di chiusura '${closingUnopened[1]}' non è stato aperto.`,
      `終了タグ「${closingUnopened[1]}」に対応する開始タグがありません。`,
      `A tag de fechamento '${closingUnopened[1]}' não foi aberta.`,
    ));
  }
  const expectedClose = raw.match(
    /^Expected closing tag '(.+)' \(opened in line (\d+), col (\d+)\) instead of closing tag '(.+)'\.?$/,
  );
  if (expectedClose) {
    const en = expectedClose[0].endsWith(".") ? expectedClose[0] : `${expectedClose[0]}.`;
    return localize(locale, L(
      en,
      `期望结束标签「${expectedClose[1]}」（在第 ${expectedClose[2]} 行第 ${expectedClose[3]} 列打开），实际为「${expectedClose[4]}」`,
      `期望結束標籤「${expectedClose[1]}」（在第 ${expectedClose[2]} 行第 ${expectedClose[3]} 列打開），實際為「${expectedClose[4]}」`,
      `Se esperaba la etiqueta de cierre '${expectedClose[1]}' (abierta en línea ${expectedClose[2]}, col. ${expectedClose[3]}), no '${expectedClose[4]}'.`,
      `Era previsto il tag di chiusura '${expectedClose[1]}' (aperto a riga ${expectedClose[2]}, col. ${expectedClose[3]}), non '${expectedClose[4]}'.`,
      `終了タグ「${expectedClose[1]}」が必要です（${expectedClose[2]} 行 ${expectedClose[3]} 列で開始）。実際は「${expectedClose[4]}」でした。`,
      `Esperava-se a tag de fechamento '${expectedClose[1]}' (aberta na linha ${expectedClose[2]}, col. ${expectedClose[3]}), não '${expectedClose[4]}'.`,
    ));
  }
  if (raw === "Invalid space after '<'." || raw === "Invalid space after '<'") {
    return localize(locale, L(
      "Invalid space after '<'.",
      "`<` 后不能有空白",
      "`<` 後不能有空白",
      "No puede haber espacio después de '<'.",
      "Non può esserci spazio dopo '<'.",
      "'<' の後に空白は置けません。",
      "Não pode haver espaço após '<'.",
    ));
  }
  if (raw === "Multiple possible root nodes found." || raw === "Multiple possible root nodes found") {
    return localize(locale, L(
      "Multiple possible root nodes found.",
      "发现多个可能的根节点",
      "發現多個可能的根節點",
      "Se encontraron varios nodos raíz posibles.",
      "Trovati più possibili nodi radice.",
      "複数のルートノードが見つかりました。",
      "Foram encontrados vários nós raiz possíveis.",
    ));
  }
  return null;
}

function jsonWhere(locale, v8Pos, fxPos) {
  const key = normalizeLocale(locale);
  if (v8Pos) {
    const en = v8Pos[0];
    if (key === "zh-CN") {
      return { en, local: v8Pos[2] ? `（第 ${v8Pos[2]} 行第 ${v8Pos[3]} 列，位置 ${v8Pos[1]}）` : `（位置 ${v8Pos[1]}）` };
    }
    if (key === "zh-TW") {
      return { en, local: v8Pos[2] ? `（第 ${v8Pos[2]} 行第 ${v8Pos[3]} 列，位置 ${v8Pos[1]}）` : `（位置 ${v8Pos[1]}）` };
    }
    if (key === "ja") {
      return { en, local: v8Pos[2] ? `（${v8Pos[2]} 行 ${v8Pos[3]} 列、位置 ${v8Pos[1]}）` : `（位置 ${v8Pos[1]}）` };
    }
    if (key === "es") {
      return { en, local: v8Pos[2] ? ` (línea ${v8Pos[2]}, columna ${v8Pos[3]}, posición ${v8Pos[1]})` : ` (posición ${v8Pos[1]})` };
    }
    if (key === "it") {
      return { en, local: v8Pos[2] ? ` (riga ${v8Pos[2]}, colonna ${v8Pos[3]}, posizione ${v8Pos[1]})` : ` (posizione ${v8Pos[1]})` };
    }
    if (key === "pt-BR") {
      return { en, local: v8Pos[2] ? ` (linha ${v8Pos[2]}, coluna ${v8Pos[3]}, posição ${v8Pos[1]})` : ` (posição ${v8Pos[1]})` };
    }
    return { en, local: en };
  }
  if (fxPos) {
    const en = fxPos[0];
    if (key === "zh-CN" || key === "zh-TW") return { en, local: `（第 ${fxPos[1]} 行第 ${fxPos[2]} 列）` };
    if (key === "ja") return { en, local: `（${fxPos[1]} 行 ${fxPos[2]} 列）` };
    if (key === "es") return { en, local: ` (línea ${fxPos[1]}, columna ${fxPos[2]})` };
    if (key === "it") return { en, local: ` (riga ${fxPos[1]}, colonna ${fxPos[2]})` };
    if (key === "pt-BR") return { en, local: ` (linha ${fxPos[1]}, coluna ${fxPos[2]})` };
    return { en, local: en };
  }
  return { en: "", local: "" };
}

/** Translate V8 / SpiderMonkey JSON.parse SyntaxError messages; returns null if not a JSON syntax error. */
function localizeJsonSyntaxError(locale, raw) {
  const v8Pos = raw.match(/ at position (\d+)(?: \(line (\d+) column (\d+)\))?$/);
  const fxPos = raw.match(/ at line (\d+) column (\d+)(?: of the JSON data)?$/i);
  let body = raw;
  if (v8Pos) body = raw.slice(0, v8Pos.index);
  else if (fxPos) body = raw.slice(0, fxPos.index).replace(/^JSON\.parse:\s*/i, "");
  else body = raw.replace(/^JSON\.parse:\s*/i, "");

  const { en: whereEn, local: whereLocal } = jsonWhere(locale, v8Pos, fxPos);
  const key = normalizeLocale(locale);

  const rules = [
    [/^(?:Bad control character in string literal(?: in JSON)?|bad control character in string literal)$/i,
      L(
        "Bad control character in string literal in JSON",
        "JSON 字符串中含有未转义的控制字符（如换行、制表符，请写成 \\n、\\t）",
        "JSON 字串中含有未跳脫的控制字元（如換行、製表符，請寫成 \\n、\\t）",
        "Carácter de control sin escapar en un literal de cadena JSON",
        "Carattere di controllo non escapato in un letterale stringa JSON",
        "JSON 文字列リテラルにエスケープされていない制御文字があります（\\n、\\t など）",
        "Caractere de controle sem escape em literal de string JSON",
      )],
    [/^(?:Unterminated string(?: in JSON)?|unterminated string)$/i,
      L(
        "Unterminated string in JSON",
        "JSON 字符串未正确结束",
        "JSON 字串未正確結束",
        "Cadena JSON sin terminar",
        "Stringa JSON non terminata",
        "JSON 文字列が正しく終了していません",
        "String JSON não terminada",
      )],
    [/^(?:Unexpected end of JSON input|unexpected end of data)$/i,
      L(
        "Unexpected end of JSON input",
        "JSON 不完整，意外结束",
        "JSON 不完整，意外結束",
        "Fin inesperado de la entrada JSON",
        "Fine inattesa dell'input JSON",
        "JSON 入力が途中で終了しました",
        "Fim inesperado da entrada JSON",
      )],
    [/^(?:Expected property name or '\}'(?: in JSON)?|expected property name or '\}')$/i,
      L(
        "Expected property name or '}' in JSON",
        "JSON 此处需要属性名或 '}'",
        "JSON 此處需要屬性名或 '}'",
        "Se esperaba un nombre de propiedad o '}' en JSON",
        "Previsto un nome proprietà o '}' in JSON",
        "JSON ではプロパティ名または '}' が必要です",
        "Esperava-se um nome de propriedade ou '}' no JSON",
      )],
    [/^Expected ',' or '\}' after property value(?: in JSON)?$/i,
      L(
        "Expected ',' or '}' after property value in JSON",
        "JSON 属性值后需要 ',' 或 '}'",
        "JSON 屬性值後需要 ',' 或 '}'",
        "Se esperaba ',' o '}' tras el valor de la propiedad en JSON",
        "Prevista ',' o '}' dopo il valore della proprietà in JSON",
        "JSON のプロパティ値の後には ',' または '}' が必要です",
        "Esperava-se ',' ou '}' após o valor da propriedade no JSON",
      )],
    [/^Expected ',' or ']' after array element(?: in JSON)?$/i,
      L(
        "Expected ',' or ']' after array element in JSON",
        "JSON 数组元素后需要 ',' 或 ']'",
        "JSON 陣列元素後需要 ',' 或 ']'",
        "Se esperaba ',' o ']' tras un elemento de matriz en JSON",
        "Prevista ',' o ']' dopo un elemento di array in JSON",
        "JSON の配列要素の後には ',' または ']' が必要です",
        "Esperava-se ',' ou ']' após um elemento de array no JSON",
      )],
    [/^Expected double-quoted property name(?: in JSON)?$/i,
      L(
        "Expected double-quoted property name in JSON",
        "JSON 属性名须使用双引号",
        "JSON 屬性名須使用雙引號",
        "El nombre de propiedad JSON debe ir entre comillas dobles",
        "Il nome proprietà JSON deve essere tra virgolette doppie",
        "JSON のプロパティ名は二重引用符で囲む必要があります",
        "O nome da propriedade JSON deve usar aspas duplas",
      )],
    [/^Expected ':' after property name(?: in JSON)?$/i,
      L(
        "Expected ':' after property name in JSON",
        "JSON 属性名后需要 ':'",
        "JSON 屬性名後需要 ':'",
        "Se esperaba ':' tras el nombre de propiedad en JSON",
        "Previsti ':' dopo il nome proprietà in JSON",
        "JSON のプロパティ名の後には ':' が必要です",
        "Esperava-se ':' após o nome da propriedade no JSON",
      )],
    [/^Unexpected non-whitespace character after JSON$/i,
      L(
        "Unexpected non-whitespace character after JSON",
        "JSON 结束后还有多余字符",
        "JSON 結束後還有多餘字元",
        "Carácter inesperado tras el JSON",
        "Carattere inatteso dopo il JSON",
        "JSON の後に余分な文字があります",
        "Caractere inesperado após o JSON",
      )],
  ];

  for (const [re, dict] of rules) {
    if (!body.match(re)) continue;
    const msg = localize(locale, dict);
    return key === "en" ? `${msg}${whereEn}` : `${msg}${whereLocal}`;
  }

  const tokenJson = body.match(/^Unexpected token (.+), .+ is not valid JSON$/i);
  if (tokenJson) {
    return localize(locale, L(
      tokenJson[0],
      `JSON 语法错误：意外的 ${tokenJson[1]}${whereLocal}`,
      `JSON 語法錯誤：意外的 ${tokenJson[1]}${whereLocal}`,
      `Error de sintaxis JSON: ${tokenJson[1]} inesperado${whereLocal}`,
      `Errore di sintassi JSON: ${tokenJson[1]} imprevisto${whereLocal}`,
      `JSON 構文エラー：予期しない ${tokenJson[1]}${whereLocal}`,
      `Erro de sintaxe JSON: ${tokenJson[1]} inesperado${whereLocal}`,
    ));
  }
  const tokenIn = body.match(/^Unexpected token (.+) in JSON$/i);
  if (tokenIn) {
    return localize(locale, L(
      `Unexpected token ${tokenIn[1]} in JSON${whereEn}`,
      `JSON 语法错误：意外的 ${tokenIn[1]}${whereLocal}`,
      `JSON 語法錯誤：意外的 ${tokenIn[1]}${whereLocal}`,
      `Token inesperado ${tokenIn[1]} en JSON${whereLocal}`,
      `Token imprevisto ${tokenIn[1]} in JSON${whereLocal}`,
      `JSON 内の予期しないトークン ${tokenIn[1]}${whereLocal}`,
      `Token inesperado ${tokenIn[1]} no JSON${whereLocal}`,
    ));
  }
  if (/^unexpected character$/i.test(body)) {
    return localize(locale, L(
      `Unexpected character in JSON${whereEn}`,
      `JSON 含有意外字符${whereLocal}`,
      `JSON 含有意外字元${whereLocal}`,
      `Carácter inesperado en JSON${whereLocal}`,
      `Carattere imprevisto in JSON${whereLocal}`,
      `JSON に予期しない文字があります${whereLocal}`,
      `Caractere inesperado no JSON${whereLocal}`,
    ));
  }

  if (!/in JSON|is not valid JSON|^JSON\.parse:/i.test(raw)) return null;
  if (key === "en") return raw;
  return localize(locale, L(
    raw,
    `JSON 解析失败：${body}${whereLocal}`,
    `JSON 解析失敗：${body}${whereLocal}`,
    `Error al analizar JSON: ${body}${whereLocal}`,
    `Analisi JSON non riuscita: ${body}${whereLocal}`,
    `JSON の解析に失敗しました：${body}${whereLocal}`,
    `Falha ao analisar JSON: ${body}${whereLocal}`,
  ));
}

export function errorMessage(err) {
  if (err == null) return "";
  if (typeof err === "string") return err;
  return String(err.message || err.msg || err.data?.message || err.toString?.() || "");
}

export function localizeError(locale, err) {
  const raw = errorMessage(err).trim();
  if (!raw) {
    return localize(locale, L(
      "Request failed",
      "操作失败",
      "操作失敗",
      "La operación falló",
      "Operazione non riuscita",
      "操作に失敗しました",
      "A operação falhou",
    ));
  }
  if (/sidecar is not ready|backend is not ready/i.test(raw)) {
    return localize(locale, SIDECAR_ERRORS["Sidecar is not ready"]);
  }
  const exact = SIDECAR_ERRORS[raw] || APP_ERRORS[raw];
  if (exact) return localize(locale, exact);

  const keyLen = raw.match(/^Key length must be (\d+) bytes$/);
  if (keyLen) {
    return localize(locale, L(
      raw,
      `密钥长度必须是 ${keyLen[1]} 字节`,
      `金鑰長度必須是 ${keyLen[1]} 位元組`,
      `La clave debe tener ${keyLen[1]} bytes`,
      `La chiave deve essere di ${keyLen[1]} byte`,
      `鍵長は ${keyLen[1]} バイトである必要があります`,
      `A chave deve ter ${keyLen[1]} bytes`,
    ));
  }
  const ivLen = raw.match(/^(Nonce|IV) must be (\d+) bytes$/);
  if (ivLen) {
    const name = ivLen[1];
    return localize(locale, L(
      raw,
      `${name} 必须是 ${ivLen[2]} 字节`,
      `${name} 必須是 ${ivLen[2]} 位元組`,
      `${name} debe tener ${ivLen[2]} bytes`,
      `${name} deve essere di ${ivLen[2]} byte`,
      `${name} は ${ivLen[2]} バイトである必要があります`,
      `${name} deve ter ${ivLen[2]} bytes`,
    ));
  }
  const exceeds = raw.match(/^(.+) exceeds the (\d+) byte input limit$/);
  if (exceeds) {
    const labels = {
      "Crypto input": L("Crypto input", "加密输入", "加密輸入", "Entrada cifrada", "Input crittografico", "暗号入力", "Entrada criptográfica"),
      "Crypto AAD": L("Crypto AAD", "AAD", "AAD", "AAD", "AAD", "AAD", "AAD"),
      "RSA input": L("RSA input", "RSA 输入", "RSA 輸入", "Entrada RSA", "Input RSA", "RSA 入力", "Entrada RSA"),
      "RSA ciphertext": L("RSA ciphertext", "RSA 密文", "RSA 密文", "Texto cifrado RSA", "Testo cifrato RSA", "RSA 暗号文", "Texto cifrado RSA"),
      "SM2 input": L("SM2 input", "SM2 输入", "SM2 輸入", "Entrada SM2", "Input SM2", "SM2 入力", "Entrada SM2"),
      "SM2 ciphertext": L("SM2 ciphertext", "SM2 密文", "SM2 密文", "Texto cifrado SM2", "Testo cifrato SM2", "SM2 暗号文", "Texto cifrado SM2"),
      "JWT input": L("JWT input", "JWT 输入", "JWT 輸入", "Entrada JWT", "Input JWT", "JWT 入力", "Entrada JWT"),
      "Certificate input": L("Certificate input", "证书输入", "憑證輸入", "Entrada de certificado", "Input certificato", "証明書入力", "Entrada de certificado"),
    };
    const named = localize(locale, labels[exceeds[1]] || L(exceeds[1], exceeds[1], exceeds[1], exceeds[1], exceeds[1], exceeds[1], exceeds[1]));
    const n = Number(exceeds[2]).toLocaleString();
    return localize(locale, L(
      `${exceeds[1]} exceeds the ${n} byte input limit`,
      `${named}超过 ${n} 字节上限`,
      `${named}超過 ${n} 位元組上限`,
      `${named} supera el límite de ${n} bytes`,
      `${named} supera il limite di ${n} byte`,
      `${named}が ${n} バイト上限を超えています`,
      `${named} excede o limite de ${n} bytes`,
    ));
  }
  if (raw === "Missing password" || raw === "Missing currentPassword" || raw === "Missing newPassword") {
    return localize(locale, L(
      "Enter the master password",
      "请填写主密码",
      "請填寫主密碼",
      "Introduce la contraseña maestra",
      "Inserisci la password master",
      "マスターパスワードを入力してください",
      "Informe a senha mestra",
    ));
  }
  const ndjson = raw.match(/^Invalid NDJSON at line (\d+): (.+)$/);
  if (ndjson) {
    const detail = localizeError(locale, ndjson[2]);
    return localize(locale, L(
      `Invalid NDJSON at line ${ndjson[1]}: ${detail}`,
      `第 ${ndjson[1]} 行 NDJSON 无效：${detail}`,
      `第 ${ndjson[1]} 行 NDJSON 無效：${detail}`,
      `NDJSON no válido en la línea ${ndjson[1]}: ${detail}`,
      `NDJSON non valido alla riga ${ndjson[1]}: ${detail}`,
      `${ndjson[1]} 行目の NDJSON が無効です：${detail}`,
      `NDJSON inválido na linha ${ndjson[1]}: ${detail}`,
    ));
  }
  const xmlKeys = raw.match(/^Cannot represent these object keys as XML: (.+)$/);
  if (xmlKeys) {
    const detail = localizeXmlDetail(locale, xmlKeys[1]) || localizeError(locale, xmlKeys[1]);
    return localize(locale, L(
      `Cannot represent these object keys as XML: ${detail}`,
      `这些对象键无法表示为 XML：${detail}`,
      `這些物件鍵無法表示為 XML：${detail}`,
      `No se pueden representar estas claves de objeto como XML: ${detail}`,
      `Impossibile rappresentare queste chiavi oggetto come XML: ${detail}`,
      `これらのオブジェクトキーを XML として表現できません：${detail}`,
      `Não é possível representar estas chaves de objeto como XML: ${detail}`,
    ));
  }
  const xmlDetail = localizeXmlDetail(locale, raw);
  if (xmlDetail) return xmlDetail;
  const datePath = raw.match(/^Date\/time at (.+) cannot be converted without changing its type\. Quote it as a string first\.$/);
  if (datePath) {
    return localize(locale, L(
      raw,
      `${datePath[1]} 处的日期/时间无法原样转换，请先写成字符串`,
      `${datePath[1]} 處的日期/時間無法原樣轉換，請先寫成字串`,
      `La fecha/hora en ${datePath[1]} no se puede convertir sin cambiar el tipo. Escríbela primero como cadena.`,
      `Data/ora in ${datePath[1]} non convertibile senza cambiare tipo. Scrivila prima come stringa.`,
      `${datePath[1]} の日付/時刻はそのまま変換できません。先に文字列にしてください。`,
      `Data/hora em ${datePath[1]} não pode ser convertida sem mudar o tipo. Escreva-a primeiro como string.`,
    ));
  }
  const collPath = raw.match(/^Unsupported collection at (.+)\. Use a plain object or array before converting\.$/);
  if (collPath) {
    return localize(locale, L(
      raw,
      `${collPath[1]} 处含不支持的集合类型，请先换成普通对象或数组再转换`,
      `${collPath[1]} 處含不支援的集合類型，請先換成普通物件或陣列再轉換`,
      `${collPath[1]} contiene un tipo de colección no admitido. Usa un objeto o matriz simple antes de convertir.`,
      `${collPath[1]} contiene un tipo di collezione non supportato. Usa un oggetto o array semplice prima di convertire.`,
      `${collPath[1]} に未対応のコレクション型があります。変換前に通常のオブジェクトか配列にしてください。`,
      `${collPath[1]} contém um tipo de coleção não suportado. Use um objeto ou array simples antes de converter.`,
    ));
  }
  const tomlNull = raw.match(/^TOML cannot represent null at (.+)\. Remove it or choose another format\.$/);
  if (tomlNull) {
    return localize(locale, L(
      raw,
      `TOML 无法表示 ${tomlNull[1]} 处的 null，请删除或改用其他格式`,
      `TOML 無法表示 ${tomlNull[1]} 處的 null，請刪除或改用其他格式`,
      `TOML no puede representar null en ${tomlNull[1]}. Elimínalo o elige otro formato.`,
      `TOML non può rappresentare null in ${tomlNull[1]}. Rimuovilo o scegli un altro formato.`,
      `TOML は ${tomlNull[1]} の null を表現できません。削除するか別形式を選んでください。`,
      `TOML não pode representar null em ${tomlNull[1]}. Remova-o ou escolha outro formato.`,
    ));
  }
  const jsonErr = localizeJsonSyntaxError(locale, raw);
  if (jsonErr) return jsonErr;
  return raw;
}

export const chrome = {
  brand: L("Toolbox", "工具箱", "工具箱", "Herramientas", "Strumenti", "ツールボックス", "Ferramentas"),
  search: L("Search tools", "搜索工具", "搜尋工具", "Buscar herramientas", "Cerca strumenti", "ツールを検索", "Buscar ferramentas"),
  searchPlaceholder: L(
    "Search tools, features, or keywords",
    "搜索工具、功能或关键字",
    "搜尋工具、功能或關鍵字",
    "Buscar herramientas, funciones o palabras clave",
    "Cerca strumenti, funzioni o parole chiave",
    "ツール、機能、キーワードを検索",
    "Buscar ferramentas, recursos ou palavras-chave",
  ),
  searchPlaceholderShort: L(
    "Search names, features, or keywords",
    "搜索名称、功能或关键字",
    "搜尋名稱、功能或關鍵字",
    "Buscar nombres, funciones o palabras clave",
    "Cerca nomi, funzioni o parole chiave",
    "名前、機能、キーワードを検索",
    "Buscar nomes, recursos ou palavras-chave",
  ),
  searchPlaceholderEllipsis: L(
    "Search names, features, or keywords…",
    "搜索名称、功能或关键字…",
    "搜尋名稱、功能或關鍵字…",
    "Buscar nombres, funciones o palabras clave…",
    "Cerca nomi, funzioni o parole chiave…",
    "名前、機能、キーワードを検索…",
    "Buscar nomes, recursos ou palavras-chave…",
  ),
  clearSearch: L("Clear search", "清空搜索", "清空搜尋", "Borrar búsqueda", "Cancella ricerca", "検索をクリア", "Limpar pesquisa"),
  searchResultsLabel: L("Tool search results", "工具搜索结果", "工具搜尋結果", "Resultados de búsqueda", "Risultati di ricerca", "ツール検索結果", "Resultados da pesquisa"),
  results: L("Results", "搜索结果", "搜尋結果", "Resultados", "Risultati", "検索結果", "Resultados"),
  favoritesAndRecent: L(
    "Favorites and recent",
    "常用与最近",
    "常用與最近",
    "Favoritos y recientes",
    "Preferiti e recenti",
    "お気に入りと最近",
    "Favoritos e recentes",
  ),
  recent: L("Recent", "最近使用", "最近使用", "Recientes", "Recenti", "最近", "Recentes"),
  recentHint: L("Recently opened tools", "自动记录最近打开的工具", "自動記錄最近開啟的工具", "Herramientas abiertas recientemente", "Strumenti aperti di recente", "最近開いたツール", "Ferramentas abertas recentemente"),
  empty: L("No matching tools", "没有匹配的工具", "沒有符合的工具", "No hay herramientas coincidentes", "Nessuno strumento corrispondente", "一致するツールがありません", "Nenhuma ferramenta correspondente"),
  emptyDot: L("No matching tools.", "没有匹配的工具。", "沒有符合的工具。", "No hay herramientas coincidentes.", "Nessuno strumento corrispondente.", "一致するツールがありません。", "Nenhuma ferramenta correspondente."),
  noToolsYet: L("No tools yet", "暂无工具", "暫無工具", "Aún no hay herramientas", "Nessuno strumento", "ツールはまだありません", "Ainda não há ferramentas"),
  pin: L("Pin tool", "固定到常用工具", "固定到常用工具", "Fijar herramienta", "Fissa strumento", "ツールを固定", "Fixar ferramenta"),
  unpin: L("Unpin tool", "从常用工具移除", "從常用工具移除", "Desfijar herramienta", "Rimuovi dai preferiti", "固定を解除", "Desafixar ferramenta"),
  addFavorite: L("Add favorite", "添加到常用", "新增到常用", "Añadir a favoritos", "Aggiungi ai preferiti", "お気に入りに追加", "Adicionar aos favoritos"),
  removeFavorite: L("Remove favorite", "从常用移除", "從常用移除", "Quitar de favoritos", "Rimuovi dai preferiti", "お気に入りから削除", "Remover dos favoritos"),
  pinned: L("Favorites", "常用工具", "常用工具", "Favoritos", "Preferiti", "お気に入り", "Favoritos"),
  pinnedHint: L(
    "Drag cards to arrange your workflow",
    "拖动卡片调整日常使用顺序",
    "拖動卡片調整日常使用順序",
    "Arrastra las tarjetas para ordenar tu flujo",
    "Trascina le schede per ordinare il flusso",
    "カードをドラッグして並び替え",
    "Arraste os cartões para organizar o fluxo",
  ),
  starInLibrary: L(
    "Star tools in the library",
    "在工具库中点击星标添加",
    "在工具庫中點擊星標新增",
    "Marca herramientas en la biblioteca",
    "Aggiungi strumenti dalla libreria",
    "ライブラリで星を付けて追加",
    "Marque ferramentas na biblioteca",
  ),
  openedAppearHere: L(
    "Opened tools appear here",
    "打开工具后会显示在这里",
    "開啟工具後會顯示在這裡",
    "Las herramientas abiertas aparecen aquí",
    "Gli strumenti aperti compaiono qui",
    "開いたツールがここに表示されます",
    "Ferramentas abertas aparecem aqui",
  ),
  allTools: L("All tools", "全部工具", "全部工具", "Todas las herramientas", "Tutti gli strumenti", "すべてのツール", "Todas as ferramentas"),
  all: L("All", "全部", "全部", "Todas", "Tutti", "すべて", "Todas"),
  library: L("Library", "工具库", "工具庫", "Biblioteca", "Libreria", "ライブラリ", "Biblioteca"),
  categoriesNav: L("Tool categories", "工具分类", "工具分類", "Categorías de herramientas", "Categorie strumenti", "ツールのカテゴリ", "Categorias de ferramentas"),
  browseByCategory: L("Browse by category", "按分类浏览", "按分類瀏覽", "Explorar por categoría", "Sfoglia per categoria", "カテゴリで閲覧", "Navegar por categoria"),
  catalogHint: L(
    "Search, filter, and favorite the tools you use most.",
    "搜索、筛选并将高频工具加入常用。",
    "搜尋、篩選並將常用工具加入常用。",
    "Busca, filtra y marca las herramientas que más usas.",
    "Cerca, filtra e aggiungi ai preferiti gli strumenti più usati.",
    "よく使うツールを検索・絞り込み・お気に入り登録。",
    "Pesquise, filtre e favorite as ferramentas que mais usa.",
  ),
  homeTitle: L("What do you need?", "需要使用什么工具？", "需要使用什麼工具？", "¿Qué necesitas?", "Di cosa hai bisogno?", "何が必要ですか？", "Do que você precisa?"),
  homeSubtitle: L(
    "Search every tool, or jump back into favorites and recent tools.",
    "搜索全部工具，或从常用和最近使用中快速打开。",
    "搜尋全部工具，或從常用和最近使用中快速開啟。",
    "Busca cualquier herramienta, o vuelve a favoritos y recientes.",
    "Cerca ogni strumento, o torna a preferiti e recenti.",
    "すべてのツールを検索するか、お気に入りと最近から開きます。",
    "Pesquise todas as ferramentas, ou volte aos favoritos e recentes.",
  ),
  expandSidebar: L("Expand sidebar", "展开侧栏", "展開側欄", "Expandir barra lateral", "Espandi barra laterale", "サイドバーを展開", "Expandir barra lateral"),
  collapseSidebar: L("Collapse sidebar", "收起侧栏", "收起側欄", "Contraer barra lateral", "Comprimi barra laterale", "サイドバーを折りたたむ", "Recolher barra lateral"),
  primaryNav: L("Primary navigation", "主导航", "主導覽", "Navegación principal", "Navigazione principale", "メインナビゲーション", "Navegação principal"),
  home: L("Home", "首页", "首頁", "Inicio", "Home", "ホーム", "Início"),
  collapse: L("Collapse", "收起", "收起", "Contraer", "Comprimi", "折りたたむ", "Recolher"),
  showAll: (n) => L(
    `Show all (${n})`,
    `展开全部（${n}）`,
    `展開全部（${n}）`,
    `Mostrar todo (${n})`,
    `Mostra tutto (${n})`,
    `すべて表示（${n}）`,
    `Mostrar tudo (${n})`,
  ),
  toolCount: (n) => L(
    `${n} tools`,
    `${n} 个工具`,
    `${n} 個工具`,
    `${n} herramientas`,
    `${n} strumenti`,
    `${n} 個のツール`,
    `${n} ferramentas`,
  ),
  emptyFavorites: L("No favorite tools yet.", "还没有常用工具。", "還沒有常用工具。", "Aún no hay favoritos.", "Nessun preferito.", "お気に入りはまだありません。", "Ainda não há favoritos."),
  addFromLibrary: L(
    "Add from tool library",
    "前往工具库添加",
    "前往工具庫新增",
    "Añadir desde la biblioteca",
    "Aggiungi dalla libreria",
    "ライブラリから追加",
    "Adicionar da biblioteca",
  ),
  reorderHintRow: L(
    "Drag the row or use Up/Down to reorder",
    "拖动整行或使用上下方向键排序",
    "拖動整行或使用上下方向鍵排序",
    "Arrastra la fila o usa ↑/↓ para reordenar",
    "Trascina la riga o usa ↑/↓ per riordinare",
    "行をドラッグ、または↑/↓で並べ替え",
    "Arraste a linha ou use ↑/↓ para reordenar",
  ),
  reorderHintCard: L(
    "Drag the card to reorder, or use arrow keys",
    "拖动整张卡片排序，或使用方向键调整",
    "拖動整張卡片排序，或使用方向鍵調整",
    "Arrastra la tarjeta o usa las flechas",
    "Trascina la scheda o usa le frecce",
    "カードをドラッグ、または矢印キーで並べ替え",
    "Arraste o cartão ou use as setas",
  ),
  reorderItem: (name) => L(
    `Reorder ${name}`,
    `调整 ${name} 顺序`,
    `調整 ${name} 順序`,
    `Reordenar ${name}`,
    `Riordina ${name}`,
    `${name} の順序を変更`,
    `Reordenar ${name}`,
  ),
  select: L("Select", "选择", "選擇", "Seleccionar", "Seleziona", "選択", "Selecionar"),
  open: L("Open", "打开", "開啟", "Abrir", "Apri", "開く", "Abrir"),
  close: L("Close", "关闭", "關閉", "Cerrar", "Chiudi", "閉じる", "Fechar"),
  allToolsHint: L(
    "Browse every tool by category. Pin the ones you use often to keep them in the sidebar.",
    "按分类浏览全部工具；固定常用工具后，它会出现在左侧栏。",
    "按分類瀏覽全部工具；固定常用工具後，它會出現在左側欄。",
    "Explora todas las herramientas por categoría. Fija las que uses a menudo para verlas en la barra lateral.",
    "Sfoglia tutti gli strumenti per categoria. Fissa quelli che usi spesso nella barra laterale.",
    "カテゴリ別にすべてのツールを閲覧できます。よく使うものはサイドバーに固定できます。",
    "Navegue por todas as ferramentas por categoria. Fixe as que usa com frequência na barra lateral.",
  ),
  emptyMine: L(
    "No pinned tools yet. Pin tools from the full catalog.",
    "还没有常用工具，可从全部工具中固定。",
    "還沒有常用工具，可從全部工具中固定。",
    "Aún no hay herramientas fijadas. Fíjalas desde el catálogo completo.",
    "Nessuno strumento fissato. Fissane dal catalogo completo.",
    "まだ固定したツールがありません。カタログから固定できます。",
    "Ainda não há ferramentas fixadas. Fixe-as no catálogo completo.",
  ),
  run: L("Run", "运行", "執行", "Ejecutar", "Esegui", "実行", "Executar"),
  copy: L("Copy output", "复制输出", "複製輸出", "Copiar salida", "Copia output", "出力をコピー", "Copiar saída"),
  clear: L("Clear", "清空", "清空", "Borrar", "Cancella", "クリア", "Limpar"),
  input: L("Input", "输入", "輸入", "Entrada", "Input", "入力", "Entrada"),
  output: L("Output", "输出", "輸出", "Salida", "Output", "出力", "Saída"),
  copied: L("Copied", "已复制", "已複製", "Copiado", "Copiato", "コピーしました", "Copiado"),
  ready: L("Ready", "已就绪", "已就緒", "Listo", "Pronto", "準備完了", "Pronto"),
  subtitle: L(
    "Runs locally. Keys never enter browser storage.",
    "本地计算，密钥不进浏览器存储",
    "本機計算，金鑰不進瀏覽器儲存",
    "Se ejecuta en local. Las claves no se guardan en el almacenamiento del navegador.",
    "Esegue in locale. Le chiavi non entrano nello storage del browser.",
    "ローカルで実行。鍵はブラウザーのストレージに入りません。",
    "Executa localmente. As chaves não entram no armazenamento do navegador.",
  ),
  vault: L("Key vault", "密钥库", "金鑰庫", "Almacén de claves", "Archivio chiavi", "キー保管庫", "Cofre de chaves"),
  vaultShort: L("Vault", "密钥库", "金鑰庫", "Almacén", "Archivio", "保管庫", "Cofre"),
  vaultUnlockedShort: L("Vault unlocked", "密钥库已解锁", "金鑰庫已解鎖", "Almacén desbloqueado", "Archivio sbloccato", "保管庫解除済み", "Cofre desbloqueado"),
  vaultLocked: L("Key vault (locked)", "密钥库（已锁定）", "金鑰庫（已鎖定）", "Almacén de claves (bloqueado)", "Archivio chiavi (bloccato)", "キー保管庫（ロック中）", "Cofre de chaves (bloqueado)"),
  vaultUnlocked: L("Key vault (unlocked)", "密钥库（已解锁）", "金鑰庫（已解鎖）", "Almacén de claves (desbloqueado)", "Archivio chiavi (sbloccato)", "キー保管庫（解除済み）", "Cofre de chaves (desbloqueado)"),
  copyFailed: L(
    "Copy failed; please copy manually",
    "复制失败，请手动复制",
    "複製失敗，請手動複製",
    "Error al copiar; cópialo manualmente",
    "Copia non riuscita; copia manualmente",
    "コピーに失敗しました。手動でコピーしてください",
    "Falha ao copiar; copie manualmente",
  ),
};

export const categories = {
  format: L("Data & code", "数据与代码", "資料與程式碼", "Datos y código", "Dati e codice", "データとコード", "Dados e código"),
  encode: L("Encode & escape", "编码转义", "編碼轉義", "Codificar y escapar", "Codifica ed escape", "エンコードとエスケープ", "Codificar e escapar"),
  convert: L("Convert & calculate", "转换计算", "轉換計算", "Convertir y calcular", "Converti e calcola", "変換と計算", "Converter e calcular"),
  text: L("Text tools", "文本工具", "文字工具", "Herramientas de texto", "Strumenti di testo", "テキストツール", "Ferramentas de texto"),
  security: L("Security & crypto", "安全加密", "安全加密", "Seguridad y cifrado", "Sicurezza e crittografia", "セキュリティと暗号", "Segurança e criptografia"),
  generate: L("Generators", "生成器", "產生器", "Generadores", "Generatori", "ジェネレーター", "Geradores"),
  image: L("Images", "图片", "圖片", "Imágenes", "Immagini", "画像", "Imagens"),
};

export const optionLabels = {
  direction: L("Direction", "方向", "方向", "Dirección", "Direzione", "方向", "Direção"),
  path: L("Path", "路径", "路徑", "Ruta", "Percorso", "パス", "Caminho"),
  table: L("Table", "表名", "表名", "Tabla", "Tabella", "テーブル", "Tabela"),
  from: L("From", "从", "從", "Desde", "Da", "から", "De"),
  to: L("To", "到", "到", "Hasta", "A", "へ", "Para"),
  now: L("Mode", "模式", "模式", "Modo", "Modalità", "モード", "Modo"),
  mode: L("Mode", "模式", "模式", "Modo", "Modalità", "モード", "Modo"),
  encoding: L("Encoding", "编码", "編碼", "Codificación", "Codifica", "エンコーディング", "Codificação"),
  language: L("Language", "语言", "語言", "Idioma", "Lingua", "言語", "Idioma"),
  kind: L("Kind", "类型", "類型", "Tipo", "Tipo", "種類", "Tipo"),
  sm4Mode: L("SM4 mode", "SM4 模式", "SM4 模式", "Modo SM4", "Modalità SM4", "SM4 モード", "Modo SM4"),
  url: L("Variant", "变体", "變體", "Variante", "Variante", "バリアント", "Variante"),
  mime: L("MIME", "MIME", "MIME", "MIME", "MIME", "MIME", "MIME"),
  op: L("Operation", "操作", "操作", "Operación", "Operazione", "操作", "Operação"),
  algorithm: L("Algorithm", "算法", "演算法", "Algoritmo", "Algoritmo", "アルゴリズム", "Algoritmo"),
  inputHex: L("Input format", "输入格式", "輸入格式", "Formato de entrada", "Formato di input", "入力形式", "Formato de entrada"),
  action: L("Action", "操作", "操作", "Acción", "Azione", "操作", "Ação"),
  sortKeys: L("Key order", "键顺序", "鍵順序", "Orden de claves", "Ordine chiavi", "キー順", "Ordem das chaves"),
  style: L("Style", "风格", "風格", "Estilo", "Stile", "スタイル", "Estilo"),
  find: L("Find", "查找", "尋找", "Buscar", "Trova", "検索", "Localizar"),
  replace: L("Replace", "替换", "取代", "Reemplazar", "Sostituisci", "置換", "Substituir"),
  pattern: L("Pattern", "表达式", "運算式", "Patrón", "Espressione", "パターン", "Padrão"),
  flags: L("Flags", "标志", "旗標", "Indicadores", "Flag", "フラグ", "Flags"),
  affix: L("Affix", "前后缀", "前後綴", "Afijo", "Affisso", "接辞", "Afixo"),
  size: L("Length", "长度", "長度", "Longitud", "Lunghezza", "長さ", "Comprimento"),
  length: L("Length", "长度", "長度", "Longitud", "Lunghezza", "長さ", "Comprimento"),
  symbols: L("Symbols", "符号", "符號", "Símbolos", "Simboli", "記号", "Símbolos"),
  paragraphs: L("Lines", "行数", "行數", "Líneas", "Righe", "行数", "Linhas"),
};
