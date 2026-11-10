// Public application configuration only: never execute the program or read user tokens/state.
// This unsigned Windows build is trusted ONLY by an explicitly approved, exact SHA256 pin.
import * as fs from "node:fs/promises";
import { constants } from "node:fs";
import { createHash } from "node:crypto";
import { win32 as path } from "node:path";

const SUPPORTED_SHA256 = "d82033662f9a803a8d51805e1bef3520d77fe7948b4a5fd142b5f55a0053637b";
const SUPPORTED_BYTES = 193038848;
const MAX_IMAGE_BYTES = 256 * 1024 * 1024;
const CONFIG_SYMBOL = "google3/third_party/jetski/language_server/code_assist_client/codeassistclient.getOAuth2Config";
// App 2.30.0, x64 Go: exact reviewed instructions, including both coalesce loops and stores.
// No credential or binary-wide string fingerprint is embedded here. Updates fail closed.
const CONFIG_SHAPE = "407f35690e70565becab23c303df097c354411c7e94de0dc8e30c39e5c420b1c";
const CALLS = new Map([
  [0x281, "runtime.growslice"], [0x2cb, "runtime.typedslicecopy"], [0x333, "runtime.growslice"],
  [0x363, "runtime.newobject"], [0x386, "runtime.gcWriteBarrier2"], [0x3e0, "runtime.gcWriteBarrier1"],
  [0x400, "runtime.wbMove"], [0x460, "runtime.gopanic"], [0x473, "runtime.gopanic"], [0x479, "runtime.morestack_noctxt"],
]);
function fail(message) {
  const error = new Error(`Pinned Windows Antigravity App OAuth import: ${message}`);
  error.code = "ERR_ANTIGRAVITY_APP_IMPORT";
  throw error;
}
function check(condition, message) { if (!condition) fail(message); }
function sha256(value) { return createHash("sha256").update(value).digest("hex"); }

