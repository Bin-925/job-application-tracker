package com.bin.jobtracker.repository;

import com.bin.jobtracker.dto.StatusCount;
import com.bin.jobtracker.entity.Application;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.util.List;

public interface ApplicationRepository extends JpaRepository<Application, Long> {

    List<Application> findByMemberId(Long memberId);

    // 본인 지원을 상태별로 묶어서 개수 집계 (개수 0인 상태는 결과에 안 나옴)
    @Query("SELECT new com.bin.jobtracker.dto.StatusCount(a.status, COUNT(a)) " +
            "FROM Application a WHERE a.member.id = :memberId GROUP BY a.status")
    List<StatusCount> countByStatus(@Param("memberId") Long memberId);
}