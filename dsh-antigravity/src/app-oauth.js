// Import public OAuth APPLICATION configuration only. Never read user tokens or application state.
import * as fs from "node:fs/promises";
import { constants } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
import { basename, isAbsolute, join, resolve } from "node:path";

const execFileAsync = promisify(execFile);
const DEFAULT_APP = "/Applications/Antigravity.app";
const BUNDLE_ID = "com.google.antigravity";
const TEAM_ID = "EQHXZ8M8AV";
// Do not trust display strings alone: require a certificate anchored in Apple's trust chain.
const SIGNING_REQUIREMENT = `=anchor apple generic and identifier "${BUNDLE_ID}" and certificate leaf[subject.OU] = "${TEAM_ID}"`;
const MAX_IMAGE_BYTES = 256 * 1024 * 1024;
const MAX_MANIFEST_BYTES = 4 * 1024 * 1024;
const CONFIG_SYMBOL = "google3/third_party/jetski/language_server/code_assist_client/codeassistclient.getOAuth2Config";
// Reviewed App 2.29 ARM64 Go function shape, NOT a credential or a binary-wide string fingerprint.
// Only ADRP/page ADD relocations and BL destinations are normalized. BL targets are checked separately.
// A compiler/layout change must be reviewed explicitly; never guess among client strings after failure.
const CONFIG_SHAPE = "3c359cbf5cf9c3b8fb2fc0f3ef0217a915d60d16ab286aedee27c2dada9543c7";
const CALLS = new Map([
  [0x200, "runtime.growslice"], [0x238, "runtime.typedslicecopy"], [0x290, "runtime.growslice"],
  [0x2b4, "runtime.newobject"], [0x2d4, "runtime.gcWriteBarrier2"], [0x308, "runtime.gcWriteBarrier1"],
  [0x324, "runtime.wbMove"], [0x368, "runtime.gopanic"], [0x37c, "runtime.gopanic"], [0x388, "runtime.morestack_noctxt"],
]);
function fail(message) {
  const error = new Error(`Official Antigravity App OAuth import: ${message}`);
  error.code = "ERR_ANTIGRAVITY_APP_IMPORT";
  throw error;
}
function check(condition, message) { if (!condition) fail(message); }
function sha256(value, encoding = "hex") { return createHash("sha256").update(value).digest(encoding); }
function asciiName(buffer, offset, max) {
  const end = buffer.indexOf(0, offset);
  check(end >= offset && end - offset <= max, "invalid Go symbol name");
  return buffer.toString("utf8", offset, end);
}

