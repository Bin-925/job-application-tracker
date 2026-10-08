package com.bin.jobtracker.repository;

import com.bin.jobtracker.entity.RegistrationToken;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;
import java.time.Instant;
import java.util.Optional;

public interface RegistrationTokenRepository extends JpaRepository<RegistrationToken, String> {
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select t from RegistrationToken t where t.tokenHash = :hash")
    Optional<RegistrationToken> findForUpdate(@Param("hash") String hash);

    @Modifying
    @Query("delete from RegistrationToken t where t.expiresAt <= :now")
    int deleteExpired(@Param("now") Instant now);
}
