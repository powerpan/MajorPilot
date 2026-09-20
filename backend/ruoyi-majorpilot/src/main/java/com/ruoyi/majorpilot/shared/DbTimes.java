package com.ruoyi.majorpilot.shared;
import java.sql.Timestamp;
import java.time.*;
/** MySQL DATETIME is a UTC local wall time; Connector/J may return either JDBC or java.time values. */
public final class DbTimes {
    private DbTimes() {}
    public static Instant instant(Object value) {
        if(value instanceof Instant instant)return instant;
        if(value instanceof LocalDateTime dateTime)return dateTime.toInstant(ZoneOffset.UTC);
        if(value instanceof Timestamp timestamp)return timestamp.toInstant();
        throw new IllegalStateException("Unexpected database timestamp type");
    }
}
