package com.bin.jobtracker.repository;

import com.bin.jobtracker.entity.PasswordResetToken;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.util.Optional;

public interface PasswordResetRepository extends JpaRepository<PasswordResetToken, Long> {
    @Query("select t.memberId from PasswordResetToken t where t.tokenHash = :hash")
    Optional<Long> findMemberIdByTokenHash(@Param("hash") String hash);
}
