package com.ruoyi.majorpilot.analytics.metrics;

import static com.ruoyi.majorpilot.analytics.metrics.MetricsModels.*;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.function.Function;

/** metrics-v2: deterministic recomputation of retained facts, never a historical database restore. */
public final class MetricsEngine {
    private static final List<String> MAJORS = List.of("AI", "DATA_SCIENCE", "BUSINESS_ANALYTICS");
    private static final Comparator<Run> START_ORDER = Comparator.comparing(Run::startedAt).thenComparingLong(Run::id);
    private static final Comparator<Report> READY_ORDER = Comparator.comparing(Report::firstReadyAt).thenComparingLong(Report::id);

    public Overview compute(Snapshot snapshot, Query request) {
        Query query = normalize(request);
        Context context = new Context(snapshot, query);
        Core core = core(context, query.filters());
        List<MajorBreakdown> majors = new ArrayList<>();
        for (String major : MAJORS) {
            if (query.filters().majorCode() == null || major.equals(query.filters().majorCode())) {
                Filters f = query.filters();
                majors.add(new MajorBreakdown(major, core(context,
                    new Filters(major, f.taskVersionId(), f.questionnaireVersion(), f.recommendationRuleVersion()))));
            }
        }
        return new Overview("metrics-v2", query.asOf(), query.from(), query.to(), query.filters(),
            context.dataUpdatedAt, context.exclusions, core, majors,
            List.of(firstValue(context), comparison(context, null, null)), comparisonPairs(context), taskFunnels(context), diagnostics(context), List.of(
                "RETAINED_RECORDS_AS_OF_NOT_HISTORICAL_RESTORE", "CURRENT_EXCLUSIONS_APPLY_TO_ALL_AS_OF_VALUES",
                "STANDARD_MAJOR_ONLY", "OPTIONAL_RESEARCH_CONSENT_DOES_NOT_FILTER_OPERATIONAL_METRICS",
                "OBSERVATIONS_USE_RECEIVED_AT_AND_MAY_BE_MISSING", "RATES_ARE_RATIOS_NOT_PERCENTAGES",
                "NO_BASELINE_TARGET_OR_CAUSAL_INFERENCE", "SMALL_SAMPLES_MUST_BE_READ_WITH_COUNTS"));
    }

    public static Query normalize(Query request) {
        if (request == null || request.asOf() == null) throw quality("METRICS_QUERY_INVALID");
        Instant asOf = request.asOf();
        Instant to = request.to() == null ? asOf : request.to();
        Instant from = request.from() == null ? to.minus(90, ChronoUnit.DAYS) : request.from();
        if (!millis(asOf) || !millis(from) || !millis(to) || !from.isBefore(to) || to.isAfter(asOf)
            || Duration.between(from, to).compareTo(Duration.ofDays(366)) > 0) throw quality("METRICS_QUERY_INVALID");
        Filters f = request.filters() == null ? Filters.all() : request.filters();
        if (f.majorCode() != null && !MAJORS.contains(f.majorCode())) throw quality("METRICS_QUERY_INVALID");
        for (String value : new String[] {f.taskVersionId(), f.questionnaireVersion(), f.recommendationRuleVersion()}) {
            if (value != null && (value.isBlank() || value.length() > 128)) throw quality("METRICS_QUERY_INVALID");
        }
        return new Query(asOf, from, to, f);
    }

