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
The temporary pre-registration journey in which a Visitor saves intake answers and receives an Initial Recommendation.
_Avoid_: Anonymous Session, Guest Session

**Major**:
A supported academic and professional direction that a Student can experience and compare, initially Artificial Intelligence, Data Science, or Business Analytics.
_Avoid_: Course, Degree, University Program

**Decision Profile**:
A versioned snapshot of information a Visitor or Student voluntarily provides for recommendation, explanation, and product analysis.
_Avoid_: User Profile, Questionnaire

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
An immutable, reviewed release of the content, data, steps, hints, and evaluation rules used by a Major Experience.
_Avoid_: Task, Lesson Version

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

**Evidence Snapshot**:
The immutable set of Experience Evidence approved as input to one Report Version.
_Avoid_: Prompt Context, Event Dump

**Report Claim**:
A single report statement classified as observed fact, Student self-report, bounded interpretation, limitation, or next step and linked to supporting evidence.
_Avoid_: AI Insight, Assessment Result

**Experience Report**:
A private, evidence-based report about one completed Major Experience that separates experience preference, current preparation, and observed task performance.
_Avoid_: Fit Report, Assessment Report

**Comparison Report**:
A private report comparing evidence from at least two completed Major Experiences without producing a total ranking or final major decision.
_Avoid_: Ranking Report, Final Recommendation

**Report Version**:
An immutable generated snapshot of an Experience Report or Comparison Report and the evidence and generation rules it used.
_Avoid_: Report Update
