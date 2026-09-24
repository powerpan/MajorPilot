// Local schema generation; never reads credentials or calls providers.
import fs from 'node:fs';
import assert from 'node:assert/strict';
const obj=properties=>({type:'object',additionalProperties:false,properties,required:Object.keys(properties)});
const arr=(items,minItems=0,maxItems=60)=>({type:'array',items,minItems,maxItems});
const str=(maxLength,minLength=1)=>({type:'string',minLength,maxLength});
const major={enum:['AI','DATA_SCIENCE','BUSINESS_ANALYTICS']};
const assessment={enum:['SUPPORTED','PARTIAL','NEEDS_REVISION','INSUFFICIENT']};
const schema=JSON.parse(fs.readFileSync(new URL('./schemas/report-v1.json',import.meta.url),'utf8'));
schema.$id='https://majorpilot.local/schemas/method-report-v1.json';
schema.properties.schemaVersion={const:'method-report-v1'};
schema.properties.generationMode={const:'AI'};
schema.properties.sections=arr(schema.properties.sections.items,0,0);
schema.properties.methodAnalysis=obj({summary:str(1200),highlights:arr(obj({title:str(80),explanation:str(600)}),0,3),nodes:arr(obj({checkpointId:str(30),majorCode:major,title:str(200),assessment,reasoning:str(1600),nextStep:str(800),example:str(1000,0),quotes:arr(obj({label:str(300),quote:str(1600)}),1,6),supportConditions:arr(str(300),0,8),change:obj({state:{enum:['COMPARED','NO_COMPARISON']},explanation:str(1000)}),dependency:obj({explanation:str(1000)})}),3,9),answers:arr(obj({label:str(300),answerQuote:str(1600),majorCode:major,assessment,explanation:str(1200),nextStep:str(800)}),1,90),preference:str(1600),comparison:arr(obj({text:str(1200)}),0,3)});
schema.properties.professionConnections=arr(obj({majorCode:major,methodName:str(200),scope:str(1000)}),1,3);
// Optional for read compatibility with earlier immutable snapshots. New output always includes it.
schema.properties.calculationConditions=arr(obj({majorCode:major,stepTitle:str(200),verificationStatus:{enum:['MATCHED','MISMATCHED','NOT_REPRODUCIBLE','VERSION_MISMATCH','NOT_CHECKED']},description:str(800)}),0,12);
// A supported answer need not manufacture a deficiency or an extra assignment.
// Other judgements still require a concrete next step.
const answer=schema.properties.methodAnalysis.properties.answers.items;
answer.properties.nextStep=str(800,0);
answer.allOf=[{if:{properties:{assessment:{not:{const:'SUPPORTED'}}}},then:{properties:{nextStep:str(800)}}}];
schema.required.push('methodAnalysis','professionConnections');
const file=new URL('./schemas/method-report-v1.json',import.meta.url),text=JSON.stringify(schema,null,2)+'\n';
assert.ok(process.argv.slice(2).every(x=>x==='--write'));
if(process.argv.includes('--write'))fs.writeFileSync(file,text);else assert.equal(fs.readFileSync(file,'utf8'),text);
console.log('Method report public schema verified (paid calls: 0)');