    private Core core(Context c, Filters filters) {
        long completionCohort = 0, completionImmature = 0, complete = 0;
        long reportCohort = 0, answered = 0, positive = 0, viewed = 0, viewedAnswered = 0, answeredWithoutView = 0;
        long secondImmature = 0, second = 0, before = 0, after = 0;
        for (Chain chain : c.firstChains.values()) {
            Run anchor = chain.first();
            if (!c.inCohort(anchor.startedAt()) || !matches(anchor, filters)) continue;
            completionCohort++;
            Instant deadline = anchor.startedAt().plus(7, ChronoUnit.DAYS);
            if (deadline.isAfter(c.q.asOf())) { completionImmature++; continue; }
            if (chain.runs().stream().anyMatch(run -> within(run.closedAt(), anchor.startedAt(), deadline))) complete++;
        }
        for (Report report : c.firstReports.values()) {
            Run source = c.runs.get(report.sourceRunIds().get(0));
            if (!c.inCohort(report.firstReadyAt()) || !matches(source, filters)) continue;
            reportCohort++;
            Survey survey = c.firstSurveys.get(report.id());
            boolean hasAnswer = survey != null && survey.insightResponse() != null;
            boolean hasView = c.firstObservation("report.viewed", report.studentId(), null, report.id(), null,
                report.firstReadyAt()) != null;
            if (hasAnswer) {
                answered++;
                if (survey.insightResponse() >= 4) positive++;
                if (!hasView) answeredWithoutView++;
            }
            if (hasView) { viewed++; if (hasAnswer) viewedAnswered++; }
            Instant deadline = report.firstReadyAt().plus(14, ChronoUnit.DAYS);
            if (deadline.isAfter(c.q.asOf())) { secondImmature++; continue; }
            Run secondRun = c.secondMajorStart(report.studentId(), deadline);
            if (secondRun != null) {
                second++;
                if (secondRun.startedAt().isBefore(report.firstReadyAt())) before++; else after++;
            }
        }
        return new Core(kpi(complete, completionCohort - completionImmature, completionCohort,
                    completionImmature, "FIRST_FORMAL_RECOVERY_CHAIN_STARTED_AT", 7),
                kpi(positive, answered, reportCohort, 0, "FIRST_LOGICAL_EXPERIENCE_REPORT_FIRST_READY_AT", 0),
                kpi(second, reportCohort - secondImmature, reportCohort, secondImmature,
                    "FIRST_LOGICAL_EXPERIENCE_REPORT_FIRST_READY_AT", 14),
                new Coverage(viewedAnswered, viewed, ratio(viewedAnswered, viewed), answeredWithoutView, reportCohort - viewed),
                new SecondTiming(before, after));
    }

    private Funnel firstValue(Context c) {
        long[] counts = new long[9];
        Filters f = c.q.filters();
        boolean downstream = f.majorCode() != null || f.taskVersionId() != null || f.recommendationRuleVersion() != null;
        Set<Long> countedStudents = new HashSet<>();
        List<Intake> ordered = c.intakes.values().stream().sorted(Comparator.comparing(Intake::startedAt).thenComparingLong(Intake::id)).toList();
        for (Intake intake : ordered) {
            if (!c.inCohort(intake.startedAt()) || !equalFilter(f.questionnaireVersion(), intake.questionnaireVersion())) continue;
            Long studentId = intake.studentId();
            Chain first = studentId == null ? null : c.firstChains.get(studentId);
            if (downstream && (first == null || !matches(first.first(),
                    new Filters(f.majorCode(), f.taskVersionId(), null, f.recommendationRuleVersion())))) continue;
            // Each anonymous Intake is a distinct journey; a claimed Student appears only once.
            if (studentId != null && !countedStudents.add(studentId)) continue;
            counts[0]++;
            Instant cursor = atOrAfter(intake.submittedAt(), intake.startedAt(), c.q.asOf());
            if (cursor == null) continue; counts[1]++;
            cursor = c.firstObservation("recommendation.viewed", studentId, intake.id(), null, null, cursor);
            if (cursor == null) continue; counts[2]++;
            Student student = studentId == null ? null : c.students.get(studentId);
            if (student == null) continue;
            Instant registered = max(student.createdAt(), intake.claimedAt());
            cursor = atOrAfter(registered, cursor, c.q.asOf());
            if (cursor == null) continue; counts[3]++;
            cursor = atOrAfter(student.emailVerifiedAt(), cursor, c.q.asOf());
            if (cursor == null) continue; counts[4]++;
            if (first == null) continue;
            cursor = atOrAfter(first.first().startedAt(), cursor, c.q.asOf());
            if (cursor == null) continue; counts[5]++;
            cursor = firstClose(first, cursor, c.q.asOf());
            if (cursor == null) continue; counts[6]++;
            Report report = c.firstReports.get(studentId);
            if (report == null) continue;
            cursor = c.firstObservation("report.viewed", studentId, null, report.id(), null, max(cursor, report.firstReadyAt()));
            if (cursor == null) continue; counts[7]++;
            Survey survey = c.firstSurveys.get(report.id());
            if (survey != null && atOrAfter(survey.createdAt(), cursor, c.q.asOf()) != null) counts[8]++;
        }
        List<String> notes = new ArrayList<>(List.of("INTAKE_JOURNEYS_NOT_UNIQUE_VISITORS",
            "CLAIMED_STUDENT_COUNTED_ONCE", "ORDERED_PATH_MISSING_OBSERVATION_IS_NOT_PROOF_OF_INACTION"));
        if (downstream) notes.add("NARROWED_TO_STARTED_JOURNEYS_UNREGISTERED_CANNOT_BE_CLASSIFIED_BY_DOWNSTREAM_DIMENSIONS");
        return funnel("FIRST_VALUE", "INTAKE_JOURNEY_THEN_UNIQUE_STUDENT", "INTAKE_STARTED_AT", counts,
            List.of("INTAKE_STARTED", "PROFILE_SUBMITTED", "RECOMMENDATION_VIEWED", "REGISTERED", "EMAIL_VERIFIED",
                "FIRST_EXPERIENCE_STARTED", "FIRST_EXPERIENCE_CLOSED", "FIRST_REPORT_VIEWED", "FIRST_REPORT_SURVEY_SUBMITTED"), notes);
    }

