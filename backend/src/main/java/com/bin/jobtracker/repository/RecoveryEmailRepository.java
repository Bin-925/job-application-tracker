package com.bin.jobtracker.repository;

import com.bin.jobtracker.entity.RecoveryEmailVerification;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import java.util.Optional;

public interface RecoveryEmailRepository extends JpaRepository<RecoveryEmailVerification, Long> {
    @Query("select v.memberId from RecoveryEmailVerification v where v.tokenHash = :hash")
    Optional<Long> findMemberIdByTokenHash(String hash);
}
