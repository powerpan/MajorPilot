package com.ruoyi.majorpilot.learning;

import com.fasterxml.jackson.databind.*;
import com.fasterxml.jackson.databind.node.*;
import com.ruoyi.majorpilot.shared.ApiException;
import java.time.Instant;
import java.util.*;
import org.junit.jupiter.api.Test;
import static com.ruoyi.majorpilot.learning.LearningTimeline.*;
import static org.junit.jupiter.api.Assertions.*;

class LearningTimelineTest {
    private final ObjectMapper json = new ObjectMapper();
    private final Instant start = Instant.parse("2026-09-24T02:00:00Z");
    private JsonNode schema() {
        return json.createObjectNode().put("type","object").set("properties",json.createObjectNode().set("explanation",json.createObjectNode().put("type","string").put("minLength",1).put("maxLength",2000)));
    }
    private JsonNode validSchema() { var value=(ObjectNode)schema();value.set("required",json.createArrayNode().add("explanation"));value.put("additionalProperties",false);return value; }
    private Definition definition() {
        var nodes=new ArrayList<Checkpoint>();
        for(int i=1;i<=3;i++) {
            var supports=new ArrayList<Support>();for(SupportKind kind:SupportKind.values())supports.add(new Support("ba-c"+i+"-"+kind.name().toLowerCase(Locale.ROOT).replace('_','-'),"support-v1",Integer.toHexString(i).repeat(64),kind));
            nodes.add(new Checkpoint("BA-C"+i,"b"+i,validSchema(),i==3?"ba-transfer-v1":null,i==3?"b6":null,i==3?validSchema():null,supports));
        }
        return new Definition("ba-method-v1",nodes);
    }
    private Binding binding(Definition definition) {return new Binding("01JB2000000000000000000099","01JB2000000000000000000001","a".repeat(64),definitionHash(definition));}
    private Command support(int checkpoint,SupportKind kind) {return new Command(kind==SupportKind.RECOVERY?Kind.BASELINE_SELECTED:Kind.SUPPORT_PROVIDED,"BA-C"+checkpoint,null,null,null,null,null,"ba-c"+checkpoint+"-"+kind.name().toLowerCase(Locale.ROOT).replace('_','-'));}
    private Command attempt(int checkpoint,Role role,long revision,String text) {var answer=json.createObjectNode().put("explanation",text);return new Command(Kind.ATTEMPT_SUBMITTED,"BA-C"+checkpoint,role,answer,role==Role.TRANSFER?"b6":"b"+checkpoint,revision,answerHash(answer),null);}
    private Command continuation(int checkpoint) {return new Command(Kind.CONTINUE_WITH_SUPPORT,"BA-C"+checkpoint,null,null,null,null,null,null);}
    private Event add(List<Event> history,Command command) {var d=definition();var event=append(binding(d),d,history,history.size(),command,start.plusMillis(history.size()));history.add(event);return event;}
    private List<Event> initials() {var result=new ArrayList<Event>();for(int i=1;i<=3;i++){add(result,support(i,SupportKind.BASIC));add(result,attempt(i,Role.INITIAL,10,"我还不确定，需要进一步解释"));}return result;}