    private List<ComparisonBreakdown> comparisonPairs(Context c) {
        List<ComparisonBreakdown> result = new ArrayList<>();
        for (String first : MAJORS) {
            List<String> seconds = new ArrayList<>(MAJORS); seconds.remove(first); seconds.add(null);
            for (String second : seconds) {
                Funnel grouped = comparison(c, first, second);
                if (grouped.stages().get(0).count() > 0) result.add(new ComparisonBreakdown(first, second, grouped));
            }
        }
        return result;
    }

    private Funnel comparison(Context c, String firstMajorFilter, String secondMajorFilter) {
        long[] counts = new long[6];
        for (Report report : c.firstReports.values()) {
            Run source = c.runs.get(report.sourceRunIds().get(0));
            if (!c.inCohort(report.firstReadyAt()) || !matches(source, c.q.filters())) continue;
            Run second = c.secondMajorStart(report.studentId(), c.q.asOf());
            if (firstMajorFilter != null && (!firstMajorFilter.equals(c.firstChains.get(report.studentId()).first().majorCode())
                || !Objects.equals(secondMajorFilter, second == null ? null : second.majorCode()))) continue;
            Instant viewed = c.firstObservation("report.viewed", report.studentId(), null, report.id(), null, report.firstReadyAt());
            if (viewed == null) continue;
            counts[0]++;
            Instant next = c.firstObservation("next_recommendation.viewed", report.studentId(), null, null, source.id(), viewed);
            if (next == null) continue; counts[1]++;
            // A previously started second Major cannot become a post-report start by resuming/replacing it.
            if (second == null || second.startedAt().isBefore(next)) continue;
            counts[2]++;
            Chain secondChain = c.chains.get(c.roots.get(second.id()));
            Instant closed = firstClose(secondChain, second.startedAt(), c.q.asOf());
            if (closed == null) continue; counts[3]++;
            Report comparison = c.reports.values().stream().filter(r -> "COMPARISON".equals(r.reportType())
                && r.studentId() == report.studentId() && !r.firstReadyAt().isBefore(closed)
                && hasMajor(c, r, source.majorCode()) && hasMajor(c, r, second.majorCode()))
                .min(READY_ORDER).orElse(null);
            if (comparison == null) continue; counts[4]++;
            if (c.firstObservation("comparison_report.viewed", report.studentId(), null, comparison.id(), null,
                    comparison.firstReadyAt()) != null) counts[5]++;
        }
        return funnel("POST_REPORT_COMPARISON", "UNIQUE_STUDENT", "FIRST_LOGICAL_EXPERIENCE_REPORT_FIRST_READY_AT", counts,
            List.of("FIRST_REPORT_VIEWED", "NEXT_RECOMMENDATION_VIEWED", "SECOND_MAJOR_STARTED", "SECOND_MAJOR_CLOSED",
                "COMPARISON_REPORT_READY", "COMPARISON_REPORT_VIEWED"),
            List.of("ORDERED_POST_REPORT_PATH_ONLY", "BEFORE_REPORT_EXPLORATION_REPORTED_SEPARATELY",
                "OBSERVATION_ABSENCE_IS_NOT_BUSINESS_FACT_ABSENCE"));
    }

