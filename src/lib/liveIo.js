import { quotedPrintable } from "./tools/encode.js";
import { slugify, sqlEscape, stripHtml } from "./simpleTransforms.js";

export const LIVE_IO_TOOLS = {
  "quoted-printable": {
    options: [
      {
        key: "mode",
        type: "select",
        ui: "segment",
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
    labels: (opts) =>
      opts.mode === "decode"
        ? {
            inputZh: "QP 文本",
            inputEn: "QP text",
            outputZh: "原文",
            outputEn: "Source",
            inputPlaceholderZh: "Hello=20world=21",
            inputPlaceholderEn: "Hello=20world=21",
          }
        : {
            inputZh: "原文",
            inputEn: "Source",
            outputZh: "QP 文本",
            outputEn: "QP text",
            inputPlaceholderZh: "Hello world!",
            inputPlaceholderEn: "Hello world!",
          },
    inputZh: "原文",
    inputEn: "Source",
    outputZh: "QP 文本",
    outputEn: "QP text",
  },
  slugify: {
    transform: (input) => slugify(input),
    inputZh: "文本",
    inputEn: "Text",
    outputZh: "Slug",
    outputEn: "Slug",
    inputPlaceholderZh: "Hello World 你好",
    inputPlaceholderEn: "Hello World",
  },
  "strip-html": {
    transform: (input) => stripHtml(input),
    inputZh: "HTML",
    inputEn: "HTML",
    outputZh: "文本",
    outputEn: "Text",
    inputPlaceholderZh: "<p>Hello <b>world</b></p>",
    inputPlaceholderEn: "<p>Hello <b>world</b></p>",
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
    inputPlaceholderZh: "O'Reilly\nline two",
    inputPlaceholderEn: "O'Reilly\nline two",
  },
};
