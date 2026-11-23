globalThis.btoa = (value) => __toolboxBtoa(Array.from(value, (char) => {
  const code = char.charCodeAt(0);
  if (code > 255) throw new Error("Expected byte characters in Base64 source");
  return code;
}));

globalThis.atob = (value) => __toolboxAtob(value).map(byte => String.fromCharCode(byte)).join("");

globalThis.TextEncoder = class {
  encode(value = "") {
    const out = [];
    for (const char of String(value)) {
      let code = char.codePointAt(0);
      if (code >= 0xd800 && code <= 0xdfff) code = 0xfffd;
      if (code <= 0x7f) out.push(code);
      else if (code <= 0x7ff) out.push(0xc0 | (code >> 6), 0x80 | (code & 63));
      else if (code <= 0xffff) out.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 63), 0x80 | (code & 63));
      else out.push(0xf0 | (code >> 18), 0x80 | ((code >> 12) & 63), 0x80 | ((code >> 6) & 63), 0x80 | (code & 63));
    }
    return Uint8Array.from(out);
  }
};

globalThis.TextDecoder = class {
  decode(bytes = []) {
    return __toolboxDecode(Array.from(bytes));
  }
};

globalThis.crypto = {
  getRandomValues(bytes) {
    bytes.set(__toolboxRandom(bytes.length));
    return bytes;
  },
};

globalThis.setTimeout = () => {
  throw new Error("The MCP utility engine only runs synchronous operations");
};

globalThis.URL = class {
  constructor(value, base = "") {
    const { query, ...fields } = JSON.parse(__toolboxUrl(String(value), String(base)));
    Object.assign(this, fields);
    this.searchParams = {
      get: key => query.find(([name]) => name === key)?.[1] ?? null,
      [Symbol.iterator]: () => query[Symbol.iterator](),
    };
  }

  toString() { return this.href; }
  toJSON() { return this.href; }
};
