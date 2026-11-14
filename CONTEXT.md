# MajorPilot Domain Language

MajorPilot helps prospective postgraduate students compare majors through short, evidence-based experiences. This glossary fixes the product language used across requirements, design, implementation, and analysis.

## People and identity

**Visitor**:
A person browsing the product or completing the initial intake before creating a Student Account.
_Avoid_: Anonymous User, Guest User

**Student**:
A registered person using MajorPilot to explore and compare majors; the term does not imply admission to or enrollment in a university.
_Avoid_: User, Applicant, Customer

**Internal Operator**:
An authorized team member who manages content, supports Students, or reviews product operations and analysis.
_Avoid_: User, Super User

**Student Account**:
The identity through which a Student saves progress, resumes experiences, and accesses private reports.
_Avoid_: User Account, System User

**Operator Account**:
The identity through which an Internal Operator accesses internal functions under assigned permissions.
_Avoid_: Student Account, User Account

## Major decision

**Intake Session**:
The temporary pre-registration journey in which a Visitor may save intake answers. An Initial Recommendation is available only when the required preference inputs are complete; skipping background questions does not skip account or consent requirements.
_Avoid_: Anonymous Session, Guest Session

**Major**:
A supported academic and professional direction that a Student can experience and compare, initially Artificial Intelligence, Data Science, or Business Analytics.
_Avoid_: Course, Degree, University Program

**Decision Profile**:
A versioned snapshot of information a Visitor or Student voluntarily provides for recommendation, explanation, and product analysis.
_Avoid_: User Profile, Questionnaire

**Profile Draft**:
A resumable, version-checked set of unsubmitted background answers, separate from the current Decision Profile. Submitting it creates a new Decision Profile; existing Experience Runs and Reports retain their original background references.

**Initial Recommendation**:
The first Major Experience proposed from a Decision Profile before the Student begins a Major Experience.
_Avoid_: Fit Result, Major Decision

**Next Recommendation**:
A proposed next Major Experience based on completed experience evidence and the Student's remaining choices.
_Avoid_: Final Recommendation, Best Major

**Override**:
A Student's choice to begin a different Major Experience from the one recommended by MajorPilot.
_Avoid_: Rejection, Incorrect Choice

**Recommendation Reason**:
A versioned, human-explainable statement identifying a ranking reason, supporting context, or limitation of an Initial Recommendation or Next Recommendation.
_Avoid_: Fit Signal, Personality Trait

## Experience and content

**Major Experience**:
The complete guided product journey for one Major, including preparation, a representative task, reflection, and an Experience Report.
_Avoid_: Course, Test, Assessment

**Task Version**:
An immutable version of the content, data, steps, hints, and evaluation rules used by a Major Experience. Professional review and availability for local use are separate facts.
_Avoid_: Task, Lesson Version

**Local Product Release**:
The project owner's explicit authorization to use one fixed Task Version in the complete local product flow; it does not claim professional approval or public release.

**Historical Experience Adoption**:
The explicit inclusion of one completed preview Experience Run in the report and further-exploration flow, preserving its original answers, evidence, and provenance.

**Experience Run**:
One Student's attempt at one Major, bound to exactly one Task Version when first started; pausing and resuming preserve the same attempt.
_Avoid_: Task, Session, Attempt

**Paused Experience**:
An unfinished Experience Run that the Student explicitly put aside while retaining its saved progress and place in the task or reflection.
_Avoid_: Abandoned Experience, Completed Experience

**Closed Experience**:
An Experience Run whose required task and reflection are submitted and whose report inputs are frozen; its report may still be preparing.
_Avoid_: Ready Report, Abandoned Experience

**Replaced Experience**:
An unfinished Experience Run superseded by an audited recovery attempt without rewriting its submitted content or treating it as completed.
_Avoid_: Completed Experience, Retake

**Step Response**:
A Student's saved answer, choice, code change, parameter change, or other task input within an Experience Run.
_Avoid_: Answer

**Hint Request**:
A Student-initiated request for a defined level of help at a specific step of an Experience Run.
_Avoid_: AI Chat, Support Message

