package com.ruoyi.majorpilot.shared;
import java.util.HashSet;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;
class PublicIdsTest {
    @Test void identifiersHaveUlidShapeAndRandomSuffixes() { var values=new HashSet<String>();for(int i=0;i<1000;i++){String id=PublicIds.next();assertTrue(id.matches("[0-7][0-9A-HJKMNP-TV-Z]{25}"));assertTrue(values.add(id));} }
}
