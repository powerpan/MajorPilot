package com.ruoyi.majorpilot.p0;

import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;

/** There is deliberately no deployable production configuration in P0. */
@Configuration @Profile("!p0 & !local & !pilot")
public class P0OnlyGuard {
    public P0OnlyGuard() { throw new IllegalStateException("MajorPilot requires an explicit local, p0 or guarded pilot profile"); }
}
