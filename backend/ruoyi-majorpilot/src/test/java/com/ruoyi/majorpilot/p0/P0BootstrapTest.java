package com.ruoyi.majorpilot.p0;

import static org.junit.jupiter.api.Assertions.*;
import org.junit.jupiter.api.Test;

class P0BootstrapTest {
    @Test void localRandomAdminPasswordMustRespectUpstreamMaximum() {
        assertDoesNotThrow(()->P0Bootstrap.validateAdminPassword("a".repeat(16)));
        assertDoesNotThrow(()->P0Bootstrap.validateAdminPassword("a".repeat(20)));
        assertThrows(IllegalArgumentException.class,()->P0Bootstrap.validateAdminPassword("a".repeat(15)));
        assertThrows(IllegalArgumentException.class,()->P0Bootstrap.validateAdminPassword("a".repeat(21)));
        assertThrows(IllegalArgumentException.class,()->P0Bootstrap.validateAdminPassword(null));
    }
}
