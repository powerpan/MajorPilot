package com.ruoyi.majorpilot.intake;

import static org.junit.jupiter.api.Assertions.*;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.Test;

class QuestionnaireTest {
    @Test void publicFixtureHasTwelvePagesAndThirteenDeclaredFields() {
        assertNotNull(Questionnaire.complete(IntakeFixtures.answers()));
        var definition=QuestionnaireDefinition.current();assertEquals(12,definition.pages().size());assertEquals(10,definition.pages().stream().filter(QuestionnaireDefinition.Page::required).count());
        assertEquals(13,definition.pages().stream().mapToInt(page->page.fields().size()).sum());
    }
    @Test void skippedFinalPageNormalizesChannelWithoutBlockingRecommendation() {
        var input=IntakeFixtures.answers();input.remove("currentFieldText");input.remove("mainQuestion");input.remove("acquisitionChannel");
        var answers=Questionnaire.complete(input);assertEquals(DecisionAnswers.AcquisitionChannel.DECLINED,answers.acquisitionChannel());assertNull(answers.mainQuestion());
    }
    @Test void draftCanSaveAnIncompleteMatrixOrEmptySelectionButCannotSubmitIt() throws Exception {
        var partial=IntakeFixtures.JSON.readTree("{\"majorFamiliarity\":{\"AI\":\"UNFAMILIAR\"}}");
        assertDoesNotThrow(()->Questionnaire.pageDraft("step-7",partial));
        var complete=IntakeFixtures.answers();complete.set("majorFamiliarity",partial.get("majorFamiliarity"));assertThrows(Questionnaire.Invalid.class,()->Questionnaire.complete(complete));
        var empty=IntakeFixtures.JSON.readTree("{\"workElements\":[]}");assertDoesNotThrow(()->Questionnaire.pageDraft("step-10",empty));
        complete.set("workElements",empty.get("workElements"));assertThrows(Questionnaire.Invalid.class,()->Questionnaire.complete(complete));
    }
    @Test void rejectsMissingDuplicateOrGappedScenarios() throws Exception {
        for(String scenarios:new String[]{"[{\"majorCode\":\"AI\",\"rank\":1},{\"majorCode\":\"DATA_SCIENCE\",\"rank\":2}]","[{\"majorCode\":\"AI\",\"rank\":1},{\"majorCode\":\"AI\",\"rank\":1},{\"majorCode\":\"BUSINESS_ANALYTICS\",\"rank\":2}]","[{\"majorCode\":\"AI\",\"rank\":1},{\"majorCode\":\"DATA_SCIENCE\",\"rank\":3},{\"majorCode\":\"BUSINESS_ANALYTICS\",\"rank\":3}]"}) {
            var input=IntakeFixtures.answers();input.set("scenarioPreference",IntakeFixtures.JSON.readTree(scenarios));assertThrows(Questionnaire.Invalid.class,()->Questionnaire.complete(input));
        }
    }
    @Test void acceptsEveryDocumentedTiePattern() {
        for(int[] ranks:new int[][]{{1,1,2},{1,2,2},{1,1,1}}) {
            var input=IntakeFixtures.answers();for(int i=0;i<3;i++)((ObjectNode)input.get("scenarioPreference").get(i)).put("rank",ranks[i]);assertDoesNotThrow(()->Questionnaire.complete(input));
        }
    }
    @Test void unknownFieldsEnumsDuplicatesAndOversizeValuesAreRejected() {
        var unknown=IntakeFixtures.answers();unknown.put("fitScore",99);assertThrows(Questionnaire.Invalid.class,()->Questionnaire.complete(unknown));
        var extra=IntakeFixtures.answers();extra.putArray("workElements").add("CHECK_ERRORS").add("ADJUST_EXPERIMENTS").add("CLEAN_DATA").add("DEFINE_METRICS");assertThrows(Questionnaire.Invalid.class,()->Questionnaire.complete(extra));
        var duplicate=IntakeFixtures.answers();duplicate.putArray("consideredMajors").add("AI").add("AI");assertThrows(Questionnaire.Invalid.class,()->Questionnaire.complete(duplicate));
        var invalid=IntakeFixtures.answers();invalid.put("currentField","OTHER_MAJOR");assertThrows(Questionnaire.Invalid.class,()->Questionnaire.complete(invalid));
        var longText=IntakeFixtures.answers();longText.put("mainQuestion","问".repeat(301));assertThrows(Questionnaire.Invalid.class,()->Questionnaire.complete(longText));
        var control=IntakeFixtures.answers();control.put("mainQuestion","secret\u0000value");var failure=assertThrows(Questionnaire.Invalid.class,()->Questionnaire.complete(control));assertFalse(failure.getMessage().contains("secret"));
    }
    @Test void pageCannotWriteAnotherPagesField() {
        var input=IntakeFixtures.JSON.createObjectNode().put("applicationStage","EXPLORING");assertThrows(Questionnaire.Invalid.class,()->Questionnaire.pageDraft("step-9",input));assertThrows(Questionnaire.Invalid.class,()->Questionnaire.pageDraft("../../file",input));
    }
    @Test void charactersUseCodePointsNotUtf16Units() {
        var input=IntakeFixtures.answers();input.put("currentFieldText","😀".repeat(80));assertEquals(80,Questionnaire.complete(input).currentFieldText().codePointCount(0,160));
    }
    @Test void partialNormalizationNeverCreatesAnswersAndReadinessRequiresAllRankingInputs() throws Exception {
        var input=(ObjectNode)IntakeFixtures.JSON.readTree("{\"applicationStage\":null,\"targetIntakeWindow\":\"UNSURE\",\"majorFamiliarity\":{\"AI\":\"UNFAMILIAR\"},\"scenarioPreference\":[{\"majorCode\":\"AI\",\"rank\":2}]}");
        var output=Questionnaire.draft(input);assertEquals(input,output);assertFalse(output.has("acquisitionChannel"));assertFalse(Questionnaire.isComplete(output));assertFalse(Questionnaire.recommendationReady(output));
        assertEquals("SKIPPED",Questionnaire.answerStates(output).get("applicationStage"));assertEquals("UNSURE",Questionnaire.answerStates(output).get("targetIntakeWindow"));assertEquals("MISSING",Questionnaire.answerStates(output).get("currentField"));
        var full=IntakeFixtures.answers();full.remove("currentFieldText");full.remove("mainQuestion");full.remove("acquisitionChannel");assertTrue(Questionnaire.isComplete(full));assertTrue(Questionnaire.recommendationReady(full));
        full.putNull("foundationSelfView");assertFalse(Questionnaire.isComplete(full));assertTrue(Questionnaire.recommendationReady(full));
        full.putNull("scenarioPreference");assertFalse(Questionnaire.recommendationReady(full));
    }

}