    @Test void explicitAttemptsPreserveFirstResponseSupportConditionsAndOneRevision() {
        var history=new ArrayList<Event>();add(history,support(1,SupportKind.BASIC));
        var first=add(history,attempt(1,Role.INITIAL,1,"我以为 40 除以 80 是所有报名人的比例"));
        add(history,support(1,SupportKind.HINT_1));var revision=add(history,attempt(1,Role.REVISION,2,"如果看所有报名人，要除以报名人数 100"));
        assertEquals("我以为 40 除以 80 是所有报名人的比例",first.payload().path("answer").path("explanation").asText());
        assertEquals(List.of(1,3),json.convertValue(revision.payload().path("providedSupportSequences"),List.class));
        assertEquals("PROVIDED_NOT_PROOF_OF_READING_OR_UNDERSTANDING",history.get(2).payload().path("meaning").asText());
        assertEquals("LEARNING_ATTEMPT_LIMIT",assertThrows(ApiException.class,()->add(history,attempt(1,Role.REVISION,3,"再次修改"))).code);
        assertEquals(4,history.size());
    }
    @Test void incorrectOrUncertainAnswersCanCompleteWithoutRevisingOrPretendingTheyAreCorrect() {
        var history=initials();var d=definition();var snapshot=freeze(binding(d),d,history);
        assertEquals(6,snapshot.events().size());assertEquals("learning-snapshot-v1",snapshot.schemaVersion());
        assertEquals(snapshot,freeze(binding(d),d,history));assertTrue(snapshot.sha256().matches("[a-f0-9]{64}"));
        assertTrue(snapshot.events().stream().noneMatch(e->e.payload().has("score")||e.payload().has("understood")));
    }
    @Test void transferIsASeparateQuestionAndItsStepRevisionIsNotComparedToAnotherStepsRevision() {
        var history=initials();var transfer=add(history,attempt(3,Role.TRANSFER,1,"两个月参加的人可能不一样，不能直接认定是提醒起作用"));
        assertEquals("ba-transfer-v1",transfer.payload().path("questionId").asText());
        assertEquals("b6",transfer.payload().path("responseStepKey").asText());
        assertEquals("LEARNING_ATTEMPT_LIMIT",assertThrows(ApiException.class,()->add(history,attempt(3,Role.TRANSFER,2,"重答新题"))).code);
        assertThrows(ApiException.class,()->add(history,attempt(1,Role.TRANSFER,2,"没有这道新题")));
        assertThrows(ApiException.class,()->add(history,attempt(3,Role.REVISION,11,"转移题之后再改")));
    }
    @Test void recoveryIsDisclosedAndFlowsIntoLaterSupportConditionsWithoutReplacingStudentWork() {
        var history=new ArrayList<Event>();add(history,support(1,SupportKind.BASIC));add(history,attempt(1,Role.INITIAL,1,"目前不确定"));
        var baseline=add(history,support(1,SupportKind.RECOVERY));add(history,continuation(1));
        add(history,support(2,SupportKind.BASIC));var downstream=add(history,attempt(2,Role.INITIAL,1,"基于系统提供的数据继续判断"));
        assertEquals("SYSTEM_RESULT_SELECTED_NOT_STUDENT_WORK",baseline.payload().path("meaning").asText());
        assertTrue(json.convertValue(downstream.payload().path("providedSupportSequences"),List.class).contains(3));
        assertEquals("目前不确定",history.get(1).payload().path("answer").path("explanation").asText());
    }
    @Test void supportDoesNotInventReadingOrUnderstandingAndCanOnlyUsePinnedMaterials() {
        var history=new ArrayList<Event>();add(history,support(1,SupportKind.BASIC));
        assertThrows(ApiException.class,()->add(history,support(1,SupportKind.BASIC)));
        assertThrows(ApiException.class,()->add(history,new Command(Kind.SUPPORT_PROVIDED,"BA-C1",null,null,null,null,null,"unpublished-help")));
        assertThrows(ApiException.class,()->add(history,support(1,SupportKind.RECOVERY)));
        assertThrows(ApiException.class,()->add(history,continuation(1)));
        add(history,attempt(1,Role.INITIAL,1,"先保存自己的想法"));
        assertEquals("LEARNING_SUPPORT_REQUIRED",assertThrows(ApiException.class,()->add(history,continuation(1))).code);
        add(history,support(1,SupportKind.HINT_2));add(history,continuation(1));
        assertThrows(ApiException.class,()->add(history,continuation(1)));
    }
    @Test void sequencingAndSourceRevisionsFailClosedButIdempotencyMustBeHandledByPersistenceLayer() {
        var d=definition();var history=new ArrayList<Event>();
        assertEquals("LEARNING_SEQUENCE_CONFLICT",assertThrows(ApiException.class,()->append(binding(d),d,history,1,support(1,SupportKind.BASIC),start)).code);
        assertEquals("LEARNING_INTRODUCTION_REQUIRED",assertThrows(ApiException.class,()->add(history,attempt(1,Role.INITIAL,1,"还没提供概念"))).code);
        add(history,support(2,SupportKind.BASIC));assertThrows(ApiException.class,()->add(history,attempt(2,Role.INITIAL,1,"跳过前一检查点")));
        add(history,support(1,SupportKind.BASIC));add(history,attempt(1,Role.INITIAL,10,"初次提交"));
        assertEquals("LEARNING_RESPONSE_STALE",assertThrows(ApiException.class,()->add(history,attempt(1,Role.REVISION,10,"旧的源版本"))).code);
        var input=attempt(1,Role.REVISION,11,"修改");var wrongHash=new Command(input.kind(),input.checkpointId(),input.role(),input.answer(),input.responseStepKey(),11L,"0".repeat(64),null);
        assertThrows(ApiException.class,()->add(history,wrongHash));
    }
    @Test void historyCannotBeReboundReorderedOrHaveAnswersHelpOrClockEdited() {
        var history=initials();var d=definition();var binding=binding(d);
        var otherRun=new Binding("01JB2000000000000000000098",binding.taskVersionId(),binding.taskManifestSha256(),binding.definitionSha256());
        assertThrows(ApiException.class,()->freeze(otherRun,d,history));
        var reordered=new ArrayList<>(history);Collections.swap(reordered,0,1);assertThrows(ApiException.class,()->freeze(binding,d,reordered));
        Event original=history.get(1);var payload=(ObjectNode)original.payload();((ObjectNode)payload.path("answer")).put("explanation","冒充初次就答对");
        var changed=new ArrayList<>(history);changed.set(1,new Event(original.sequence(),original.kind(),original.checkpointId(),original.acceptedAt(),payload,original.previousSha256(),original.sha256()));
        var tampered=changed;assertThrows(ApiException.class,()->freeze(binding,d,tampered));
        changed=new ArrayList<>(history);changed.set(1,new Event(original.sequence(),original.kind(),original.checkpointId(),original.acceptedAt().plusSeconds(1),original.payload(),original.previousSha256(),original.sha256()));
        var clock=changed;assertThrows(ApiException.class,()->freeze(binding,d,clock));
    }
    @Test void commandAndReturnedPayloadsAreDefensivelyCopiedAndExtraFieldsCannotEnterTheModel() {
        var history=new ArrayList<Event>();add(history,support(1,SupportKind.BASIC));var input=attempt(1,Role.INITIAL,1,"保留原文");
        ((ObjectNode)input.answer()).put("explanation","外部改变");var event=add(history,input);((ObjectNode)event.payload()).put("fakeRead",true);
        assertEquals("保留原文",event.payload().path("answer").path("explanation").asText());assertFalse(event.payload().has("fakeRead"));
        var bad=json.createObjectNode().put("explanation","说明").put("accountEmail","private");
        assertThrows(ApiException.class,()->add(history,new Command(Kind.ATTEMPT_SUBMITTED,"BA-C1",Role.REVISION,bad,"b1",2L,answerHash(bad),null)));
    }
    @Test void incompleteHistoryCannotBeFrozenIntoInventedLearningEvidence() {
        var d=definition();assertEquals("LEARNING_CHECKPOINT_MISSING",assertThrows(ApiException.class,()->freeze(binding(d),d,List.of())).code);
        var history=new ArrayList<Event>();add(history,support(1,SupportKind.BASIC));add(history,attempt(1,Role.INITIAL,1,"只有第一步"));
        assertThrows(ApiException.class,()->freeze(binding(d),d,history));
    }
    @Test void persistedIntegralNodeTypesDoNotInvalidateTheChainButExtraFieldsStillDo() throws Exception {
        var history=initials();var restored=new ArrayList<Event>();
        for(var e:history)restored.add(new Event(e.sequence(),e.kind(),e.checkpointId(),e.acceptedAt(),json.readTree(json.writeValueAsString(e.payload())),e.previousSha256(),e.sha256()));
        var d=definition();assertEquals(freeze(binding(d),d,history).sha256(),freeze(binding(d),d,restored).sha256());
        var e=restored.getFirst();var payload=(ObjectNode)e.payload();payload.put("invented",true);
        restored.set(0,new Event(e.sequence(),e.kind(),e.checkpointId(),e.acceptedAt(),payload,e.previousSha256(),e.sha256()));
        assertThrows(ApiException.class,()->freeze(binding(d),d,restored));
    }
    @Test void changingRubricSupportOrQuestionDefinitionChangesItsPin() {
        var d=definition();var first=d.checkpoints().getFirst();var supports=new ArrayList<>(first.supports());var original=supports.getFirst();
        supports.set(0,new Support(original.supportId(),original.version(),"f".repeat(64),original.kind()));
        var nodes=new ArrayList<>(d.checkpoints());nodes.set(0,new Checkpoint(first.checkpointId(),first.stepKey(),first.answerSchema(),null,null,null,supports));
        var changed=new Definition(d.methodVersion(),nodes);assertNotEquals(definitionHash(d),definitionHash(changed));
        assertThrows(ApiException.class,()->freeze(binding(d),changed,initials()));
    }
}