**Reflection**:
A Student's post-task account of interest, difficulty, frustration, surprise, and willingness to continue similar work.
_Avoid_: Feedback, Self-rating

**Experience Evidence**:
A traceable fact selected from an Experience Run or Reflection that is eligible to support a report statement.
_Avoid_: Score, Event, AI Observation

**Product Event**:
A structured record used to understand product operation or behaviour; a Product Event is not automatically Experience Evidence.
_Avoid_: Report Evidence, User Log

## Reports

**Pilot Account**:
A pre-provisioned Student Account authorized for a bounded invitation-only test. Activation does not imply email verification or consent on the Student's behalf.

**Report Allowance**:
A server-enforced limit on new report generation tasks, with independent Experience Report and Comparison Report counters. Viewing an existing report does not consume an allowance; model stages within one task are not separate reports.

**Evidence Snapshot**:
The immutable set of Experience Evidence approved as input to one Report Version.
_Avoid_: Prompt Context, Event Dump

**Report Claim**:
A single report statement classified as observed fact, Student self-report, bounded interpretation, limitation, or next step and linked to supporting evidence.
_Avoid_: AI Insight, Assessment Result

**Answer Analysis**:
A bounded interpretation of a Student's particular answer against the task question, available results, and evaluation criteria. It distinguishes demonstrated reasoning, unsupported claims, and opportunities for improvement without judging stable ability or suitability for a Major.

**Answer Excerpt**:
An unchanged, contiguous passage of a Student's Step Response shown alongside an Answer Analysis. Its attribution establishes what the Student wrote, not whether the answer or its analysis is correct.

**Analysis Refinement**:
An independent review and rewrite of an unpublished Answer Analysis against its original task, answers, and evidence. It can correct an analysis but does not certify that every interpretation is factually correct.
_Avoid_: Fact Certificate, AI Approval

**Frozen Response Reference**:
A traceable reference to an original answer or reflection preserved when an Experience Run closed. It establishes what the Student wrote, not whether the content is correct.

**Experience Report**:
A private, evidence-based report about one completed Major Experience that separates experience preference, current preparation, and observed task performance.
_Avoid_: Fit Report, Assessment Report

**Comparison Report**:
A private report comparing evidence from at least two completed Major Experiences without producing a total ranking or final major decision.
_Avoid_: Ranking Report, Final Recommendation

**Report Version**:
An immutable generated snapshot of an Experience Report or Comparison Report and the evidence and generation rules it used.
_Avoid_: Report Update

## Guided experience design

**Method Path**:
The explicit sequence of reasoning moves that connects a Major Experience's question, learning support, Student decisions, and final work. It represents one professional approach, not the entirety of a Major or a mandatory named framework.
_Avoid_: Ability Ladder, Major Syllabus

**Understanding Checkpoint**:
A bounded opportunity within a Method Path to demonstrate one specified idea through a choice, explanation, or application. A response supports interpretation of that instance, not a diagnosis of stable ability.
_Avoid_: Ability Test, Mastery Score

**Learning Attempt**:
A Student's explicitly submitted response to an Understanding Checkpoint, preserved together with the task and support conditions at submission. Later corrections do not replace earlier attempts.
_Avoid_: Keystroke History, Final Answer Only

**Learning Support**:
A versioned explanation, worked example, or hint made available for a particular part of a Major Experience. Its recorded delivery establishes availability, not that the Student read, understood, or learned from it.
_Avoid_: Proof of Learning, Ability Penalty

**Recovery Baseline**:
A disclosed, verified intermediate result a Student may use to continue a Major Experience after an upstream difficulty. It is supplied support, not a Student-produced result.
_Avoid_: Corrected Student Answer, Retake

**Workbook Asset**:
A downloadable, version-bound spreadsheet containing the public materials for local exploration in a Major Experience. A copy on the Student's device is outside the platform's observation and is not automatically report evidence.
_Avoid_: Uploaded Evidence, Verified Student Work

**Local Result Submission**:
A Student's submitted description of local data processing, selected results, and reasoning, linked to the relevant Workbook Asset. Reproducing a result can corroborate a calculation but does not verify the Student's local editing process.
_Avoid_: Observed Excel Activity, Verified Workbook
