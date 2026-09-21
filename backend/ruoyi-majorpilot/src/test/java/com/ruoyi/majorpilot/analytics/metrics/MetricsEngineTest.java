package com.ruoyi.majorpilot.analytics.metrics;

import static com.ruoyi.majorpilot.analytics.metrics.MetricsModels.*;
import static org.junit.jupiter.api.Assertions.*;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;

/** Synthetic golden vectors, not measured product performance. No Spring, SQL, network, or secrets. */
class MetricsEngineTest {
    static final Instant ZERO = Instant.parse("2026-01-01T00:00:00Z");
    static Instant day(long n) { return ZERO.plus(n, ChronoUnit.DAYS); }
    static Instant ms(long n) { return ZERO.plusMillis(n); }
    static final MetricsEngine ENGINE = new MetricsEngine();
    static Query query(Instant asOf) { return new Query(asOf, day(-3), asOf, Filters.all()); }
    static Student student(long id) { return new Student(id, "ACTIVE", null, day(-2), day(-1)); }
    static Run run(long id, long student, String major, Instant start, Instant close) {
        return new Run(id, student, null, "MAJOR", "STANDARD", major, major + "-v1", "q1", "rules1", day(-1), start, close);
    }
    static Run origin(Run r, long parent) { return new Run(r.id(), r.studentId(), parent, r.contentKind(), r.runMode(), r.majorCode(),
        r.taskVersionId(), r.questionnaireVersion(), r.recommendationRuleVersion(), r.createdAt(), r.startedAt(), r.closedAt()); }
    static Run mode(Run r, String kind, String mode) { return new Run(r.id(), r.studentId(), r.originRunId(), kind, mode, r.majorCode(),
        r.taskVersionId(), r.questionnaireVersion(), r.recommendationRuleVersion(), r.createdAt(), r.startedAt(), r.closedAt()); }
    static Report report(long id, long student, long run, Instant ready) { return new Report(id, student, "EXPERIENCE", List.of(run), ready); }
    static Survey survey(long id, long student, long report, Integer answer, Instant at) { return new Survey(id, student, report,
        "report-value-v1", true, answer, at); }
    static Observation view(String id, long student, long report, Instant received) {
        return new Observation(id, "report.viewed", student, null, null, report, null, received);
    }
    static class Data {
        List<Student> students = new ArrayList<>(); List<Intake> intakes = new ArrayList<>();
        List<Run> runs = new ArrayList<>(); List<Report> reports = new ArrayList<>(); List<Survey> surveys = new ArrayList<>();
        List<Observation> events = new ArrayList<>(); List<StepCompletion> completions = new ArrayList<>();
        List<TaskDefinition> tasks = new ArrayList<>();
        Snapshot snapshot() { return new Snapshot(day(30), students, intakes, runs, reports, surveys, events, completions, tasks); }
        Overview at(Instant instant) { return ENGINE.compute(snapshot(), query(instant)); }
        Overview at(Query q) { return ENGINE.compute(snapshot(), q); }
    }
    static Data completion(Instant close) {
        Data d = new Data(); d.students.add(student(1)); d.runs.add(run(1, 1, "AI", day(0), close)); return d;
    }
    static Data reported(Integer answer) {
        Data d = completion(day(1)); d.reports.add(report(1, 1, 1, day(2)));
        if (answer != null) d.surveys.add(survey(1, 1, 1, answer, day(3))); return d;
    }
    static void fraction(Kpi metric, long n, long den) {
        assertEquals(n, metric.numerator()); assertEquals(den, metric.denominator());
        if (den == 0) assertNull(metric.rate()); else assertEquals(BigDecimal.valueOf(n).divide(BigDecimal.valueOf(den), 6,
            java.math.RoundingMode.HALF_UP), metric.rate());
    }
    static void code(String code, Runnable action) { assertEquals(code, assertThrows(MetricsQualityException.class, action::run).code()); }

