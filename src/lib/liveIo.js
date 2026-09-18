import { quotedPrintable } from "./tools/encode.js";
import { sqlEscape } from "./tools/convert.js";
import { slugify, stripHtml } from "./tools/text.js";

export const LIVE_IO_TOOLS = {
  "quoted-printable": {
    options: [
      {
        key: "mode",
        type: "select",
        zh: "模式",
        en: "Mode",
        values: [
          { value: "encode", zh: "编码", en: "Encode" },
          { value: "decode", zh: "解码", en: "Decode" },
        ],
      },
    ],
    defaults: { mode: "encode" },
    transform: (input, opts) => quotedPrintable(input, opts.mode === "decode"),
    inputZh: "输入",
    inputEn: "Input",
    outputZh: "输出",
    outputEn: "Output",
  },
  slugify: {
    transform: (input) => slugify(input),
    inputZh: "文本",
    inputEn: "Text",
    outputZh: "Slug",
    outputEn: "Slug",
  },
  "strip-html": {
    transform: (input) => stripHtml(input),
    inputZh: "HTML",
    inputEn: "HTML",
    outputZh: "文本",
    outputEn: "Text",
  },
  "sql-escape": {
    options: [
      {
        key: "comma",
        type: "checkbox",
        zh: "每行后面加逗号",
        en: "Comma after each line",
      },
    ],
    defaults: { comma: false },
    transform: (input, opts) => sqlEscape(input, opts),
    inputZh: "文本",
    inputEn: "Text",
    outputZh: "SQL 字符串",
    outputEn: "SQL string",
  },
};
