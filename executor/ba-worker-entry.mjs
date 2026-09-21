import { calculateBa } from "../shared/ba/ba-metrics-v1.mjs";

// A reviewed synchronous calculator only: no code, imports, network or WebCrypto
// from the message. Public data is checked by the loader and by the calculator.
const bytes = (value) => new TextEncoder().encode(JSON.stringify(value)).length;
let finished = false;
self.onmessage = ({ data }) => {
  if (finished) return;
  finished = true;
  let response;
  try {
    if (
      !data ||
      Object.keys(data).sort().join("|") !==
        "datasetSha256|operationKey|parameters|rows|template" ||
      data.template !== "ba-analysis-v1" ||
      bytes(data) > 1048576
    )
      throw new Error("BA_PARAMETERS_INVALID");
    response = {
      status: "SUCCESS",
      result: calculateBa(data.operationKey, data.rows, data.parameters, {
        datasetSha256: data.datasetSha256,
      }),
    };
  } catch (cause) {
    const safe = ["BA_PARAMETERS_INVALID", "BA_DATA_INVALID"];
    response = {
      status: "ERROR",
      code: safe.includes(cause?.code)
        ? cause.code
        : safe.includes(cause?.message)
          ? cause.message
          : "BA_PARAMETERS_INVALID",
    };
  }
  const result = { ...response, engine: "ba-metrics-v1" };
  self.postMessage(
    bytes(result) > 102400
      ? { status: "ERROR", code: "OUTPUT_LIMIT", engine: "ba-metrics-v1" }
      : result,
  );
};