    private List<TaskFunnel> taskFunnels(Context c) {
        List<TaskFunnel> result = new ArrayList<>();
        for (TaskDefinition task : c.tasks.values().stream().sorted(Comparator.comparing(TaskDefinition::taskVersionId)).toList()) {
            List<Run> relevant = c.runs.values().stream().filter(r -> Objects.equals(task.taskVersionId(), r.taskVersionId())
                && r.startedAt() != null && !r.startedAt().isAfter(c.q.asOf())
                && c.inCohort(c.chains.get(c.roots.get(r.id())).first().startedAt())
                && matches(c.chains.get(c.roots.get(r.id())).first(), c.q.filters())).sorted(START_ORDER).toList();
            if (relevant.isEmpty()) continue;
            Map<Long, List<Run>> byStudent = new LinkedHashMap<>();
            for (Run run : relevant) byStudent.computeIfAbsent(run.studentId(), ignored -> new ArrayList<>()).add(run);
            List<String> keys = new ArrayList<>(List.of("TASK_STARTED"));
            for (String step : task.stepKeys()) { keys.add(step + ":VIEWED"); keys.add(step + ":COMPLETED"); }
            long[] counts = new long[keys.size()];
            for (List<Run> attempts : byStudent.values()) {
                counts[0]++;
                Instant cursor = attempts.get(0).startedAt();
                Set<Long> runIds = new HashSet<>();
                for (Run run : attempts) runIds.add(run.id());
                int index = 1;
                for (String step : task.stepKeys()) {
                    Instant after = cursor;
                    cursor = c.events.stream().filter(e -> "experience.step.viewed".equals(e.eventName())
                        && runIds.contains(e.runId()) && step.equals(e.stepKey()) && !e.receivedAt().isBefore(after))
                        .map(Observation::receivedAt).min(Comparator.naturalOrder()).orElse(null);
                    if (cursor == null) break; counts[index++]++;
                    Instant afterView = cursor;
                    cursor = c.completions.stream().filter(e -> runIds.contains(e.runId()) && step.equals(e.stepKey())
                        && !e.completedAt().isBefore(afterView)).map(StepCompletion::completedAt)
                        .min(Comparator.naturalOrder()).orElse(null);
                    if (cursor == null) break; counts[index++]++;
                }
            }
            Set<Long> runIds = new HashSet<>(); for (Run run : relevant) runIds.add(run.id());
            List<StepDiagnostic> diagnostics = new ArrayList<>();
            for (String step : task.stepKeys()) diagnostics.add(new StepDiagnostic(step,
                eventStudents(c, runIds, step, Set.of("experience.step.viewed")),
                c.completions.stream().filter(e -> runIds.contains(e.runId()) && step.equals(e.stepKey()))
                    .map(e -> c.runs.get(e.runId()).studentId()).distinct().count(),
                eventStudents(c, runIds, step, Set.of("experience.execution.failed")),
                eventStudents(c, runIds, step, Set.of("experience.run.resumed", "experience.run.reactivated", "experience.run.replaced")),
                eventStudents(c, runIds, step, Set.of("experience.hint.requested"))));
            result.add(new TaskFunnel(task.taskVersionId(), task.majorCode(), funnel("TASK_STEPS", "UNIQUE_STUDENT_PER_TASK_VERSION",
                "FORMAL_TASK_STARTED_AT", counts, keys, List.of("MANIFEST_STEP_ORDER", "MISSING_VIEW_DOES_NOT_CANCEL_COMPLETION_FACT",
                    "ORDERED_OBSERVED_PATH_NOT_TOTAL_BUSINESS_COMPLETIONS")), diagnostics));
        }
        return result;
    }

