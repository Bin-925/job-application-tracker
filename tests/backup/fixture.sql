INSERT INTO member(id,username,password,nickname,role,auth_version)
VALUES (41,'backupfixture','synthetic-not-a-real-password','복원 확인','USER',7);
INSERT INTO application(id,member_id,company,position,status,applied_date,deadline,memo,source,version)
VALUES (51,41,'검증 회사','Backend','INTERVIEW','2026-10-01','2026-10-20',E'한글 메모\n두 번째 줄 / emoji 테스트','MANUAL',9);
INSERT INTO schedule_event(id,application_id,type,title,event_date,event_time,state,version)
VALUES (61,51,'INTERVIEW','복원 면접','2026-10-10','14:30','SCHEDULED',3);
SELECT setval(pg_get_serial_sequence('member','id'),41,true);
SELECT setval(pg_get_serial_sequence('application','id'),51,true);
SELECT setval(pg_get_serial_sequence('schedule_event','id'),61,true);
INSERT INTO spring_session(primary_id,session_id,creation_time,last_access_time,max_inactive_interval,expiry_time,principal_name)
VALUES ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002',1,1,600,9999999999999,'backupfixture');
INSERT INTO spring_session_attributes(session_primary_id,attribute_name,attribute_bytes)
VALUES ('00000000-0000-0000-0000-000000000001','fixture',decode('010203','hex'));
INSERT INTO recovery_email_verification(member_id,email,token_hash,auth_version,expires_at,issued_at)
VALUES (41,'fixture@example.test',repeat('a',64),7,now() + interval '30 minutes',now());
INSERT INTO password_reset_token(member_id,email,token_hash,auth_version,expires_at,issued_at)
VALUES (41,'fixture@example.test',repeat('b',64),7,now() + interval '15 minutes',now());
INSERT INTO registration_token(token_hash,email,expires_at)
VALUES (repeat('c',64),'signup@example.test',now() + interval '30 minutes');
