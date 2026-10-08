package com.bin.jobtracker.migration;

import org.flywaydb.core.Flyway;
import org.flywaydb.core.api.FlywayException;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import java.sql.Connection;
import java.sql.DriverManager;
import java.util.UUID;
import static org.assertj.core.api.Assertions.*;

@Tag("postgres")
@Testcontainers
class PostgresMigrationTest {
    @Container static final PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:17-alpine");

    private String schema() { return "study_" + UUID.randomUUID().toString().replace("-", ""); }
    private org.flywaydb.core.api.configuration.FluentConfiguration config(String schema) {
        return Flyway.configure().dataSource(postgres.getJdbcUrl(), postgres.getUsername(), postgres.getPassword())
                .schemas(schema).defaultSchema(schema).locations("classpath:db/migration/postgresql")
                .baselineOnMigrate(false).cleanDisabled(true);
    }
    private Connection connect(String schema) throws Exception {
        var connection = DriverManager.getConnection(postgres.getJdbcUrl(), postgres.getUsername(), postgres.getPassword());
        connection.setSchema(schema);
        return connection;
    }
    private void seedLegacy(String schema) throws Exception {
        try (var connection = connect(schema); var sql = connection.createStatement()) {
            sql.executeUpdate("INSERT INTO member(username,password,nickname) VALUES ('learner','test-only-hash','Learner')");
            sql.executeUpdate("INSERT INTO application(member_id,company,position,status,applied_date,interview_date,memo) "
                    + "VALUES (1,'Sample','Engineer','APPLIED','2026-01-02','2026-01-10','Keep this note')");
        }
    }

    @Test void emptyDatabaseMigratesAndRepeatedStartupHasNoPendingMigrations() {
        var flyway = config(schema()).load();
        assertThat(flyway.migrate().migrationsExecuted).isEqualTo(5);
        assertThat(flyway.migrate().migrationsExecuted).isZero();
        assertThatCode(flyway::validate).doesNotThrowAnyException();
    }

    @Test void legacyUpgradeBackfillsVersionsAndPreservesDatesAndNotes() throws Exception {
        String schema = schema();
        config(schema).target("1").load().migrate();
        seedLegacy(schema);
        assertThat(config(schema).load().migrate().migrationsExecuted).isEqualTo(4);
        try (var connection = connect(schema); var sql = connection.createStatement();
             var rows = sql.executeQuery("SELECT a.version,m.auth_version,a.memo,a.interview_date "
                     + "FROM application a JOIN member m ON m.id=a.member_id")) {
            assertThat(rows.next()).isTrue();
            assertThat(rows.getLong("version")).isZero();
            assertThat(rows.getLong("auth_version")).isZero();
            assertThat(rows.getString("memo")).isEqualTo("Keep this note");
            assertThat(rows.getString("interview_date")).isEqualTo("2026-01-10");
        }
    }

    @Test void unmanagedSchemaRequiresExplicitBaselineAndThenPreservesData() throws Exception {
        String schema = schema();
        config(schema).target("1").load().migrate();
        seedLegacy(schema);
        try (var connection = connect(schema); var sql = connection.createStatement()) {
            sql.execute("DROP TABLE flyway_schema_history");
        }
        var flyway = config(schema).baselineVersion("1").load();
        assertThatThrownBy(flyway::migrate).isInstanceOf(FlywayException.class);
        flyway.baseline();
        assertThat(flyway.migrate().migrationsExecuted).isEqualTo(4);
        try (var connection = connect(schema); var sql = connection.createStatement();
             var rows = sql.executeQuery("SELECT COUNT(*) FROM application")) {
            rows.next();
            assertThat(rows.getInt(1)).isEqualTo(1);
        }
    }

    @Test void alreadyPresentVersionsAreNotResetDuringUpgrade() throws Exception {
        String schema = schema();
        config(schema).target("1").load().migrate();
        seedLegacy(schema);
        try (var connection = connect(schema); var sql = connection.createStatement()) {
            sql.execute("ALTER TABLE member ADD COLUMN auth_version BIGINT DEFAULT 9");
            sql.execute("ALTER TABLE application ADD COLUMN version BIGINT DEFAULT 7");
        }
        config(schema).load().migrate();
        try (var connection = connect(schema); var sql = connection.createStatement();
             var rows = sql.executeQuery("SELECT a.version,m.auth_version FROM application a JOIN member m ON m.id=a.member_id")) {
            rows.next();
            assertThat(rows.getLong(1)).isEqualTo(7);
            assertThat(rows.getLong(2)).isEqualTo(9);
        }
    }

    @Test void changedMigrationChecksumFailsValidation() throws Exception {
        String schema = schema();
        var flyway = config(schema).load();
        flyway.migrate();
        try (var connection = connect(schema); var sql = connection.createStatement()) {
            sql.executeUpdate("UPDATE flyway_schema_history SET checksum=0 WHERE version='2'");
        }
        assertThatThrownBy(flyway::validate).isInstanceOf(FlywayException.class);
    }

    @Test void backupRestoresRecordsAndMigrationHistoryIntoAnotherDatabase() throws Exception {
        String schema = schema();
        config(schema).load().migrate();
        seedLegacy(schema);
        String dump = "/tmp/" + schema + ".dump";
        String restored = "restore_" + UUID.randomUUID().toString().replace("-", "");
        assertThat(postgres.execInContainer("pg_dump", "-U", postgres.getUsername(), "-d", postgres.getDatabaseName(),
                "-n", schema, "-Fc", "-f", dump).getExitCode()).isZero();
        assertThat(postgres.execInContainer("createdb", "-U", postgres.getUsername(), restored).getExitCode()).isZero();
        assertThat(postgres.execInContainer("pg_restore", "-U", postgres.getUsername(), "-d", restored,
                "--exit-on-error", dump).getExitCode()).isZero();
        String url = "jdbc:postgresql://" + postgres.getHost() + ":" + postgres.getMappedPort(5432) + "/" + restored;
        try (var connection = DriverManager.getConnection(url, postgres.getUsername(), postgres.getPassword())) {
            connection.setSchema(schema);
            try (var sql = connection.createStatement(); var rows = sql.executeQuery("SELECT memo FROM application")) {
                assertThat(rows.next()).isTrue();
                assertThat(rows.getString(1)).isEqualTo("Keep this note");
            }
        }
        Flyway.configure().dataSource(url, postgres.getUsername(), postgres.getPassword())
                .schemas(schema).defaultSchema(schema).locations("classpath:db/migration/postgresql").load().validate();
    }
}
