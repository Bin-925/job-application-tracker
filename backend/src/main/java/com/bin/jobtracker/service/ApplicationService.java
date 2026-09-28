package com.bin.jobtracker.service;

import com.bin.jobtracker.dto.ApplicationCreateRequest;
import com.bin.jobtracker.dto.ApplicationResponse;
import com.bin.jobtracker.dto.ApplicationUpdateRequest;
import com.bin.jobtracker.dto.StatusCount;
import com.bin.jobtracker.entity.Application;
import com.bin.jobtracker.entity.Member;
import com.bin.jobtracker.enums.ApplicationStatus;
import com.bin.jobtracker.exception.ForbiddenException;
import com.bin.jobtracker.exception.NotFoundException;
import com.bin.jobtracker.repository.ApplicationRepository;
import com.bin.jobtracker.repository.MemberRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class ApplicationService {

    private final ApplicationRepository applicationRepository;
    private final MemberRepository memberRepository;

    @Transactional
    public Application create(Long memberId, ApplicationCreateRequest req) {
        Member member = memberRepository.findById(memberId)
                .orElseThrow(() -> new IllegalArgumentException("회원을 찾을 수 없습니다."));
        Application application = new Application(
                member, req.company(), req.position(), req.status(),
                req.appliedDate(), req.deadline(), req.interviewDate(), req.interviewTime(),
                req.link(), req.memo());
        return applicationRepository.save(application);
    }

    public List<ApplicationResponse> getMyApplications(Long memberId) {
        return applicationRepository.findByMemberId(memberId).stream()
                .map(ApplicationResponse::from)
                .toList();
    }

    public Application getMyApplication(Long memberId, Long applicationId) {
        return findOwned(memberId, applicationId);
    }

    @Transactional
    public Application update(Long memberId, Long applicationId, ApplicationUpdateRequest req) {
        Application app = findOwned(memberId, applicationId);
        if (!java.util.Objects.equals(req.version(), app.getVersion())) {
            throw new org.springframework.orm.ObjectOptimisticLockingFailureException(Application.class, applicationId);
        }
        app.update(req.company(), req.position(), req.status(),
                req.appliedDate(), req.deadline(), req.interviewDate(), req.interviewTime(),
                req.link(), req.memo());
        applicationRepository.flush();
        return app;
    }

    @Transactional
    public Application changeStatus(Long memberId, Long applicationId, ApplicationStatus status) {
        Application app = findOwned(memberId, applicationId);
        app.changeStatus(status);
        return app;
    }

    @Transactional
    public Application changeStatus(Long memberId, Long applicationId,
            com.bin.jobtracker.dto.StatusUpdateRequest request) {
        Application app = findOwned(memberId, applicationId);
        if (request.status() != ApplicationStatus.TO_APPLY && app.getAppliedDate() == null) {
            if (request.appliedDate() == null) throw new IllegalArgumentException("지원일을 입력해 주세요.");
            app.recordAppliedDate(request.appliedDate());
        }
        app.changeStatus(request.status());
        applicationRepository.flush();
        return app;
    }

    @Transactional
    public Application addSchedule(Long memberId, Long applicationId,
            com.bin.jobtracker.dto.ScheduleRequest request) {
        Application app = findOwned(memberId, applicationId);
        app.getSchedules().add(new com.bin.jobtracker.entity.ScheduleEvent(app, request));
        applicationRepository.flush();
        return app;
    }

    @Transactional
    public Application updateSchedule(Long memberId, Long applicationId, Long scheduleId,
            com.bin.jobtracker.dto.ScheduleRequest request) {
        Application app = findOwned(memberId, applicationId);
        var event = app.getSchedules().stream().filter(e -> e.getId().equals(scheduleId)).findFirst()
                .orElseThrow(() -> new NotFoundException("일정을 찾을 수 없습니다."));
        if (!java.util.Objects.equals(request.version(), event.getVersion())) {
            throw new org.springframework.orm.ObjectOptimisticLockingFailureException(
                    com.bin.jobtracker.entity.ScheduleEvent.class, scheduleId);
        }
        event.update(request);
        applicationRepository.flush();
        return app;
    }

    @Transactional
    public void deleteSchedule(Long memberId, Long applicationId, Long scheduleId) {
        Application app = findOwned(memberId, applicationId);
        if (!app.getSchedules().removeIf(e -> e.getId().equals(scheduleId))) {
            throw new NotFoundException("일정을 찾을 수 없습니다.");
        }
    }

    @Transactional
    public Application replaceLegacySchedule(Long memberId, Long applicationId,
            com.bin.jobtracker.entity.ScheduleEvent.Type type,
            com.bin.jobtracker.dto.ScheduleRequest request) {
        Application app = findOwned(memberId, applicationId);
        app.clearLegacySchedule(type);
        if (request != null) {
            app.getSchedules().add(new com.bin.jobtracker.entity.ScheduleEvent(app, request));
        }
        applicationRepository.flush();
        return app;
    }

    @Transactional
    public void delete(Long memberId, Long applicationId) {
        Application app = findOwned(memberId, applicationId);
        applicationRepository.delete(app);
    }

    // 상태별 통계: 모든 상태를 0으로 채운 뒤, DB 집계 결과로 덮어씀
    public Map<ApplicationStatus, Long> getStats(Long memberId) {
        Map<ApplicationStatus, Long> result = new EnumMap<>(ApplicationStatus.class);
        for (ApplicationStatus s : ApplicationStatus.values()) {
            result.put(s, 0L);
        }
        for (StatusCount sc : applicationRepository.countByStatus(memberId)) {
            result.put(sc.status(), sc.count());
        }
        return result;
    }

    private Application findOwned(Long memberId, Long applicationId) {
        Application app = applicationRepository.findById(applicationId)
                .orElseThrow(() -> new NotFoundException("지원 내역을 찾을 수 없습니다."));
        if (!app.getMember().getId().equals(memberId)) {
            throw new ForbiddenException("본인의 지원만 접근할 수 있습니다.");
        }
        return app;
    }
}
