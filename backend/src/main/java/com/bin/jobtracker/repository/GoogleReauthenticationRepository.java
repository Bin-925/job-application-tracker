package com.bin.jobtracker.repository;
import com.bin.jobtracker.entity.GoogleReauthentication;
import org.springframework.data.jpa.repository.JpaRepository;
public interface GoogleReauthenticationRepository extends JpaRepository<GoogleReauthentication, Long> {}
