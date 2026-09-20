import {
  calculateDsPrepared,
  normalizeParameters,
  validateRows,
} from "../shared/ds/ds-stats-v1.mjs";

// Only the reviewed fixed calculator is bundled. No assets, user source or imports at runtime.
const bytes = (value) => new TextEncoder().encode(JSON.stringify(value)).length;
let pending;
let finished = false;
self.onmessage = ({ data }) => {
  if (finished) return;
  const reply = (value) => {
    finished = true;
    const result = { ...value, engine: "ds-stats-v1" };
    self.postMessage(
      bytes(result) > 102400
        ? { status: "ERROR", code: "OUTPUT_LIMIT", engine: "ds-stats-v1" }
        : result,
    );
  };
  try {
    if (pending) {
      if (
        !data ||
        Object.keys(data).sort().join("|") !==
          "cleaningConfigSha256|operationKey|type" ||
        data.type !== "MP_DS_HASH_RESULT" ||
        data.operationKey !== pending.operationKey ||
        !/^[a-f0-9]{64}$/.test(data.cleaningConfigSha256)
      )
        throw new Error("DS_DIGEST_INVALID");
      reply({
        status: "SUCCESS",
        result: calculateDsPrepared(
          pending.operationKey,
          pending.rows,
          pending.parameters,
          {
            datasetSha256: pending.datasetSha256,
            cleaningConfigSha256: data.cleaningConfigSha256,
          },
        ),
      });
      return;
    }
    if (
      !data ||
      Object.keys(data).sort().join("|") !==
        "datasetSha256|operationKey|parameters|rows|template" ||
      data.template !== "ds-analysis-v1" ||
      bytes(data) > 1048576
    )
      throw new Error("DS_INPUT_INVALID");
    if (!/^[a-f0-9]{64}$/.test(data.datasetSha256))
      throw new Error("DS_DATASET_HASH_INVALID");
    validateRows(data.rows);
    const parameters = normalizeParameters(data.operationKey, data.parameters);
    pending = {
      operationKey: data.operationKey,
      rows: data.rows,
      parameters,
      datasetSha256: data.datasetSha256,
    };
    self.postMessage({
      type: "MP_DS_HASH_REQUEST",
      operationKey: data.operationKey,
      canonicalCleaning: JSON.stringify({
        duplicatePolicy: parameters.duplicatePolicy,
        extremePolicy: parameters.extremePolicy,
        missingPolicy: parameters.missingPolicy,
      }),
    });
  } catch {
    reply({ status: "ERROR", code: "DS_INPUT_INVALID" });
  }
};
