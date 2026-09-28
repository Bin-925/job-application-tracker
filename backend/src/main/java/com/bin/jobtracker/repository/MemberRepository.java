package com.bin.jobtracker.repository;

import com.bin.jobtracker.entity.Member;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;

public interface MemberRepository extends JpaRepository<Member, Long> {
    // Serialize all member writes so profile edits cannot restore an old authVersion/password.
    @org.springframework.data.jpa.repository.Lock(jakarta.persistence.LockModeType.PESSIMISTIC_WRITE)
    @org.springframework.data.jpa.repository.Query("select m from Member m where m.id = :id")
    Optional<Member> findForUpdate(@org.springframework.data.repository.query.Param("id") Long id);

    Optional<Member> findByUsername(String username);
    boolean existsByUsername(String username);
}
