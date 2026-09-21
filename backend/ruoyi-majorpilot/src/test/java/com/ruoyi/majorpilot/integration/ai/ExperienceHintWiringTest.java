package com.ruoyi.majorpilot.integration.ai;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ruoyi.majorpilot.content.*;
import com.ruoyi.majorpilot.experience.HintProvider;
import com.ruoyi.majorpilot.report.ReportConfiguration;
import org.junit.jupiter.api.Test;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;
import org.springframework.mock.env.MockEnvironment;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.support.TransactionTemplate;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class ExperienceHintWiringTest {
    @Test void springSelectsProductionConstructorAndKeepsExistingLiveP0ConfigurationStaticByDefault(){
        ObjectMapper mapper=new ObjectMapper();TaskContentRepository repository=new TaskContentRepository(mapper);var bundle=repository.get("demo-table/1.0.0/manifest.json");var m=bundle.manifest();String id=m.path("taskVersionId").asText();TaskContentProvider content=mock(TaskContentProvider.class);
        when(content.pinned(id)).thenReturn(new TaskContent.Version(1,id,"DEMO",null,"DEMO_TABLE","1.0.0",bundle.manifestSha256(),m));
        try(var context=new AnnotationConfigApplicationContext()){
            context.setEnvironment(new MockEnvironment().withProperty("MAJORPILOT_AI_MODE","bailian").withProperty("BAILIAN_API_KEY","synthetic-wiring-key"));
            context.getEnvironment().setActiveProfiles("local");
            context.registerBean(ObjectMapper.class,()->mapper);
            context.register(ReportConfiguration.class);
            context.registerBean(TaskContentProvider.class,()->content);
            context.scan("com.ruoyi.majorpilot.integration.ai");
            assertDoesNotThrow(context::refresh);
            assertEquals(1,context.getBeansOfType(HintProvider.class).size());
            var output=context.getBean(HintProvider.class).hint(new HintProvider.Context(id,"1.0.0","prepare",1,"ignored",mapper.createObjectNode(),"ignored",true));
            assertEquals("STATIC",output.provider());assertEquals("FALLBACK",output.status());
            assertEquals("hint-result-v1",output.response().path("schemaVersion").asText());
        }
    }
    @Test void allNewContentAndAiBeansWireThroughActualComponentScanningWithoutDatabaseOrNetwork(){
        try(var context=new AnnotationConfigApplicationContext()){
            context.setEnvironment(new MockEnvironment().withProperty("MP_P2_DEMO_ENABLED","false").withProperty("MP_EXPERIENCE_AI_ENABLED","false"));
            context.getEnvironment().setActiveProfiles("local");
            context.registerBean(ObjectMapper.class,()->new ObjectMapper());
            context.register(ReportConfiguration.class);
            context.registerBean(JdbcTemplate.class,()->mock(JdbcTemplate.class));
            context.registerBean(TransactionTemplate.class,()->mock(TransactionTemplate.class));
            context.register(com.ruoyi.majorpilot.acceptance.LocalProductAccess.class);
            context.scan("com.ruoyi.majorpilot.content","com.ruoyi.majorpilot.integration.ai");
            assertDoesNotThrow(context::refresh);
            assertEquals(1,context.getBeansOfType(TaskContentProvider.class).size());
            assertEquals(1,context.getBeansOfType(HintProvider.class).size());
            assertNotNull(context.getBean(TaskContentRepository.class));
            assertNotNull(context.getBean(TaskPublicationService.class));
            assertNotNull(context.getBean(TaskContentController.class));
            verify(context.getBean(JdbcTemplate.class)).afterPropertiesSet();
            verifyNoMoreInteractions(context.getBean(JdbcTemplate.class));
        }
    }
}
