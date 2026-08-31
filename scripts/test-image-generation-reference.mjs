#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const sourcePath = new URL("../lib/image-generation-reference-policy.ts", import.meta.url);
const source = fs.readFileSync(sourcePath, "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const module = { exports: {} };
vm.runInNewContext(compiled, { module, exports: module.exports }, { filename: sourcePath.pathname });
const {
  getUserReferenceImagePolicy,
  isReferenceInputUnsupportedError,
  redactImageGenerationError,
  validateOwnedAppImageReference,
} = module.exports;

assert.equal(getUserReferenceImagePolicy("gpt-image-2").canAttemptImageInput, true);
assert.equal(getUserReferenceImagePolicy(" models/GPT_IMAGE_2 ").canAttemptImageInput, true);
assert.equal(getUserReferenceImagePolicy("chatgpt-image-2").canAttemptImageInput, true);
assert.equal(getUserReferenceImagePolicy("gpt-image-1").canAttemptImageInput, false);
assert.equal(getUserReferenceImagePolicy("flux-image").canAttemptImageInput, false);

assert.equal(isReferenceInputUnsupportedError(new Error("生图 API 错误 400: image edits not supported")), true);
assert.equal(isReferenceInputUnsupportedError(new Error("生图 API 错误 401: invalid API key")), false);
assert.equal(isReferenceInputUnsupportedError(new Error("生图 API 错误 429: rate limited")), false);
assert.equal(isReferenceInputUnsupportedError(new Error("生图 API 错误 500: image backend down")), false);

const ref = "media-store://mc_owned";
validateOwnedAppImageReference({
  ref,
  ownedRows: [{ id: ref, category: "image" }],
  media: { category: "image", mimeType: "image/png", bytes: 1024 },
  maxBytes: 25 * 1024 * 1024,
});
assert.throws(() => validateOwnedAppImageReference({
  ref: "media-store://mc_other",
  ownedRows: [{ id: ref, category: "image" }],
  media: { category: "image", mimeType: "image/png", bytes: 1024 },
  maxBytes: 25 * 1024 * 1024,
}), /不是当前 APP 拥有/);
assert.throws(() => validateOwnedAppImageReference({
  ref,
  ownedRows: [{ id: ref, category: "image" }],
  media: null,
  maxBytes: 25 * 1024 * 1024,
}), /已被删除/);
assert.throws(() => validateOwnedAppImageReference({
  ref,
  ownedRows: [{ id: ref, category: "image" }],
  media: { category: "image", mimeType: "image/png", bytes: 25 * 1024 * 1024 + 1 },
  maxBytes: 25 * 1024 * 1024,
}), /不能超过 25MB/);

const secret = "sk-super-secret-key";
const base64 = "A".repeat(900);
const safe = redactImageGenerationError(`Authorization: Bearer ${secret}; apiKey=${secret}; data:image/png;base64,${base64}`);
assert.equal(safe.includes(secret), false);
assert.equal(safe.includes(base64), false);
assert.match(safe, /REDACTED/);

console.log("image-generation-reference policy tests: 15 passed");
