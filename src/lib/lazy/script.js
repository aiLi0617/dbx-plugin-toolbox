import { format } from "prettier/standalone";
import * as estree from "prettier/plugins/estree";
import * as babel from "prettier/plugins/babel";
import * as typescript from "prettier/plugins/typescript";

export function formatScript(input, language, indent) {
  const isTypeScript = language === "typescript" || language === "ts";
  return format(input, {
    parser: isTypeScript ? "typescript" : "babel",
    plugins: [estree, isTypeScript ? typescript : babel],
    tabWidth: indent,
  });
}
