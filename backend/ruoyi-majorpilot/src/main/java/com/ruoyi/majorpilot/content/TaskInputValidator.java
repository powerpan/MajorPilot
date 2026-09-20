package com.ruoyi.majorpilot.content;

import com.fasterxml.jackson.databind.JsonNode;
import com.ruoyi.majorpilot.shared.ApiException;
import java.util.HashSet;
import java.util.Set;

/** Deliberately small, fail-closed JSON Schema subset for versioned task inputs. */
public final class TaskInputValidator {
    private static final Set<String> KEYS=Set.of("type","properties","required","additionalProperties","items","enum","const","minimum","maximum","minLength","maxLength","minItems","maxItems","uniqueItems");
    private TaskInputValidator() {}
    public static void validate(JsonNode schema,JsonNode input,boolean complete) {
        if(input==null || input.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8).length>65536 || !matches(schema,input,complete,0))throw new ApiException(422,"STEP_VALIDATION_FAILED");
    }
    public static void validateSchema(JsonNode schema) {
        if(!validSchema(schema,0))throw new ApiException(422,"CONTENT_SCHEMA_INVALID");
    }
    private static boolean validSchema(JsonNode schema,int depth) {
        if(depth>8||!schema.isObject())return false;
        for(var fields=schema.fieldNames();fields.hasNext();)if(!KEYS.contains(fields.next()))return false;
        String type=schema.path("type").asText();
        if(!Set.of("object","array","string","integer","number","boolean").contains(type))return false;
        Set<String> typedKeys=switch(type){case "object"->Set.of("properties","required","additionalProperties");case "array"->Set.of("items","minItems","maxItems","uniqueItems");case "string"->Set.of("minLength","maxLength");case "integer","number"->Set.of("minimum","maximum");default->Set.of();};
        for(var fields=schema.fieldNames();fields.hasNext();){String key=fields.next();if(!Set.of("type","enum","const").contains(key)&&!typedKeys.contains(key))return false;}
        for(String key:Set.of("minItems","maxItems","minLength","maxLength"))if(schema.has(key)&&(!schema.get(key).isIntegralNumber()||schema.get(key).asLong()<0||schema.get(key).asLong()>10000))return false;
        for(String key:Set.of("minimum","maximum"))if(schema.has(key)&&!schema.get(key).isNumber())return false;
        if(schema.has("uniqueItems")&&!schema.get("uniqueItems").isBoolean())return false;
        if(type.equals("object")) {
            if(!schema.path("properties").isObject()||schema.path("properties").size()>30||!schema.path("required").isArray()||!schema.path("additionalProperties").isBoolean()||schema.path("additionalProperties").asBoolean())return false;
            for(JsonNode child:schema.path("properties"))if(!validSchema(child,depth+1))return false;
            Set<String> requiredKeys=new HashSet<>();for(JsonNode required:schema.path("required"))if(!required.isTextual()||!requiredKeys.add(required.asText())||!schema.path("properties").has(required.asText()))return false;
        }
        if(type.equals("array")&&!validSchema(schema.path("items"),depth+1))return false;
        if(schema.has("enum")){if(!schema.get("enum").isArray()||schema.get("enum").isEmpty())return false;Set<JsonNode> values=new HashSet<>();for(JsonNode value:schema.get("enum"))if(!values.add(value)||!matches(schema,value,true,depth+1))return false;}
        if(schema.has("const")&&!matches(schema,schema.get("const"),true,depth+1))return false;
        return true;
    }
    private static boolean matches(JsonNode schema,JsonNode value,boolean complete,int depth) {
        if(depth>8||value==null||value.isNull())return false;
        if(schema.has("const")&&!schema.get("const").equals(value))return false;
        if(schema.has("enum")){boolean found=false;for(JsonNode option:schema.get("enum"))if(option.equals(value))found=true;if(!found)return false;}
        return switch(schema.path("type").asText()) {
            case "object" -> {
                if(!value.isObject()||value.size()>40)yield false;
                boolean valid=true;
                for(var fields=value.fieldNames();fields.hasNext();) {String key=fields.next();if(!schema.path("properties").has(key)||!matches(schema.path("properties").get(key),value.get(key),complete,depth+1))valid=false;}
                if(complete)for(JsonNode key:schema.path("required"))if(!value.has(key.asText()))valid=false;
                yield valid;
            }
            case "array" -> {
                if(!value.isArray()||complete&&value.size()<schema.path("minItems").asInt(0)||value.size()>schema.path("maxItems").asInt(1000))yield false;
                boolean valid=true;Set<JsonNode> seen=new HashSet<>();for(JsonNode item:value){if(!matches(schema.path("items"),item,complete,depth+1))valid=false;if(schema.path("uniqueItems").asBoolean()&&!seen.add(item))valid=false;}yield valid;
            }
            case "string" -> value.isTextual()&&safeText(value.asText())&&(!complete||value.asText().codePointCount(0,value.asText().length())>=schema.path("minLength").asInt(0))&&value.asText().codePointCount(0,value.asText().length())<=schema.path("maxLength").asInt(10000);
            case "integer","number" -> value.isNumber()&&Double.isFinite(value.doubleValue())&&(!schema.path("type").asText().equals("integer")||value.isIntegralNumber())&&(!schema.has("minimum")||value.decimalValue().compareTo(schema.get("minimum").decimalValue())>=0)&&(!schema.has("maximum")||value.decimalValue().compareTo(schema.get("maximum").decimalValue())<=0);
            case "boolean" -> value.isBoolean();
            default -> false;
        };
    }
    private static boolean safeText(String text) { for(int i=0;i<text.length();i++){char c=text.charAt(i);if(Character.isISOControl(c)&&c!='\n'&&c!='\t')return false;if(Character.isHighSurrogate(c)){if(i+1>=text.length()||!Character.isLowSurrogate(text.charAt(++i)))return false;}else if(Character.isLowSurrogate(c))return false;}return true; }
}