    private Diagnostics diagnostics(Context c) {
        long started = 0, observed = 0, millis = 0;
        for (Run run : c.runs.values()) {
            if (run.startedAt() == null || !c.inCohort(run.startedAt()) || !matches(run, c.q.filters())) continue;
            started++;
            List<Instant> times = c.events.stream().filter(e -> Objects.equals(e.runId(), run.id())
                && e.eventName().startsWith("experience.") && !e.receivedAt().isBefore(run.startedAt())
                && (run.closedAt() == null || !e.receivedAt().isAfter(run.closedAt())))
                .map(Observation::receivedAt).distinct().sorted().toList();
            if (!times.isEmpty()) observed++;
            for (int i = 1; i < times.size(); i++) millis += Math.min(600_000, Duration.between(times.get(i - 1), times.get(i)).toMillis());
        }
        return new Diagnostics(c.students.size(), observed, started, millis / 1000, ratio(observed, started));
    }

    private static long eventStudents(Context c, Set<Long> runs, String step, Set<String> names) {
        return c.events.stream().filter(e -> runs.contains(e.runId()) && step.equals(e.stepKey()) && names.contains(e.eventName()))
            .map(e -> c.runs.get(e.runId()).studentId()).distinct().count();
    }
    private static boolean hasMajor(Context c, Report report, String major) {
        return report.sourceRunIds().stream().anyMatch(id -> major.equals(c.runs.get(id).majorCode()));
    }
    private static Instant firstClose(Chain chain, Instant after, Instant through) {
        return chain.runs().stream().map(Run::closedAt).filter(t -> within(t, after, through))
            .min(Comparator.naturalOrder()).orElse(null);
    }
    private static Kpi kpi(long numerator, long denominator, long cohort, long immature, String anchor, int days) {
        return new Kpi(numerator, denominator, ratio(numerator, denominator), cohort, immature, anchor, days);
    }
    private static Funnel funnel(String key, String grain, String anchor, long[] counts, List<String> keys, List<String> notes) {
        List<Stage> stages = new ArrayList<>();
        for (int i = 0; i < counts.length; i++) stages.add(new Stage(keys.get(i), counts[i],
            i == 0 ? null : ratio(counts[i], counts[i - 1]), ratio(counts[i], counts[0])));
        return new Funnel(key, grain, anchor, stages, notes);
    }
    private static BigDecimal ratio(long numerator, long denominator) {
        return denominator == 0 ? null : BigDecimal.valueOf(numerator).divide(BigDecimal.valueOf(denominator), 6, RoundingMode.HALF_UP);
    }
    private static boolean matches(Run run, Filters f) {
        return equalFilter(f.majorCode(), run.majorCode()) && equalFilter(f.taskVersionId(), run.taskVersionId())
            && equalFilter(f.questionnaireVersion(), run.questionnaireVersion())
            && equalFilter(f.recommendationRuleVersion(), run.recommendationRuleVersion());
    }
    private static boolean equalFilter(String filter, String value) { return filter == null || filter.equals(value); }
    private static Instant atOrAfter(Instant value, Instant after, Instant through) { return within(value, after, through) ? value : null; }
    private static boolean within(Instant value, Instant from, Instant through) {
        return value != null && from != null && !value.isBefore(from) && !value.isAfter(through);
    }
    private static Instant max(Instant a, Instant b) { return a == null || b == null ? null : a.isAfter(b) ? a : b; }
    private static boolean millis(Instant value) { return value.getNano() % 1_000_000 == 0; }
    private static MetricsQualityException quality(String code) { return new MetricsQualityException(code); }
    private record Chain(long root, List<Run> runs, Run first) {}

    private static final class Context {
        final Query q;
        final Instant dataUpdatedAt;
        final Map<Long, Student> students = new LinkedHashMap<>();
        final Map<Long, Intake> intakes = new LinkedHashMap<>();
        final Map<Long, Run> runs = new LinkedHashMap<>();
        final Map<Long, Long> roots = new HashMap<>();
        final Map<Long, Chain> chains = new HashMap<>();
        final Map<Long, Chain> firstChains = new HashMap<>();
        final Map<Long, Report> reports = new LinkedHashMap<>();
        final Map<Long, Report> firstReports = new HashMap<>();
        final Map<Long, Survey> firstSurveys = new HashMap<>();
        final List<Observation> events = new ArrayList<>();
        final Map<Long, List<Observation>> eventsByStudent = new HashMap<>();
        final Map<Long, List<Observation>> eventsByIntake = new HashMap<>();
        final Map<Long, List<Observation>> eventsByReport = new HashMap<>();
        final Map<Long, List<Observation>> eventsByRun = new HashMap<>();
        final Map<Long, List<Run>> startsByStudent = new HashMap<>();
        final List<StepCompletion> completions = new ArrayList<>();
        final Map<String, TaskDefinition> tasks = new LinkedHashMap<>();
        final Exclusions exclusions;