/** Pure, bounded parser. This verifies structure, NOT authenticity; use the importer on untrusted files. */
export function extractOfficialAppOAuthConfig(value) {
  check(value instanceof Uint8Array, "expected a binary byte array");
  check(value.byteLength >= 4096 && value.byteLength <= MAX_IMAGE_BYTES, "binary size is outside the supported bounds");
  const image = Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  function bounds(offset, length) {
    check(Number.isSafeInteger(offset) && Number.isSafeInteger(length) && offset >= 0 && length >= 0 && offset + length <= image.length, "binary reference is out of bounds");
  }
  const u32 = offset => { bounds(offset, 4); return image.readUInt32LE(offset); };
  const i32 = offset => { bounds(offset, 4); return image.readInt32LE(offset); };
  const u64 = offset => {
    bounds(offset, 8); const n = image.readBigUInt64LE(offset);
    check(n <= BigInt(Number.MAX_SAFE_INTEGER), "unsupported 64-bit address"); return Number(n);
  };
  const fixed = offset => { bounds(offset, 16); return image.toString("utf8", offset, offset + 16).replace(/\0.*$/, ""); };
  check(u32(0) === 0xfeedfacf && u32(4) === 0x0100000c && u32(8) === 0 && u32(12) === 2, "unsupported binary format or architecture (requires thin ARM64 Mach-O)");
  const commandCount = u32(16), commandBytes = u32(20);
  check(commandCount > 0 && commandCount <= 128 && commandBytes <= 65536, "invalid Mach-O command table");
  bounds(32, commandBytes);
  const segments = [], sections = new Map();
  let cursor = 32;
  for (let index = 0; index < commandCount; index++) {
    const kind = u32(cursor), size = u32(cursor + 4);
    check(size >= 8 && size % 8 === 0 && cursor + size <= 32 + commandBytes, "invalid Mach-O load command");
    if (kind === 0x19) {
      check(size >= 72, "invalid segment command");
      const segment = { name: fixed(cursor + 8), address: u64(cursor + 24), vmSize: u64(cursor + 32), offset: u64(cursor + 40), size: u64(cursor + 48), protection: u32(cursor + 60) };
      const count = u32(cursor + 64);
      check(count <= 256 && 72 + count * 80 === size && segment.size <= segment.vmSize, "invalid segment or section table");
      bounds(segment.offset, segment.size);
      check(Number.isSafeInteger(segment.address + segment.vmSize), "invalid segment address");
      if (segment.size > 0) {
        for (const previous of segments) check(segment.offset + segment.size <= previous.offset || previous.offset + previous.size <= segment.offset, "overlapping file-backed segments");
        segments.push(segment);
      }
      for (let j = 0; j < count; j++) {
        const at = cursor + 72 + j * 80;
        const section = { name: fixed(at), segment: fixed(at + 16), address: u64(at + 32), size: u64(at + 40), offset: u32(at + 48), flags: u32(at + 64) };
        check(section.segment === segment.name && section.address >= segment.address && section.address + section.size <= segment.address + segment.vmSize, "invalid section range");
        const sectionType = section.flags & 0xff;
        if (![1, 12, 18].includes(sectionType)) {
          bounds(section.offset, section.size);
          check(section.offset >= segment.offset && section.offset + section.size <= segment.offset + segment.size && section.address - segment.address === section.offset - segment.offset, "invalid file-backed section mapping");
        }
        const key = `${section.segment}/${section.name}`;
        check(!sections.has(key), "ambiguous Mach-O section"); sections.set(key, section);
      }
    }
    cursor += size;
  }
  check(cursor === 32 + commandBytes, "Mach-O load command size mismatch");
  function section(key) { const result = sections.get(key); check(result, "required Mach-O section is missing"); return result; }
  function inSection(address, length, target) { return Number.isSafeInteger(address) && Number.isSafeInteger(length) && length >= 0 && address >= target.address && address + length <= target.address + target.size; }
  function addressOffset(address, length) {
    const matches = segments.filter(segment => address >= segment.address && address + length <= segment.address + segment.size);
    check(matches.length === 1, "ambiguous or unmapped binary address");
    const offset = matches[0].offset + address - matches[0].address; bounds(offset, length); return offset;
  }
  const text = section("__TEXT/__text"), pcln = section("__TEXT/__lrodata_gopcln"), types = section("__DATA_CONST/__go_type"), rodata = section("__TEXT/__rodata");
  check([text, pcln, types, rodata].every(item => (item.flags & 0xff) === 0), "required sections must be regular file-backed data");
  const base = pcln.offset;
  check(pcln.size >= 72 && u32(base) === 0xfffffff1 && image[base + 4] === 0 && image[base + 5] === 0 && image[base + 6] === 4 && image[base + 7] === 8, "unsupported Go pclntab format");
  const count = u64(base + 8), textStart = u64(base + 24);
  check(count > 0 && count <= 300000 && (textStart === 0 || textStart === text.address), "unsupported Go text mapping");
  const offsets = [32, 40, 48, 56, 64].map(at => u64(base + at));
  check(offsets[0] === 72 && offsets.every((offset, i) => offset < pcln.size && (!i || offset > offsets[i - 1])), "invalid Go metadata sections");
  const names = image.subarray(base + offsets[0], base + offsets[1]);
  const table = base + offsets[4], tableEnd = base + pcln.size;
  check(table + (count + 1) * 8 <= tableEnd, "invalid Go function table");
  const marker = Buffer.from(`${CONFIG_SYMBOL}\0`);
  const nameMatches = [];
  for (let at = names.indexOf(marker); at !== -1; at = names.indexOf(marker, at + 1)) {
    if (at === 0 || names[at - 1] === 0) nameMatches.push(at);
  }
  check(nameMatches.length === 1, "OAuth configuration symbol is missing or ambiguous");
  const functions = new Map(); let selected; let selectedCount = 0;
  for (let i = 0; i < count; i++) {
    const entry = u32(table + i * 8), next = u32(table + (i + 1) * 8), funcOffset = u32(table + i * 8 + 4);
    check((i !== 0 || entry === 0) && entry < next && next <= text.size && funcOffset >= (count + 1) * 8 && table + funcOffset + 8 <= tableEnd, "invalid Go function entry");
    const info = table + funcOffset;
    check(u32(info) === entry, "Go function entry mismatch");
    const nameOffset = i32(info + 4);
    check(nameOffset >= 0 && nameOffset < names.length, "invalid Go function name offset");
    functions.set(text.address + entry, nameOffset);
    if (nameOffset === nameMatches[0]) { selectedCount++; selected = { address: text.address + entry, offset: text.offset + entry, size: next - entry }; }
  }
  check(selectedCount === 1 && selected.size === 0x390, "OAuth configuration function is ambiguous or has an unsupported layout");
  const body = image.subarray(selected.offset, selected.offset + selected.size), normalized = Buffer.from(body);
  let previous;
  for (let at = 0; at < body.length; at += 4) {
    const instruction = body.readUInt32LE(at); let normalizedInstruction = instruction;
    if (((instruction & 0x9f000000) >>> 0) === 0x90000000) normalizedInstruction = instruction & 0x9f00001f;
    else if (((instruction & 0xfc000000) >>> 0) === 0x94000000) {
      normalizedInstruction = 0x94000000;
      let delta = instruction & 0x03ffffff; if (delta & 0x02000000) delta -= 0x04000000;
      const target = selected.address + at + delta * 4, nameOffset = functions.get(target);
      check(nameOffset !== undefined && CALLS.has(at) && asciiName(names, nameOffset, 256) === CALLS.get(at), "unexpected OAuth function call target");
    } else if (((instruction & 0xffc00000) >>> 0) === 0x91000000 && previous !== undefined && ((previous & 0x9f000000) >>> 0) === 0x90000000 && (instruction & 31) === (previous & 31) && ((instruction >>> 5) & 31) === (previous & 31)) {
      normalizedInstruction = instruction & ~0x003ffc00;
    }
    normalized.writeUInt32LE(normalizedInstruction >>> 0, at); previous = instruction;
  }
  check(sha256(normalized) === CONFIG_SHAPE, "unsupported OAuth ARM64 instruction layout");
  function decodeAddress(at, register) {
    const adrp = body.readUInt32LE(at), add = body.readUInt32LE(at + 4);
    check(((adrp & 0x9f000000) >>> 0) === 0x90000000 && (adrp & 31) === register && ((add & 0xffc00000) >>> 0) === 0x91000000 && (add & 31) === register && ((add >>> 5) & 31) === register, "invalid OAuth constant address instructions");
    let pages = ((adrp >>> 29) & 3) | (((adrp >>> 5) & 0x7ffff) << 2);
    if (pages & 0x100000) pages -= 0x200000;
    return Math.floor((selected.address + at) / 4096) * 4096 + pages * 4096 + ((add >>> 10) & 0xfff);
  }
  function goName(address) {
    check(inSection(address, 3, types), "Go type name is outside the type section");
    let at = addressOffset(address, 3) + 1, length = 0, shift = 0, byte;
    do { check(shift <= 14, "invalid Go type name length"); byte = image[at++]; length |= (byte & 127) << shift; shift += 7; } while (byte & 128);
    check(length > 0 && length <= 256 && inSection(address, at - addressOffset(address, 1) + length, types), "invalid Go type name");
    return image.toString("utf8", at, at + length);
  }
  const configType = decodeAddress(0x2ac, 0);
  check(inSection(configType, 80, types), "OAuth allocation type is outside the type section");
  const configAt = addressOffset(configType, 80);
  check((image[configAt + 23] & 31) === 25 && goName(types.address + i32(configAt + 40)).replace(/^\*/, "") === "oauth2.Config", "OAuth function no longer allocates oauth2.Config");
  const fieldsAddress = u64(configAt + 56), fieldCount = u64(configAt + 64);
  check(fieldCount === 6 && u64(configAt + 72) === fieldCount && inSection(fieldsAddress, fieldCount * 24, types), "unsupported OAuth Config field layout");
  const fields = new Map();
  for (let i = 0; i < fieldCount; i++) {
    const at = addressOffset(fieldsAddress + i * 24, 24), name = goName(u64(at));
    check(!fields.has(name), "ambiguous OAuth Config field"); fields.set(name, u64(at + 16));
  }
  check(fields.get("ClientID") === 0 && fields.get("ClientSecret") === 16 && fields.get("Endpoint") === 32 && fields.get("RedirectURL") === 88 && fields.get("Scopes") === 104, "OAuth Config field offsets changed");
  // The reviewed coalesce blocks load optional overrides first and these normal-consumer defaults second.
  // Their results flow through the reviewed stack slots to this SAME allocation's ClientID/ClientSecret.
  function constant(at, pointerRegister, lengthRegister, minimum, maximum) {
    const address = decodeAddress(at, pointerRegister), movz = body.readUInt32LE(at + 8);
    check(((movz & 0xffe0001f) >>> 0) === ((0xd2800000 | lengthRegister) >>> 0), "invalid OAuth string length instruction");
    const length = (movz >>> 5) & 0xffff;
    check(length >= minimum && length <= maximum && inSection(address, length, rodata), "OAuth constant is outside read-only string data");
    const offset = addressOffset(address, length); return image.toString("utf8", offset, offset + length);
  }
  const clientId = constant(0xa0, 6, 7, 32, 128), clientSecret = constant(0xfc, 7, 9, 16, 128);
  check(/^[0-9]{6,}-[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/.test(clientId) && /^GOCSPX-[A-Za-z0-9_-]+$/.test(clientSecret), "invalid public OAuth application constants");
  return { clientId, clientSecret };
}

async function inspectPath(applicationPath) {
  check(typeof applicationPath === "string" && applicationPath.length <= 4096 && !applicationPath.includes("\0") && isAbsolute(applicationPath), "application path must be absolute");
  const root = resolve(applicationPath);
  check(basename(root) === "Antigravity.app", "application path must name Antigravity.app");
  check(await fs.realpath(root) === root, "symlinked application paths are not accepted");
  for (const relative of ["", "Contents", "Contents/Resources", "Contents/Resources/bin", "Contents/_CodeSignature"]) {
    const stat = await fs.lstat(join(root, relative));
    check(stat.isDirectory() && !stat.isSymbolicLink(), "invalid application directory boundary");
  }
  return root;
}
async function verifySignedApp(root) {
  const options = { timeout: 60000, maxBuffer: 512 * 1024 };
  try { await execFileAsync("/usr/bin/codesign", ["--verify", "--deep", "--strict", "-R", SIGNING_REQUIREMENT, root], options); }
  catch (error) {
    if (/FinderInfo|resource fork|detritus/.test(String(error?.stderr))) fail("signature verification failed: invalid FinderInfo/resource metadata; repair the official installation before importing");
    fail("signature verification failed");
  }
  let result;
  try { result = await execFileAsync("/usr/bin/codesign", ["--display", "--verbose=4", root], options); }
  catch { fail("could not inspect application signing identity"); }
  const lines = `${result.stdout}\n${result.stderr}`.split(/\r?\n/);
  function fact(key) {
    const values = lines.filter(line => line.startsWith(`${key}=`)).map(line => line.slice(key.length + 1));
    check(values.length === 1, "ambiguous application signing identity"); return values[0];
  }
  check(fact("Identifier") === BUNDLE_ID && fact("TeamIdentifier") === TEAM_ID, "application is not signed by the expected Google identity");
  const cdHash = fact("CDHash"); check(/^[a-f0-9]{40,64}$/.test(cdHash), "invalid application signature digest"); return cdHash;
}
function sameFile(a, b) { return ["dev", "ino", "size", "mtimeNs", "ctimeNs"].every(key => a[key] === b[key]); }
async function readBounded(file, maximum) {
  const beforePath = await fs.lstat(file, { bigint: true });
  check(beforePath.isFile() && !beforePath.isSymbolicLink() && beforePath.size > 0n && beforePath.size <= BigInt(maximum), "invalid public resource file or size");
  check(await fs.realpath(file) === file, "public resource escapes the application boundary");
  const handle = await fs.open(file, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const before = await handle.stat({ bigint: true });
    check(sameFile(beforePath, before), "public resource changed before reading");
    const bytes = Buffer.alloc(Number(before.size)); let position = 0;
    while (position < bytes.length) {
      const { bytesRead } = await handle.read(bytes, position, bytes.length - position, position);
      check(bytesRead > 0, "public resource was truncated"); position += bytesRead;
    }
    const extra = await handle.read(Buffer.alloc(1), 0, 1, bytes.length);
    check(extra.bytesRead === 0 && sameFile(before, await handle.stat({ bigint: true })), "public resource changed while reading");
    return { bytes, stat: before };
  } finally { await handle.close(); }
}
function sealedBinaryHash(manifest) {
  const source = manifest.toString("utf8");
  check(!source.includes("<!ENTITY"), "unsupported signed resource manifest");
  const start = source.indexOf("<key>files2</key>");
  check(start >= 0 && source.indexOf("<key>files2</key>", start + 1) === -1, "ambiguous signed resource manifest");
  const section = source.slice(start), key = "<key>Resources/bin/language_server</key>";
  check(section.indexOf(key) >= 0 && section.indexOf(key, section.indexOf(key) + 1) === -1, "language server is not uniquely sealed");
  const match = section.match(/<key>Resources\/bin\/language_server<\/key>\s*<dict>\s*<key>hash2<\/key>\s*<data>\s*([A-Za-z0-9+/=\s]+?)\s*<\/data>\s*<\/dict>/);
  check(match, "language server has an unsupported resource seal");
  const hash = match[1].replace(/\s/g, "");
  check(/^[A-Za-z0-9+/]{43}=$/.test(hash) && Buffer.from(hash, "base64").length === 32, "invalid language server resource seal"); return hash;
}

/** Verify the Google-signed App twice, then return only its normal public OAuth application pair. */
export async function importOfficialAppOAuthConfig(applicationPath = DEFAULT_APP) {
  check(process.platform === "darwin", "automatic App import is supported only on macOS");
  try {
    const root = await inspectPath(applicationPath), firstIdentity = await verifySignedApp(root);
    const manifestPath = join(root, "Contents/_CodeSignature/CodeResources"), binaryPath = join(root, "Contents/Resources/bin/language_server");
    const manifest = await readBounded(manifestPath, MAX_MANIFEST_BYTES);
    const binary = await readBounded(binaryPath, MAX_IMAGE_BYTES);
    check(sha256(binary.bytes, "base64") === sealedBinaryHash(manifest.bytes), "language server does not match its signed resource seal");
    const pair = extractOfficialAppOAuthConfig(binary.bytes);
    check(await inspectPath(root) === root && await verifySignedApp(root) === firstIdentity, "application changed during import");
    const afterManifest = await readBounded(manifestPath, MAX_MANIFEST_BYTES);
    const afterBinary = await fs.lstat(binaryPath, { bigint: true });
    check(sameFile(manifest.stat, afterManifest.stat) && sha256(manifest.bytes) === sha256(afterManifest.bytes) && sameFile(binary.stat, afterBinary) && !afterBinary.isSymbolicLink() && await fs.realpath(binaryPath) === binaryPath, "application resources changed during import");
    return pair;
  } catch (error) {
    if (error?.code === "ERR_ANTIGRAVITY_APP_IMPORT") throw error;
    fail("could not safely read the official application resources");
  }
}
