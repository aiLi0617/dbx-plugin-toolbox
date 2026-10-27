import { fromBER } from "asn1js";
import {
  ContentInfo,
  SignedData,
  setEngine,
  CryptoEngine,
  CertificateChainValidationEngine,
} from "pkijs";
setEngine(
  "browser",
  globalThis.crypto,
  new CryptoEngine({
    name: "browser",
    crypto: globalThis.crypto,
    subtle: globalThis.crypto.subtle,
  }),
);
export async function inspectSignature(entry) {
  const base = {
    byteRange: entry.range,
    coversCurrentFile: entry.coversCurrentFile,
    contentIntegrity: "unverified",
    certificateValidity: "unverified",
    certificateChain: "unverified",
    timestamp: "unverified",
    systemTrust: "unverified",
  };
  if (
    !["/adbe.pkcs7.detached", "/ETSI.CAdES.detached"].includes(entry.subFilter)
  )
    return { ...base, reason: "Unsupported PDF signature format" };
  try {
    const decoded = fromBER(
      entry.cms.buffer.slice(
        entry.cms.byteOffset,
        entry.cms.byteOffset + entry.cms.byteLength,
      ),
    );
    if (decoded.offset < 0) throw new Error("Invalid CMS signature");
    const info = new ContentInfo({ schema: decoded.result });
    const signed = new SignedData({ schema: info.content });
    const result = await signed.verify({
      signer: 0,
      data: entry.signed.buffer,
      checkChain: false,
      extendedMode: true,
    });
    const cert = result.signerCertificate;
    const subject = cert?.subject.typesAndValues
      .map((x) => `${x.type}=${x.value.valueBlock.value}`)
      .join(", ");
    const issuer = cert?.issuer.typesAndValues
      .map((x) => `${x.type}=${x.value.valueBlock.value}`)
      .join(", ");
    const now = new Date();
    let chain = "unverified";
    // Internal chain consistency is distinct from trust in an operating-system root store.
    if (cert && signed.certificates?.length) {
      try {
        const roots = signed.certificates.filter((c) =>
          c.subject?.isEqual(c.issuer),
        );
        if (roots.length) {
          const engine = new CertificateChainValidationEngine({
            trustedCerts: roots,
            certs: [...signed.certificates.filter((c) => c !== cert), cert],
            checkDate: now,
          });
          chain = (await engine.verify()).result
            ? "internally-valid; root not trusted"
            : "incomplete-or-invalid";
        }
      } catch {
        chain = "unverified";
      }
    }
    return {
      ...base,
      contentIntegrity: result.signatureVerified ? "valid" : "invalid",
      subject,
      issuer,
      notBefore: cert?.notBefore.value.toISOString(),
      notAfter: cert?.notAfter.value.toISOString(),
      certificateValidity: cert
        ? now >= cert.notBefore.value && now <= cert.notAfter.value
          ? "valid-now"
          : "outside-validity-period"
        : "unverified",
      certificateChain: chain,
    };
  } catch (e) {
    return {
      ...base,
      contentIntegrity:
        e.signatureVerified === false ? "invalid" : "unverified",
      reason: String(e.message || e),
    };
  }
}
