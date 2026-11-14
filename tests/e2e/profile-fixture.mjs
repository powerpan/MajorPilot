// Synthetic UI fixtures only. No real identities, answers, credentials or report calls.
import { readFileSync } from 'node:fs';
const p1 = JSON.parse(readFileSync(new URL('../../contracts/openapi-p1.json', import.meta.url)));
export const keys = Object.keys(p1.components.schemas.DraftAnswers.properties);
export const codes = ['AI', 'DATA_SCIENCE', 'BUSINESS_ANALYTICS'];
export const names = ['Artificial Intelligence', 'Data Science', 'Business Analytics'];
export const now = '2026-11-14T01:00:00.000Z';
export const id = '01ARZ3NDEKTSV4RRFFQ69G5FAV';
export const copy = value => JSON.parse(JSON.stringify(value));
const option = (code, label = code) => ({ code, label });
const field = (key, type, options = [], rows = [], more = {}) => ({key, type, required: !['currentFieldText','mainQuestion','acquisitionChannel'].includes(key), minItems:null,maxItems:null,maxLength:null,options,rows,...more});
const single = (key, values) => field(key, 'SINGLE', values.map(value => Array.isArray(value) ? option(...value) : option(value)));
const fields = [
 single('applicationStage', [['EXPLORING','探索方向'],['RESEARCHING_PROGRAMS','研究项目'],['PREPARING_APPLICATION','准备申请'],['APPLIED','已经申请'],['HOLDING_OFFERS','持有录取结果']]),
 single('targetIntakeWindow', [['WITHIN_6_MONTHS','6个月内'],['MONTHS_6_TO_12','6–12个月'],['MONTHS_12_TO_24','12–24个月'],['AFTER_24_MONTHS','24个月以后'],['UNSURE','不确定']]),
 field('targetRegions','MULTIPLE',[option('HONG_KONG','香港'),option('SINGAPORE','新加坡'),option('UNITED_KINGDOM','英国')],[],{minItems:1,maxItems:3}),
 single('currentField',[['COMPUTING_ENGINEERING','计算机与工程'],['MATHEMATICS_STATISTICS','数学与统计'],['BUSINESS_ECONOMICS','商科与经济'],['NATURAL_LIFE_SCIENCES','自然与生命科学'],['SOCIAL_HUMANITIES','社科与人文'],['OTHER','其他']]),
 field('currentFieldText','TEXT',[],[],{maxLength:80}),
 field('consideredMajors','MULTIPLE',codes.map((code,i)=>option(code,names[i])),[],{minItems:1,maxItems:3}),
 field('majorFamiliarity','MATRIX',['UNFAMILIAR','READ_OVERVIEW','COURSE_OR_PROJECT','PRACTICAL_EXPERIENCE'].map(code=>option(code)),codes.map((code,i)=>option(code,names[i]))),
 field('foundationSelfView','MATRIX',['UNEXPOSED','BEGINNER','BASIC_TASKS','FAMILIAR'].map(code=>option(code)),['PROGRAMMING','MATHEMATICS_STATISTICS','DATA_ANALYSIS','BUSINESS_PROBLEMS'].map(code=>option(code))),
 field('scenarioPreference','RANKING',codes.map((code,i)=>option(code,names[i])),[],{minItems:3,maxItems:3}),
 field('workElements','MULTIPLE',['CHECK_ERRORS','ADJUST_EXPERIMENTS','CLEAN_DATA','INTERPRET_CHARTS','DEFINE_METRICS','PROPOSE_ACTIONS','COMMUNICATE_CONCLUSIONS'].map(code=>option(code)),[],{minItems:1,maxItems:3}),
 field('decisionUncertainties','MULTIPLE',['DAILY_WORK','INTEREST','LEARNING_DIFFICULTY','CURRENT_FOUNDATION','MAJOR_DIFFERENCES','FUTURE_DEVELOPMENT'].map(code=>option(code)),[],{minItems:1,maxItems:2}),
 field('mainQuestion','TEXT',[],[],{maxLength:300}), single('acquisitionChannel',['FRIEND_OR_CLASSMATE','SOCIAL_MEDIA','SEARCH','COMMUNITY','OTHER','DECLINED'])
];
const titles=['你目前处于什么阶段？','你预计何时开始硕士学习？','你主要考虑哪些地区？','你目前的学习或工作背景更接近哪一类？','愿意补充你的具体专业或方向吗？','你目前正在考虑哪些方向？','你对三个方向分别了解多少？','你如何描述当前基础？','哪种工作情境最想先体验？','哪些工作环节更吸引你？','你最想通过体验弄清哪些问题？','还有什么困惑？你从哪里知道我们？'];
export const questionnaire={questionnaireVersion:'decision-profile-v1',pageCount:12,requiredPageCount:10,pages:titles.map((title,i)=>({stepKey:`step-${i+1}`,number:i+1,title,why:'合成界面夹具；自述不作为能力评分。',required:![4,11].includes(i),fields:i===11?fields.slice(11):[fields[i]]}))};
export function profile(answers={},version=1){return {decisionProfileId:id,profileVersion:version,questionnaireVersion:'decision-profile-v1',submittedAt:now,answers:copy(answers),answerStates:Object.fromEntries(keys.map(key=>[key,!(key in answers)?'MISSING':answers[key]===null?'SKIPPED':key==='targetIntakeWindow'&&answers[key]==='UNSURE'?'UNSURE':'ANSWERED'])),complete:false,recommendationReady:false};}
export function run(majorCode,status='READY',index=0){return {runId:`01ARZ3NDEKTSV4RRFFQ69G5FA${index}`,contentKind:'MAJOR',majorCode,demoKey:null,status,revision:3,taskVersionId:id,currentStepKey:'task-1',pausedFromStatus:status==='PAUSED'?'IN_PROGRESS':null,activeRunId:null,replacementRunId:null,readOnly:status==='CLOSED',steps:[{stepKey:'task-1',status:'COMPLETED',revision:2},{stepKey:'task-2',status:'DRAFT',revision:1}],startedAt:now,closedAt:status==='CLOSED'?now:null,reportStatus:status==='CLOSED'?'READY':'NOT_REQUESTED',runMode:'STANDARD',experienceEdition:2,productEligible:true};}
