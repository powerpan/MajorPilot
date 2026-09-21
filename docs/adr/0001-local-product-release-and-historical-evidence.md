# Local product release and historical evidence

Status: Accepted by the project owner's explicit request, 2026-09-21.

## Context

The first human acceptance identified that engineering preview was an incomplete Student journey. The owner requests the complete product experience and a real report from their already closed BA preview. Existing professional review and target-user timing are still pending. Reclassifying old runs or pretending review has passed would erase provenance.

## Decision

- Separate professional publication from local product availability. An authorized Operator can register an explicit owner authorization against one immutable Task Version and its manifest hash. Only the local profile with `MP_LOCAL_PRODUCT_ENABLED=true` permits new starts from such REVIEW content. Professional publication remains unchanged and requires its existing review checks.
- New journeys use STANDARD runs and the existing task → reflection → evidence → report → next recommendation → comparison pipeline.
- One already CLOSED REVIEW_PREVIEW can receive a separate, audited, exact historical adoption. Its Student, Run, Task Version, Decision Profile and frozen-input hash must match. Do not change original mode, answers, execution results, timestamps, frozen input, or evidence snapshot.
- An adopted source keeps its original mode and includes internal authorization provenance in frozen ReportInput. Report validation and publication recheck actual database ownership and authorization. The grant is not a model instruction or a Student-editable field.
- Account deletion includes Student-owned adoption. Personal exports include only safe provenance, not Operator identity or internal authorization notes. Metrics-v2 retains its original STANDARD cohort; no historical event is fabricated.

## Consequences

V9 adds two tables and no automatic grants. Existing executed migrations remain immutable. Turning off new local starts does not erase previously authorized source provenance. A report is private, not a professional suitability score or admission recommendation. This change does not complete P8 or authorize public deployment.

## Verification

See [human acceptance product flow](../36-human-acceptance-product-flow.md) for migration, source integrity, interaction and real report evidence. Exact authorization references and personal report outputs remain in local private data, not Git.
