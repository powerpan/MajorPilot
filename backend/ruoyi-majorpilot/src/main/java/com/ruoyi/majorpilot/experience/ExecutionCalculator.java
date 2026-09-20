package com.ruoyi.majorpilot.experience;
import com.fasterxml.jackson.databind.JsonNode;
import com.ruoyi.majorpilot.content.TaskContent;
/** Fixed bounded operations only. Implementations must never evaluate student code. */
public interface ExecutionCalculator { JsonNode calculate(TaskContent.Version version,JsonNode operation,JsonNode parameters); }
