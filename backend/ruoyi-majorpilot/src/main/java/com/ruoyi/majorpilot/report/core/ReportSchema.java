package com.ruoyi.majorpilot.report.core;
import com.fasterxml.jackson.databind.*;
import java.time.OffsetDateTime;
import java.util.*;

/** Closed, local-only schema vocabulary used by the two report contracts. No remote refs. */
public final class ReportSchema {
    private final JsonNode output,proposal;
    public ReportSchema(ObjectMapper mapper){try{output=mapper.readTree(ReportSchema.class.getResourceAsStream("/report-schemas/report-v1.json"));proposal=mapper.readTree(ReportSchema.class.getResourceAsStream("/report-schemas/report-proposal-v1.json"));if(output==null||proposal==null)throw new IllegalArgumentException();}catch(Exception invalid){throw new ReportInputException("REPORT_CATALOG_INVALID");}}
    public boolean output(JsonNode value){return matches(output,value,0);}
    public boolean proposal(JsonNode value){return matches(proposal,value,0);}
    private boolean matches(JsonNode schema,JsonNode value,int depth){if(depth>20||value==null)return false;if(schema.has("anyOf")){for(var branch:schema.path("anyOf"))if(matches(branch,value,depth+1))return true;return false;}if(schema.has("const")&&!schema.get("const").equals(value))return false;if(schema.has("enum")){boolean found=false;for(var option:schema.get("enum"))if(option.equals(value))found=true;if(!found)return false;}String type=schema.path("type").asText("");
        if(type.equals("null"))return value.isNull();
        if(type.equals("object")){if(!value.isObject())return false;for(var required:schema.path("required"))if(!value.has(required.asText()))return false;for(var it=value.fieldNames();it.hasNext();){String key=it.next();if(!schema.path("properties").has(key)||!matches(schema.path("properties").get(key),value.get(key),depth+1))return false;}return true;}
        if(type.equals("array")){if(!value.isArray()||value.size()<schema.path("minItems").asInt(0)||value.size()>schema.path("maxItems").asInt(10000))return false;var seen=new HashSet<JsonNode>();for(var item:value){if(!matches(schema.path("items"),item,depth+1)||schema.path("uniqueItems").asBoolean()&&!seen.add(item))return false;}return true;}
        if(type.equals("string")){if(!value.isTextual())return false;String s=value.asText();int length=s.codePointCount(0,s.length());if(length<schema.path("minLength").asInt(0)||length>schema.path("maxLength").asInt(10000)||schema.has("pattern")&&!s.matches(schema.path("pattern").asText()))return false;if(schema.path("format").asText().equals("date-time"))try{OffsetDateTime.parse(s);}catch(Exception invalid){return false;}return true;}
        if(type.equals("integer"))return value.isIntegralNumber()&&value.canConvertToLong()&&(!schema.has("minimum")||value.decimalValue().compareTo(schema.get("minimum").decimalValue())>=0)&&(!schema.has("maximum")||value.decimalValue().compareTo(schema.get("maximum").decimalValue())<=0);
        return type.isEmpty()&&(schema.has("enum")||schema.has("const"));
    }
}
