package com.ruoyi.majorpilot.intake;

import java.nio.file.Files;
import java.nio.file.Path;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;

public final class IntakeFixtures {
    public static final ObjectMapper JSON=new ObjectMapper().findAndRegisterModules();
    private IntakeFixtures() {}
    public static ObjectNode answers() {
        try {
            Path current=Path.of(System.getProperty("user.dir")).toAbsolutePath();
            while(current!=null) {
                Path file=current.resolve("contracts/examples/p1-intake.json");
                if(Files.exists(file))return (ObjectNode)JSON.readTree(file.toFile()).get("answers");
                current=current.getParent();
            }
            throw new IllegalStateException("Public P1 fixture not found");
        } catch(Exception failure) { throw new IllegalStateException("Cannot read public P1 fixture",failure); }
    }
}
