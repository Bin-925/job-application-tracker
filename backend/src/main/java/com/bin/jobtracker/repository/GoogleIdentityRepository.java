package com.bin.jobtracker.repository;

import com.bin.jobtracker.entity.GoogleIdentity;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;
import java.util.Optional;

public interface GoogleIdentityRepository extends JpaRepository<GoogleIdentity, Long> {
    @Query("select g.memberId from GoogleIdentity g where g.issuer = :issuer and g.subject = :subject")
    Optional<Long> findMemberId(@Param("issuer") String issuer, @Param("subject") String subject);
}
