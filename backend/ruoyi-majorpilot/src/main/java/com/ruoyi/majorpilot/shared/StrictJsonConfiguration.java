package com.ruoyi.majorpilot.shared;

import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.MapperFeature;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.databind.cfg.CoercionAction;
import com.fasterxml.jackson.databind.cfg.CoercionInputShape;
import com.fasterxml.jackson.databind.type.LogicalType;
import org.springframework.boot.autoconfigure.jackson.Jackson2ObjectMapperBuilderCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;

/** Formal DTOs accept their JSON schema types, never truncation or scalar aliases. */
@Configuration @Profile({"local","pilot"})
public class StrictJsonConfiguration {
    @Bean public Jackson2ObjectMapperBuilderCustomizer p1StrictJson() {
        return builder->builder
            .featuresToDisable(DeserializationFeature.ACCEPT_FLOAT_AS_INT,MapperFeature.ALLOW_COERCION_OF_SCALARS,SerializationFeature.WRITE_DATES_AS_TIMESTAMPS)
            .featuresToEnable(DeserializationFeature.FAIL_ON_NUMBERS_FOR_ENUMS,DeserializationFeature.FAIL_ON_NULL_FOR_PRIMITIVES)
            .postConfigurer(mapper->{
                for(var shape:new CoercionInputShape[]{CoercionInputShape.Float,CoercionInputShape.String,CoercionInputShape.EmptyString,CoercionInputShape.Boolean})
                    mapper.coercionConfigFor(LogicalType.Integer).setCoercion(shape,CoercionAction.Fail);
                for(var shape:new CoercionInputShape[]{CoercionInputShape.Integer,CoercionInputShape.Float,CoercionInputShape.Boolean}) {
                    mapper.coercionConfigFor(LogicalType.Enum).setCoercion(shape,CoercionAction.Fail);
                    mapper.coercionConfigFor(LogicalType.Textual).setCoercion(shape,CoercionAction.Fail);
                }
            });
    }
}