/** Pure, pinned PE/x64 Go parser. Returns only the reviewed normal-consumer application pair. */
export function extractWindowsAppOAuthConfig(value) {
  check(value instanceof Uint8Array, "expected a binary byte array");
  check(value.byteLength >= 4096 && value.byteLength <= MAX_IMAGE_BYTES, "binary size is outside the supported bounds");
  // Own the bytes before hashing, including when the caller supplied a shared/resizable view.
  const image = Buffer.from(value);
  check(sha256(image) === SUPPORTED_SHA256, "binary SHA256 is not the explicitly supported build");
  check(image.length === SUPPORTED_BYTES, "unsupported pinned binary size");
  function bounds(offset, length) {
    check(Number.isSafeInteger(offset) && Number.isSafeInteger(length) && offset >= 0 && length >= 0 && offset + length <= image.length, "binary reference is out of bounds");
  }
  const u16 = offset => { bounds(offset, 2); return image.readUInt16LE(offset); };
  const u32 = offset => { bounds(offset, 4); return image.readUInt32LE(offset); };
  const i32 = offset => { bounds(offset, 4); return image.readInt32LE(offset); };
  const u64 = offset => {
    bounds(offset, 8); const value = image.readBigUInt64LE(offset);
    check(value <= BigInt(Number.MAX_SAFE_INTEGER), "unsupported 64-bit address"); return Number(value);
  };
  check(u16(0) === 0x5a4d, "unsupported DOS header");
  const pe = u32(60);
  check(pe >= 64 && pe <= 4096 && u32(pe) === 0x4550 && u16(pe + 4) === 0x8664, "requires a PE x64 program");
  const sectionCount = u16(pe + 6), optionalSize = u16(pe + 20), optional = pe + 24;
  check(sectionCount > 0 && sectionCount <= 96 && optionalSize === 240 && u16(optional) === 0x20b && !(u16(pe + 22) & 0x2000), "unsupported PE headers");
  const imageBase = u64(optional + 24), imageSize = u32(optional + 56), headersSize = u32(optional + 60);
  check(imageBase > 0 && Number.isSafeInteger(imageBase + imageSize) && u32(optional + 108) === 16, "invalid PE address mapping");
  check(optional + optionalSize + sectionCount * 40 <= headersSize, "invalid PE section table"); bounds(0, headersSize);
  const sections = new Map();
  for (let index = 0; index < sectionCount; index++) {
    const at = optional + optionalSize + index * 40; bounds(at, 40);
    const name = image.toString("ascii", at, at + 8).replace(/\0.*$/, "");
    const virtualSize = u32(at + 8), rva = u32(at + 12), size = u32(at + 16), offset = u32(at + 20), flags = u32(at + 36);
    check(name && !sections.has(name) && virtualSize > 0 && rva >= headersSize && rva + Math.max(virtualSize, size) <= imageSize, "invalid PE section range");
    bounds(offset, size); check(!size || offset >= headersSize, "PE section overlaps headers");
    const section = { address: imageBase + rva, virtualSize, size: Math.min(size, virtualSize), rawSize: size, offset, flags };
    for (const previous of sections.values()) {
      check(offset + size <= previous.offset || previous.offset + previous.rawSize <= offset, "overlapping PE file sections");
      check(section.address + virtualSize <= previous.address || previous.address + previous.virtualSize <= section.address, "overlapping PE virtual sections");
    }
    sections.set(name, section);
  }
  function section(name, flags) {
    const result = sections.get(name);
    check(result && result.flags === flags, "required PE section is missing or has unsupported permissions"); return result;
  }
  const text = section(".text", 0x60000020), rodata = section(".rdata", 0x40000040), data = section(".data", 0xc0000040);
  function inSection(address, length, target) {
    return Number.isSafeInteger(address) && Number.isSafeInteger(length) && length >= 0 && address >= target.address && address + length <= target.address + target.size;
  }
  function addressOffset(address, length, target) {
    check(inSection(address, length, target), "binary address is outside its required file-backed section");
    const offset = target.offset + address - target.address; bounds(offset, length); return offset;
  }
  function uniqueOffset(haystack, needle, message) {
    const offset = haystack.indexOf(needle);
    check(offset >= 0 && haystack.indexOf(needle, offset + 1) === -1, message); return offset;
  }
  // Search only structural magic inside read-only PE data, never OAuth strings across the image.
  const pclnOffset = uniqueOffset(image.subarray(rodata.offset, rodata.offset + rodata.size), Buffer.from([0xf1, 0xff, 0xff, 0xff, 0, 0, 1, 8]), "Go pclntab is missing or ambiguous");
  const base = rodata.offset + pclnOffset, pclnAddress = rodata.address + pclnOffset;
  addressOffset(pclnAddress, 72, rodata);
  const count = u64(base + 8), textStart = u64(base + 24), offsets = [32, 40, 48, 56, 64].map(at => u64(base + at));
  check(count > 0 && count <= 300000 && textStart === 0 && offsets[0] === 72 && offsets.every((offset, index) => offset < rodata.size - pclnOffset && (!index || offset > offsets[index - 1])), "unsupported Go pclntab layout");
  const pointer = Buffer.alloc(8); pointer.writeBigUInt64LE(BigInt(pclnAddress));
  const moduleOffset = uniqueOffset(image.subarray(data.offset, data.offset + data.size), pointer, "Go moduledata is missing or ambiguous");
  check(moduleOffset % 8 === 0, "unaligned Go moduledata");
  const module = data.offset + moduleOffset; addressOffset(data.address + moduleOffset, 352, data);
  for (let index = 0; index < 4; index++) {
    const at = module + 8 + index * 24;
    check(u64(at) === pclnAddress + offsets[index] && u64(at + 8) === u64(at + 16), "Go metadata slice mismatch");
    const multiplier = index === 1 ? 4 : 1;
    check(u64(at + 8) * multiplier === offsets[index + 1] - offsets[index], "invalid Go metadata slice length");
  }
  const tableAddress = pclnAddress + offsets[4], tableSize = u64(module + 112);
  check(u64(module + 104) === tableAddress && u64(module + 120) === tableSize && tableSize >= (count + 1) * 8, "invalid Go function metadata slice");
  const table = addressOffset(tableAddress, tableSize, rodata), tableEnd = table + tableSize;
  check(u64(module + 128) === tableAddress && u64(module + 136) === count + 1 && u64(module + 144) === count + 1 && u64(module + 160) === text.address && u64(module + 176) === text.address, "unsupported Go text/module mapping");
  const textEnd = u64(module + 168);
  check(inSection(text.address, textEnd - text.address, text) && u64(module + 184) >= textEnd, "invalid Go text extent");
  const names = image.subarray(base + offsets[0], base + offsets[1]);
  const marker = Buffer.from(`${CONFIG_SYMBOL}\0`), selectedName = uniqueOffset(names, marker, "OAuth configuration symbol is missing or ambiguous");
  check(selectedName === 0 || names[selectedName - 1] === 0, "invalid OAuth configuration symbol boundary");
  function symbol(offset) {
    check(offset >= 0 && offset < names.length, "invalid Go symbol offset");
    const end = names.indexOf(0, offset); check(end >= offset && end - offset <= 256, "invalid Go symbol name");
    return names.toString("utf8", offset, end);
  }
  const functions = new Map(); let selected, selectedCount = 0;
  for (let index = 0; index < count; index++) {
    const entry = u32(table + index * 8), next = u32(table + (index + 1) * 8), infoOffset = u32(table + index * 8 + 4);
    check((index !== 0 || entry === 0) && entry < next && text.address + next <= textEnd && infoOffset >= (count + 1) * 8 && infoOffset + 8 <= tableSize, "invalid Go function entry");
    const info = table + infoOffset, nameOffset = i32(info + 4);
    check(u32(info) === entry && nameOffset >= 0 && nameOffset < names.length, "Go function metadata mismatch");
    functions.set(text.address + entry, nameOffset);
    if (nameOffset === selectedName) { selectedCount++; selected = { address: text.address + entry, offset: addressOffset(text.address + entry, next - entry, text), size: next - entry }; }
  }
  check(tableEnd <= rodata.offset + rodata.size && selectedCount === 1 && selected.size === 0x4a0, "unsupported OAuth configuration function extent");
  const body = image.subarray(selected.offset, selected.offset + selected.size);
  check(sha256(body) === CONFIG_SHAPE, "unsupported OAuth x64 instruction layout");
  for (const [offset, expected] of CALLS) {
    check(body[offset] === 0xe8, "invalid OAuth call instruction");
    const target = selected.address + offset + 5 + body.readInt32LE(offset + 1), nameOffset = functions.get(target);
    check(nameOffset !== undefined && symbol(nameOffset) === expected, "unexpected OAuth function call target");
  }
  function ripLea(offset, opcode) {
    check(body.subarray(offset, offset + 3).equals(Buffer.from(opcode)), "invalid OAuth constant address instruction");
    return selected.address + offset + 7 + body.readInt32LE(offset + 3);
  }
  // Reviewed moduledata type-name base slot; all dereferences must remain in read-only PE data.
  const typeNameBase = u64(module + 296); addressOffset(typeNameBase, 1, rodata);
  function goName(address) {
    let at = addressOffset(address, 2, rodata) + 1, length = 0, shift = 0, byte;
    do {
      check(shift <= 14, "invalid Go type name length"); bounds(at, 1);
      byte = image[at++]; length |= (byte & 127) << shift; shift += 7;
    } while (byte & 128);
    check(length > 0 && length <= 256, "unsupported Go type name");
    addressOffset(address, at - (rodata.offset + address - rodata.address) + length, rodata);
    return image.toString("utf8", at, at + length);
  }
  const configAddress = ripLea(0x35c, [0x48, 0x8d, 0x05]), config = addressOffset(configAddress, 80, rodata);
  check(u64(config) === 144 && (image[config + 23] & 31) === 25 && goName(typeNameBase + i32(config + 40)) === "*oauth2.Config", "OAuth allocation is not the reviewed oauth2.Config type");
  const fieldsAddress = u64(config + 56), fieldCount = u64(config + 64);
  check(fieldCount === 6 && u64(config + 72) === fieldCount, "unsupported OAuth Config field layout");
  const fields = new Map(); addressOffset(fieldsAddress, fieldCount * 24, rodata);
  for (let index = 0; index < fieldCount; index++) {
    const at = addressOffset(fieldsAddress + index * 24, 24, rodata), name = goName(u64(at));
    check(!fields.has(name), "ambiguous OAuth Config field"); fields.set(name, { offset: u64(at + 16), type: u64(at + 8) });
  }
  for (const [name, offset] of [["ClientID", 0], ["ClientSecret", 16], ["Endpoint", 32], ["RedirectURL", 88], ["Scopes", 104], ["authStyleCache", 128]]) {
    check(fields.get(name)?.offset === offset, "OAuth Config field offsets changed");
  }
  const stringType = addressOffset(fields.get("ClientID").type, 48, rodata);
  check(fields.get("ClientID").type === fields.get("ClientSecret").type && u64(stringType) === 16 && (image[stringType + 23] & 31) === 24, "OAuth client fields are not Go strings");
  // Each constant is the SECOND item of its reviewed two-string coalesce loop (override first).
  // ID -> rdx/r10 -> stack 0x68/0x30 -> allocation 0/8;
  // secret -> r8/r12 -> stack 0x60/0x28 -> the SAME allocation 16/24.
  // The exact body hash above seals these branches, stack stores and allocation-field stores.
  function constant(lengthAt, stackSlot, leaAt, opcode, minimum, maximum) {
    check(body.subarray(lengthAt, lengthAt + 4).equals(Buffer.from([0x48, 0xc7, 0x84, 0x24])) && body.readUInt32LE(lengthAt + 4) === stackSlot, "invalid OAuth string length store");
    const length = body.readUInt32LE(lengthAt + 8), address = ripLea(leaAt, opcode);
    check(length >= minimum && length <= maximum, "unsupported OAuth constant length");
    const at = addressOffset(address, length, rodata);
    check(image.subarray(at, at + length).every(byte => byte >= 0x21 && byte <= 0x7e), "OAuth constants must be bounded ASCII");
    return image.toString("ascii", at, at + length);
  }
  const clientId = constant(0xd3, 0x130, 0xdf, [0x4c, 0x8d, 0x05], 32, 128);
  const clientSecret = constant(0x14b, 0x110, 0x157, [0x4c, 0x8d, 0x0d], 16, 128);
  check(/^[0-9]{6,}-[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/.test(clientId) && /^GOCSPX-[A-Za-z0-9_-]+$/.test(clientSecret), "invalid public OAuth application constants");
  return { clientId, clientSecret };
}

function canonical(value) { return path.normalize(value).toLowerCase(); }
function sameFile(a, b) { return ["dev", "ino", "mode", "nlink", "size", "mtimeNs", "ctimeNs"].every(key => a[key] === b[key]); }
function applicationRoot(value) {
  check(typeof value === "string" && value.length <= 4096 && !value.includes("\0") && /^[A-Za-z]:[\\/]/.test(value) && path.isAbsolute(value), "application path must be an absolute local Windows root");
  // Reject device/UNC paths, alternate streams and Win32-normalized component aliases.
  const parts = value.slice(3).split(/[\\/]/).filter(Boolean);
  check(parts.every(part => part !== "." && part !== ".." && !/[<>:"|?*\x00-\x1f]/.test(part) && !/[. ]$/.test(part) && !/^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(part)), "ambiguous or unsupported application path component");
  return path.resolve(value);
}
async function inspectDirectories(root) {
  const directories = []; let cursor = root;
  while (true) {
    directories.unshift(cursor); const parent = path.dirname(cursor); if (parent === cursor) break; cursor = parent;
  }
  directories.push(path.join(root, "resources"), path.join(root, "resources", "bin"));
  const snapshots = [];
  for (const directory of directories) {
    const stat = await fs.lstat(directory, { bigint: true });
    check(stat.isDirectory() && !stat.isSymbolicLink(), "symlinked or non-directory application boundary");
    check(canonical(await fs.realpath(directory)) === canonical(directory), "application directory resolves outside its boundary");
    snapshots.push({ path: directory, stat });
  }
  return snapshots;
}
async function readBinary(file, retain) {
  const beforePath = await fs.lstat(file, { bigint: true });
  check(beforePath.isFile() && !beforePath.isSymbolicLink() && beforePath.size >= 4096n && beforePath.size <= BigInt(MAX_IMAGE_BYTES), "invalid public program file or size");
  check(canonical(await fs.realpath(file)) === canonical(file), "public program resolves outside the application boundary");
  const handle = await fs.open(file, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
  try {
    const before = await handle.stat({ bigint: true });
    check(before.isFile() && sameFile(beforePath, before), "public program changed before reading");
    const length = Number(before.size), bytes = retain ? Buffer.alloc(length) : Buffer.alloc(Math.min(length, 1024 * 1024)), hash = createHash("sha256");
    let position = 0;
    while (position < length) {
      const offset = retain ? position : 0, requested = Math.min(length - position, 1024 * 1024);
      const { bytesRead } = await handle.read(bytes, offset, requested, position);
      check(Number.isInteger(bytesRead) && bytesRead > 0 && bytesRead <= requested, "public program was truncated");
      hash.update(bytes.subarray(offset, offset + bytesRead)); position += bytesRead;
    }
    const extra = await handle.read(Buffer.alloc(1), 0, 1, length);
    const after = await handle.stat({ bigint: true }), afterPath = await fs.lstat(file, { bigint: true });
    check(extra.bytesRead === 0 && sameFile(before, after) && sameFile(before, afterPath) && afterPath.isFile() && !afterPath.isSymbolicLink() && canonical(await fs.realpath(file)) === canonical(file), "public program changed while reading");
    return { bytes: retain ? bytes : undefined, stat: before, hash: hash.digest("hex") };
  } finally { await handle.close(); }
}

/** No signature claim: require explicit approval of this exact public program SHA256 on Windows. */
export async function importWindowsAppOAuthConfig(applicationPath, options = {}) {
  check(process.platform === "win32", "Windows application import is supported only on Windows");
  check(options && typeof options === "object" && !Array.isArray(options) && Object.hasOwn(options, "sha256") && options.sha256 === SUPPORTED_SHA256, "explicit SHA256 approval of the supported Windows build is required (options.sha256)");
  try {
    if (applicationPath === undefined) {
      check(typeof process.env.LOCALAPPDATA === "string" && process.env.LOCALAPPDATA.length > 0, "LOCALAPPDATA is unavailable; supply an absolute application root");
      applicationPath = path.join(applicationRoot(process.env.LOCALAPPDATA), "Programs", "antigravity");
    }
    const root = applicationRoot(applicationPath), beforeDirectories = await inspectDirectories(root);
    const binaryPath = path.join(root, "resources", "bin", "language_server.exe");
    check(path.relative(root, binaryPath) === path.join("resources", "bin", "language_server.exe"), "invalid public program boundary");
    const first = await readBinary(binaryPath, true);
    check(first.hash === SUPPORTED_SHA256, "public program does not match the explicitly approved SHA256");
    const pair = extractWindowsAppOAuthConfig(first.bytes);
    const second = await readBinary(binaryPath, false);
    check(second.hash === first.hash && sameFile(first.stat, second.stat), "public program changed during import");
    const afterDirectories = await inspectDirectories(root);
    check(beforeDirectories.length === afterDirectories.length && beforeDirectories.every((before, index) => canonical(before.path) === canonical(afterDirectories[index].path) && sameFile(before.stat, afterDirectories[index].stat)), "application directory boundary changed during import");
    return pair;
  } catch (error) {
    if (error?.code === "ERR_ANTIGRAVITY_APP_IMPORT") throw error;
    // Do not forward OS errors, paths, binary data, or application constants into logs.
    fail("could not safely read the pinned public Windows program");
  }
}