    @Test void g01ThreeIndependentKpisAreTwoThirdsWithDifferentOriginalMajorAnchors() {
        Data d = new Data(); for (int i = 1; i <= 3; i++) d.students.add(student(i));
        d.runs.addAll(List.of(run(1, 1, "AI", day(0), day(5)), run(2, 1, "DATA_SCIENCE", day(8), null),
            run(3, 2, "AI", day(0), day(5)), run(4, 2, "DATA_SCIENCE", day(1), day(2)), run(5, 3, "AI", day(0), day(8))));
        d.reports.addAll(List.of(report(1, 1, 1, day(6)), report(2, 2, 4, day(3)), report(3, 3, 5, day(9))));
        d.surveys.addAll(List.of(survey(1, 1, 1, 5, day(7)), survey(2, 2, 2, 4, day(4)), survey(3, 3, 3, 3, day(10))));
        for (Report r : d.reports) d.events.add(view("v" + r.id(), r.studentId(), r.id(), r.firstReadyAt().plusMillis(1)));
        Overview o = d.at(day(30)); fraction(o.metrics().firstExperienceCompletion(), 2, 3);
        fraction(o.metrics().reportInsight(), 2, 3); fraction(o.metrics().secondExperienceStart(), 2, 3);
        assertEquals(new SecondTiming(1, 1), o.metrics().secondStartTiming());
        assertEquals(3, o.metrics().feedbackCoverage().numerator()); assertEquals(3, o.metrics().feedbackCoverage().denominator());
        Core ai = o.byMajor().get(0).metrics(), ds = o.byMajor().get(1).metrics();
        fraction(ai.firstExperienceCompletion(), 2, 3); fraction(ai.reportInsight(), 1, 2);
        fraction(ds.firstExperienceCompletion(), 0, 0); fraction(ds.reportInsight(), 1, 1);
    }
    @Test void c01c02SevenDayMaturityIsInclusiveAndEarlySuccessCannotInflateImmatureCohort() {
        Data d = completion(day(2)); Kpi early = d.at(day(7).minusMillis(1)).metrics().firstExperienceCompletion();
        fraction(early, 0, 0); assertEquals(1, early.cohortCount()); assertEquals(1, early.immatureCount());
        Kpi mature = d.at(day(7)).metrics().firstExperienceCompletion(); fraction(mature, 1, 1); assertEquals(0, mature.immatureCount());
    }
    @Test void c03RecoveryChainPreservesEarliestActualStartAcrossMultipleReplacements() {
        Data d = completion(null); d.runs.add(origin(run(2, 1, "AI", day(3), null), 1));
        d.runs.add(origin(run(3, 1, "AI", day(5), day(6)), 2));
        fraction(d.at(day(7)).metrics().firstExperienceCompletion(), 1, 1);
        d.runs.set(2, origin(run(3, 1, "AI", day(5), day(8)), 2));
        fraction(d.at(day(12)).metrics().firstExperienceCompletion(), 0, 1);
    }
    @Test void c04ReadyRootWithoutAStartUsesDescendantStartInsteadOfCreationOrNull() {
        Data d = completion(null); d.runs.set(0, run(1, 1, "AI", null, null));
        d.runs.add(origin(run(2, 1, "AI", day(2), null), 1)); d.runs.add(origin(run(3, 1, "AI", day(4), day(8)), 2));
        fraction(d.at(day(9)).metrics().firstExperienceCompletion(), 1, 1);
        assertEquals(1, d.at(day(8)).metrics().firstExperienceCompletion().immatureCount());
    }
    @Test void c05AnotherMajorCannotCloseTheFirstExperienceAndReadyDoesNotStart() {
        Data d = completion(null); d.runs.add(run(2, 1, "DATA_SCIENCE", day(2), day(3)));
        d.runs.add(run(3, 1, "BUSINESS_ANALYTICS", null, null));
        fraction(d.at(day(10)).metrics().firstExperienceCompletion(), 0, 1);
    }
    @Test void c06CloseAtDeadlineCountsButOneMillisecondLateDoesNot() {
        fraction(completion(day(7)).at(day(8)).metrics().firstExperienceCompletion(), 1, 1);
        fraction(completion(day(7).plusMillis(1)).at(day(8)).metrics().firstExperienceCompletion(), 0, 1);
    }
    @Test void c07BusinessFactsDoNotDependOnDuplicateStartedPausedOrClosedEvents() {
        Data d = completion(null); d.events.add(new Observation("claimed-close", "experience.run.closed", 1L, null, 1L, null, null, day(1)));
        d.events.add(d.events.get(0)); fraction(d.at(day(10)).metrics().firstExperienceCompletion(), 0, 1);
    }
    @Test void v01EveryFivePointResponseHasTheExplicitDenominatorAndFourFiveThreshold() {
        for (int score = 1; score <= 5; score++) fraction(reported(score).at(day(30)).metrics().reportInsight(), score >= 4 ? 1 : 0, 1);
    }
    @Test void v02FirstValidSurveySkippingInsightCannotBeBackfilledFromLaterSurvey() {
        Data d = reported(null); d.surveys.add(survey(1, 1, 1, null, day(3)));
        d.surveys.add(new Survey(2, 1, 1, "report-value-v1", false, 5, day(4))); d.events.add(view("v", 1, 1, day(2)));
        Core core = d.at(day(30)).metrics(); fraction(core.reportInsight(), 0, 0);
        assertEquals(0, core.feedbackCoverage().numerator()); assertEquals(1, core.feedbackCoverage().denominator());
    }
    @Test void v03LaterPositiveScoreDoesNotRewriteFirstNegativeScore() {
        Data d = reported(2); d.surveys.add(new Survey(2, 1, 1, "report-value-v1", false, 5, day(4)));
        fraction(d.at(day(30)).metrics().reportInsight(), 0, 1);
    }
    @Test void v04GenericCommentIsNotTheFirstValidValueSurvey() {
        Data d = reported(5); d.surveys.add(new Survey(2, 1, 1, null, false, null, day(2)));
        fraction(d.at(day(30)).metrics().reportInsight(), 1, 1);
    }
    @Test void v05LaterProfessionalReportCannotSubstituteForTheFirstLogicalReport() {
        Data d = reported(null); d.runs.add(run(2, 1, "DATA_SCIENCE", day(3), day(4)));
        d.reports.add(report(2, 1, 2, day(5))); d.surveys.add(survey(2, 1, 2, 5, day(6)));
        fraction(d.at(day(30)).metrics().reportInsight(), 0, 0);
    }
    @Test void v06ViewsDeduplicateAcrossIdsVersionsAndSubjectNamespaces() {
        Data d = reported(5); Observation view = view("same-client-id", 1, 1, day(2));
        d.events.addAll(List.of(view, view, view("another-version", 1, 1, day(4))));
        d.students.add(student(2)); d.runs.add(run(2, 2, "AI", day(0), day(1))); d.reports.add(report(2, 2, 2, day(2)));
        d.events.add(view("same-client-id", 2, 2, day(2)));
        Coverage coverage = d.at(day(30)).metrics().feedbackCoverage();
        assertEquals(2, coverage.denominator()); assertEquals(1, coverage.numerator());
    }
    @Test void v07MissingViewDoesNotEraseValidAnswersOrProduceCoverageAboveOne() {
        Core core = reported(5).at(day(30)).metrics(); fraction(core.reportInsight(), 1, 1);
        assertNull(core.feedbackCoverage().rate()); assertEquals(1, core.feedbackCoverage().answeredWithoutViewed());
    }
    @Test void v08ViewedWithoutAnswerHasZeroCoverageAndUnknownInsightRate() {
        Data d = reported(null); d.events.add(view("v", 1, 1, day(2)));
        Core core = d.at(day(30)).metrics(); fraction(core.reportInsight(), 0, 0);
        assertEquals(new BigDecimal("0.000000"), core.feedbackCoverage().rate());
    }
    @Test void v09ReceivedAtAndFeedbackCreatedAtAreCutOffAtAsOf() {
        Data d = reported(5); d.events.add(view("received-late", 1, 1, day(4)));
        Core early = d.at(day(2).plusMillis(1)).metrics(); fraction(early.reportInsight(), 0, 0);
        assertEquals(0, early.feedbackCoverage().denominator());
        assertEquals(1, d.at(day(4)).metrics().feedbackCoverage().denominator());
    }
    @Test void n01n02SecondStartMaturityDoesNotReportPrematureSuccess() {
        Data d = reported(null); d.runs.add(run(2, 1, "DATA_SCIENCE", day(3), null));
        Kpi early = d.at(day(16).minusMillis(1)).metrics().secondExperienceStart(); fraction(early, 0, 0); assertEquals(1, early.immatureCount());
        fraction(d.at(day(16)).metrics().secondExperienceStart(), 1, 1);
    }
    @Test void n03BeforeVersusAfterUsesStrictBeforeAndEqualityBelongsToAfter() {
        for (boolean before : List.of(true, false)) {
            Data d = reported(null); d.runs.add(run(2, 1, "DATA_SCIENCE", before ? day(2).minusMillis(1) : day(2), null));
            Core core = d.at(day(30)).metrics(); fraction(core.secondExperienceStart(), 1, 1);
            assertEquals(before ? new SecondTiming(1, 0) : new SecondTiming(0, 1), core.secondStartTiming());
        }
    }
    @Test void n04SecondStartDeadlineIsInclusive() {
        for (long ms : List.of(0L, 1L)) {
            Data d = reported(null); d.runs.add(run(2, 1, "DATA_SCIENCE", day(16).plusMillis(ms), null));
            fraction(d.at(day(30)).metrics().secondExperienceStart(), ms == 0 ? 1 : 0, 1);
        }
    }
    @Test void n05n06SameMajorRecoveryAndReadySecondMajorDoNotCountAsDistinctStart() {
        Data d = reported(null); d.runs.add(origin(run(2, 1, "AI", day(3), null), 1));
        d.runs.add(origin(run(3, 1, "AI", day(4), null), 2)); d.runs.add(run(4, 1, "DATA_SCIENCE", null, null));
        fraction(d.at(day(30)).metrics().secondExperienceStart(), 0, 1);
    }
    @Test void n07RegeneratedReportCannotResetFirstReadyWindow() {
        Data d = reported(null); d.runs.add(run(2, 1, "DATA_SCIENCE", day(17), null));
        // A logical report remains one row, with firstReadyAt at day 2 even if regenerated day 20.
        fraction(d.at(day(30)).metrics().secondExperienceStart(), 0, 1);
    }
    @Test void n08MissingReportAndNextViewsDoNotRemoveActualSecondStart() {
        Data d = reported(null); d.runs.add(run(2, 1, "DATA_SCIENCE", day(3), null));
        Overview result = d.at(day(30)); fraction(result.metrics().secondExperienceStart(), 1, 1);
        assertEquals(0, result.funnels().get(1).stages().get(0).count());
    }
    @Test void exclusionsApplyToEveryKpiCoverageAndFunnelWithoutResearchConsentInference() {
        for (String exclusion : List.of("TEST", "BOT", "DELETION_PENDING", "DELETED")) {
            Data d = reported(5); d.runs.add(run(2, 1, "DATA_SCIENCE", day(3), null)); d.events.add(view("v", 1, 1, day(2)));
            d.students.set(0, new Student(1, exclusion.startsWith("DELE") ? exclusion : "ACTIVE",
                SetLike.exclusion(exclusion), day(-2), day(-1)));
            Core core = d.at(day(30)).metrics(); fraction(core.firstExperienceCompletion(), 0, 0);
            fraction(core.reportInsight(), 0, 0); fraction(core.secondExperienceStart(), 0, 0);
            assertNull(core.feedbackCoverage().rate());
        }
        // Consent is intentionally not a population field. Decline/withdrawal cannot silently filter a Student.
        fraction(reported(5).at(day(30)).metrics().reportInsight(), 1, 1);
    }
    private static final class SetLike { static String exclusion(String value) { return value.equals("TEST") || value.equals("BOT") ? value : null; } }
    @Test void demoPreviewCannotStealFirstPositionAndCannotCountTheirReports() {
        Data d = reported(5); d.runs.add(mode(run(2, 1, "DATA_SCIENCE", day(-1), day(0)), "MAJOR", "REVIEW_PREVIEW"));
        d.runs.add(mode(run(3, 1, "BUSINESS_ANALYTICS", day(-1), day(0)), "DEMO", "STANDARD"));
        d.reports.add(report(2, 1, 2, day(0))); d.surveys.add(survey(2, 1, 2, 1, day(1)));
        Core core = d.at(day(30)).metrics(); fraction(core.reportInsight(), 1, 1); fraction(core.secondExperienceStart(), 0, 1);
    }
    @Test void halfOpenAnchorBoundsAndOriginalDimensionsAreAppliedAfterSelectingFirstFacts() {
        Data d = reported(5); d.runs.add(run(2, 1, "DATA_SCIENCE", day(3), day(4))); d.reports.add(report(2, 1, 2, day(5)));
        Overview lower = d.at(new Query(day(30), day(0), day(1), Filters.all())); fraction(lower.metrics().firstExperienceCompletion(), 1, 1);
        fraction(d.at(new Query(day(30), day(-1), day(0), Filters.all())).metrics().firstExperienceCompletion(), 0, 0);
        Overview ds = d.at(new Query(day(30), day(-3), day(30), new Filters("DATA_SCIENCE", null, null, null)));
        fraction(ds.metrics().firstExperienceCompletion(), 0, 0); fraction(ds.metrics().reportInsight(), 0, 0);
        fraction(d.at(new Query(day(30), day(-3), day(30), new Filters(null, "AI-v1", "q1", "rules1"))).metrics().reportInsight(), 1, 1);
        fraction(d.at(new Query(day(30), day(-3), day(30), new Filters(null, null, "new-current-q", null))).metrics().reportInsight(), 0, 0);
    }
    @Test void futureStartsClosesReportsAnswersAndViewsDoNotEnterHistoricalAsOf() {
        Data d = reported(5); d.runs.set(0, run(1, 1, "AI", day(0), day(8))); d.reports.set(0, report(1, 1, 1, day(9)));
        d.surveys.set(0, survey(1, 1, 1, 5, day(10))); d.runs.add(run(2, 1, "DATA_SCIENCE", day(20), null));
        d.events.add(view("future", 1, 1, day(10)));
        Overview o = d.at(day(7)); fraction(o.metrics().firstExperienceCompletion(), 0, 1);
        fraction(o.metrics().reportInsight(), 0, 0); fraction(o.metrics().secondExperienceStart(), 0, 0);
        assertEquals(day(7), o.dataUpdatedAt());
    }
    @Test void badOriginOwnershipCycleScopeAndMissingAncestorAreSafeQualityFailures() {
        Data owner = completion(null); owner.students.add(student(2)); owner.runs.add(origin(run(2, 2, "AI", day(1), null), 1));
        code("METRICS_ORIGIN_OWNER_MISMATCH", () -> owner.at(day(30)));
        Data cycle = completion(null); cycle.runs.set(0, origin(cycle.runs.get(0), 2)); cycle.runs.add(origin(run(2, 1, "AI", day(1), null), 1));
        code("METRICS_ORIGIN_CYCLE", () -> cycle.at(day(30)));
        Data scope = completion(null); scope.runs.add(origin(run(2, 1, "DATA_SCIENCE", day(1), null), 1));
        code("METRICS_ORIGIN_SCOPE_MISMATCH", () -> scope.at(day(30)));
        Data missing = completion(null); missing.runs.set(0, origin(missing.runs.get(0), 99));
        code("METRICS_ORIGIN_MISSING", () -> missing.at(day(30)));
    }
    @Test void duplicateFirstSurveyOrCrossOwnerObservationFailsRatherThanChoosingConvenientFacts() {
        Data d = reported(5); d.surveys.add(survey(2, 1, 1, 1, day(4)));
        code("METRICS_FIRST_SURVEY_INVALID", () -> d.at(day(30)));
        Data owner = reported(5); owner.students.add(student(2)); owner.events.add(view("bad", 2, 1, day(3)));
        code("METRICS_EVENT_OWNER_MISMATCH", () -> owner.at(day(30)));
    }
    @Test void firstValueIncludesAnonymousIntakeAndDoesNotInventMissingRecommendationView() {
        Data d = new Data(); d.students.add(new Student(1, "ACTIVE", null, ms(3), ms(4)));
        d.intakes.add(new Intake(1, 1L, "q1", ms(0), ms(1), ms(3)));
        d.intakes.add(new Intake(2, null, "q1", ms(0), ms(1), null));
        d.events.add(new Observation("recommendation", "recommendation.viewed", null, 1L, null, null, null, ms(2)));
        d.runs.add(run(1, 1, "AI", ms(5), day(1))); d.reports.add(report(1, 1, 1, day(2)));
        d.events.add(view("v", 1, 1, day(2).plusMillis(1))); d.surveys.add(survey(1, 1, 1, 5, day(2).plusMillis(2)));
        Funnel f = d.at(day(30)).funnels().get(0);
        assertEquals(List.of(2L, 2L, 1L, 1L, 1L, 1L, 1L, 1L, 1L), f.stages().stream().map(Stage::count).toList());
        assertEquals(new BigDecimal("0.500000"), f.stages().get(2).previousConversion());
        Funnel filtered = d.at(new Query(day(30), day(-3), day(30), new Filters("AI", null, null, null))).funnels().get(0);
        assertEquals(1, filtered.stages().get(0).count());
        assertTrue(filtered.coverageNotes().stream().anyMatch(n -> n.startsWith("NARROWED_TO_STARTED")));
    }
    @Test void postReportComparisonIsOrderedAndBeforeReportExplorationIsNotRecountedByRecovery() {
        Data d = reported(null); d.events.add(view("v", 1, 1, day(2)));
        d.events.add(new Observation("next", "next_recommendation.viewed", 1L, null, 1L, null, null, day(3)));
        d.runs.add(run(2, 1, "DATA_SCIENCE", day(4), day(5)));
        d.reports.add(new Report(2, 1, "COMPARISON", List.of(1L, 2L), day(6)));
        d.events.add(new Observation("compare", "comparison_report.viewed", 1L, null, null, 2L, null, day(7)));
        assertEquals(List.of(1L, 1L, 1L, 1L, 1L, 1L), d.at(day(30)).funnels().get(1).stages().stream().map(Stage::count).toList());
        assertEquals("DATA_SCIENCE", d.at(day(30)).comparisonByMajorPair().get(0).secondMajorCode());
        d.runs.set(1, run(2, 1, "DATA_SCIENCE", day(1), day(5)));
        d.runs.add(origin(run(3, 1, "DATA_SCIENCE", day(4), null), 2));
        Overview o = d.at(day(30)); assertEquals(0, o.funnels().get(1).stages().get(2).count());
        assertEquals(1, o.metrics().secondStartTiming().before());
    }
    @Test void manifestStepOrderAndMissingViewsKeepIndependentBusinessCompletionsVisible() {
        Data d = completion(day(5)); d.tasks.add(new TaskDefinition("AI-v1", "AI", List.of("a1", "a2")));
        d.completions.addAll(List.of(new StepCompletion(1, "a1", day(1)), new StepCompletion(1, "a2", day(2))));
        TaskFunnel missing = d.at(day(30)).taskFunnels().get(0); assertEquals(0, missing.funnel().stages().get(1).count());
        assertEquals(1, missing.diagnostics().get(0).completedStudents());
        d.events.add(new Observation("a1", "experience.step.viewed", 1L, null, 1L, null, "a1", ms(1)));
        d.events.add(new Observation("a2", "experience.step.viewed", 1L, null, 1L, null, "a2", day(1).plusMillis(1)));
        d.events.add(new Observation("fail", "experience.execution.failed", 1L, null, 1L, null, "a2", day(1).plusMillis(2)));
        TaskFunnel full = d.at(day(30)).taskFunnels().get(0);
        assertEquals(List.of(1L, 1L, 1L, 1L, 1L), full.funnel().stages().stream().map(Stage::count).toList());
        assertEquals(1, full.diagnostics().get(1).errorStudents());
    }
    @Test void activityCapsEveryGapAtTenMinutesAndCountsDuplicateTimestampOnce() {
        Data d = completion(day(1));
        for (long minute : List.of(0L, 1L, 31L, 31L)) d.events.add(new Observation("activity-" + d.events.size(),
            "experience.response.saved", 1L, null, 1L, null, "a1", ZERO.plus(minute, ChronoUnit.MINUTES)));
        Diagnostics result = d.at(day(30)).diagnostics(); assertEquals(660, result.observedActiveSeconds());
        assertEquals(new BigDecimal("1.000000"), result.activityObservationCoverage());
    }
    @Test void emptySnapshotDefaultsDatesSafelyAndRejectsBadIntervalsOrNanosecondPrecision() {
        Data d = new Data(); Snapshot empty = new Snapshot(null, List.of(), List.of(), List.of(), List.of(), List.of(), List.of(), List.of(), List.of());
        Overview result = ENGINE.compute(empty, new Query(day(30), null, null, null)); assertNull(result.dataUpdatedAt());
        assertEquals(day(-60), result.from()); fraction(result.metrics().firstExperienceCompletion(), 0, 0);
        code("METRICS_QUERY_INVALID", () -> d.at(new Query(day(30), day(1), day(1), null)));
        code("METRICS_QUERY_INVALID", () -> d.at(new Query(day(30), day(0), day(31), null)));
        code("METRICS_QUERY_INVALID", () -> d.at(new Query(day(400), day(0), day(367), null)));
        code("METRICS_QUERY_INVALID", () -> d.at(new Query(day(30).plusNanos(1), day(0), day(1), null)));
    }
}