        Context(Snapshot s, Query query) {
            if (s == null) throw quality("METRICS_SOURCE_INVALID");
            q = query;
            dataUpdatedAt = s.dataUpdatedAt() == null ? null : s.dataUpdatedAt().isAfter(q.asOf()) ? q.asOf() : s.dataUpdatedAt();
            long test = 0, bot = 0, deletion = 0, nonStandard = 0;
            Map<Long, Student> allStudents = index(s.students(), Student::id);
            for (Student student : allStudents.values()) {
                if (!visible(student.createdAt())) continue;
                if (student.status() == null || !Set.of("PENDING_VERIFICATION", "ACTIVE", "LOCKED", "DELETION_PENDING", "DELETED")
                    .contains(student.status())) throw quality("METRICS_STUDENT_INVALID");
                if (Set.of("DELETION_PENDING", "DELETED").contains(student.status())) { deletion++; continue; }
                if ("TEST".equals(student.analyticsExclusionCode())) { test++; continue; }
                if ("BOT".equals(student.analyticsExclusionCode())) { bot++; continue; }
                if (student.analyticsExclusionCode() != null && !"NONE".equals(student.analyticsExclusionCode())) throw quality("METRICS_EXCLUSION_INVALID");
                students.put(student.id(), student);
            }
            Map<Long, Run> allRuns = index(s.runs(), Run::id);
            for (Run run : allRuns.values()) {
                if (!visible(run.createdAt()) || !students.containsKey(run.studentId())) continue;
                if (!formal(run)) { nonStandard++; continue; }
                if (run.majorCode() == null || !MAJORS.contains(run.majorCode()) || (visible(run.startedAt()) && run.taskVersionId() == null)
                    || (visible(run.startedAt()) && run.startedAt().isBefore(run.createdAt()))
                    || (visible(run.closedAt()) && (!visible(run.startedAt()) || run.closedAt().isBefore(run.startedAt()))))
                    throw quality("METRICS_RUN_INVALID");
                runs.put(run.id(), run);
            }
            exclusions = new Exclusions(test, bot, deletion, nonStandard);
            buildChains(allRuns);
            for (Run run : runs.values()) if (visible(run.startedAt()))
                startsByStudent.computeIfAbsent(run.studentId(), ignored -> new ArrayList<>()).add(run);
            for (List<Run> starts : startsByStudent.values()) starts.sort(START_ORDER);
            for (Intake intake : index(s.intakes(), Intake::id).values()) {
                if (visible(intake.startedAt()) && (intake.studentId() == null || students.containsKey(intake.studentId()))) intakes.put(intake.id(), intake);
            }
            for (Report report : index(s.reports(), Report::id).values()) {
                if (!visible(report.firstReadyAt()) || !students.containsKey(report.studentId())) continue;
                if (report.reportType() == null || !Set.of("EXPERIENCE", "COMPARISON").contains(report.reportType()) || report.sourceRunIds().isEmpty()
                    || ("EXPERIENCE".equals(report.reportType()) && report.sourceRunIds().size() != 1)) throw quality("METRICS_REPORT_INVALID");
                boolean formal = true;
                for (Long id : report.sourceRunIds()) {
                    Run run = allRuns.get(id);
                    if (run == null || run.studentId() != report.studentId()) throw quality("METRICS_REPORT_OWNER_MISMATCH");
                    if (!formal(run)) { formal = false; continue; }
                    if (!runs.containsKey(id) || !visible(run.closedAt()) || run.closedAt().isAfter(report.firstReadyAt())) throw quality("METRICS_REPORT_INVALID");
                }
                if (!formal) continue;
                reports.put(report.id(), report);
                if ("EXPERIENCE".equals(report.reportType())) firstReports.merge(report.studentId(), report,
                    (a, b) -> READY_ORDER.compare(a, b) <= 0 ? a : b);
            }
            List<Survey> surveys = index(s.surveys(), Survey::id).values().stream().filter(v -> visible(v.createdAt())
                && reports.containsKey(v.reportId()) && "report-value-v1".equals(v.surveyVersion()))
                .sorted(Comparator.comparing(Survey::createdAt).thenComparingLong(Survey::id)).toList();
            for (Survey survey : surveys) {
                Report report = reports.get(survey.reportId());
                if (survey.studentId() != report.studentId()) throw quality("METRICS_SURVEY_OWNER_MISMATCH");
                if (survey.createdAt().isBefore(report.firstReadyAt()) || (survey.insightResponse() != null
                    && (survey.insightResponse() < 1 || survey.insightResponse() > 5))) throw quality("METRICS_SURVEY_INVALID");
                if (!firstSurveys.containsKey(survey.reportId())) {
                    if (!survey.firstValidSurvey()) throw quality("METRICS_FIRST_SURVEY_INVALID");
                    firstSurveys.put(survey.reportId(), survey);
                } else if (survey.firstValidSurvey()) throw quality("METRICS_FIRST_SURVEY_INVALID");
            }
            Map<String, Observation> uniqueEvents = new LinkedHashMap<>();
            for (Observation event : s.observations()) {
                if (!visible(event.receivedAt())) continue;
                if (event.studentId() != null && !students.containsKey(event.studentId())) continue;
                if (event.intakeId() != null && !intakes.containsKey(event.intakeId())) continue;
                if (event.runId() != null && !runs.containsKey(event.runId())) continue;
                if (event.reportId() != null && !reports.containsKey(event.reportId())) continue;
                validateOwner(event);
                // IDs are scoped by subject; repeat identical delivery is harmless, conflicting identity is not.
                String subject = event.studentId() != null ? "s:" + event.studentId() : "i:" + event.intakeId();
                String key = subject + ":" + event.id();
                Observation old = uniqueEvents.putIfAbsent(key, event);
                if (old != null && !old.equals(event)) throw quality("METRICS_EVENT_ID_CONFLICT");
            }
            events.addAll(uniqueEvents.values());
            for (Observation event : events) {
                if (event.studentId() != null) eventsByStudent.computeIfAbsent(event.studentId(), ignored -> new ArrayList<>()).add(event);
                if (event.intakeId() != null) eventsByIntake.computeIfAbsent(event.intakeId(), ignored -> new ArrayList<>()).add(event);
                if (event.reportId() != null) eventsByReport.computeIfAbsent(event.reportId(), ignored -> new ArrayList<>()).add(event);
                if (event.runId() != null) eventsByRun.computeIfAbsent(event.runId(), ignored -> new ArrayList<>()).add(event);
            }
            for (TaskDefinition task : s.taskDefinitions()) {
                if (task.majorCode() == null || !MAJORS.contains(task.majorCode()) || task.taskVersionId() == null || task.taskVersionId().isBlank()
                    || task.stepKeys().isEmpty() || task.stepKeys().stream().anyMatch(String::isBlank)
                    || new HashSet<>(task.stepKeys()).size() != task.stepKeys().size()
                    || tasks.putIfAbsent(task.taskVersionId(), task) != null) throw quality("METRICS_TASK_DEFINITION_INVALID");
            }
            for (StepCompletion completion : s.stepCompletions()) {
                if (!visible(completion.completedAt()) || !runs.containsKey(completion.runId())) continue;
                Run run = runs.get(completion.runId());
                TaskDefinition task = tasks.get(run.taskVersionId());
                if (!visible(run.startedAt()) || completion.completedAt().isBefore(run.startedAt()) || task == null
                    || !task.stepKeys().contains(completion.stepKey())) throw quality("METRICS_STEP_INVALID");
                completions.add(completion);
            }
        }

