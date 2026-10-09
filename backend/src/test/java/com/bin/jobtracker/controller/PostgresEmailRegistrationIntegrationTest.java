package com.bin.jobtracker.controller;

import org.junit.jupiter.api.Tag;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.*;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.*;

@Tag("postgres")
@Testcontainers
@SpringBootTest(properties = {"app.registration-email.required=true", "app.recovery-email.enabled=true",
        "app.recovery-email.from=noreply@jobtracker.test", "app.recovery-email.public-base-url=https://jobtracker.test",
        "spring.flyway.enabled=true", "spring.flyway.locations=classpath:db/migration/postgresql",
        "spring.jpa.hibernate.ddl-auto=validate", "spring.session.jdbc.initialize-schema=never",
        "spring.jpa.properties.hibernate.dialect=org.hibernate.dialect.PostgreSQLDialect"})
class PostgresEmailRegistrationIntegrationTest extends EmailRegistrationIntegrationTest {
    @Container static final PostgreSQLContainer postgres = new PostgreSQLContainer("postgres:17-alpine");
    @DynamicPropertySource static void database(DynamicPropertyRegistry properties) {
        properties.add("spring.datasource.url", postgres::getJdbcUrl);
        properties.add("spring.datasource.username", postgres::getUsername);
        properties.add("spring.datasource.password", postgres::getPassword);
        properties.add("spring.datasource.driver-class-name", () -> "org.postgresql.Driver");
    }
}
