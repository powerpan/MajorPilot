// These self-contained functions are embedded in the trusted launcher's CSP-pinned
// script. The opaque worker has no WebCrypto, filesystem or network capability.
export async function digestUtf8(value, subtle) {
  const digest = await subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export function createDsDigestHandler({
  worker,
  operationKey,
  parameters,
  isActive,
  onFailure,
  subtle,
}) {
  let requested = false;
  return async (message) => {
    if (!isActive()) return;
    try {
      if (
        requested ||
        !message ||
        Object.keys(message).sort().join("|") !==
          "canonicalCleaning|operationKey|type" ||
        message.type !== "MP_DS_HASH_REQUEST" ||
        message.operationKey !== operationKey ||
        ![
          "ds-quality-clean",
          "ds-profile",
          "ds-relationship",
          "ds-stratify",
        ].includes(operationKey) ||
        typeof message.canonicalCleaning !== "string" ||
        message.canonicalCleaning.length > 160
      )
        throw new Error("Invalid digest request");
      requested = true;
      const cleaning = JSON.parse(message.canonicalCleaning);
      if (
        !cleaning ||
        Object.keys(cleaning).sort().join("|") !==
          "duplicatePolicy|extremePolicy|missingPolicy" ||
        !["KEEP", "DROP_EXACT"].includes(cleaning.duplicatePolicy) ||
        !["KEEP", "CAP_P95"].includes(cleaning.extremePolicy) ||
        !["KEEP_NULL", "DROP_MISSING", "MEDIAN_NUMERIC"].includes(
          cleaning.missingPolicy,
        )
      )
        throw new Error("Invalid cleaning fields");
      const canonical = JSON.stringify({
        duplicatePolicy: parameters.duplicatePolicy,
        extremePolicy: parameters.extremePolicy,
        missingPolicy: parameters.missingPolicy,
      });
      if (message.canonicalCleaning !== canonical)
        throw new Error("Digest request does not match this operation's input");
      const cleaningConfigSha256 = await digestUtf8(canonical, subtle);
      // Capture the original worker, not a mutable current-worker slot. A timeout,
      // cancellation or replacement makes its result unusable even if digest resolves.
      if (isActive())
        worker.postMessage({
          type: "MP_DS_HASH_RESULT",
          operationKey,
          cleaningConfigSha256,
        });
    } catch {
      if (isActive())
        onFailure({
          status: "ERROR",
          code: "DS_DIGEST_FAILURE",
          engine: "ds-stats-v1",
        });
    }
  };
}
