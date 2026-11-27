package com.majorpilot.redesign;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling
public class RedesignApplication {
    public static void main(String[] args) {
        SpringApplication.run(RedesignApplication.class, args);
    }
}
