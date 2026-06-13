package com.bin.jobtracker;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.data.jpa.repository.config.EnableJpaAuditing;

@EnableJpaAuditing
@SpringBootApplication
public class JobtrackerApplication {
	public static void main(String[] args) {
		SpringApplication.run(JobtrackerApplication.class, args);
	}
}
