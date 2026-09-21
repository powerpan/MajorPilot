package com.ruoyi.majorpilot.shared;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.TreeSet;

/** Preserve the existing evidence hash protocol: sorted object keys, ordered arrays, unchanged scalars. */
public final class CanonicalJson {
    private CanonicalJson() {}
    public static JsonNode canonical(ObjectMapper mapper,JsonNode value) {
        if(value.isObject()){var result=mapper.createObjectNode();var keys=new TreeSet<String>();value.fieldNames().forEachRemaining(keys::add);for(String key:keys)result.set(key,canonical(mapper,value.get(key)));return result;}
        if(value.isArray()){var result=mapper.createArrayNode();value.forEach(v->result.add(canonical(mapper,v)));return result;}
        return value.deepCopy();
    }
    public static String hash(ObjectMapper mapper,JsonNode value) {
        try{return Secrets.hash(mapper.writeValueAsString(canonical(mapper,value)));}catch(Exception invalid){throw new IllegalArgumentException("Canonical JSON invalid",invalid);}
    }
}
