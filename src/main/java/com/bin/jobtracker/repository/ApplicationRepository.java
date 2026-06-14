package com.bin.jobtracker.repository;

import com.bin.jobtracker.entity.Application;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface ApplicationRepository extends JpaRepository<Application, Long> {
    List<Application> findByMemberId(Long memberId);
}