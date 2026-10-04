CREATE TEMP TABLE backup_result (report jsonb);
DO $$
DECLARE
    name text;
    max_id bigint;
    next_id bigint;
    migrations jsonb := '[]'::jsonb;
BEGIN
    FOREACH name IN ARRAY ARRAY['member','application','schedule_event','spring_session','spring_session_attributes'] LOOP
        IF to_regclass('public.' || name) IS NULL THEN
            RAISE EXCEPTION 'Required application table missing';
        END IF;
    END LOOP;
    IF EXISTS (SELECT 1 FROM spring_session) OR EXISTS (SELECT 1 FROM spring_session_attributes) THEN
        RAISE EXCEPTION 'Backup contains login sessions';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE connamespace = 'public'::regnamespace AND NOT convalidated) THEN
        RAISE EXCEPTION 'Restored constraint not validated';
    END IF;
    IF EXISTS (SELECT 1 FROM application a LEFT JOIN member m ON m.id = a.member_id WHERE m.id IS NULL)
       OR EXISTS (SELECT 1 FROM schedule_event s LEFT JOIN application a ON a.id = s.application_id WHERE a.id IS NULL) THEN
        RAISE EXCEPTION 'Restored owner relation invalid';
    END IF;
    FOREACH name IN ARRAY ARRAY['member','application','schedule_event'] LOOP
        EXECUTE format('SELECT coalesce(max(id),0) FROM %I', name) INTO max_id;
        SELECT nextval(pg_get_serial_sequence(name, 'id')) INTO next_id;
        IF next_id IS NULL OR next_id <= max_id THEN RAISE EXCEPTION 'Restored identity sequence invalid'; END IF;
    END LOOP;
    IF to_regclass('public.flyway_schema_history') IS NOT NULL THEN
        IF EXISTS (SELECT 1 FROM flyway_schema_history WHERE NOT success) THEN
            RAISE EXCEPTION 'Unsuccessful migration history';
        END IF;
        SELECT coalesce(jsonb_agg(jsonb_build_object('version',version,'checksum',checksum) ORDER BY installed_rank), '[]'::jsonb)
          INTO migrations FROM flyway_schema_history;
    END IF;
    INSERT INTO backup_result VALUES (jsonb_build_object(
        'members', (SELECT count(*) FROM member),
        'applications', (SELECT count(*) FROM application),
        'schedules', (SELECT count(*) FROM schedule_event),
        'sessions', (SELECT count(*) FROM spring_session),
        'sessionAttributes', (SELECT count(*) FROM spring_session_attributes),
        'sequencesValid', true, 'constraintsValid', true, 'migrations', migrations,
        'memberDigest', (SELECT md5(coalesce(string_agg(row_to_json(t)::text,E'\n' ORDER BY id),'')) FROM member t),
        'applicationDigest', (SELECT md5(coalesce(string_agg(row_to_json(t)::text,E'\n' ORDER BY id),'')) FROM application t),
        'scheduleDigest', (SELECT md5(coalesce(string_agg(row_to_json(t)::text,E'\n' ORDER BY id),'')) FROM schedule_event t)
    ));
END $$;
SELECT report FROM backup_result;
