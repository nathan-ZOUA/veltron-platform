// =============================================================================
// Chiffrement de bout en bout (E2EE) pour la messagerie d'équipe VELTRON
// Algorithmes Web Crypto natifs :
//   - Identité membre : ECDH sur courbe NIST P-256
//   - Échange de clé de salon : ECDH -> HKDF-SHA256 -> AES-256-GCM (wrapping)
//   - Messages : AES-256-GCM avec vecteur d'initialisation aléatoire 96 bits
// Les clés privées ne quittent JAMAIS l'appareil de l'utilisateur.
// =============================================================================

const enc = new TextEncoder();
const dec = new TextDecoder();

function toB64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function fromB64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export interface DeviceIdentity {
  publicJwk: JsonWebKey;
  privateKey: CryptoKey;
  fingerprint: string;
}

async function computeFingerprint(pub: JsonWebKey): Promise<string> {
  const canonical = JSON.stringify({ crv: pub.crv, kty: pub.kty, x: pub.x, y: pub.y });
  const digest = await crypto.subtle.digest("SHA-256", enc.encode(canonical));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function formatFingerprint(fp: string): string {
  return fp
    .slice(0, 32)
    .toUpperCase()
    .replace(/(.{4})/g, "$1 ")
    .trim();
}

export async function getOrCreateIdentity(agencyId: number, userId: number): Promise<DeviceIdentity> {
  const storageKey = `veltron-e2ee-v1-${agencyId}-${userId}`;
  const raw = localStorage.getItem(storageKey);

  if (raw) {
    try {
      const parsed = JSON.parse(raw) as { publicJwk: JsonWebKey; privateJwk: JsonWebKey };
      const privateKey = await crypto.subtle.importKey(
        "jwk",
        parsed.privateJwk,
        { name: "ECDH", namedCurve: "P-256" },
        false,
        ["deriveBits"],
      );
      const fingerprint = await computeFingerprint(parsed.publicJwk);
      return { publicJwk: parsed.publicJwk, privateKey, fingerprint };
    } catch {
      /* régénère si corrompu */
    }
  }

  const pair = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const publicJwk = await crypto.subtle.exportKey("jwk", pair.publicKey);
  const privateJwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
  delete publicJwk.key_ops;
  localStorage.setItem(storageKey, JSON.stringify({ publicJwk, privateJwk }));

  const nonExtractablePriv = await crypto.subtle.importKey(
    "jwk",
    privateJwk,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    ["deriveBits"],
  );
  const fingerprint = await computeFingerprint(publicJwk);
  return { publicJwk, privateKey: nonExtractablePriv, fingerprint };
}

async function derivePairWrappingKey(myPriv: CryptoKey, peerPubJwk: JsonWebKey): Promise<CryptoKey> {
  const peerPub = await crypto.subtle.importKey("jwk", peerPubJwk, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const sharedBits = await crypto.subtle.deriveBits({ name: "ECDH", public: peerPub }, myPriv, 256);
  const hkdfKey = await crypto.subtle.importKey("raw", sharedBits, "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: enc.encode("veltron-e2ee-chat-salt-v1"),
      info: enc.encode("group-key-wrap"),
    },
    hkdfKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function generateGroupKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
}

export async function wrapGroupKeyForMember(
  groupKey: CryptoKey,
  myIdentity: DeviceIdentity,
  recipientPubJwk: JsonWebKey,
): Promise<{ iv: string; wrapped_key: string; sender_public_jwk: JsonWebKey }> {
  const rawGroup = await crypto.subtle.exportKey("raw", groupKey);
  const wrapKey = await derivePairWrappingKey(myIdentity.privateKey, recipientPubJwk);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, wrapKey, rawGroup);
  return {
    iv: toB64(iv),
    wrapped_key: toB64(encrypted),
    sender_public_jwk: myIdentity.publicJwk,
  };
}

export async function unwrapGroupKey(
  myIdentity: DeviceIdentity,
  senderPubJwk: JsonWebKey,
  ivB64: string,
  wrappedB64: string,
): Promise<CryptoKey> {
  const wrapKey = await derivePairWrappingKey(myIdentity.privateKey, senderPubJwk);
  const rawGroup = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromB64(ivB64) as BufferSource },
    wrapKey,
    fromB64(wrappedB64) as BufferSource,
  );
  return crypto.subtle.importKey("raw", rawGroup, { name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
}

export async function encryptMessage(groupKey: CryptoKey, plaintext: string): Promise<{ iv: string; ciphertext: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, groupKey, enc.encode(plaintext));
  return { iv: toB64(iv), ciphertext: toB64(ct) };
}

export async function decryptMessage(groupKey: CryptoKey, ivB64: string, ciphertextB64: string): Promise<string> {
  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromB64(ivB64) as BufferSource },
    groupKey,
    fromB64(ciphertextB64) as BufferSource,
  );
  return dec.decode(pt);
}

