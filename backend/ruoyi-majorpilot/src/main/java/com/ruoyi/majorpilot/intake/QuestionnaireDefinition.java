package com.ruoyi.majorpilot.intake;

import java.util.List;
import static com.ruoyi.majorpilot.intake.DecisionAnswers.*;

/** Versioned public copy and shape. This contains no hidden scoring weights. */
public record QuestionnaireDefinition(String questionnaireVersion, int pageCount, int requiredPageCount, List<Page> pages) {
    public record Option(String code, String label) {}
    public record Field(String key, String type, boolean required, Integer minItems, Integer maxItems, Integer maxLength, List<Option> options, List<Option> rows) {}
    public record Page(String stepKey, int number, String title, String why, boolean required, List<Field> fields) {}
    public static QuestionnaireDefinition current() {
        return new QuestionnaireDefinition(Questionnaire.VERSION, 12, 10, List.of(
            page(1,"你目前处于什么阶段？","帮助我们理解你的决策阶段，不参与专业排序。",true, single("applicationStage", options(ApplicationStage.values(),"探索方向","研究项目","准备申请","已经申请","持有录取结果"))),
            page(2,"你预计何时开始硕士学习？","了解你的时间安排，不参与专业排序。",true,single("targetIntakeWindow",options(TargetIntakeWindow.values(),"6个月内","6–12个月","12–24个月","24个月以后","不确定"))),
            page(3,"你主要考虑哪些地区？","首版围绕这些地区提供体验背景，不推荐具体院校。",true,multiple("targetRegions",1,3,options(TargetRegion.values(),"香港","新加坡","英国"))),
            page(4,"你目前的学习或工作背景更接近哪一类？","帮助我们调整说明，不会限制任何专业。",true,single("currentField",options(CurrentField.values(),"计算机与工程","数学与统计","商科与经济","自然与生命科学","社科与人文","其他"))),
            page(5,"愿意补充你的具体专业或方向吗？","可跳过；只用于背景理解和产品研究，不进入推荐排序。",false,text("currentFieldText",80)),
            page(6,"你目前正在考虑哪些方向？","可以选择1–3项；没有选中的专业仍然可以体验。",true,multiple("consideredMajors",1,3,majorOptions())),
            page(7,"你对三个方向分别了解多少？","同等想试时，了解较少的考虑方向可能更值得先探索。",true,new Field("majorFamiliarity","MATRIX",true,null,null,null,options(Familiarity.values(),"未了解","看过介绍","做过课程或小项目","有较多实践"),majorOptions())),
            page(8,"你如何描述当前基础？","帮助说明任务会提供哪些支持，不作为专业门槛。",true,new Field("foundationSelfView","MATRIX",true,null,null,null,options(FoundationLevel.values(),"未接触","入门","能完成基础任务","较熟悉"),options(FoundationArea.values(),"编程","数学统计","数据分析","商业问题"))),
            page(9,"哪种工作情境最想先体验？","可以并列，也可全部同样想试；只有并列时才参考辅助信息。",true,new Field("scenarioPreference","RANKING",true,3,3,null,List.of(
                new Option("AI","改进模型行为：检查系统为什么判断错误，调整有限规则或示例，再比较变化"),
                new Option("DATA_SCIENCE","用数据检验判断：整理不完美的数据，寻找关系，并说明哪些结论不能确定"),
                new Option("BUSINESS_ANALYTICS","把指标变化转成行动：拆解指标变化，找到优先问题，并提出可验证的行动")),List.of())),
            page(10,"哪些工作环节更吸引你？","选择1–3项，只在情境并列时帮助安排体验顺序。",true,multiple("workElements",1,3,options(WorkElement.values(),"检查错误","调整实验","清理数据","解释图表","定义指标","提出行动","表达结论"))),
            page(11,"你最想通过体验弄清哪些问题？","选择1–2项，帮助说明体验的关注点，不作为适配评分。",true,multiple("decisionUncertainties",1,2,options(DecisionUncertainty.values(),"日常工作","兴趣","学习难度","现有基础","专业差异","未来发展"))),
            page(12,"还有什么困惑？你从哪里知道我们？","本页可跳过；不愿回答来源不会影响推荐和服务。",false,text("mainQuestion",300),new Field("acquisitionChannel","SINGLE",false,null,null,null,options(AcquisitionChannel.values(),"朋友或同学","社交媒体","搜索","社群","其他","不愿回答"),List.of()))
        ));
    }
    public static List<Option> majorOptions() { return options(Major.values(),"Artificial Intelligence","Data Science","Business Analytics"); }
    private static Page page(int number,String title,String why,boolean required,Field... fields) { return new Page("step-"+number,number,title,why,required,List.of(fields)); }
    private static Field single(String key,List<Option> options) { return new Field(key,"SINGLE",true,null,null,null,options,List.of()); }
    private static Field multiple(String key,int min,int max,List<Option> options) { return new Field(key,"MULTIPLE",true,min,max,null,options,List.of()); }
    private static Field text(String key,int max) { return new Field(key,"TEXT",false,null,null,max,List.of(),List.of()); }
    private static List<Option> options(Enum<?>[] values,String... labels) {
        if(values.length!=labels.length)throw new IllegalArgumentException("Questionnaire options mismatch");
        return java.util.stream.IntStream.range(0,values.length).mapToObj(i->new Option(values[i].name(),labels[i])).toList();
    }
}
