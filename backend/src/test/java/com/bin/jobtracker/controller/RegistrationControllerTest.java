package com.bin.jobtracker.controller;

import com.bin.jobtracker.dto.JoinRequest;
import com.bin.jobtracker.service.MemberService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.dao.DataIntegrityViolationException;

import java.sql.SQLException;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class RegistrationControllerTest {
    @Mock MemberService members;
    @Mock com.bin.jobtracker.config.RegistrationPolicy registrationPolicy;
    @InjectMocks MemberController controller;
    private final JoinRequest request = new JoinRequest("audituser", "Audit1234!", "Audit");

    @Test void committedUsernameCollisionIsReportedAsDuplicate() {
        when(members.join(anyString(), anyString(), anyString()))
                .thenThrow(new DataIntegrityViolationException("fixture", new SQLException("fixture", "23505")));
        when(members.existsByUsername("audituser")).thenReturn(true);
        assertThatThrownBy(() -> controller.join(request)).isInstanceOf(IllegalArgumentException.class)
                .hasMessage("이미 사용 중인 아이디입니다.");
    }

    @Test void otherIntegrityFailuresAreNotReportedAsDuplicate() {
        var failure = new DataIntegrityViolationException("fixture", new SQLException("fixture", "23502"));
        when(members.join(anyString(), anyString(), anyString())).thenThrow(failure);
        assertThatThrownBy(() -> controller.join(request)).isSameAs(failure);
        verify(members, never()).existsByUsername(anyString());
    }

    @Test void uniqueFailureWithoutExistingUsernameIsNotReportedAsDuplicate() {
        var failure = new DataIntegrityViolationException("fixture", new SQLException("fixture", "23505"));
        when(members.join(anyString(), anyString(), anyString())).thenThrow(failure);
        when(members.existsByUsername("audituser")).thenReturn(false);
        assertThatThrownBy(() -> controller.join(request)).isSameAs(failure);
    }
}
