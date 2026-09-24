// Explicit isolated MySQL integration; no ordinary invocation can call a paid provider.
import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {ROOT} from './local-config.mjs';
import {runtimeEnv} from './env.mjs';
import {record,processInspectionAvailable} from './processes.mjs';
import {acquireTestLock,releaseTestLock} from './integration.mjs';
if(process.argv.slice(2).some(x=>x!=='--export-quality-inputs'))throw Error('No model or environment overrides accepted');
if(!processInspectionAvailable()||record('p6-test-backend')||record('p6-test-student'))throw Error('Stop the project-owned test harness before this test');
const owner=acquireTestLock({pid:process.pid,scope:'method-led isolated integration',nonce:randomUUID()});
try{execFileSync(`${ROOT}/backend/mvnw`,[`-Dmaven.repo.local=${ROOT}/.local/m2`,'-pl','ruoyi-majorpilot','-am','-Dtest=MethodLearningMySqlTest,MethodReportContractTest,LearningTimelineTest,LocalResultVerifierTest','-Dsurefire.failIfNoSpecifiedTests=false','test'],{cwd:`${ROOT}/backend`,env:{...runtimeEnv({secrets:true}),MP_METHOD_EXPORT:String(process.argv.includes('--export-quality-inputs')),MP_RUN_MYSQL_TESTS:'true',MP_RUN_LIVE_REPORT_TESTS:'false',MP_RUN_BAILIAN_TEST:'false',MP_REPORT_ANALYSIS_LIVE:'false',MP_METHOD_LIVE:'false',MP_REPORT_AI_ENABLED:'false',MP_EXPERIENCE_AI_ENABLED:'false',MP_LOCAL_PRODUCT_ENABLED:'false',MAVEN_USER_HOME:`${ROOT}/data/maven-user`},stdio:'inherit'});}finally{releaseTestLock(owner);}