        void buildChains(Map<Long, Run> allRuns) {
            for (Run run : runs.values()) {
                Set<Long> path = new HashSet<>(); Run cursor = run;
                while (cursor.originRunId() != null) {
                    if (!path.add(cursor.id())) throw quality("METRICS_ORIGIN_CYCLE");
                    Run parent = allRuns.get(cursor.originRunId());
                    if (parent == null) throw quality("METRICS_ORIGIN_MISSING");
                    if (parent.studentId() != run.studentId()) throw quality("METRICS_ORIGIN_OWNER_MISMATCH");
                    if (!Objects.equals(parent.majorCode(), run.majorCode()) || !formal(parent)) throw quality("METRICS_ORIGIN_SCOPE_MISMATCH");
                    if (!runs.containsKey(parent.id()) || parent.createdAt().isAfter(cursor.createdAt())) throw quality("METRICS_ORIGIN_TIME_INVALID");
                    cursor = parent;
                }
                roots.put(run.id(), cursor.id());
            }
            Map<Long, List<Run>> members = new HashMap<>();
            for (Run run : runs.values()) members.computeIfAbsent(roots.get(run.id()), ignored -> new ArrayList<>()).add(run);
            for (Map.Entry<Long, List<Run>> entry : members.entrySet()) {
                Run first = entry.getValue().stream().filter(r -> visible(r.startedAt())).min(START_ORDER).orElse(null);
                Chain chain = new Chain(entry.getKey(), List.copyOf(entry.getValue()), first);
                chains.put(entry.getKey(), chain);
                if (first != null) firstChains.merge(first.studentId(), chain,
                    (a, b) -> START_ORDER.compare(a.first(), b.first()) <= 0 ? a : b);
            }
        }
        void validateOwner(Observation e) {
            if (e.id() == null || e.id().isBlank() || e.eventName() == null || (e.studentId() == null && e.intakeId() == null)) throw quality("METRICS_EVENT_INVALID");
            if (e.runId() != null && (e.studentId() == null || runs.get(e.runId()).studentId() != e.studentId())) throw quality("METRICS_EVENT_OWNER_MISMATCH");
            if (e.reportId() != null && (e.studentId() == null || reports.get(e.reportId()).studentId() != e.studentId())) throw quality("METRICS_EVENT_OWNER_MISMATCH");
            if (e.intakeId() != null && e.studentId() != null && !Objects.equals(intakes.get(e.intakeId()).studentId(), e.studentId())) throw quality("METRICS_EVENT_OWNER_MISMATCH");
        }
        Instant firstObservation(String name, Long student, Long intake, Long report, Long run, Instant after) {
            if (after == null) return null;
            List<Observation> candidates = intake != null ? eventsByIntake.getOrDefault(intake, List.of())
                : report != null ? eventsByReport.getOrDefault(report, List.of())
                : run != null ? eventsByRun.getOrDefault(run, List.of()) : eventsByStudent.getOrDefault(student, List.of());
            return candidates.stream().filter(e -> name.equals(e.eventName()) && (intake != null
                    ? Objects.equals(intake, e.intakeId()) : Objects.equals(student, e.studentId()))
                && (report == null || Objects.equals(report, e.reportId())) && (run == null || Objects.equals(run, e.runId()))
                && !e.receivedAt().isBefore(after)).map(Observation::receivedAt).min(Comparator.naturalOrder()).orElse(null);
        }
        Run secondMajorStart(long student, Instant deadline) {
            Set<String> seen = new HashSet<>();
            for (Run run : startsByStudent.getOrDefault(student, List.of())) {
                if (run.startedAt().isAfter(deadline)) break;
                if (seen.add(run.majorCode()) && seen.size() == 2) return run;
            }
            return null;
        }
        boolean visible(Instant time) { return time != null && !time.isAfter(q.asOf()); }
        boolean inCohort(Instant time) { return time != null && !time.isBefore(q.from()) && time.isBefore(q.to()); }
        static boolean formal(Run run) { return "STANDARD".equals(run.runMode()) && "MAJOR".equals(run.contentKind()); }
        static <T> Map<Long, T> index(List<T> values, Function<T, Long> id) {
            Map<Long, T> result = new LinkedHashMap<>();
            for (T value : values) {
                if (id.apply(value) <= 0 || result.putIfAbsent(id.apply(value), value) != null) throw quality("METRICS_DUPLICATE_SOURCE_ID");
            }
            return result;
        }
    }
}
