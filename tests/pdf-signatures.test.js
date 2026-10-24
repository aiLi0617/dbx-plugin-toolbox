import test from "node:test";
import assert from "node:assert/strict";
import * as asn1 from "asn1js";
import {
  Certificate,
  AttributeTypeAndValue,
  ContentInfo,
  SignedData,
  EncapsulatedContentInfo,
  SignerInfo,
  IssuerAndSerialNumber,
} from "pkijs";
import { PDFDocument, PDFName, PDFHexString } from "@cantoo/pdf-lib";
import { pdfSignatureData } from "../src/lib/lazy/pdf-tools.js";
import { inspectSignature } from "../src/lib/lazy/pdf-signatures.js";

async function signedFixture() {
  const keys = await crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"],
  );
  const certificate = new Certificate();
  certificate.version = 2;
  certificate.serialNumber = new asn1.Integer({ value: 1 });
  certificate.issuer.typesAndValues.push(
    new AttributeTypeAndValue({
      type: "2.5.4.3",
      value: new asn1.Utf8String({ value: "Toolbox test certificate" }),
    }),
  );
  certificate.subject.typesAndValues = certificate.issuer.typesAndValues;
  certificate.notBefore.value = new Date("2020-01-01");
  certificate.notAfter.value = new Date("2040-01-01");
  await certificate.subjectPublicKeyInfo.importKey(keys.publicKey);
  await certificate.sign(keys.privateKey, "SHA-256");
  const pdf = await PDFDocument.create();
  pdf.setTitle("Alpha");
  pdf.addPage().drawText("Signature fixture");
  const dict = pdf.context.obj({
    Type: "Sig",
    Filter: "Adobe.PPKLite",
    SubFilter: "adbe.pkcs7.detached",
    ByteRange: [0, 1111111111, 2222222222, 3333333333],
    Contents: PDFHexString.of("0".repeat(16384)),
  });
  pdf.catalog.set(PDFName.of("TestSignature"), pdf.context.register(dict));
  let raw = new TextDecoder("latin1").decode(
    await pdf.save({ useObjectStreams: false }),
  );
  // The serialized PDF has only ASCII text here; use Buffer's latin1 mapping to retain header bytes.
  const source = await pdf.save({ useObjectStreams: false });
  raw = Buffer.from(source).toString("latin1");
  const gapStart = raw.indexOf("<" + "0".repeat(64)),
    gapEnd = gapStart + 16386;
  assert.ok(gapStart > 0);
  raw = raw
    .replace("1111111111", String(gapStart).padStart(10, "0"))
    .replace("2222222222", String(gapEnd).padStart(10, "0"))
    .replace("3333333333", String(raw.length - gapEnd).padStart(10, "0"));
  const signedBytes = Buffer.concat([
    Buffer.from(raw.slice(0, gapStart), "latin1"),
    Buffer.from(raw.slice(gapEnd), "latin1"),
  ]);
  const cms = new SignedData({
    version: 1,
    encapContentInfo: new EncapsulatedContentInfo({
      eContentType: "1.2.840.113549.1.7.1",
    }),
    certificates: [certificate],
    signerInfos: [
      new SignerInfo({
        version: 1,
        sid: new IssuerAndSerialNumber({
          issuer: certificate.issuer,
          serialNumber: certificate.serialNumber,
        }),
      }),
    ],
  });
  await cms.sign(keys.privateKey, 0, "SHA-256", signedBytes);
  const info = new ContentInfo({
    contentType: "1.2.840.113549.1.7.2",
    content: cms.toSchema(true),
  });
  const hex = Buffer.from(info.toSchema().toBER(false)).toString("hex");
  assert.ok(hex.length < 16384);
  return new Uint8Array(
    Buffer.from(
      raw.slice(0, gapStart + 1) +
        hex.padEnd(16384, "0") +
        raw.slice(gapEnd - 1),
      "latin1",
    ),
  );
}
test("PDF signature verification distinguishes signed integrity from system trust and later modifications", async () => {
  const source = await signedFixture();
  const entries = await pdfSignatureData(source);
  assert.equal(entries.length, 1);
  const result = await inspectSignature(entries[0]);
  assert.equal(result.contentIntegrity, "valid");
  assert.equal(result.systemTrust, "unverified");
  assert.equal(result.timestamp, "unverified");
  assert.equal(result.coversCurrentFile, true);
  const modified = source.slice();
  // Alter the binary comment after the PDF header without breaking PDF syntax.
  modified[12] ^= 1;
  const tampered = await inspectSignature(
    (await pdfSignatureData(modified))[0],
  );
  assert.equal(tampered.contentIntegrity, "invalid");
  const appended = new Uint8Array([
    ...source,
    ...new TextEncoder().encode("\n% later revision\n"),
  ]);
  assert.equal(
    (await inspectSignature((await pdfSignatureData(appended))[0]))
      .coversCurrentFile,
    false,
  );
});
