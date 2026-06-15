package com.bin.jobtracker.service;

import com.bin.jobtracker.dto.ApplicationCreateRequest;
import com.bin.jobtracker.dto.StatusCount;
import com.bin.jobtracker.entity.Application;
import com.bin.jobtracker.entity.Member;
import com.bin.jobtracker.enums.ApplicationStatus;
import com.bin.jobtracker.exception.ForbiddenException;
import com.bin.jobtracker.exception.NotFoundException;
import com.bin.jobtracker.repository.ApplicationRepository;
import com.bin.jobtracker.repository.MemberRepository;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.BDDMockito.*;
import static org.mockito.Mockito.never;

@ExtendWith(MockitoExtension.class)
class ApplicationServiceTest {

    @Mock ApplicationRepository applicationRepository;
    @Mock MemberRepository memberRepository;
    @InjectMocks ApplicationService applicationService;

    // 헬퍼: 회원 (id를 강제로 주입 — 아래 설명 참고)
    private Member memberWithId(Long id) {
        Member member = new Member("user" + id, "pw", "닉" + id);
        ReflectionTestUtils.setField(member, "id", id);
        return member;
    }

    // 헬퍼: 특정 회원이 소유한 지원 1건
    private Application applicationOf(Member owner) {
        return new Application(owner, "토스", "백엔드", ApplicationStatus.APPLIED,
                LocalDate.now(), LocalDate.now().plusDays(7), "https://toss.im", "메모");
    }

    @Test
    @DisplayName("지원 생성 성공")
    void create_success() {
        Member member = memberWithId(1L);
        given(memberRepository.findById(1L)).willReturn(Optional.of(member));
        given(applicationRepository.save(any(Application.class)))
                .willAnswer(inv -> inv.getArgument(0)); // 저장한 객체 그대로 반환
        ApplicationCreateRequest req = new ApplicationCreateRequest(
                "토스", "백엔드", ApplicationStatus.APPLIED,
                LocalDate.now(), LocalDate.now().plusDays(7), "https://toss.im", "메모");

        Application result = applicationService.create(1L, req);

        assertThat(result.getMember()).isEqualTo(member);
        assertThat(result.getCompany()).isEqualTo("토스");
        then(applicationRepository).should().save(any(Application.class));
    }

    @Test
    @DisplayName("지원 생성 - 회원이 없으면 예외, 저장 안 함")
    void create_memberNotFound() {
        given(memberRepository.findById(99L)).willReturn(Optional.empty());
        ApplicationCreateRequest req = new ApplicationCreateRequest(
                "토스", "백엔드", ApplicationStatus.APPLIED,
                LocalDate.now(), null, null, null);

        assertThatThrownBy(() -> applicationService.create(99L, req))
                .isInstanceOf(IllegalArgumentException.class);
        then(applicationRepository).should(never()).save(any());
    }

    @Test
    @DisplayName("내 지원 조회 성공")
    void getMyApplication_success() {
        Member owner = memberWithId(1L);
        Application app = applicationOf(owner);
        given(applicationRepository.findById(10L)).willReturn(Optional.of(app));

        Application result = applicationService.getMyApplication(1L, 10L);

        assertThat(result).isSameAs(app);
    }

    @Test
    @DisplayName("내 지원 조회 - 없으면 404(NotFound)")
    void getMyApplication_notFound() {
        given(applicationRepository.findById(10L)).willReturn(Optional.empty());

        assertThatThrownBy(() -> applicationService.getMyApplication(1L, 10L))
                .isInstanceOf(NotFoundException.class);
    }

    @Test
    @DisplayName("★ 내 지원 조회 - 타인 것이면 403(Forbidden)")
    void getMyApplication_forbidden() {
        Member owner = memberWithId(1L);          // 지원의 주인 = 회원 1
        Application app = applicationOf(owner);
        given(applicationRepository.findById(10L)).willReturn(Optional.of(app));

        // 회원 2가 회원 1의 지원에 접근 시도
        assertThatThrownBy(() -> applicationService.getMyApplication(2L, 10L))
                .isInstanceOf(ForbiddenException.class);
    }

    @Test
    @DisplayName("★ 지원 삭제 - 타인 것이면 403이고, 실제 삭제는 호출되지 않음")
    void delete_forbidden() {
        Member owner = memberWithId(1L);
        Application app = applicationOf(owner);
        given(applicationRepository.findById(10L)).willReturn(Optional.of(app));

        assertThatThrownBy(() -> applicationService.delete(2L, 10L))
                .isInstanceOf(ForbiddenException.class);
        then(applicationRepository).should(never()).delete(any()); // 삭제 차단 검증
    }

    @Test
    @DisplayName("상태 변경 성공")
    void changeStatus_success() {
        Member owner = memberWithId(1L);
        Application app = applicationOf(owner);
        given(applicationRepository.findById(10L)).willReturn(Optional.of(app));

        applicationService.changeStatus(1L, 10L, ApplicationStatus.INTERVIEW);

        assertThat(app.getStatus()).isEqualTo(ApplicationStatus.INTERVIEW);
    }

    @Test
    @DisplayName("★ 상태별 통계 - 0개인 상태도 포함되고, 집계값으로 덮어씀")
    void getStats_fillsAllStatuses() {
        given(applicationRepository.countByStatus(1L)).willReturn(List.of(
                new StatusCount(ApplicationStatus.APPLIED, 2L),
                new StatusCount(ApplicationStatus.INTERVIEW, 1L)
        ));

        Map<ApplicationStatus, Long> stats = applicationService.getStats(1L);

        assertThat(stats).hasSize(ApplicationStatus.values().length); // 모든 상태 키 존재
        assertThat(stats.get(ApplicationStatus.APPLIED)).isEqualTo(2L);
        assertThat(stats.get(ApplicationStatus.INTERVIEW)).isEqualTo(1L);
        assertThat(stats.get(ApplicationStatus.REJECTED)).isEqualTo(0L);  // 집계 안 된 건 0
    }
}