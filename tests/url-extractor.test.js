import test from "node:test";
import assert from "node:assert/strict";
import { extractLinks, linkGroup } from "../src/lib/contentExpansion.js";

test("extracts hierarchical and opaque protocols without rewriting their schemes", () => {
  const links = [
    "https://example.com/", "http://localhost:3000/api", "ftp://files.example.com/a.zip",
    "ftps://files.example.com/a.zip", "sftp://server.example.com/home", "ssh://user@server:22/home",
    "ws://localhost:8080/", "wss://socket.example.com/live", "file:///C:/Work/readme.txt",
    "my-app+v2://open/document?id=1", "mailto:hello@example.com", "tel:+8613800000000",
    "sms:+123456789", "magnet:?xt=urn:btih:abcdef", "urn:isbn:9781234567890", "geo:39.9,116.4",
    "news:comp.lang.javascript", "bitcoin:abc123?amount=1",
  ];
  assert.deepEqual(extractLinks(links.join("\n")), links);
});

test("bare hosts preserve queries, fragments, ports and Unicode domains", () => {
  assert.deepEqual(extractLinks("example.com?q=1#top www.example.com:8080/a?x=2 192.168.1.10:8080/api [::1]:3000/x localhost:5173/ //cdn.example.com/app.js 例子.中国/文档"), [
    "https://example.com/?q=1#top", "https://www.example.com:8080/a?x=2", "https://192.168.1.10:8080/api",
    "https://[::1]:3000/x", "https://localhost:5173/", "https://cdn.example.com/app.js",
    new URL("https://例子.中国/文档").href,
  ]);
});

test("Markdown brackets and Chinese prose do not pollute links; balanced URL brackets survive", () => {
  assert.deepEqual(extractLinks("[Wiki](https://example.com/wiki/Test_(topic)). 访问（https://example.com/a），然后 https://example.com/b。"), [
    "https://example.com/wiki/Test_(topic)", "https://example.com/a", "https://example.com/b",
  ]);
  assert.deepEqual(extractLinks("https://example.com/search?q=why?"), ["https://example.com/search?q=why?"]);
});

test("HTML attribute entities are decoded without altering literal plain text ampersands", () => {
  assert.deepEqual(extractLinks('<a href="https://example.com/?q=1&amp;p=2&#35;top">link</a> https://example.com/?q=&amp;'), [
    "https://example.com/?q=1&p=2#top", "https://example.com/?q=&amp;",
  ]);
});

test("deduplication is optional and sorting, stripping, and protocol grouping compose", () => {
  const text = "https://b.example/a?x=1#top tel:+123 file:///tmp/a https://b.example/a?x=2#end";
  assert.deepEqual(extractLinks(text, { keepQuery: false, sort: true }), ["file:///tmp/a", "https://b.example/a", "tel:+123"]);
  assert.equal(extractLinks(text, { keepQuery: false, deduplicate: false }).length, 4);
  const groups = extractLinks(text, { group: true });
  assert.deepEqual(groups.tel, ["tel:+123"]);
  assert.deepEqual(groups.file, ["file:///tmp/a"]);
  assert.equal(linkGroup("magnet:?xt=urn:btih:abc"), "magnet");
});

test("email addresses, invalid IPs, and executable schemes are not extracted as web links", () => {
  assert.deepEqual(extractLinks("hello@example.com a.b@example.org 999.999.999.999 javascript://example.com data://example.org vbscript://example.net"), []);
  assert.deepEqual(extractLinks(""), []);
  assert.deepEqual(extractLinks("a".repeat(100000)), []);
});
