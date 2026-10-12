import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  constructValidatorPayload,
  createValidatorSigningRequest,
  submitValidatedRegistration,
  validateRegistrationArtifact,
  validatorRegistrationCall,
} from "../src/lib/validator-signing.ts";

const signingRequest = createValidatorSigningRequest({
  chainId: 10143,
  operator: "0x1111111111111111111111111111111111111111",
  saltSeed: `0x${"22".repeat(32)}`,
  authAddress: "0x3333333333333333333333333333333333333333",
  amount: "100000000000000000000000",
  commission: "0",
});
const artifactFixture = JSON.parse(await readFile(new URL("./fixtures/validator-registration.json", import.meta.url), "utf8")) as unknown;

test("validates the signed operator artifact and exact packed registration payload", () => {
  const artifact = validateRegistrationArtifact(artifactFixture, signingRequest);
  assert.equal(artifact.payload.length, 332);
  assert.equal(constructValidatorPayload({ ...artifact }), artifact.payload);
  assert.equal(artifact.secpPubkey.length, 68);
  assert.equal(artifact.blsPubkey.length, 98);
});

test("rejects wrong network, stale contract parameters, malformed lengths and invalid signatures", () => {
  assert.throws(() => validateRegistrationArtifact(artifactFixture, { ...signingRequest, chainId: 1 }), /different Monad network/);
  assert.throws(() => validateRegistrationArtifact(artifactFixture, { ...signingRequest, commission: "1" }), /commission differs/);
  const artifact = artifactFixture as Record<string, unknown>;
  assert.throws(() => validateRegistrationArtifact({ ...artifact, blsPubkey: "0x1234" }, signingRequest), /BLS public key/);
  assert.throws(() => validateRegistrationArtifact({ ...artifact, signedBlsMessage: `0x${"00".repeat(96)}` }, signingRequest), /BLS signature is invalid/);
  assert.throws(() => validateRegistrationArtifact({ ...artifact, privateKey: "0x1234" }, signingRequest), /private keys/);
});

test("builds the existing Quevra createValidator transaction call from verified data", () => {
  const artifact = validateRegistrationArtifact(artifactFixture, signingRequest);
  const call = validatorRegistrationCall(artifact);
  assert.equal(call.functionName, "createValidator");
  assert.deepEqual(call.args, [artifact.saltSeed, artifact.authAddress, artifact.payload, artifact.signedSecpMessage, artifact.signedBlsMessage]);
});

test("submits only after a fresh contract request still matches the signed artifact", async () => {
  const artifact = validateRegistrationArtifact(artifactFixture, signingRequest);
  let submissions = 0;
  await submitValidatedRegistration(artifact, signingRequest, async () => { submissions += 1; });
  assert.equal(submissions, 1);
  await assert.rejects(
    submitValidatedRegistration(artifact, { ...signingRequest, amount: "1" }, async () => { submissions += 1; }),
    /amount differs/,
  );
  assert.equal(submissions, 1);
});
